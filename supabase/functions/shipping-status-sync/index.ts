import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const CRON_SECRET = Deno.env.get("CRON_JOB_SECRET") || "default-cron-secret";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") || "";
const MAX_SHIPMENTS_PER_ACCOUNT = 250;
const MAX_STALE_PER_ACCOUNT = 50;
const MAX_SHIPPED_RECHECK_PER_ACCOUNT = 30;
const DELAY_BETWEEN_CALLS_MS = 200;
const DELAY_BETWEEN_ACCOUNTS_MS = 2000;

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

// Statuses that may still change and need periodic checking
const ACTIVE_STATUSES = ["ready_to_ship", "handling", "pending"];
const TERMINAL_STATUSES = new Set(["delivered", "not_delivered", "cancelled"]);

function isAuthorized(req: Request): boolean {
  const cronKey = req.headers.get("x-cron-key");
  if (cronKey === CRON_SECRET) return true;

  const authHeader = req.headers.get("authorization") || "";
  const token = authHeader.replace("Bearer ", "").trim();
  if (token === SUPABASE_ANON_KEY) return true;

  return false;
}

interface ShipmentRow {
  shipment_id: string | number;
  shipment_status: string | null;
  shipment_substatus: string | null;
}

interface CheckContext {
  supabase: any;
  accessToken: string;
  sellerId: string | number;
  stats: { checked: number; updated: number; errors: number };
}

