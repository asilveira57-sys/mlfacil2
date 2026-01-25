import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import type { Plan, PlanPrice, BillingSettings, CheckoutResponse } from '@/types/billing';

interface ViewRow {
  plan_id: string;
  slug: string;
  name: string;
  description: string | null;
  features: string[];
  category: string;
  price_id: string;
  mode: string;
  period: string;
  amount_cents: number;
  currency: string;
  badge_text: string | null;
  label_sub: string | null;
  ui_order: number;
}

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

      // Fetch plans directly from the public view (no edge function cold start)
      const [plansResult, settingsResult] = await Promise.all([
        supabase
          .from('public_plans_v1')
          .select('*')
          .order('category')
          .order('ui_order'),
        supabase
          .from('billing_settings')
          .select('key, value'),
      ]);

      if (plansResult.error) throw plansResult.error;

      // Parse settings
      const settingsMap: BillingSettings = { annual_enabled: false, ui_copy: {} };
      settingsResult.data?.forEach((s: { key: string; value: unknown }) => {
        if (s.key === 'campaigns') {
          const campaigns = s.value as { annual_enabled?: boolean } | null;
          settingsMap.annual_enabled = campaigns?.annual_enabled ?? false;
        }
        if (s.key === 'ui_copy') {
          settingsMap.ui_copy = (s.value as Record<string, string>) ?? {};
        }
      });

      // Group by plan
      const plansMap = new Map<string, Plan>();
      (plansResult.data as ViewRow[] | null)?.forEach((row) => {
        if (!plansMap.has(row.slug)) {
          plansMap.set(row.slug, {
            id: row.plan_id,
            slug: row.slug,
            name: row.name,
            description: row.description,
            features: row.features || [],
            category: row.category as 'volume' | 'zpl',
            prices: [],
          });
        }

        const plan = plansMap.get(row.slug)!;

        // Filter out annual_campaign if not enabled
        if (row.period === 'annual_campaign' && !settingsMap.annual_enabled) {
          return;
        }

        plan.prices.push({
          id: row.price_id,
          mode: row.mode as 'one_time' | 'subscription',
          period: row.period as 'monthly' | 'quarterly' | 'semiannual' | 'annual_campaign',
          amount_cents: row.amount_cents,
          currency: row.currency,
          badge_text: row.badge_text,
          label_sub: row.label_sub,
          ui_order: row.ui_order,
        });
      });

      // Convert to array and filter plans without visible prices
      const plansList = Array.from(plansMap.values())
        .filter(p => p.prices.length > 0)
        .sort((a, b) => (a.category === 'volume' ? -1 : 1) - (b.category === 'volume' ? -1 : 1));

      setPlans(plansList);
      setSettings(settingsMap);
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
