import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const CRON_SECRET = Deno.env.get("CRON_JOB_SECRET") || "default-cron-secret";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") || "";
const MAX_SHIPMENTS_PER_ACCOUNT = 150;
const DELAY_BETWEEN_CALLS_MS = 200;
const DELAY_BETWEEN_ACCOUNTS_MS = 2000;

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

// Statuses that may still change and need periodic checking
const ACTIVE_STATUSES = ["ready_to_ship", "handling", "pending"];

function isAuthorized(req: Request): boolean {
  const cronKey = req.headers.get("x-cron-key");
  if (cronKey === CRON_SECRET) return true;

  const authHeader = req.headers.get("authorization") || "";
  const token = authHeader.replace("Bearer ", "").trim();
  if (token === SUPABASE_ANON_KEY) return true;

  return false;
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

  const startTime = Date.now();
  const stats = { accounts: 0, checked: 0, updated: 0, errors: 0, skipped: 0 };

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

    // Mark as running
    await supabase
      .from("sync_scheduler")
      .upsert({
        job_name: "shipping-status-sync",
        status: "running",
        last_run_at: new Date().toISOString(),
      }, { onConflict: "job_name" });

    // Get all active ML accounts
    const { data: accounts, error: accError } = await supabase
      .from("ml_accounts")
      .select("id, ml_user_id, user_id, access_token")
      .eq("is_active", true);

    if (accError || !accounts || accounts.length === 0) {
      console.log("[shipping-status-sync] No active accounts found");
      await markDone(supabase, stats);
      return new Response(JSON.stringify({ status: "idle", stats }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`[shipping-status-sync] Processing ${accounts.length} accounts`);

    for (const account of accounts) {
      stats.accounts++;

      try {
        const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

        const { data: activeShipments, error: shipError } = await supabase
          .from("meli_shipments_cache")
          .select("shipment_id, shipment_status, shipment_substatus")
          .eq("seller_id", account.ml_user_id)
          .in("shipment_status", ACTIVE_STATUSES)
          .gte("last_sync_at", sevenDaysAgo)
          .order("last_sync_at", { ascending: true })
          .limit(MAX_SHIPMENTS_PER_ACCOUNT);

        if (shipError) {
          console.error(`[shipping-status-sync] Error fetching shipments for ${account.ml_user_id}:`, shipError);
          stats.errors++;
          continue;
        }

        if (!activeShipments || activeShipments.length === 0) {
          stats.skipped++;
          continue;
        }

        console.log(`[shipping-status-sync] ${account.ml_user_id}: checking ${activeShipments.length} shipments`);

        for (const shipment of activeShipments) {
          stats.checked++;

          try {
            const response = await fetch(
              `https://api.mercadolibre.com/shipments/${shipment.shipment_id}`,
              { headers: { Authorization: `Bearer ${account.access_token}` } }
            );

            if (response.status === 401) {
              console.warn(`[shipping-status-sync] Token expired for ${account.ml_user_id}`);
              break;
            }

            if (response.status === 429) {
              console.warn(`[shipping-status-sync] Rate limited for ${account.ml_user_id}`);
              await sleep(5000);
              break;
            }

            if (!response.ok) {
              stats.errors++;
              await sleep(DELAY_BETWEEN_CALLS_MS);
              continue;
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

            // Only update if status changed or we have new handling limit data
            const statusChanged = data.status !== shipment.shipment_status ||
              data.substatus !== shipment.shipment_substatus;

            if (statusChanged || estimatedHandlingLimit) {
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

              if (estimatedHandlingLimit) {
                updateData.estimated_handling_limit = estimatedHandlingLimit;
              }

              await supabase
                .from("meli_shipments_cache")
                .update(updateData)
                .eq("seller_id", account.ml_user_id)
                .eq("shipment_id", shipment.shipment_id);

              if (statusChanged) {
                stats.updated++;
                console.log(
                  `[shipping-status-sync] Updated ${shipment.shipment_id}: ${shipment.shipment_status}/${shipment.shipment_substatus} → ${data.status}/${data.substatus}`
                );
              }
            }

            await sleep(DELAY_BETWEEN_CALLS_MS);
          } catch (err) {
            console.error(`[shipping-status-sync] Error checking ${shipment.shipment_id}:`, err);
            stats.errors++;
          }
        }

        if (stats.accounts < accounts.length) {
          await sleep(DELAY_BETWEEN_ACCOUNTS_MS);
        }
      } catch (accErr) {
        console.error(`[shipping-status-sync] Account error ${account.ml_user_id}:`, accErr);
        stats.errors++;
      }
    }

    await markDone(supabase, stats);

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

async function markDone(supabase: any, stats: Record<string, number>) {
  await supabase
    .from("sync_scheduler")
    .update({
      status: "idle",
      last_run_at: new Date().toISOString(),
    })
    .eq("job_name", "shipping-status-sync");
}
