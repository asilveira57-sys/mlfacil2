import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const CRON_SECRET = Deno.env.get("CRON_JOB_SECRET") || "default-cron-secret";
const MAX_SHIPMENTS_PER_ACCOUNT = 50;
const DELAY_BETWEEN_CALLS_MS = 200;
const DELAY_BETWEEN_ACCOUNTS_MS = 2000;

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

// Statuses that may still change and need periodic checking
const ACTIVE_STATUSES = ["ready_to_ship", "handling"];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Validate cron key
  const cronKey = req.headers.get("x-cron-key");
  const authHeader = req.headers.get("authorization");
  if (cronKey !== CRON_SECRET && !authHeader?.includes(Deno.env.get("SUPABASE_ANON_KEY") || "")) {
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
      // If stuck for more than 10 minutes, allow re-run
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
        // Get shipments with active statuses from last 7 days
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
              break; // Skip rest of this account
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

            // Only update if status actually changed
            if (
              data.status !== shipment.shipment_status ||
              data.substatus !== shipment.shipment_substatus
            ) {
              const receiverAddress = data.receiver_address || {};
              const labelAvailable = data.substatus === "ready_to_print" || data.substatus === "printed";

              await supabase
                .from("meli_shipments_cache")
                .update({
                  shipment_status: data.status,
                  shipment_substatus: data.substatus || null,
                  tracking_number: data.tracking_number || null,
                  receiver_name: receiverAddress.receiver_name || null,
                  logistic_type: data.logistic_type || null,
                  label_available: labelAvailable,
                  last_sync_at: new Date().toISOString(),
                })
                .eq("seller_id", account.ml_user_id)
                .eq("shipment_id", shipment.shipment_id);

              stats.updated++;
              console.log(
                `[shipping-status-sync] Updated ${shipment.shipment_id}: ${shipment.shipment_status}/${shipment.shipment_substatus} → ${data.status}/${data.substatus}`
              );
            }

            await sleep(DELAY_BETWEEN_CALLS_MS);
          } catch (err) {
            console.error(`[shipping-status-sync] Error checking ${shipment.shipment_id}:`, err);
            stats.errors++;
          }
        }

        // Delay between accounts
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
