// @ts-nocheck
/**
 * Billing Periodic Sync (Cron)
 * Iterates all active ML accounts and triggers billing sync for each.
 * Called by pg_cron every 30 minutes.
 * Does NOT touch cost-engine or financial calculations.
 */
import { createClient } from "npm:@supabase/supabase-js@2";
import { logSyncEvent, syncStartTimer, syncDuration } from "../_shared/sync-audit.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-key",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const DELAY_BETWEEN_ACCOUNTS_MS = 5000; // 5s between accounts to respect rate limits

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const timer = syncStartTimer();

  try {
    console.log(`[billing-periodic-sync] Starting at ${timer.startedAt}`);

    await logSyncEvent(supabase, {
      action: "sync_started",
      entityType: "billing_sync",
      entityId: "billing-periodic-cron",
      metadata: { module: "billing_sync", scope: "periodic_30m", started_at: timer.startedAt },
    });

    // Get all active ML accounts
    const { data: accounts, error: accErr } = await supabase
      .from("ml_accounts")
      .select("id, user_id, ml_user_id, nickname, is_active")
      .eq("is_active", true);

    if (accErr) throw new Error(`Failed to fetch accounts: ${accErr.message}`);

    console.log(`[billing-periodic-sync] Found ${accounts?.length || 0} active accounts`);

    const stats = {
      accounts_total: accounts?.length || 0,
      accounts_triggered: 0,
      accounts_skipped: 0,
      accounts_failed: 0,
    };

    for (const account of accounts || []) {
      try {
        // Check if billing sync is already running for this seller
        const { data: syncState } = await supabase
          .from("meli_billing_details_sync_state")
          .select("status")
          .eq("seller_id", account.ml_user_id)
          .maybeSingle();

        if (syncState?.status === "running") {
          console.log(`[billing-periodic-sync] Skipping ${account.ml_user_id} - already running`);
          stats.accounts_skipped++;
          continue;
        }

        // Trigger billing sync via edge function
        const response = await fetch(`${SUPABASE_URL}/functions/v1/ml-sync-billing-details`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          },
          body: JSON.stringify({
            seller_id: account.ml_user_id,
            action: "sync",
            scope: "recent",
          }),
        });

        if (response.ok) {
          stats.accounts_triggered++;
          console.log(`[billing-periodic-sync] Triggered for ${account.nickname || account.ml_user_id}`);
        } else {
          const errText = await response.text();
          console.warn(`[billing-periodic-sync] Failed for ${account.ml_user_id}: ${response.status} ${errText}`);
          stats.accounts_failed++;
        }

        await sleep(DELAY_BETWEEN_ACCOUNTS_MS);
      } catch (err) {
        console.error(`[billing-periodic-sync] Error for ${account.ml_user_id}:`, err);
        stats.accounts_failed++;
      }
    }

    const duration = syncDuration(timer.startMs);

    await logSyncEvent(supabase, {
      action: "sync_finished",
      entityType: "billing_sync",
      entityId: "billing-periodic-cron",
      metadata: {
        module: "billing_sync",
        scope: "periodic_30m",
        started_at: timer.startedAt,
        finished_at: new Date().toISOString(),
        duration_ms: duration,
        accounts_processed: stats.accounts_triggered,
        accounts_failed: stats.accounts_failed,
      },
    });

    console.log(`[billing-periodic-sync] Completed in ${duration}ms:`, stats);

    return new Response(JSON.stringify({ success: true, stats }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[billing-periodic-sync] Fatal error:", error);

    await logSyncEvent(supabase, {
      action: "sync_failed",
      entityType: "billing_sync",
      entityId: "billing-periodic-cron",
      metadata: { module: "billing_sync", scope: "periodic_30m", error_message: String(error) },
    });

    return new Response(JSON.stringify({ error: String(error) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
