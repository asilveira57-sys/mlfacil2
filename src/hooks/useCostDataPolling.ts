import { useEffect, useRef, useCallback, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

const POLL_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes — manual refresh preferred

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
  const intervalRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isVisibleRef = useRef(true);

  const fetchSummary = useCallback(async () => {
    if (!sellerId || !enabled || !isVisibleRef.current) return;

    try {
      setLoading(true);
      
      // Calculate date range
      const computedDateTo = dateTo || new Date().toISOString();
      const computedDateFrom = dateFrom || new Date(Date.now() - periodDays * 86400000).toISOString();

      // Call the RPC directly instead of going through the edge function
      const { data: summaryData, error } = await supabase.rpc('get_cost_summary_v2', {
        p_seller_id: sellerId,
        p_date_from: computedDateFrom,
        p_date_to: computedDateTo,
      });

      if (error) {
        console.error("[CostDataPolling] RPC error:", error);
        return;
      }

      if (summaryData) {
        const s = (Array.isArray(summaryData) ? summaryData[0] : summaryData) as Record<string, any>;
        const newSummary: CostSummaryData = {
          total_revenue: s?.total_revenue || 0,
          total_cost: s?.total_cost || 0,
          total_profit: s?.total_profit || 0,
          avg_margin: s?.avg_margin || 0,
          order_count: s?.orders_imported || 0,
          incomplete_percent: s?.incomplete_percent || 0,
          cancelled_count: s?.cancelled_count || 0,
          cancelled_vgv: s?.cancelled_vgv || 0,
          missing_cost_count: s?.missing_cost_count || 0,
          total_cost_product: s?.total_cost_product || 0,
          total_cost_shipping: s?.total_cost_shipping || 0,
          total_cost_marketplace: s?.total_cost_marketplace || 0,
          total_tax: s?.total_cost_tax || 0,
          total_packaging: s?.total_cost_packaging || 0,
          total_installments: s?.total_installments || 0,
          total_cost_other: s?.total_cost_other || 0,
          orders_imported: s?.orders_imported || 0,
          orders_calculated: s?.orders_calculated || 0,
          coverage_percent: s?.coverage_percent || 0,
        };
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

  // No auto-refresh on tab visibility — manual refresh only
  // This prevents unnecessary queries on tab switch

  // Polling effect
  useEffect(() => {
    if (!sellerId || !enabled) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }

    fetchSummary();

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
