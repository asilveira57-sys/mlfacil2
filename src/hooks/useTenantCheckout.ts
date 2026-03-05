import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface TenantPlan {
  id: string;
  code: string;
  name: string;
  display_name: string | null;
  min_orders_30d: number;
  max_orders_30d: number | null;
  is_enterprise: boolean;
  display_order: number;
}

export interface TenantCheckoutResponse {
  status: 'created' | 'not_configured';
  init_point: string | null;
  provider_id?: string;
  plan_code: string;
  error?: string;
  is_enterprise?: boolean;
}

/**
 * Hook for tenant-based billing checkout using plan_tiers.
 * Uses plan_code instead of plan_price_id.
 */
export function useTenantCheckout() {
  const [loading, setLoading] = useState(false);

  const checkout = useCallback(async (planCode: string): Promise<TenantCheckoutResponse | null> => {
    try {
      setLoading(true);

      const { data, error: fnError } = await supabase.functions.invoke<TenantCheckoutResponse>(
        'billing-checkout',
        {
          body: {
            plan_code: planCode,
            success_url: `${window.location.origin}/auth?payment=success`,
            failure_url: `${window.location.origin}/planos?payment=failure`,
          },
        }
      );

      if (fnError) throw new Error(fnError.message);
      if (!data) throw new Error('Resposta vazia do checkout');

      if (data.is_enterprise) {
        toast.info('Plano Enterprise', {
          description: 'Entre em contato com nossa equipe comercial.',
        });
        return data;
      }

      if (data.status === 'not_configured') {
        toast.error('Checkout não configurado', {
          description: 'Entre em contato com o suporte.',
        });
        return data;
      }

      if (!data.init_point) {
        toast.error('Erro no checkout', {
          description: data.error || 'Não foi possível iniciar o pagamento.',
        });
        return data;
      }

      // Redirect to Mercado Pago
      window.location.href = data.init_point;
      return data;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro ao iniciar checkout';
      console.error('[useTenantCheckout] Error:', message);
      toast.error('Erro no checkout', { description: message });
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  return { checkout, loading };
}

/**
 * Fetch compatible plans for a given sales volume from RPC.
 */
export async function fetchCompatiblePlans(orders30d: number): Promise<TenantPlan[]> {
  try {
    const { data, error } = await supabase.rpc('rpc_get_compatible_plans', {
      p_sales_30d: orders30d,
    });
    if (error) throw error;
    return (data as any) || [];
  } catch (err) {
    console.error('[fetchCompatiblePlans] Error:', err);
    return [];
  }
}

/**
 * Check if downgrade is allowed.
 */
export async function checkDowngradeAllowed(tenantId: string, targetPlanId: string): Promise<{ allowed: boolean; reason?: string }> {
  try {
    const { data, error } = await supabase.rpc('rpc_check_downgrade_allowed', {
      p_tenant_id: tenantId,
      p_target_plan_id: targetPlanId,
    });
    if (error) throw error;
    return data as any;
  } catch (err) {
    console.error('[checkDowngradeAllowed] Error:', err);
    return { allowed: false, reason: 'Erro ao verificar downgrade' };
  }
}

/**
 * Start trial for a tenant.
 */
export async function startTenantTrial(tenantId: string): Promise<{ success: boolean; error?: string; trial_end?: string }> {
  try {
    const { data, error } = await supabase.rpc('rpc_start_tenant_trial', {
      p_tenant_id: tenantId,
    });
    if (error) throw error;
    return data as any;
  } catch (err) {
    console.error('[startTenantTrial] Error:', err);
    return { success: false, error: 'Erro ao iniciar teste' };
  }
}
