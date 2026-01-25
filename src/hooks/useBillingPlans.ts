import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import type { Plan, PlanPrice, BillingSettings, PublicPlansResponse, CheckoutResponse } from '@/types/billing';

export function useBillingPlans() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [settings, setSettings] = useState<BillingSettings>({
    annual_enabled: false,
    ui_copy: {},
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchPlans = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const { data, error: fnError } = await supabase.functions.invoke<PublicPlansResponse>(
        'billing-public-plans'
      );

      if (fnError) {
        throw new Error(fnError.message);
      }

      if (data) {
        setPlans(data.plans || []);
        setSettings(data.settings || { annual_enabled: false, ui_copy: {} });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro ao carregar planos';
      console.error('[useBillingPlans] Error:', message);
      setError(message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPlans();
  }, [fetchPlans]);

  // Derived data
  const volumePlans = plans.filter(p => p.category === 'volume');
  const zplPlan = plans.find(p => p.category === 'zpl');

  return {
    plans,
    volumePlans,
    zplPlan,
    settings,
    loading,
    error,
    refetch: fetchPlans,
  };
}

export function useBillingCheckout() {
  const [loading, setLoading] = useState(false);

  const checkout = useCallback(async (priceId: string): Promise<CheckoutResponse | null> => {
    try {
      setLoading(true);

      const { data, error: fnError } = await supabase.functions.invoke<CheckoutResponse>(
        'billing-checkout',
        {
          body: {
            plan_price_id: priceId,
            success_url: `${window.location.origin}/auth?payment=success`,
            failure_url: `${window.location.origin}/planos?payment=failure`,
          },
        }
      );

      if (fnError) {
        throw new Error(fnError.message);
      }

      if (!data) {
        throw new Error('Resposta vazia do checkout');
      }

      if (data.status === 'not_configured') {
        toast.error('Checkout não configurado', {
          description: data.message || 'Entre em contato com o suporte.',
        });
        return data;
      }

      if (data.status === 'error' || !data.init_point) {
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
      console.error('[useBillingCheckout] Error:', message);
      toast.error('Erro no checkout', { description: message });
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  return {
    checkout,
    loading,
  };
}

// Helper to format price in BRL
export function formatPriceBRL(cents: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(cents / 100);
}
