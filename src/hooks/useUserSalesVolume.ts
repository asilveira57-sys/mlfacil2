import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

interface SalesVolumeData {
  totalSales30d: number;
  accountBreakdown: { sellerId: string; nickname: string | null; sales30d: number }[];
  minimumTierCode: string | null;
  loading: boolean;
}

/**
 * Tier-code-based thresholds matching plan_tiers codes.
 */
const TIER_THRESHOLDS: { code: string; maxSales: number }[] = [
  { code: 'volume_ate_50', maxSales: 50 },
  { code: 'volume_51_300', maxSales: 300 },
  { code: 'volume_301_700', maxSales: 700 },
  { code: 'volume_701_1500', maxSales: 1500 },
  { code: 'volume_1501_3000', maxSales: 3000 },
  { code: 'volume_acima_3000', maxSales: Infinity },
];

function getMinimumTierCode(totalSales: number): string | null {
  if (totalSales <= 0) return null;
  for (const tier of TIER_THRESHOLDS) {
    if (totalSales <= tier.maxSales) return tier.code;
  }
  return 'volume_acima_3000';
}

/**
 * Returns true if a tier with the given code is too small for the user's sales volume.
 */
export function isTierTooSmall(tierCode: string, totalSales: number): boolean {
  if (totalSales <= 0) return false;
  const tier = TIER_THRESHOLDS.find(t => t.code === tierCode);
  if (!tier) return false;
  return totalSales > tier.maxSales;
}

// Keep legacy export for backward compat
export function isPlanTooSmall(planSlug: string, totalSales: number): boolean {
  return isTierTooSmall(planSlug, totalSales);
}

async function fetchSalesVolume(): Promise<Omit<SalesVolumeData, 'loading'>> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { totalSales30d: 0, accountBreakdown: [], minimumTierCode: null };

  const { data: accounts } = await supabase
    .from('ml_accounts')
    .select('ml_user_id, nickname')
    .eq('user_id', user.id)
    .eq('is_active', true);

  if (!accounts || accounts.length === 0) {
    return { totalSales30d: 0, accountBreakdown: [], minimumTierCode: null };
  }

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const dateFrom = thirtyDaysAgo.toISOString();

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
  const minimumTierCode = getMinimumTierCode(totalSales30d);

  return { totalSales30d, accountBreakdown: breakdown, minimumTierCode };
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
    minimumTierCode: query.data?.minimumTierCode ?? null,
    // Legacy alias
    minimumPlanSlug: query.data?.minimumTierCode ?? null,
    loading: query.isLoading,
    error: query.error,
  };
}
