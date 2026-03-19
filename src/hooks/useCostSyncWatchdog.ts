import { useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Cost Sync Watchdog — Manual-only mode
 * All automatic polling has been removed to prevent unnecessary edge function invocations.
 * Actions are triggered only by user interaction.
 */
export function useCostSyncWatchdog(sellerId: string | null, _enabled: boolean) {
  // Force resume functions (for manual triggers only)
  const forceResumeBilling = useCallback(async () => {
    if (!sellerId) return;
    return supabase.functions.invoke("ml-sync-billing-details", {
      body: { seller_id: sellerId, action: "sync", scope: "recent" }
    });
  }, [sellerId]);

  const forceResumeBackfill = useCallback(async () => {
    if (!sellerId) return;
    return supabase.functions.invoke("ml-sync-real-costs", {
      body: { seller_id: sellerId, action: "continue_backfill" }
    });
  }, [sellerId]);

  const forceResumeRealCosts = useCallback(async () => {
    if (!sellerId) return;
    return supabase.functions.invoke("ml-sync-real-costs", {
      body: { seller_id: sellerId, action: "continue", force_resume: true }
    });
  }, [sellerId]);

  const resetProgressOnly = useCallback(async () => {
    if (!sellerId) return;
    await supabase.from("meli_real_costs_sync_state").delete().eq("seller_id", sellerId);
    await supabase.from("meli_backfill_sync_state").delete().eq("seller_id", sellerId);
    await supabase.from("meli_billing_details_sync_state").delete().eq("seller_id", sellerId);
  }, [sellerId]);

  return {
    forceResumeBilling,
    forceResumeBackfill,
    forceResumeRealCosts,
    resetProgressOnly,
  };
}
