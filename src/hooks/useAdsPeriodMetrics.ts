import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { getAdsCacheStale, setAdsCache, adsCacheKey, ADS_CACHE_TTL } from '@/hooks/useAdsDataCache';
import type { AdsMetricsSummary } from '@/types/ads';

export interface PeriodDailyPoint {
  date: string;
  spent: number;
  revenue: number;
  seller_revenue: number;
  organic_revenue: number;
  seller_orders: number;
  clicks: number;
  impressions: number;
  conversions: number;
}

export interface CampaignMetric {
  ml_campaign_id: string;
  name: string;
  spent: number;
  revenue: number;
  clicks: number;
  impressions: number;
  conversions: number;
}

interface FullPeriodResponse {
  summary: AdsMetricsSummary;
  dailyMetrics: PeriodDailyPoint[];
  campaigns: CampaignMetric[];
  dateFrom: string;
  dateTo: string;
}

interface PeriodMetricsResult {
  summary: AdsMetricsSummary;
  dailyMetrics: PeriodDailyPoint[];
  campaignsMetrics: CampaignMetric[];
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
  total_seller_revenue: 0,
  total_seller_orders: 0,
  total_cancelled_revenue: 0,
  total_cancelled_orders: 0,
  organic_revenue: 0,
  organic_percent: 0,
  paid_percent: 0,
  tacos_total: 0,
  cost_per_sale_general: 0,
  cost_per_sale_ads: 0,
};

export function useAdsPeriodMetrics(
  sellerId?: string,
  dateFrom?: string,
  dateTo?: string,
): PeriodMetricsResult {
  const [summary, setSummary] = useState<AdsMetricsSummary>(emptySummary);
  const [dailyMetrics, setDailyMetrics] = useState<PeriodDailyPoint[]>([]);
  const [campaignsMetrics, setCampaignsMetrics] = useState<CampaignMetric[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();
  const abortRef = useRef<AbortController | null>(null);

  const fetchMetrics = useCallback(async () => {
    if (!sellerId || !dateFrom || !dateTo) return;

    const cacheKey = adsCacheKey(sellerId, 'period', dateFrom, dateTo);

    // 1. Check global memory cache (stale-while-revalidate)
    const cached = getAdsCacheStale<FullPeriodResponse>(cacheKey);
    if (cached) {
      setSummary(cached.data.summary);
      setDailyMetrics(cached.data.dailyMetrics);
      setCampaignsMetrics(cached.data.campaigns);
      
      if (!cached.isStale) {
        // Fresh cache — no need to fetch
        setLoading(false);
        return;
      }
      // Stale cache — show cached data immediately, fetch in background
      console.log(`[useAdsPeriodMetrics] Stale cache hit for ${dateFrom}→${dateTo}, refreshing in background`);
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    // Only show loading spinner if we have no cached data at all
    if (!cached) {
      setLoading(true);
    }
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
        total_seller_revenue: data.total_seller_revenue || 0,
        total_seller_orders: data.total_seller_orders || 0,
        total_cancelled_revenue: data.total_cancelled_revenue || 0,
        total_cancelled_orders: data.total_cancelled_orders || 0,
        organic_revenue: data.organic_revenue || 0,
        organic_percent: data.organic_percent || 0,
        paid_percent: data.paid_percent || 0,
        tacos_total: data.tacos_total || 0,
        cost_per_sale_general: data.cost_per_sale_general || 0,
        cost_per_sale_ads: data.cost_per_sale_ads || 0,
      };

      const daily = Array.isArray(data.daily) ? data.daily : [];
      
      const campaigns: CampaignMetric[] = Array.isArray(data.campaigns)
        ? data.campaigns.map((c: any) => ({
            ml_campaign_id: String(c.ml_campaign_id || c.campaign_id || ''),
            name: c.name || '',
            spent: c.spent || 0,
            revenue: c.revenue || 0,
            clicks: c.clicks || 0,
            impressions: c.impressions || 0,
            conversions: c.conversions || 0,
          }))
        : [];

      const fullResponse: FullPeriodResponse = {
        summary: result,
        dailyMetrics: daily,
        campaigns,
        dateFrom,
        dateTo,
      };

      // Save to global memory cache
      setAdsCache(cacheKey, fullResponse, ADS_CACHE_TTL.PERIOD_METRICS);

      setSummary(result);
      setDailyMetrics(daily);
      setCampaignsMetrics(campaigns);
    } catch (err: any) {
      if (controller.signal.aborted) return;
      const msg = err?.message || 'Erro ao buscar métricas';
      console.error('[useAdsPeriodMetrics] Error:', msg);
      setError(msg);
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

  return { summary, dailyMetrics, campaignsMetrics, loading, error };
}
