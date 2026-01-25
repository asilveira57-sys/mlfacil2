import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import type { 
  Plan, 
  PlanPrice, 
  PlanSettings, 
  PublicPlanViewRow, 
  CheckoutResponse,
  PriceMode,
  PricePeriod 
} from '@/types/billing';

// Helper to format price in BRL
export function formatPriceBRL(cents: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(cents / 100);
}

// Helper to get period label
export function getPeriodLabel(period: PricePeriod): string {
  const labels: Record<PricePeriod, string> = {
    mensal: 'Mensal',
    trimestral: 'Trimestral',
    semestral: 'Semestral',
    anual: 'Anual',
  };
  return labels[period] || period;
}

// Helper to get mode label
export function getModeLabel(mode: PriceMode): string {
  return mode === 'avulso' ? 'Pagamento Antecipado' : 'Assinatura Recorrente';
}

interface UseBillingPlansReturn {
  volumePlans: Plan[];
  zplPlan: Plan | null;
  settings: PlanSettings;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

export function useBillingPlans(): UseBillingPlansReturn {
  const [volumePlans, setVolumePlans] = useState<Plan[]>([]);
  const [zplPlan, setZplPlan] = useState<Plan | null>(null);
  const [settings, setSettings] = useState<PlanSettings>({ enable_annual_campaign: false });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      // Fetch plans from view and settings in parallel
      const [plansResult, settingsResult] = await Promise.all([
        supabase
          .from('public_plans_v1')
          .select('*'),
        supabase
          .from('plan_settings')
          .select('*')
          .eq('key', 'global')
          .single(),
      ]);

      if (plansResult.error) throw plansResult.error;

      // Parse settings
      const parsedSettings: PlanSettings = {
        enable_annual_campaign: settingsResult.data?.enable_annual_campaign ?? false,
      };
      setSettings(parsedSettings);

      // Group rows by plan
      const rows = plansResult.data as PublicPlanViewRow[];
      const plansMap = new Map<string, Plan>();

      rows.forEach((row) => {
        if (!plansMap.has(row.plan_id)) {
          plansMap.set(row.plan_id, {
            id: row.plan_id,
            slug: row.slug,
            name: row.name,
            category: row.category as 'volume' | 'zpl',
            description: row.description,
            features: Array.isArray(row.features) ? row.features as string[] : [],
            active: row.active,
            sort_order: row.plan_sort_order,
            prices: [],
          });
        }

        // Add price if exists and visible
        if (row.price_id && row.visible) {
          const plan = plansMap.get(row.plan_id)!;
          
          // Filter campaign prices based on setting
          const isCampaign = row.is_campaign ?? false;
          if (isCampaign && !parsedSettings.enable_annual_campaign) {
            return; // Skip campaign prices if not enabled
          }

          plan.prices.push({
            id: row.price_id,
            plan_id: row.plan_id,
            mode: row.mode as PriceMode,
            period: row.period as PricePeriod,
            price_cents: row.price_cents ?? 0,
            currency: row.currency ?? 'BRL',
            recurring: row.recurring ?? false,
            auto_renew: row.auto_renew ?? false,
            badge_text: row.badge_text,
            visible: row.visible ?? true,
            is_campaign: isCampaign,
            campaign_notes: row.campaign_notes,
            mp_preapproval_plan_id: row.mp_preapproval_plan_id,
            mp_checkout_url: row.mp_checkout_url,
            sort_order: row.price_sort_order ?? 0,
          });
        }
      });

      // Separate volume and zpl plans
      const allPlans = Array.from(plansMap.values());
      const volume = allPlans
        .filter((p) => p.category === 'volume')
        .sort((a, b) => a.sort_order - b.sort_order);
      const zpl = allPlans.find((p) => p.category === 'zpl') || null;

      // Sort prices within each plan
      volume.forEach((p) => p.prices.sort((a, b) => a.sort_order - b.sort_order));
      if (zpl) zpl.prices.sort((a, b) => a.sort_order - b.sort_order);

      setVolumePlans(volume);
      setZplPlan(zpl);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro ao carregar planos';
      console.error('[useBillingPlans] Error:', message);
      setError(message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return {
    volumePlans,
    zplPlan,
    settings,
    loading,
    error,
    refetch: fetchData,
  };
}

// Hook for checkout
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
