import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import type { AdsMetricsSummary } from '@/types/ads';

export interface PeriodDailyPoint {
  date: string;
  spent: number;
  revenue: number;
}

interface PeriodMetricsResult {
  summary: AdsMetricsSummary;
  dailyMetrics: PeriodDailyPoint[];
  loading: boolean;
  error: string | null;
}

const emptySummary: AdsMetricsSummary = {
  total_spent: 0,
  total_revenue: 0,
  total_clicks: 0,
  total_impressions: 0,
  total_conversions: 0,
  avg_acos: 0,
  avg_roas: 0,
  avg_cpc: 0,
  avg_tacos: 0,
  products_at_loss: 0,
  products_scalable: 0,
};

export function useAdsPeriodMetrics(
  sellerId?: string,
  dateFrom?: string,
  dateTo?: string,
): PeriodMetricsResult {
  const [summary, setSummary] = useState<AdsMetricsSummary>(emptySummary);
  const [dailyMetrics, setDailyMetrics] = useState<PeriodDailyPoint[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();
  const cacheRef = useRef<Map<string, AdsMetricsSummary>>(new Map());
  const abortRef = useRef<AbortController | null>(null);

  const fetchMetrics = useCallback(async () => {
    if (!sellerId || !dateFrom || !dateTo) return;

    const cacheKey = `${sellerId}:${dateFrom}:${dateTo}`;
    const cached = cacheRef.current.get(cacheKey);
    if (cached) {
      setSummary(cached);
      setLoading(false);
      return;
    }

    // Abort previous request
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError(null);

    try {
      const { data, error: fnError } = await supabase.functions.invoke('ads-period-metrics', {
        body: { seller_id: sellerId, date_from: dateFrom, date_to: dateTo },
      });

      if (controller.signal.aborted) return;

      if (fnError) {
        throw new Error(fnError.message || 'Erro ao buscar métricas do período');
      }

      const result: AdsMetricsSummary = {
        total_spent: data.total_spent || 0,
        total_revenue: data.total_revenue || 0,
        total_clicks: data.total_clicks || 0,
        total_impressions: data.total_impressions || 0,
        total_conversions: data.total_conversions || 0,
        avg_acos: data.avg_acos || 0,
        avg_roas: data.avg_roas || 0,
        avg_cpc: data.avg_cpc || 0,
        avg_tacos: data.avg_tacos || 0,
        products_at_loss: data.products_at_loss || 0,
        products_scalable: data.products_scalable || 0,
      };

      cacheRef.current.set(cacheKey, result);
      setSummary(result);
      setDailyMetrics(Array.isArray(data.daily) ? data.daily : []);
    } catch (err: any) {
      if (controller.signal.aborted) return;
      const msg = err?.message || 'Erro ao buscar métricas';
      console.error('[useAdsPeriodMetrics] Error:', msg);
      setError(msg);
      // Don't toast on every error, only set error state
    } finally {
      if (!controller.signal.aborted) {
        setLoading(false);
      }
    }
  }, [sellerId, dateFrom, dateTo, toast]);

  useEffect(() => {
    fetchMetrics();
    return () => {
      abortRef.current?.abort();
    };
  }, [fetchMetrics]);

  return { summary, dailyMetrics, loading, error };
}
