import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface SellerCategoryMetric {
  category_id: string;
  category_name?: string;
  period_key: string;
  quantity_sold: number;
  revenue: number;
  avg_ticket: number;
  margin_percent: number | null;
  items_count: number;
  orders_count: number;
  calculated_at: string;
}

export interface MarketComparison {
  category_id: string;
  category_name: string;
  seller: {
    quantity_sold: number;
    revenue: number;
    avg_ticket: number;
    margin_percent: number | null;
    items_count: number;
  };
  market: {
    avg_price: number | null;
    min_price: number | null;
    max_price: number | null;
    top_seller_revenue_estimate: number | null;
  };
  positioning: {
    price_vs_market: 'below' | 'average' | 'above' | 'unknown';
    price_diff_percent: number | null;
  };
}

// Fetch seller metrics by category from the database
export function useSellerCategoryMetrics(sellerId: string | null, periodKey: string = 'last_30d') {
  return useQuery({
    queryKey: ['seller-category-metrics', sellerId, periodKey],
    queryFn: async (): Promise<SellerCategoryMetric[]> => {
      if (!sellerId) return [];

      const { data, error } = await supabase
        .from('seller_category_metrics')
        .select('*')
        .eq('seller_id', sellerId)
        .eq('period_key', periodKey)
        .order('revenue', { ascending: false });

      if (error) {
        console.error('[useSellerCategoryMetrics] Error:', error);
        return [];
      }

      // Resolve category names from cache
      const categoryIds = data.map(d => d.category_id).filter(id => id !== 'unknown');
      const { data: categories } = await supabase
        .from('category_tree_cache')
        .select('id, name')
        .in('id', categoryIds);

      const categoryNameMap = new Map<string, string>();
      for (const cat of categories || []) {
        categoryNameMap.set(cat.id, cat.name);
      }

      // If not in cache, try to fetch from ML API
      const missingCategories = categoryIds.filter(id => !categoryNameMap.has(id));
      for (const catId of missingCategories.slice(0, 5)) { // Limit to avoid too many requests
        try {
          const res = await fetch(`https://api.mercadolibre.com/categories/${catId}`);
          if (res.ok) {
            const catData = await res.json();
            categoryNameMap.set(catId, catData.name);
          }
        } catch {
          // Ignore errors
        }
      }

      return data.map(d => ({
        ...d,
        category_name: categoryNameMap.get(d.category_id) || d.category_id,
      }));
    },
    enabled: !!sellerId,
    staleTime: 2 * 60 * 1000, // 2 minutes
  });
}

// Trigger metrics calculation
export function useTriggerMetricsCalculation() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ sellerId, periodKey }: { sellerId: string; periodKey: string }) => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/trends-seller-metrics`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ seller_id: sellerId, period_key: periodKey }),
        }
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to calculate metrics');
      }

      return response.json();
    },
    onSuccess: (_, { sellerId, periodKey }) => {
      queryClient.invalidateQueries({ 
        queryKey: ['seller-category-metrics', sellerId, periodKey] 
      });
    },
  });
}

// Fetch market data for comparison
export function useMarketComparison(sellerId: string | null, periodKey: string = 'last_30d') {
  const { data: sellerMetrics } = useSellerCategoryMetrics(sellerId, periodKey);

  return useQuery({
    queryKey: ['market-comparison', sellerId, periodKey, sellerMetrics?.length],
    queryFn: async (): Promise<MarketComparison[]> => {
      if (!sellerMetrics || sellerMetrics.length === 0) return [];

      const comparisons: MarketComparison[] = [];

      for (const metric of sellerMetrics.slice(0, 10)) { // Top 10 categories
        if (metric.category_id === 'unknown') continue;

        // Try to get market highlights for comparison
        const { data: highlights } = await supabase
          .from('highlights_items')
          .select(`
            price,
            sold_quantity,
            estimated_revenue,
            highlights_snapshots!inner(category_id)
          `)
          .eq('highlights_snapshots.category_id', metric.category_id)
          .order('rank', { ascending: true })
          .limit(5);

        let marketAvgPrice = null;
        let marketMinPrice = null;
        let marketMaxPrice = null;
        let topSellerRevenueEstimate = null;

        if (highlights && highlights.length > 0) {
          const prices = highlights.map(h => h.price).filter(p => p != null) as number[];
          if (prices.length > 0) {
            marketAvgPrice = prices.reduce((a, b) => a + b, 0) / prices.length;
            marketMinPrice = Math.min(...prices);
            marketMaxPrice = Math.max(...prices);
          }
          
          const revenues = highlights.map(h => h.estimated_revenue).filter(r => r != null) as number[];
          if (revenues.length > 0) {
            topSellerRevenueEstimate = revenues[0]; // Top seller's estimated revenue
          }
        }

        // Calculate price positioning
        let priceVsMarket: 'below' | 'average' | 'above' | 'unknown' = 'unknown';
        let priceDiffPercent: number | null = null;

        if (marketAvgPrice && metric.avg_ticket > 0) {
          priceDiffPercent = ((metric.avg_ticket - marketAvgPrice) / marketAvgPrice) * 100;
          
          if (priceDiffPercent < -10) {
            priceVsMarket = 'below';
          } else if (priceDiffPercent > 10) {
            priceVsMarket = 'above';
          } else {
            priceVsMarket = 'average';
          }
        }

        comparisons.push({
          category_id: metric.category_id,
          category_name: metric.category_name || metric.category_id,
          seller: {
            quantity_sold: metric.quantity_sold,
            revenue: metric.revenue,
            avg_ticket: metric.avg_ticket,
            margin_percent: metric.margin_percent,
            items_count: metric.items_count,
          },
          market: {
            avg_price: marketAvgPrice,
            min_price: marketMinPrice,
            max_price: marketMaxPrice,
            top_seller_revenue_estimate: topSellerRevenueEstimate,
          },
          positioning: {
            price_vs_market: priceVsMarket,
            price_diff_percent: priceDiffPercent,
          },
        });
      }

      return comparisons;
    },
    enabled: !!sellerId && !!sellerMetrics && sellerMetrics.length > 0,
    staleTime: 5 * 60 * 1000,
  });
}
