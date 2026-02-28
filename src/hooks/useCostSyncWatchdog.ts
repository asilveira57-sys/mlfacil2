import { useEffect, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

const WATCHDOG_INTERVAL_MS = 15000; // Check every 15s instead of 5s
const STALE_THRESHOLD_MS = 120000; // 2 minutes instead of 1
const COOLDOWN_MS = 30000; // 30 second cooldown between actions

// Billing is considered stale if last sync was > 6 hours ago
const BILLING_STALE_THRESHOLD_MS = 6 * 60 * 60 * 1000;

interface WatchdogState {
  billingStatus: 'idle' | 'running' | 'paused' | 'done' | 'error' | null;
  billingSyncScope: string | null;
  billingLastFinished: string | null;
  backfillStatus: 'idle' | 'running' | 'paused' | 'done' | 'error' | null;
  backfillLastHeartbeat: string | null;
  realCostsStatus: 'idle' | 'running' | 'paused' | 'done' | 'error' | null;
  realCostsLastHeartbeat: string | null;
  missingBreakdown: number;
  pendingBilling: number;
}

export function useCostSyncWatchdog(sellerId: string | null, enabled: boolean) {
  const stateRef = useRef<WatchdogState>({
    billingStatus: null,
    billingSyncScope: null,
    billingLastFinished: null,
    backfillStatus: null,
    backfillLastHeartbeat: null,
    realCostsStatus: null,
    realCostsLastHeartbeat: null,
    missingBreakdown: 0,
    pendingBilling: 0,
  });
  
const lastActionRef = useRef<number>(0);
const isResumingRef = useRef(false);
const intervalRef = useRef<NodeJS.Timeout | null>(null);
const lastResumeAttemptRef = useRef<{ [key: string]: number }>({});

  const fetchState = useCallback(async () => {
    if (!sellerId) return;
    
    try {
      // Fetch billing status
      const { data: billingData } = await supabase.functions.invoke("ml-sync-billing-details", {
        body: { seller_id: sellerId, action: "status" }
      });
      if (billingData?.sync_state) {
        stateRef.current.billingStatus = billingData.sync_state.status;
        stateRef.current.billingSyncScope = billingData.sync_state.scope;
        stateRef.current.billingLastFinished = billingData.sync_state.finished_at;
      }
      
      // Fetch backfill state
      const { data: backfillData } = await supabase
        .from("meli_backfill_sync_state")
        .select("status, last_heartbeat_at")
        .eq("seller_id", sellerId)
        .maybeSingle();
      if (backfillData) {
        stateRef.current.backfillStatus = backfillData.status as WatchdogState['backfillStatus'];
        stateRef.current.backfillLastHeartbeat = backfillData.last_heartbeat_at;
      } else {
        stateRef.current.backfillStatus = null;
      }
      
      // Fetch real costs state & coverage
      const { data: costsData } = await supabase.functions.invoke("ml-sync-real-costs", {
        body: { seller_id: sellerId, action: "status" }
      });
      if (costsData?.state) {
        stateRef.current.realCostsStatus = costsData.state.status;
        stateRef.current.realCostsLastHeartbeat = costsData.state.last_heartbeat_at;
      }
      if (costsData?.coverage) {
        stateRef.current.missingBreakdown = costsData.coverage.missing_breakdown || 0;
        stateRef.current.pendingBilling = costsData.coverage.with_pending_billing || 0;
      }
    } catch (err) {
      console.error("[GlobalWatchdog] Error fetching state:", err);
    }
  }, [sellerId]);

  const isStale = useCallback((lastHeartbeat: string | null) => {
    if (!lastHeartbeat) return false;
    return Date.now() - new Date(lastHeartbeat).getTime() > STALE_THRESHOLD_MS;
  }, []);

  // WATCHDOG DISABLED: automatic actions were causing infinite loops and consuming credits.
  // All sync actions are now manual-only via the force* functions below.
  const runWatchdog = useCallback(async () => {
    // No-op: disabled to prevent infinite edge function invocation loops
  }, []);

  useEffect(() => {
    if (!sellerId || !enabled) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }
    
    // Immediate fetch + run
    fetchState().then(() => runWatchdog());
    
    // Set up interval
    intervalRef.current = setInterval(async () => {
      await fetchState();
      await runWatchdog();
    }, WATCHDOG_INTERVAL_MS);
    
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [sellerId, enabled, fetchState, runWatchdog]);

  // Force resume functions (for manual triggers)
  const forceResumeBilling = useCallback(async () => {
    if (!sellerId) return;
    lastActionRef.current = Date.now();
    return supabase.functions.invoke("ml-sync-billing-details", {
      body: { seller_id: sellerId, action: "sync", scope: stateRef.current.billingSyncScope || "history" }
    });
  }, [sellerId]);

  const forceResumeBackfill = useCallback(async () => {
    if (!sellerId) return;
    lastActionRef.current = Date.now();
    return supabase.functions.invoke("ml-sync-real-costs", {
      body: { seller_id: sellerId, action: "continue_backfill" }
    });
  }, [sellerId]);

  const forceResumeRealCosts = useCallback(async () => {
    if (!sellerId) return;
    lastActionRef.current = Date.now();
    return supabase.functions.invoke("ml-sync-real-costs", {
      body: { seller_id: sellerId, action: "continue", force_resume: true }
    });
  }, [sellerId]);

  const resetProgressOnly = useCallback(async () => {
    if (!sellerId) return;
    // Reset state tables only, not the breakdown data
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
