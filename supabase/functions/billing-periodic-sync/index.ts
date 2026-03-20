// @ts-nocheck
/**
 * Billing Periodic Sync — PERMANENTLY DISABLED
 * All billing/cost calculations are now manual-only to control cloud costs.
 * This function blocks execution and logs the attempt.
 */
import { createClient } from "npm:@supabase/supabase-js@2";
import { logSyncEvent } from "../_shared/sync-audit.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-key",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  console.log(`[billing-periodic-sync] BLOCKED — automatic billing sync is disabled.`);

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  await logSyncEvent(supabase, {
    action: "sync_blocked",
    entityType: "billing_sync",
    entityId: "billing-periodic-cron",
    metadata: {
      module: "billing_sync",
      scope: "periodic",
      reason: "SYSTEM_BLOCK: automatic billing disabled",
      blocked_at: new Date().toISOString(),
    },
  });

  return new Response(
    JSON.stringify({
      success: false,
      blocked: true,
      reason: "Automatic billing sync is permanently disabled. Use manual recalculation.",
    }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
});
