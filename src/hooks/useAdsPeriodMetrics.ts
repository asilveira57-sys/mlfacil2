import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
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

/**
 * Derive a subset period from cached daily data.
 */
function deriveFromDaily(cached: FullPeriodResponse, dateFrom: string, dateTo: string): FullPeriodResponse | null {
  if (cached.dateFrom > dateFrom || cached.dateTo < dateTo) return null;
  
  const filteredDaily = cached.dailyMetrics.filter(d => d.date >= dateFrom && d.date <= dateTo);
  if (filteredDaily.length === 0) return null;

  let total_seller_revenue = 0, total_seller_orders = 0;
  for (const d of filteredDaily) {
    total_seller_revenue += d.seller_revenue || 0;
    total_seller_orders += d.seller_orders || 0;
  }

  const totalDays = cached.dailyMetrics.length;
  const subsetDays = filteredDaily.length;
  const ratio = totalDays > 0 ? subsetDays / totalDays : 1;

  const total_spent = cached.summary.total_spent * ratio;
  const total_revenue = cached.summary.total_revenue * ratio;
  const total_clicks = Math.round(cached.summary.total_clicks * ratio);
  const total_impressions = Math.round(cached.summary.total_impressions * ratio);
  const total_conversions = Math.round(cached.summary.total_conversions * ratio);

  const organic_revenue = Math.max(0, total_seller_revenue - total_revenue);
  const organic_percent = total_seller_revenue > 0 ? (organic_revenue / total_seller_revenue) * 100 : 0;
  const paid_percent = total_seller_revenue > 0 ? (total_revenue / total_seller_revenue) * 100 : 0;
  const tacos_total = total_seller_revenue > 0 ? (total_spent / total_seller_revenue) * 100 : 0;

  const summary: AdsMetricsSummary = {
    total_spent,
    total_revenue,
    total_clicks,
    total_impressions,
    total_conversions,
    avg_acos: total_revenue > 0 ? (total_spent / total_revenue) * 100 : 0,
    avg_roas: total_spent > 0 ? total_revenue / total_spent : 0,
    avg_cpc: total_clicks > 0 ? total_spent / total_clicks : 0,
    avg_tacos: total_revenue > 0 ? (total_spent / total_revenue) * 100 : 0,
    products_at_loss: cached.summary.products_at_loss,
    products_scalable: cached.summary.products_scalable,
    total_seller_revenue,
    total_seller_orders,
    total_cancelled_revenue: 0,
    total_cancelled_orders: 0,
    organic_revenue,
    organic_percent,
    paid_percent,
    tacos_total,
    cost_per_sale_general: total_seller_orders > 0 ? total_spent / total_seller_orders : 0,
    cost_per_sale_ads: total_conversions > 0 ? total_spent / total_conversions : 0,
  };

  // Scale campaign metrics proportionally
  const derivedCampaigns: CampaignMetric[] = cached.campaigns.map(c => ({
    ml_campaign_id: c.ml_campaign_id,
    name: c.name,
    spent: c.spent * ratio,
    revenue: c.revenue * ratio,
    clicks: Math.round(c.clicks * ratio),
    impressions: Math.round(c.impressions * ratio),
    conversions: Math.round(c.conversions * ratio),
  }));

  return { summary, dailyMetrics: filteredDaily, campaigns: derivedCampaigns, dateFrom, dateTo };
}

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
  const cacheRef = useRef<Map<string, FullPeriodResponse>>(new Map());
  const abortRef = useRef<AbortController | null>(null);

  const fetchMetrics = useCallback(async () => {
    if (!sellerId || !dateFrom || !dateTo) return;

    const cacheKey = `${sellerId}:${dateFrom}:${dateTo}`;
    
    // 1. Exact cache hit
    const cached = cacheRef.current.get(cacheKey);
    if (cached) {
      setSummary(cached.summary);
      setDailyMetrics(cached.dailyMetrics);
      setCampaignsMetrics(cached.campaigns);
      setLoading(false);
      return;
    }

    // 2. Try deriving from a larger cached period
    for (const [, entry] of cacheRef.current) {
      if (entry.dateFrom <= dateFrom && entry.dateTo >= dateTo) {
        const derived = deriveFromDaily(entry, dateFrom, dateTo);
        if (derived) {
          cacheRef.current.set(cacheKey, derived);
          setSummary(derived.summary);
          setDailyMetrics(derived.dailyMetrics);
          setCampaignsMetrics(derived.campaigns);
          setLoading(false);
          console.log(`[useAdsPeriodMetrics] Derived ${dateFrom}→${dateTo} from cached ${entry.dateFrom}→${entry.dateTo}`);
          return;
        }
      }
    }

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
      
      // Extract campaigns from edge function response
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

      cacheRef.current.set(cacheKey, fullResponse);
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
