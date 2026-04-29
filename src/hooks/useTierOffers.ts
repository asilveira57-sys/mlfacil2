import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useState, useCallback } from 'react';
import { toast } from 'sonner';

// ─── Types ───
export interface TierOffer {
  id: string;
  offer_code: string;
  billing_mode: 'one_time' | 'recurring';
  period_months: number;
  price_brl: number;
  badge_text: string | null;
  is_campaign: boolean;
  mp_product_ref: string | null;
}

export interface PlanTier {
  id: string;
  code: string;
  name: string;
  description: string | null;
  min_orders_30d: number;
  max_orders_30d: number | null;
  is_enterprise: boolean;
  display_order: number;
  offers: TierOffer[];
}

export interface PlanAddon {
  id: string;
  code: string;
  name: string;
  description: string | null;
  display_order: number;
  offers: TierOffer[];
}

interface CatalogSettings {
  enable_annual_campaign: boolean;
}

interface CatalogResponse {
  tiers: PlanTier[];
  addons: PlanAddon[];
  settings: CatalogSettings;
  trial_policy: { trial_days: number; requires_card: boolean } | null;
}

// ─── Fetch ───
async function fetchCatalog(): Promise<CatalogResponse> {
  const { data, error } = await supabase.functions.invoke<CatalogResponse>('billing-public-plans', {
    method: 'GET',
  });

  if (error) {
    console.error('Error fetching catalog:', error);
    throw new Error('Falha ao carregar catálogo');
  }

  return data || { tiers: [], addons: [], settings: { enable_annual_campaign: false }, trial_policy: null };
}

// ─── Hook: Catalog ───
export function useTierOffersCatalog() {
  return useQuery({
    queryKey: ['tier-offers-catalog'],
    queryFn: fetchCatalog,
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
  });
}

// ─── Hook: Checkout ───
export function useOfferCheckout() {
  const [loading, setLoading] = useState(false);

  const checkout = useCallback(async (offerId: string, payerEmail?: string) => {
    if (!offerId) {
      toast.error('Oferta indisponível', { description: 'Esta oferta não está disponível. Contate o suporte.' });
      return null;
    }
    try {
      setLoading(true);

      const { data, error } = await supabase.functions.invoke('billing-checkout', {
        body: {
          offer_id: offerId,
          success_url: `${window.location.origin}/auth?payment=success`,
          failure_url: `${window.location.origin}/planos?payment=failure`,
          ...(payerEmail ? { payer_email: payerEmail } : {}),
        },
      });

      if (error) throw new Error(error.message);
      if (!data) throw new Error('Resposta vazia');

      if (data.status === 'not_configured') {
        toast.error('Checkout não configurado', { description: 'Entre em contato com o suporte.' });
        return data;
      }

      if (data.is_enterprise) {
        toast.info('Plano Enterprise', { description: 'Entre em contato com nossa equipe comercial.' });
        return data;
      }

      if (!data.init_point) {
        toast.error('Erro no checkout', { description: data.error || 'Não foi possível iniciar o pagamento.' });
        return data;
      }

      window.location.href = data.init_point;
      return data;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro ao iniciar checkout';
      console.error('[useOfferCheckout] Error:', message);
      toast.error('Erro no checkout', { description: message });
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  return { checkout, loading };
}

// ─── Helpers ───
export function formatPriceBRL(value: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
}

export function getOfferLabel(offer: TierOffer): string {
  const modeLabel = offer.billing_mode === 'recurring' ? 'Assinatura' : 'Pré-pago';
  const periodLabels: Record<number, string> = {
    1: 'Mensal',
    3: 'Trimestral',
    6: 'Semestral',
    12: 'Anual',
  };
  return `${modeLabel} ${periodLabels[offer.period_months] || `${offer.period_months}m`}`;
}

export function getPeriodLabel(months: number): string {
  const labels: Record<number, string> = { 1: 'Mensal', 3: 'Trimestral', 6: 'Semestral', 12: 'Anual' };
  return labels[months] || `${months} meses`;
}

export function getPeriodSuffix(months: number): string {
  const suffixes: Record<number, string> = { 1: '/mês', 3: '/trim.', 6: '/sem.', 12: '/ano' };
  return suffixes[months] || `/${months}m`;
}
