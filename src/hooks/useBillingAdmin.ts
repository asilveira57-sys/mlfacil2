import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import type { AdminPlan, AdminPlanPrice, PlanSettings, PriceMode, PricePeriod } from '@/types/billing';

interface UseBillingAdminReturn {
  plans: AdminPlan[];
  settings: PlanSettings;
  loading: boolean;
  refetch: () => Promise<void>;
  // Plan operations
  createPlan: (plan: Partial<AdminPlan>) => Promise<string | null>;
  updatePlan: (id: string, updates: Partial<AdminPlan>) => Promise<boolean>;
  deletePlan: (id: string) => Promise<boolean>;
  // Price operations
  createPrice: (price: Partial<AdminPlanPrice>) => Promise<string | null>;
  updatePrice: (id: string, updates: Partial<AdminPlanPrice>) => Promise<boolean>;
  deletePrice: (id: string) => Promise<boolean>;
  // Settings operations
  updateSettings: (updates: Partial<PlanSettings>) => Promise<boolean>;
  // MP sync
  syncPriceWithMP: (priceId: string) => Promise<boolean>;
}

export function useBillingAdmin(): UseBillingAdminReturn {
  const [plans, setPlans] = useState<AdminPlan[]>([]);
  const [settings, setSettings] = useState<PlanSettings>({ enable_annual_campaign: false });
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);

      const [plansResult, pricesResult, settingsResult] = await Promise.all([
        supabase
          .from('plans')
          .select('*')
          .order('category')
          .order('sort_order'),
        supabase
          .from('plan_prices')
          .select('*')
          .order('sort_order'),
        supabase
          .from('plan_settings')
          .select('*')
          .eq('key', 'global')
          .single(),
      ]);

      if (plansResult.error) throw plansResult.error;
      if (pricesResult.error) throw pricesResult.error;

      // Build plans with nested prices
      const plansWithPrices: AdminPlan[] = (plansResult.data || []).map((plan) => ({
        id: plan.id,
        slug: plan.slug,
        name: plan.name,
        category: plan.category as 'volume' | 'zpl',
        description: plan.description,
        features: Array.isArray(plan.features) ? plan.features as string[] : [],
        active: plan.active,
        sort_order: plan.sort_order,
        created_at: plan.created_at,
        updated_at: plan.updated_at,
        plan_prices: (pricesResult.data || [])
          .filter((p) => p.plan_id === plan.id)
          .map((p) => ({
            id: p.id,
            plan_id: p.plan_id,
            mode: p.mode as PriceMode,
            period: p.period as PricePeriod,
            price_cents: p.price_cents,
            currency: p.currency,
            recurring: p.recurring,
            auto_renew: p.auto_renew,
            badge_text: p.badge_text,
            visible: p.visible,
            is_campaign: p.is_campaign,
            campaign_notes: p.campaign_notes,
            mp_preapproval_plan_id: p.mp_preapproval_plan_id,
            mp_checkout_url: p.mp_checkout_url,
            sort_order: p.sort_order,
            created_at: p.created_at,
            updated_at: p.updated_at,
          })),
      }));

      // Parse settings
      const parsedSettings: PlanSettings = {
        enable_annual_campaign: settingsResult.data?.enable_annual_campaign ?? false,
      };

      setPlans(plansWithPrices);
      setSettings(parsedSettings);
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

  // Helper to generate slug
  const generateSlug = (name: string): string => {
    return name
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
  };

  // Plan operations
  const createPlan = async (plan: Partial<AdminPlan>): Promise<string | null> => {
    try {
      const slug = plan.slug || generateSlug(plan.name || 'novo-plano');
      const { data, error } = await supabase
        .from('plans')
        .insert({
          slug,
          name: plan.name || 'Novo Plano',
          category: plan.category || 'volume',
          description: plan.description,
          features: plan.features || [],
          active: plan.active ?? true,
          sort_order: plan.sort_order ?? 99,
        })
        .select('id')
        .single();

      if (error) throw error;
      toast.success('Plano criado com sucesso');
      await fetchData();
      return data.id;
    } catch (err) {
      console.error('[useBillingAdmin] createPlan error:', err);
      toast.error('Erro ao criar plano');
      return null;
    }
  };

  const updatePlan = async (id: string, updates: Partial<AdminPlan>): Promise<boolean> => {
    try {
      const { error } = await supabase
        .from('plans')
        .update({
          name: updates.name,
          slug: updates.slug,
          description: updates.description,
          features: updates.features,
          active: updates.active,
          sort_order: updates.sort_order,
        })
        .eq('id', id);

      if (error) throw error;
      toast.success('Plano atualizado');
      await fetchData();
      return true;
    } catch (err) {
      console.error('[useBillingAdmin] updatePlan error:', err);
      toast.error('Erro ao atualizar plano');
      return false;
    }
  };

  const deletePlan = async (id: string): Promise<boolean> => {
    try {
      const { error } = await supabase.from('plans').delete().eq('id', id);
      if (error) throw error;
      toast.success('Plano excluído');
      await fetchData();
      return true;
    } catch (err) {
      console.error('[useBillingAdmin] deletePlan error:', err);
      toast.error('Erro ao excluir plano');
      return false;
    }
  };

  // Price operations
  const createPrice = async (price: Partial<AdminPlanPrice>): Promise<string | null> => {
    try {
      const { data, error } = await supabase
        .from('plan_prices')
        .insert({
          plan_id: price.plan_id,
          mode: price.mode || 'avulso',
          period: price.period || 'mensal',
          price_cents: price.price_cents || 0,
          currency: price.currency || 'BRL',
          recurring: price.recurring ?? false,
          auto_renew: price.auto_renew ?? false,
          badge_text: price.badge_text,
          visible: price.visible ?? true,
          is_campaign: price.is_campaign ?? false,
          campaign_notes: price.campaign_notes,
          sort_order: price.sort_order ?? 99,
        })
        .select('id')
        .single();

      if (error) throw error;
      toast.success('Preço criado com sucesso');
      await fetchData();
      return data.id;
    } catch (err) {
      console.error('[useBillingAdmin] createPrice error:', err);
      toast.error('Erro ao criar preço');
      return null;
    }
  };

  const updatePrice = async (id: string, updates: Partial<AdminPlanPrice>): Promise<boolean> => {
    try {
      const { error } = await supabase
        .from('plan_prices')
        .update({
          mode: updates.mode,
          period: updates.period,
          price_cents: updates.price_cents,
          recurring: updates.recurring,
          auto_renew: updates.auto_renew,
          badge_text: updates.badge_text,
          visible: updates.visible,
          is_campaign: updates.is_campaign,
          campaign_notes: updates.campaign_notes,
          sort_order: updates.sort_order,
        })
        .eq('id', id);

      if (error) throw error;
      toast.success('Preço atualizado');
      await fetchData();
      return true;
    } catch (err) {
      console.error('[useBillingAdmin] updatePrice error:', err);
      toast.error('Erro ao atualizar preço');
      return false;
    }
  };

  const deletePrice = async (id: string): Promise<boolean> => {
    try {
      const { error } = await supabase.from('plan_prices').delete().eq('id', id);
      if (error) throw error;
      toast.success('Preço excluído');
      await fetchData();
      return true;
    } catch (err) {
      console.error('[useBillingAdmin] deletePrice error:', err);
      toast.error('Erro ao excluir preço');
      return false;
    }
  };

  // Settings operations
  const updateSettings = async (updates: Partial<PlanSettings>): Promise<boolean> => {
    try {
      const { error } = await supabase
        .from('plan_settings')
        .update({
          enable_annual_campaign: updates.enable_annual_campaign,
        })
        .eq('key', 'global');

      if (error) throw error;
      toast.success('Configurações atualizadas');
      await fetchData();
      return true;
    } catch (err) {
      console.error('[useBillingAdmin] updateSettings error:', err);
      toast.error('Erro ao atualizar configurações');
      return false;
    }
  };

  // MP sync
  const syncPriceWithMP = async (priceId: string): Promise<boolean> => {
    try {
      const { data, error } = await supabase.functions.invoke('mp-sync-price', {
        body: { plan_price_id: priceId },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      toast.success('Sincronizado com Mercado Pago');
      await fetchData();
      return true;
    } catch (err) {
      console.error('[useBillingAdmin] syncPriceWithMP error:', err);
      toast.error('Erro ao sincronizar com Mercado Pago');
      return false;
    }
  };

  return {
    plans,
    settings,
    loading,
    refetch: fetchData,
    createPlan,
    updatePlan,
    deletePlan,
    createPrice,
    updatePrice,
    deletePrice,
    updateSettings,
    syncPriceWithMP,
  };
}
