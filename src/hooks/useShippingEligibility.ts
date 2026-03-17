import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useActiveSellerId } from '@/contexts/ActiveAccountContext';

export interface ShippingEligibility {
  eligible: boolean;
  loading: boolean;
  reason: string | null;
  sales30d: number;
  sellerId: string | null;
}

/**
 * Determines if the active seller account is eligible for shipping features.
 * 
 * Criteria for ineligibility:
 * - No sales in the last 30 days
 * 
 * General system access (dashboard, analytics, etc.) is NEVER blocked.
 * Only shipping/label features are gated by this flag.
 */
export function useShippingEligibility(): ShippingEligibility {
  const sellerId = useActiveSellerId();

  const { data, isLoading } = useQuery({
    queryKey: ['shipping-eligibility', sellerId],
    enabled: !!sellerId,
    staleTime: 5 * 60 * 1000, // 5 min
    gcTime: 15 * 60 * 1000,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      if (!sellerId) return { eligible: false, reason: 'no_seller', sales30d: 0 };

      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const { count, error } = await supabase
        .from('meli_orders_cache')
        .select('*', { count: 'exact', head: true })
        .eq('seller_id', sellerId)
        .eq('order_status', 'paid')
        .gte('created_at_meli', thirtyDaysAgo.toISOString());

      if (error) {
        console.warn('[ShippingEligibility] Error checking sales:', error.message);
        // On error, allow access (fail-open for general usability)
        return { eligible: true, reason: null, sales30d: 0 };
      }

      const sales30d = count ?? 0;
      const eligible = sales30d > 0;
      const reason = !eligible ? 'no_sales_30d' : null;

      // Log eligibility calculation
      logEligibility(sellerId, eligible, reason, sales30d);

      return { eligible, reason, sales30d };
    },
  });

  return {
    eligible: data?.eligible ?? true, // fail-open while loading
    loading: isLoading,
    reason: data?.reason ?? null,
    sales30d: data?.sales30d ?? 0,
    sellerId,
  };
}

/**
 * Fire-and-forget log of eligibility calculation
 */
function logEligibility(
  sellerId: string,
  eligible: boolean,
  reason: string | null,
  sales30d: number
) {
  supabase
    .rpc('register_system_log', {
      p_level: 'info',
      p_system_area: 'shipping_eligibility',
      p_action: 'eligibility_check',
      p_user_id: null,
      p_success: eligible,
      p_message: eligible
        ? `Seller ${sellerId} eligible for shipping (${sales30d} sales in 30d)`
        : `Seller ${sellerId} NOT eligible: ${reason} (${sales30d} sales in 30d)`,
      p_meta_json: { seller_id: sellerId, eligible, reason, sales_30d: sales30d },
    })
    .then(({ error }) => {
      if (error && import.meta.env.DEV) {
        console.warn('[ShippingEligibility] Log failed:', error.message);
      }
    });
}
