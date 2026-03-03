import { useEffect, useRef, useCallback, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

const POLL_INTERVAL_MS = 30000; // 30 seconds

export interface CostSummaryData {
  total_revenue: number;
  total_cost: number;
  total_profit: number;
  avg_margin: number;
  order_count: number;
  incomplete_percent: number;
  cancelled_count: number;
  cancelled_vgv: number;
  missing_cost_count?: number;
  abc_a_percent?: number;
  abc_b_percent?: number;
  abc_c_percent?: number;
  total_cost_product?: number;
  total_cost_shipping?: number;
  total_cost_marketplace?: number;
  total_tax?: number;
  total_packaging?: number;
  total_installments?: number;
  total_cost_other?: number;
  total_receita_produtos?: number;
  total_receita_envio?: number;
  // Coverage metrics (from V2 RPC)
  orders_imported?: number;
  orders_calculated?: number;
  coverage_percent?: number;
}

interface UseCostDataPollingOptions {
  sellerId: string | null;
  enabled?: boolean;
  dateFrom?: string | null;
  dateTo?: string | null;
  periodDays?: number;
  onSummaryUpdate?: (summary: CostSummaryData | null) => void;
}

export function useCostDataPolling({ 
  sellerId, 
  enabled = true,
  dateFrom,
  dateTo,
  periodDays = 30,
  onSummaryUpdate 
}: UseCostDataPollingOptions) {
  const [loading, setLoading] = useState(false);
  const [summary, setSummary] = useState<CostSummaryData | null>(null);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const isVisibleRef = useRef(true);

  const fetchSummary = useCallback(async () => {
    if (!sellerId || !enabled || !isVisibleRef.current) return;

    try {
      setLoading(true);
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const queryParams = new URLSearchParams({ seller_id: sellerId, period_days: String(periodDays) });
      if (dateFrom) queryParams.set('date_from', dateFrom);
      if (dateTo) queryParams.set('date_to', dateTo);

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/cost-engine/summary?${queryParams}`,
        { headers: { Authorization: `Bearer ${session.access_token}` } }
      );

      if (response.ok) {
        const data = await response.json();
        // API returns { summary: { ... } }, extract the nested summary
        const newSummary = data.summary || null;
        setSummary(newSummary);
        setLastUpdate(new Date());
        onSummaryUpdate?.(newSummary);
      }
    } catch (error) {
      console.error("[CostDataPolling] Error fetching summary:", error);
    } finally {
      setLoading(false);
    }
  }, [sellerId, enabled, dateFrom, dateTo, periodDays, onSummaryUpdate]);

  // Track tab visibility
  useEffect(() => {
    const handleVisibilityChange = () => {
      isVisibleRef.current = document.visibilityState === "visible";
      
      // Fetch immediately when tab becomes visible
      if (isVisibleRef.current && sellerId && enabled) {
        fetchSummary();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [sellerId, enabled, fetchSummary]);

  // Polling effect
  useEffect(() => {
    if (!sellerId || !enabled) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }

    // Initial fetch
    fetchSummary();

    // Set up polling
    intervalRef.current = setInterval(() => {
      if (isVisibleRef.current) {
        fetchSummary();
      }
    }, POLL_INTERVAL_MS);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [sellerId, enabled, fetchSummary]);

  const refresh = useCallback(() => {
    fetchSummary();
  }, [fetchSummary]);

  return {
    summary,
    loading,
    lastUpdate,
    refresh,
  };
}
