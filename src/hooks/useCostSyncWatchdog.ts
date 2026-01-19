import { useEffect, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

const WATCHDOG_INTERVAL_MS = 5000;
const STALE_THRESHOLD_MS = 60000;
const COOLDOWN_MS = 10000;

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

  const runWatchdog = useCallback(async () => {
    if (!sellerId || !enabled || isResumingRef.current) return;
    
    // Cooldown check
    if (Date.now() - lastActionRef.current < COOLDOWN_MS) return;
    
    const state = stateRef.current;

    // Priority 0: Billing is stale (>6h since last sync) and not running -> Auto-sync
    const billingIsStale = !state.billingLastFinished || 
      (Date.now() - new Date(state.billingLastFinished).getTime() > BILLING_STALE_THRESHOLD_MS);
    
    if (billingIsStale && 
        state.billingStatus !== 'running' && 
        state.billingStatus !== 'paused' &&
        state.pendingBilling > 0) {
      console.log("[GlobalWatchdog] Billing is stale and has pending orders, triggering auto-sync...");
      isResumingRef.current = true;
      lastActionRef.current = Date.now();
      try {
        await supabase.functions.invoke("ml-sync-billing-details", {
          body: { seller_id: sellerId, action: "sync", scope: "recent" }
        });
      } catch (err) {
        console.error("[GlobalWatchdog] Error auto-syncing billing:", err);
      } finally {
        setTimeout(() => { isResumingRef.current = false; }, 10000);
      }
      return;
    }
    
    // Priority 1: Billing paused -> Resume
    if (state.billingStatus === 'paused') {
      console.log("[GlobalWatchdog] Resuming paused billing sync...");
      isResumingRef.current = true;
      lastActionRef.current = Date.now();
      try {
        await supabase.functions.invoke("ml-sync-billing-details", {
          body: { seller_id: sellerId, action: "sync", scope: state.billingSyncScope || "history" }
        });
      } catch (err) {
        console.error("[GlobalWatchdog] Error resuming billing:", err);
      } finally {
        setTimeout(() => { isResumingRef.current = false; }, 5000);
      }
      return;
    }
    
    // Priority 2: Backfill paused -> Resume
    if (state.backfillStatus === 'paused') {
      console.log("[GlobalWatchdog] Resuming paused backfill...");
      isResumingRef.current = true;
      lastActionRef.current = Date.now();
      try {
        await supabase.functions.invoke("ml-sync-real-costs", {
          body: { seller_id: sellerId, action: "continue_backfill" }
        });
      } catch (err) {
        console.error("[GlobalWatchdog] Error resuming backfill:", err);
      } finally {
        setTimeout(() => { isResumingRef.current = false; }, 5000);
      }
      return;
    }
    
    // Priority 2b: Backfill stale running -> Force resume
    if (state.backfillStatus === 'running' && isStale(state.backfillLastHeartbeat)) {
      console.log("[GlobalWatchdog] Force resuming stale backfill...");
      isResumingRef.current = true;
      lastActionRef.current = Date.now();
      try {
        await supabase.functions.invoke("ml-sync-real-costs", {
          body: { seller_id: sellerId, action: "continue_backfill" }
        });
      } catch (err) {
        console.error("[GlobalWatchdog] Error force resuming backfill:", err);
      } finally {
        setTimeout(() => { isResumingRef.current = false; }, 5000);
      }
      return;
    }
    
    // Priority 3: Missing breakdown > 0 and no backfill running -> Start backfill
    if (state.missingBreakdown > 0 && 
        (!state.backfillStatus || state.backfillStatus === 'idle' || state.backfillStatus === 'done') &&
        (state.billingStatus === 'done' || !state.billingStatus)) {
      console.log("[GlobalWatchdog] Starting backfill for missing orders...");
      isResumingRef.current = true;
      lastActionRef.current = Date.now();
      try {
        await supabase.functions.invoke("ml-sync-real-costs", {
          body: { seller_id: sellerId, action: "backfill_missing" }
        });
      } catch (err) {
        console.error("[GlobalWatchdog] Error starting backfill:", err);
      } finally {
        setTimeout(() => { isResumingRef.current = false; }, 5000);
      }
      return;
    }
    
    // Priority 4: Real costs paused -> Resume
    if (state.realCostsStatus === 'paused') {
      console.log("[GlobalWatchdog] Resuming paused real costs sync...");
      isResumingRef.current = true;
      lastActionRef.current = Date.now();
      try {
        await supabase.functions.invoke("ml-sync-real-costs", {
          body: { seller_id: sellerId, action: "continue" }
        });
      } catch (err) {
        console.error("[GlobalWatchdog] Error resuming real costs:", err);
      } finally {
        setTimeout(() => { isResumingRef.current = false; }, 5000);
      }
      return;
    }
    
    // Priority 4b: Real costs stale running -> Force resume
    if (state.realCostsStatus === 'running' && isStale(state.realCostsLastHeartbeat)) {
      console.log("[GlobalWatchdog] Force resuming stale real costs sync...");
      isResumingRef.current = true;
      lastActionRef.current = Date.now();
      try {
        await supabase.functions.invoke("ml-sync-real-costs", {
          body: { seller_id: sellerId, action: "continue", force_resume: true }
        });
      } catch (err) {
        console.error("[GlobalWatchdog] Error force resuming real costs:", err);
      } finally {
        setTimeout(() => { isResumingRef.current = false; }, 5000);
      }
      return;
    }
    
    // Priority 5: Pending billing > 0 and backfill done -> Reprocess pending
    if (state.pendingBilling > 0 &&
        state.missingBreakdown === 0 &&
        state.backfillStatus === 'done' &&
        (!state.realCostsStatus || state.realCostsStatus === 'idle' || state.realCostsStatus === 'done')) {
      console.log("[GlobalWatchdog] Starting reprocess pending...");
      isResumingRef.current = true;
      lastActionRef.current = Date.now();
      try {
        await supabase.functions.invoke("ml-sync-real-costs", {
          body: { seller_id: sellerId, action: "reprocess_pending" }
        });
      } catch (err) {
        console.error("[GlobalWatchdog] Error reprocessing pending:", err);
      } finally {
        setTimeout(() => { isResumingRef.current = false; }, 5000);
      }
    }
  }, [sellerId, enabled, isStale]);

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
