import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

interface SalesVolumeData {
  totalSales30d: number;
  accountBreakdown: { sellerId: string; nickname: string | null; sales30d: number }[];
  minimumPlanSlug: string | null;
  loading: boolean;
}

/**
 * Slug-based sales thresholds for each plan tier.
 * Order matters: first match wins (ascending).
 */
const PLAN_THRESHOLDS: { slug: string; maxSales: number }[] = [
  { slug: 'ate-50-vendas', maxSales: 50 },
  { slug: '51-300-vendas', maxSales: 300 },
  { slug: '301-700-vendas', maxSales: 700 },
  { slug: '701-1500-vendas', maxSales: 1500 },
  { slug: '1501-3000-vendas', maxSales: 3000 },
  { slug: 'acima-3000-vendas', maxSales: Infinity },
];

function getMinimumPlanSlug(totalSales: number): string | null {
  if (totalSales <= 0) return null;
  for (const tier of PLAN_THRESHOLDS) {
    if (totalSales <= tier.maxSales) return tier.slug;
  }
  return 'acima-3000-vendas';
}

/**
 * Returns true if a plan with the given slug is too small for the user's sales volume.
 */
export function isPlanTooSmall(planSlug: string, totalSales: number): boolean {
  if (totalSales <= 0) return false;
  const planTier = PLAN_THRESHOLDS.find(t => t.slug === planSlug);
  if (!planTier) return false; // unknown plan (e.g. ZPL)
  return totalSales > planTier.maxSales;
}

async function fetchSalesVolume(): Promise<Omit<SalesVolumeData, 'loading'>> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { totalSales30d: 0, accountBreakdown: [], minimumPlanSlug: null };

  // Get all active ML accounts
  const { data: accounts } = await supabase
    .from('ml_accounts')
    .select('ml_user_id, nickname')
    .eq('user_id', user.id)
    .eq('is_active', true);

  if (!accounts || accounts.length === 0) {
    return { totalSales30d: 0, accountBreakdown: [], minimumPlanSlug: null };
  }

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const dateFrom = thirtyDaysAgo.toISOString();

  // Count orders per account in parallel
  const breakdown = await Promise.all(
    accounts.map(async (acc) => {
      const { count } = await supabase
        .from('meli_orders_cache')
        .select('*', { count: 'exact', head: true })
        .eq('seller_id', acc.ml_user_id)
        .eq('order_status', 'paid')
        .gte('created_at_meli', dateFrom);

      return {
        sellerId: acc.ml_user_id,
        nickname: acc.nickname,
        sales30d: count || 0,
      };
    })
  );

  const totalSales30d = breakdown.reduce((sum, b) => sum + b.sales30d, 0);
  const minimumPlanSlug = getMinimumPlanSlug(totalSales30d);

  return { totalSales30d, accountBreakdown: breakdown, minimumPlanSlug };
}

export function useUserSalesVolume() {
  const query = useQuery({
    queryKey: ['user-sales-volume'],
    queryFn: fetchSalesVolume,
    staleTime: 5 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  return {
    totalSales30d: query.data?.totalSales30d ?? 0,
    accountBreakdown: query.data?.accountBreakdown ?? [],
    minimumPlanSlug: query.data?.minimumPlanSlug ?? null,
    loading: query.isLoading,
    error: query.error,
  };
}