/** Returns true to continue processing, false to break (token expired / rate limit). */
async function checkAndUpdateShipment(
  ctx: CheckContext,
  shipment: ShipmentRow
): Promise<boolean> {
  ctx.stats.checked++;

  try {
    const response = await fetch(
      `https://api.mercadolibre.com/shipments/${shipment.shipment_id}`,
      { headers: { Authorization: `Bearer ${ctx.accessToken}` } }
    );

    if (response.status === 401) {
      console.warn(`[shipping-status-sync] Token expired for ${ctx.sellerId}`);
      return false;
    }

    if (response.status === 429) {
      console.warn(`[shipping-status-sync] Rate limited for ${ctx.sellerId}`);
      await sleep(5000);
      return false;
    }

    if (!response.ok) {
      ctx.stats.errors++;
      await sleep(DELAY_BETWEEN_CALLS_MS);
      return true;
    }

    const data = await response.json();

    // Extract estimated_handling_limit from multiple paths
    let estimatedHandlingLimit: string | null = null;
    if (data.shipping_option?.estimated_handling_limit?.date) {
      estimatedHandlingLimit = data.shipping_option.estimated_handling_limit.date;
    } else if (data.lead_time?.estimated_handling_limit?.date) {
      estimatedHandlingLimit = data.lead_time.estimated_handling_limit.date;
    } else if (data.estimated_handling_limit?.date) {
      estimatedHandlingLimit = data.estimated_handling_limit.date;
    } else if (data.shipping_option?.estimated_delivery_time?.handling && data.date_created) {
      const created = new Date(data.date_created);
      const handlingHours = data.shipping_option.estimated_delivery_time.handling;
      const deadline = new Date(created.getTime() + handlingHours * 3600000);
      estimatedHandlingLimit = deadline.toISOString();
    }

    let estimatedScheduleLimit: string | null = null;
    if (data.shipping_option?.estimated_schedule_limit?.date) {
      estimatedScheduleLimit = data.shipping_option.estimated_schedule_limit.date;
    } else if (data.lead_time?.estimated_schedule_limit?.date) {
      estimatedScheduleLimit = data.lead_time.estimated_schedule_limit.date;
    } else if (data.estimated_schedule_limit?.date) {
      estimatedScheduleLimit = data.estimated_schedule_limit.date;
    }

    const statusChanged = data.status !== shipment.shipment_status ||
      data.substatus !== shipment.shipment_substatus;

    if (statusChanged || estimatedHandlingLimit || estimatedScheduleLimit) {
      const receiverAddress = data.receiver_address || {};
      const labelAvailable = data.substatus === "ready_to_print" || data.substatus === "printed";

      const updateData: Record<string, any> = {
        shipment_status: data.status,
        shipment_substatus: data.substatus || null,
        tracking_number: data.tracking_number || null,
        receiver_name: receiverAddress.receiver_name || null,
        logistic_type: data.logistic_type || null,
        label_available: labelAvailable,
        last_sync_at: new Date().toISOString(),
      };

      if (estimatedHandlingLimit) updateData.estimated_handling_limit = estimatedHandlingLimit;
      if (estimatedScheduleLimit) updateData.estimated_schedule_limit = estimatedScheduleLimit;

      await ctx.supabase
        .from("meli_shipments_cache")
        .update(updateData)
        .eq("seller_id", ctx.sellerId)
        .eq("shipment_id", shipment.shipment_id);

      if (statusChanged) {
        ctx.stats.updated++;
        const reachedTerminal = TERMINAL_STATUSES.has(data.status);
        const tag = reachedTerminal ? "TERMINAL" : "UPDATE";
        console.log(
          `[shipping-status-sync] [${tag}] ${shipment.shipment_id}: ${shipment.shipment_status}/${shipment.shipment_substatus} → ${data.status}/${data.substatus}`
        );
      }
    } else {
      // Touch last_sync_at so it doesn't get re-picked immediately
      await ctx.supabase
        .from("meli_shipments_cache")
        .update({ last_sync_at: new Date().toISOString() })
        .eq("seller_id", ctx.sellerId)
        .eq("shipment_id", shipment.shipment_id);
    }

    await sleep(DELAY_BETWEEN_CALLS_MS);
    return true;
  } catch (err) {
    console.error(`[shipping-status-sync] Error checking ${shipment.shipment_id}:`, err);
    ctx.stats.errors++;
    return true;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (!isAuthorized(req)) {
    return new Response("Unauthorized", { status: 401 });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  const url = new URL(req.url);
  const manualShipmentId = url.searchParams.get("shipment_id");

  // ===== Manual single-shipment recovery =====
  if (manualShipmentId) {
    console.log(`[shipping-status-sync] Manual recovery for shipment ${manualShipmentId}`);
    const { data: cached, error: cacheErr } = await supabase
      .from("meli_shipments_cache")
      .select("shipment_id, shipment_status, shipment_substatus, seller_id")
      .eq("shipment_id", manualShipmentId)
      .maybeSingle();

    if (cacheErr || !cached) {
      return new Response(JSON.stringify({ error: "Shipment not found in cache", shipment_id: manualShipmentId }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: account } = await supabase
      .from("ml_accounts")
      .select("ml_user_id, access_token")
      .eq("ml_user_id", cached.seller_id)
      .eq("is_active", true)
      .maybeSingle();

    if (!account) {
      return new Response(JSON.stringify({ error: "Active ML account not found for seller", seller_id: cached.seller_id }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const stats = { checked: 0, updated: 0, errors: 0 };
    const ok = await checkAndUpdateShipment(
      { supabase, accessToken: account.access_token, sellerId: account.ml_user_id, stats },
      cached as ShipmentRow
    );

    const { data: after } = await supabase
      .from("meli_shipments_cache")
      .select("shipment_status, shipment_substatus, last_sync_at")
      .eq("shipment_id", manualShipmentId)
      .maybeSingle();

    return new Response(JSON.stringify({ status: ok ? "completed" : "aborted", before: cached, after, stats }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const startTime = Date.now();
  const stats = { accounts: 0, checked: 0, updated: 0, errors: 0, skipped: 0, stale_checked: 0, shipped_rechecked: 0 };

  try {
    // Acquire lock via sync_scheduler
    const { data: scheduler } = await supabase
      .from("sync_scheduler")
      .select("status, last_run_at")
      .eq("job_name", "shipping-status-sync")
      .maybeSingle();

    if (scheduler?.status === "running") {
      const lastRun = scheduler.last_run_at ? new Date(scheduler.last_run_at).getTime() : 0;
      if (Date.now() - lastRun < 10 * 60 * 1000) {
        console.log("[shipping-status-sync] Already running, skipping");
        return new Response(JSON.stringify({ status: "skipped", reason: "already_running" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    await supabase
      .from("sync_scheduler")
      .upsert({
        job_name: "shipping-status-sync",
        status: "running",
        last_run_at: new Date().toISOString(),
      }, { onConflict: "job_name" });

    const { data: accounts, error: accError } = await supabase
      .from("ml_accounts")
      .select("id, ml_user_id, user_id, access_token")
      .eq("is_active", true);

    if (accError || !accounts || accounts.length === 0) {
      console.log("[shipping-status-sync] No active accounts found");
      await markDone(supabase);
      return new Response(JSON.stringify({ status: "idle", stats }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`[shipping-status-sync] Processing ${accounts.length} accounts`);

    const now = Date.now();
    const stale24hCutoff = new Date(now - 24 * 3600 * 1000).toISOString();
    // note: meli_shipments_cache has no date_created column; use last_sync_at as staleness signal
    const shipped7dCutoff = new Date(now - 7 * 24 * 3600 * 1000).toISOString();

    for (const account of accounts) {
      stats.accounts++;
      const ctx: CheckContext = {
        supabase,
        accessToken: account.access_token,
        sellerId: account.ml_user_id,
        stats: { checked: 0, updated: 0, errors: 0 },
      };

      try {
        // ===== Pass 1: stale stuck shipments (ready_to_ship/printed-or-ready_for_pickup) =====
        const { data: staleShipments } = await supabase
          .from("meli_shipments_cache")
          .select("shipment_id, shipment_status, shipment_substatus")
          .eq("seller_id", account.ml_user_id)
          .eq("shipment_status", "ready_to_ship")
          .in("shipment_substatus", ["printed", "ready_for_pickup"])
          .lt("last_sync_at", stale24hCutoff)
          .order("last_sync_at", { ascending: true, nullsFirst: true })
          .limit(MAX_STALE_PER_ACCOUNT);

        if (staleShipments && staleShipments.length > 0) {
          console.log(`[shipping-status-sync] ${account.ml_user_id}: STALE pass — ${staleShipments.length} stuck shipments`);
          for (const s of staleShipments) {
            stats.stale_checked++;
            const cont = await checkAndUpdateShipment(ctx, s as ShipmentRow);
            if (!cont) break;
          }
        }

        // ===== Pass 2: regular active shipments =====
        const { data: activeShipments, error: shipError } = await supabase
          .from("meli_shipments_cache")
          .select("shipment_id, shipment_status, shipment_substatus")
          .eq("seller_id", account.ml_user_id)
          .in("shipment_status", ACTIVE_STATUSES)
          .order("last_sync_at", { ascending: true, nullsFirst: true })
          .limit(MAX_SHIPMENTS_PER_ACCOUNT);

        if (shipError) {
          console.error(`[shipping-status-sync] Error fetching shipments for ${account.ml_user_id}:`, shipError);
          ctx.stats.errors++;
        } else if (activeShipments && activeShipments.length > 0) {
          console.log(`[shipping-status-sync] ${account.ml_user_id}: ACTIVE pass — ${activeShipments.length} shipments`);
          for (const s of activeShipments) {
            const cont = await checkAndUpdateShipment(ctx, s as ShipmentRow);
            if (!cont) break;
          }
        }

        // ===== Pass 3: terminal-state safety net (shipped >7d, not yet delivered) =====
        const { data: shippedOld } = await supabase
          .from("meli_shipments_cache")
          .select("shipment_id, shipment_status, shipment_substatus")
          .eq("seller_id", account.ml_user_id)
          .eq("shipment_status", "shipped")
          .lt("last_sync_at", shipped7dCutoff)
          .order("last_sync_at", { ascending: true, nullsFirst: true })
          .limit(MAX_SHIPPED_RECHECK_PER_ACCOUNT);

        if (shippedOld && shippedOld.length > 0) {
          console.log(`[shipping-status-sync] ${account.ml_user_id}: SHIPPED-RECHECK pass — ${shippedOld.length} shipments`);
          for (const s of shippedOld) {
            stats.shipped_rechecked++;
            const cont = await checkAndUpdateShipment(ctx, s as ShipmentRow);
            if (!cont) break;
          }
        }

        // Aggregate per-account stats
        stats.checked += ctx.stats.checked;
        stats.updated += ctx.stats.updated;
        stats.errors += ctx.stats.errors;

        if (ctx.stats.checked === 0) stats.skipped++;

        if (stats.accounts < accounts.length) {
          await sleep(DELAY_BETWEEN_ACCOUNTS_MS);
        }
      } catch (accErr) {
        console.error(`[shipping-status-sync] Account error ${account.ml_user_id}:`, accErr);
        stats.errors++;
      }
    }

    await markDone(supabase);

    const duration = Date.now() - startTime;
    console.log(`[shipping-status-sync] Done in ${duration}ms:`, stats);

    return new Response(JSON.stringify({ status: "completed", stats, duration_ms: duration }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[shipping-status-sync] Fatal error:", error);
    await supabase
      .from("sync_scheduler")
      .update({ status: "error" })
      .eq("job_name", "shipping-status-sync");

    return new Response(JSON.stringify({ error: String(error) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

async function markDone(supabase: any) {
  await supabase
    .from("sync_scheduler")
    .update({
      status: "idle",
      last_run_at: new Date().toISOString(),
    })
    .eq("job_name", "shipping-status-sync");
}
