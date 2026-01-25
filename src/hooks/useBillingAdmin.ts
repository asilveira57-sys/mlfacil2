import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import type { Json } from '@/integrations/supabase/types';

interface AdminPlanPrice {
  id: string;
  mode: string;
  period: string;
  amount_cents: number;
  currency: string;
  badge_text: string | null;
  label_sub: string | null;
  ui_order: number;
  is_visible: boolean;
  published_at: string | null;
  version: number;
}

interface AdminPlan {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  features: string[];
  category: string;
  is_active: boolean;
  billing_plan_prices: AdminPlanPrice[];
}

interface AdminSettings {
  campaigns?: { annual_enabled?: boolean };
  ui_copy?: { one_time_note?: string; subscription_note?: string };
}

export function useBillingAdmin() {
  const [plans, setPlans] = useState<AdminPlan[]>([]);
  const [settings, setSettings] = useState<AdminSettings>({});
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);

      // Query directly from Supabase tables (no edge function cold start)
      const [plansResult, pricesResult, settingsResult] = await Promise.all([
        supabase
          .from('billing_plans')
          .select('id, slug, name, description, features, category, is_active, created_at')
          .order('category')
          .order('created_at'),
        supabase
          .from('billing_plan_prices')
          .select('id, plan_id, mode, period, amount_cents, currency, badge_text, label_sub, ui_order, is_visible, published_at, version')
          .order('ui_order'),
        supabase
          .from('billing_settings')
          .select('key, value'),
      ]);

      if (plansResult.error) throw plansResult.error;
      if (pricesResult.error) throw pricesResult.error;

      // Build plans with nested prices
      const plansWithPrices: AdminPlan[] = (plansResult.data || []).map((plan) => ({
        id: plan.id,
        slug: plan.slug,
        name: plan.name,
        description: plan.description,
        features: (plan.features as string[]) || [],
        category: plan.category,
        is_active: plan.is_active ?? true,
        billing_plan_prices: (pricesResult.data || [])
          .filter((p) => p.plan_id === plan.id)
          .map((p) => ({
            id: p.id,
            mode: p.mode,
            period: p.period,
            amount_cents: p.amount_cents,
            currency: p.currency,
            badge_text: p.badge_text,
            label_sub: p.label_sub,
            ui_order: p.ui_order,
            is_visible: p.is_visible ?? true,
            published_at: p.published_at,
            version: p.version,
          })),
      }));

      // Parse settings
      const settingsMap: AdminSettings = {};
      settingsResult.data?.forEach((s) => {
        settingsMap[s.key as keyof AdminSettings] = s.value as AdminSettings[keyof AdminSettings];
      });

      setPlans(plansWithPrices);
      setSettings(settingsMap);
    } catch (err) {
      console.error('[useBillingAdmin] Error:', err);
      toast.error('Erro ao carregar dados de admin');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const updatePlan = async (plan: Partial<AdminPlan> & { id: string }) => {
    try {
      const { error } = await supabase
        .from('billing_plans')
        .update({
          name: plan.name,
          description: plan.description,
          features: plan.features,
          is_active: plan.is_active,
        })
        .eq('id', plan.id);

      if (error) throw error;

      toast.success('Plano atualizado');
      await fetchData();
    } catch (err) {
      toast.error('Erro ao atualizar plano');
    }
  };

  const updatePrice = async (price: Partial<AdminPlanPrice> & { id: string }) => {
    try {
      const { error } = await supabase
        .from('billing_plan_prices')
        .update({
          amount_cents: price.amount_cents,
          badge_text: price.badge_text,
          label_sub: price.label_sub,
          is_visible: price.is_visible,
          ui_order: price.ui_order,
        })
        .eq('id', price.id);

      if (error) throw error;

      toast.success('Preço atualizado');
      await fetchData();
    } catch (err) {
      toast.error('Erro ao atualizar preço');
    }
  };

  const publishPrice = async (priceId: string) => {
    try {
      const { error } = await supabase
        .from('billing_plan_prices')
        .update({ published_at: new Date().toISOString() })
        .eq('id', priceId);

      if (error) throw error;

      toast.success('Preço publicado');
      await fetchData();
    } catch (err) {
      toast.error('Erro ao publicar preço');
    }
  };

  const unpublishPrice = async (priceId: string) => {
    try {
      const { error } = await supabase
        .from('billing_plan_prices')
        .update({ published_at: null })
        .eq('id', priceId);

      if (error) throw error;

      toast.success('Preço despublicado');
      await fetchData();
    } catch (err) {
      toast.error('Erro ao despublicar preço');
    }
  };

  const updateSettings = async (key: string, value: unknown) => {
    try {
      // Try update first, then insert if not exists
      const { data: existing } = await supabase
        .from('billing_settings')
        .select('key')
        .eq('key', key)
        .maybeSingle();

      let error;
      if (existing) {
        const result = await supabase
          .from('billing_settings')
          .update({ value: value as Json, updated_at: new Date().toISOString() })
          .eq('key', key);
        error = result.error;
      } else {
        const result = await supabase
          .from('billing_settings')
          .insert([{ key, value: value as Json }]);
        error = result.error;
      }

      if (error) throw error;

      toast.success('Configuração atualizada');
      await fetchData();
    } catch (err) {
      toast.error('Erro ao atualizar configuração');
    }
  };

  return {
    plans,
    settings,
    loading,
    refetch: fetchData,
    updatePlan,
    updatePrice,
    publishPrice,
    unpublishPrice,
    updateSettings,
  };
}
