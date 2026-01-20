import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

// Types
export interface TrendItem {
  keyword: string;
  url?: string;
}

export interface HighlightItem {
  item_id: string;
  rank: number;
  title: string | null;
  thumbnail: string | null;
  price: number | null;
  sold_quantity: number | null;
  permalink: string | null;
  estimated_revenue?: number | null;
  entity_type?: string;
}

export interface SellerItem {
  item_id: string;
  title: string;
  thumbnail: string | null;
  visits?: number;
  quantity?: number;
  revenue?: number;
  conversion_rate?: number;
}

export interface PerformanceItem {
  item_id: string;
  title: string;
  thumbnail: string | null;
  visits: number;
  quantity: number;
  revenue: number;
  conversion_rate: number;
}

export interface PerformanceData {
  items: PerformanceItem[];
  data_range: {
    visits: { from: string; to: string };
    sales: { from: string; to: string };
    effective: { from: string; to: string };
  };
  period_requested: number;
  period_actual: number;
  has_limited_data: boolean;
}

export interface TrendAlert {
  id: string;
  seller_id: string;
  alert_type: string;
  item_id: string | null;
  title: string;
  message: string | null;
  severity: 'info' | 'warning' | 'critical';
  is_read: boolean;
  is_dismissed: boolean;
  alert_data: Record<string, unknown> | null;
  triggered_at: string;
}

export interface FeatureFlags {
  'tendencias.view_market': boolean;
  'tendencias.view_seller': boolean;
  'tendencias.view_revenue': boolean;
  'tendencias.manage_accounts': boolean;
}

export interface OverviewData {
  alerts_count: number;
  latest_trend_date: string | null;
  seller_stats: {
    visits_7d: number;
    visits_28d: number;
    sales_7d: number;
    sales_28d: number;
    growth_7d_vs_28d: string | null;
  } | null;
  market_available: boolean;
}

// API call helper
async function callTrendsApi<T>(path: string, params: Record<string, string> = {}): Promise<T> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Not authenticated');

  const queryString = new URLSearchParams(params).toString();

  const response = await fetch(
    `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/trends-api/${path}${queryString ? `?${queryString}` : ''}`,
    {
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
      },
    }
  );

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || `API error: ${response.status}`);
  }

  return response.json();
}

async function postTrendsApi<T>(path: string, body: Record<string, unknown> = {}): Promise<T> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Not authenticated');

  const response = await fetch(
    `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/trends-api/${path}`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    }
  );

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || `API error: ${response.status}`);
  }

  return response.json();
}

// Hooks

export function useFeatureFlags() {
  return useQuery({
    queryKey: ['trends', 'feature-flags'],
    queryFn: () => callTrendsApi<{ flags: FeatureFlags }>('feature-flags'),
    staleTime: 5 * 60 * 1000,
  });
}

export function useOverview(sellerId: string | null) {
  return useQuery({
    queryKey: ['trends', 'overview', sellerId],
    queryFn: () => callTrendsApi<OverviewData>('overview', sellerId ? { seller_id: sellerId } : {}),
    enabled: true,
    staleTime: 60 * 1000,
  });
}

export function useMarketTrends(siteId: string = 'MLB', categoryId?: string) {
  return useQuery({
    queryKey: ['trends', 'market', 'trends', siteId, categoryId],
    queryFn: () => callTrendsApi<{ trends: TrendItem[]; keywords: TrendItem[]; snapshot_date: string | null; message?: string }>(
      'mercado/trends',
      { site_id: siteId, ...(categoryId ? { category_id: categoryId } : {}) }
    ),
    staleTime: 5 * 60 * 1000,
  });
}

export function useMarketHighlights(siteId: string = 'MLB', categoryId?: string) {
  return useQuery({
    queryKey: ['trends', 'market', 'highlights', siteId, categoryId || 'all'],
    queryFn: () => callTrendsApi<{ items: HighlightItem[]; snapshot_date?: string; message?: string }>(
      'mercado/highlights',
      { site_id: siteId, ...(categoryId ? { category_id: categoryId } : { all: 'true' }) }
    ),
    enabled: true,
    staleTime: 5 * 60 * 1000,
  });
}

export function useSellerTopVisited(sellerId: string | null, days: number = 7) {
  console.log('[useTrendsApi] useSellerTopVisited called with days:', days);
  return useQuery({
    queryKey: ['trends', 'seller', 'top-visited', sellerId, days],
    queryFn: () => callTrendsApi<{ items: SellerItem[]; period_days: number; data_range?: { from: string; to: string } }>(
      'seller/top-visitados',
      { seller_id: sellerId!, days: String(days) }
    ),
    enabled: !!sellerId,
    staleTime: 0, // Disable stale time to ensure fresh data
  });
}

export function useSellerTopSold(sellerId: string | null, days: number = 7) {
  console.log('[useTrendsApi] useSellerTopSold called with days:', days);
  return useQuery({
    queryKey: ['trends', 'seller', 'top-sold', sellerId, days],
    queryFn: () => callTrendsApi<{ items: SellerItem[]; period_days: number; data_range?: { from: string; to: string } }>(
      'seller/top-vendidos',
      { seller_id: sellerId!, days: String(days) }
    ),
    enabled: !!sellerId,
    staleTime: 0, // Disable stale time to ensure fresh data
  });
}

export function useSellerPerformance(sellerId: string | null, days: number = 7) {
  console.log('[useTrendsApi] useSellerPerformance called with days:', days);
  return useQuery({
    queryKey: ['trends', 'seller', 'performance', sellerId, days],
    queryFn: () => callTrendsApi<PerformanceData>(
      'seller/performance',
      { seller_id: sellerId!, days: String(days) }
    ),
    enabled: !!sellerId,
    staleTime: 0,
  });
}

export function useAlerts(sellerId: string | null, includeRead = false, includeDismissed = false) {
  return useQuery({
    queryKey: ['trends', 'alerts', sellerId, includeRead, includeDismissed],
    queryFn: () => callTrendsApi<{ alerts: TrendAlert[]; unread_count: number }>(
      'alertas',
      {
        ...(sellerId ? { seller_id: sellerId } : {}),
        include_read: String(includeRead),
        include_dismissed: String(includeDismissed),
      }
    ),
    staleTime: 30 * 1000,
  });
}

export function useMarkAlertRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (alertId: string) => postTrendsApi('alertas/mark-read', { alert_id: alertId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['trends', 'alerts'] });
      queryClient.invalidateQueries({ queryKey: ['trends', 'overview'] });
    },
  });
}

export function useDismissAlert() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (alertId: string) => postTrendsApi('alertas/dismiss', { alert_id: alertId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['trends', 'alerts'] });
      queryClient.invalidateQueries({ queryKey: ['trends', 'overview'] });
    },
  });
}

export function useTriggerCollection() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ sellerId, collectType }: { sellerId: string; collectType: 'all' | 'visits' | 'sales' }) => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/trends-collect-seller`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ seller_id: sellerId, collect_type: collectType }),
        }
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to trigger collection');
      }

      return response.json();
    },
    onSuccess: () => {
      // Invalidate seller queries after a delay to allow background processing
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ['trends', 'seller'] });
      }, 5000);
    },
  });
}
