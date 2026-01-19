import { useEffect, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

// Check for stale orders every 60 seconds
const WATCHDOG_INTERVAL_MS = 60000;
// Consider stale if last sync was more than 15 minutes ago
const STALE_THRESHOLD_MS = 15 * 60 * 1000;
// Cooldown between sync actions
const COOLDOWN_MS = 60000;
// Only sync last 7 days for quick updates
const SYNC_DAYS = 7;

interface OrdersSyncState {
  lastSyncAt: string | null;
  isRunning: boolean;
}

export function useOrdersSyncWatchdog(sellerId: string | null, enabled: boolean) {
  const stateRef = useRef<OrdersSyncState>({
    lastSyncAt: null,
    isRunning: false,
  });

  const lastActionRef = useRef<number>(0);
  const isSyncingRef = useRef(false);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  const fetchState = useCallback(async () => {
    if (!sellerId) return;

    try {
      // Get the most recent completed orders sync job
      const { data: lastJob } = await supabase
        .from("sync_jobs")
        .select("completed_at, status")
        .eq("seller_id", sellerId)
        .eq("job_type", "orders")
        .eq("status", "done")
        .order("completed_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      stateRef.current.lastSyncAt = lastJob?.completed_at || null;

      // Check if there's a running sync job
      const { data: runningJob } = await supabase
        .from("sync_jobs")
        .select("id")
        .eq("seller_id", sellerId)
        .eq("job_type", "orders")
        .in("status", ["pending", "processing"])
        .limit(1)
        .maybeSingle();

      stateRef.current.isRunning = !!runningJob;
    } catch (err) {
      console.error("[OrdersWatchdog] Error fetching state:", err);
    }
  }, [sellerId]);

  const isStale = useCallback(() => {
    const { lastSyncAt } = stateRef.current;
    if (!lastSyncAt) return true; // No sync ever = stale
    return Date.now() - new Date(lastSyncAt).getTime() > STALE_THRESHOLD_MS;
  }, []);

  const runWatchdog = useCallback(async () => {
    if (!sellerId || !enabled || isSyncingRef.current) return;

    // Cooldown check
    if (Date.now() - lastActionRef.current < COOLDOWN_MS) return;

    const state = stateRef.current;

    // Don't sync if there's already one running
    if (state.isRunning) return;

    // Check if data is stale
    if (isStale()) {
      console.log("[OrdersWatchdog] Data is stale, triggering background sync...");
      isSyncingRef.current = true;
      lastActionRef.current = Date.now();

      // Notify UI that sync is starting
      window.dispatchEvent(new CustomEvent("orders_sync_start", {
        detail: { sellerId }
      }));

      try {
        // Get auth token
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) {
          isSyncingRef.current = false;
          return;
        }

        // Calculate date range for last 7 days
        const now = new Date();
        const sevenDaysAgo = new Date(now);
        sevenDaysAgo.setDate(now.getDate() - SYNC_DAYS);

        const formatDate = (d: Date, time: string) =>
          `${d.toISOString().split("T")[0]}T${time}-03:00`;

        const dateFrom = formatDate(sevenDaysAgo, "00:00:00.000");
        const dateTo = formatDate(now, "23:59:59.999");

        console.log(`[OrdersWatchdog] Syncing orders from ${dateFrom} to ${dateTo}`);

        // Trigger orders sync
        const response = await supabase.functions.invoke("ml-sync-orders", {
          headers: { Authorization: `Bearer ${session.access_token}` },
          body: {
            seller_id: sellerId,
            date_from: dateFrom,
            date_to: dateTo,
          },
        });

        if (response.data?.job_id) {
          console.log(`[OrdersWatchdog] Sync job started: ${response.data.job_id}`);

          // Wait for job completion (poll every 2 seconds)
          const waitForJob = async (jobId: string): Promise<boolean> => {
            for (let i = 0; i < 60; i++) {
              // Max 2 minutes wait
              await new Promise((r) => setTimeout(r, 2000));

              const { data: job } = await supabase
                .from("sync_jobs")
                .select("status")
                .eq("id", jobId)
                .maybeSingle();

              if (!job) return false;
              if (job.status === "done") return true;
              if (job.status === "error") return false;
            }
            return false;
          };

          const success = await waitForJob(response.data.job_id);

          if (success) {
            console.log("[OrdersWatchdog] Orders sync completed, triggering billing sync...");

            // Dispatch event to notify UI that billing sync is starting
            window.dispatchEvent(new CustomEvent("billing_sync_start", {
              detail: { sellerId }
            }));

            // First: Sync billing data (commissions, shipping fees) for recent periods
            try {
              await supabase.functions.invoke("ml-sync-billing-details", {
                body: { seller_id: sellerId, action: "sync", scope: "recent" },
              });
              console.log("[OrdersWatchdog] Billing sync triggered successfully");
            } catch (billingErr) {
              console.error("[OrdersWatchdog] Billing sync failed:", billingErr);
            }

            // Wait a moment for billing to process before triggering cost calculation
            await new Promise((r) => setTimeout(r, 3000));

            console.log("[OrdersWatchdog] Triggering cost backfill...");

            // Second: Trigger cost backfill to calculate costs using new billing data
            await supabase.functions.invoke("ml-sync-real-costs", {
              body: { seller_id: sellerId, action: "backfill_missing" },
            });

            // Third: Reprocess any pending orders that now have billing data
            await new Promise((r) => setTimeout(r, 2000));
            await supabase.functions.invoke("ml-sync-real-costs", {
              body: { seller_id: sellerId, action: "reprocess_pending" },
            });

            // Dispatch event to notify dashboard to refresh
            window.dispatchEvent(new CustomEvent("orders_sync_complete", {
              detail: { sellerId }
            }));
          }
        }
      } catch (err) {
        console.error("[OrdersWatchdog] Error syncing orders:", err);
      } finally {
        isSyncingRef.current = false;
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

    // Initial fetch + run
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

  // Manual sync trigger
  const forceSyncOrders = useCallback(async () => {
    if (!sellerId) return;

    lastActionRef.current = Date.now();
    isSyncingRef.current = true;

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const now = new Date();
      const sevenDaysAgo = new Date(now);
      sevenDaysAgo.setDate(now.getDate() - SYNC_DAYS);

      const formatDate = (d: Date, time: string) =>
        `${d.toISOString().split("T")[0]}T${time}-03:00`;

      return supabase.functions.invoke("ml-sync-orders", {
        headers: { Authorization: `Bearer ${session.access_token}` },
        body: {
          seller_id: sellerId,
          date_from: formatDate(sevenDaysAgo, "00:00:00.000"),
          date_to: formatDate(now, "23:59:59.999"),
        },
      });
    } finally {
      setTimeout(() => {
        isSyncingRef.current = false;
      }, 5000);
    }
  }, [sellerId]);

  return {
    forceSyncOrders,
    isSyncing: isSyncingRef.current,
  };
}
