import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { SystemBlocked } from '@/components/ui/system-states';

interface ShippingBlockedScreenProps {
  sellerId: string | null;
  reason: string | null;
}

/**
 * Informational screen shown when a seller tries to access shipping features
 * but doesn't meet eligibility criteria. Uses the unified SystemBlocked component.
 */
export function ShippingBlockedScreen({ sellerId, reason }: ShippingBlockedScreenProps) {
  const location = useLocation();

  // Log render and route access attempt
  useEffect(() => {
    supabase
      .rpc('register_system_log', {
        p_level: 'info',
        p_system_area: 'shipping_eligibility',
        p_action: 'blocked_route_access',
        p_user_id: null,
        p_success: false,
        p_message: `Shipping feature blocked for seller ${sellerId} at ${location.pathname}`,
        p_meta_json: {
          seller_id: sellerId,
          reason,
          route: location.pathname,
          state_classification: 'blocked_functional',
          rendered_at: new Date().toISOString(),
        },
      })
      .then(({ error }) => {
        if (error && import.meta.env.DEV) {
          console.warn('[ShippingBlocked] Log failed:', error.message);
        }
      });
  }, [sellerId, reason, location.pathname]);

  return <SystemBlocked />;
}
