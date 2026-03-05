import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

// ─── Types ───
export interface AdminTier {
  id: string;
  code: string;
  name: string;
  display_name: string | null;
  description: string | null;
  min_orders_30d: number;
  max_orders_30d: number | null;
  is_enterprise: boolean;
  is_active: boolean;
  display_order: number;
}

export interface AdminOffer {
  id: string;
  tier_id: string;
  offer_code: string;
  billing_mode: 'one_time' | 'recurring';
  period_months: number;
  price_brl: number;
  badge_text: string | null;
  is_campaign: boolean;
  is_visible: boolean;
  is_active: boolean;
  mp_sync_enabled: boolean;
  mp_product_ref: string | null;
  created_at: string;
  updated_at: string;
}

export interface AdminAddon {
  id: string;
  code: string;
  name: string;
  description: string | null;
  is_active: boolean;
  display_order: number;
}

export interface AdminAddonOffer {
  id: string;
  addon_id: string;
  offer_code: string;
  billing_mode: 'one_time' | 'recurring';
  period_months: number;
  price_brl: number;
  badge_text: string | null;
  is_campaign: boolean;
  is_visible: boolean;
  is_active: boolean;
  mp_sync_enabled: boolean;
  mp_product_ref: string | null;
  created_at: string;
  updated_at: string;
}

export interface AdminTierWithOffers extends AdminTier {
  offers: AdminOffer[];
}

export interface AdminAddonWithOffers extends AdminAddon {
  offers: AdminAddonOffer[];
}

export interface PlanSettings {
  enable_annual_campaign: boolean;
}

export function useBillingAdminTiers() {
  const [tiers, setTiers] = useState<AdminTierWithOffers[]>([]);
  const [addons, setAddons] = useState<AdminAddonWithOffers[]>([]);
  const [settings, setSettings] = useState<PlanSettings>({ enable_annual_campaign: false });
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);

      const [tiersRes, offersRes, addonsRes, addonOffersRes, settingsRes] = await Promise.all([
        supabase.from('plan_tiers').select('*').order('display_order'),
        supabase.from('plan_offers').select('*').order('billing_mode').order('period_months'),
        supabase.from('plan_addons').select('*').order('display_order'),
        supabase.from('plan_addon_offers').select('*').order('billing_mode').order('period_months'),
        supabase.from('plan_settings').select('*').eq('key', 'global').single(),
      ]);

      if (tiersRes.error) throw tiersRes.error;
      if (offersRes.error) throw offersRes.error;
      if (addonsRes.error) throw addonsRes.error;
      if (addonOffersRes.error) throw addonOffersRes.error;

      const tiersWithOffers: AdminTierWithOffers[] = (tiersRes.data || []).map((t: any) => ({
        ...t,
        offers: (offersRes.data || [])
          .filter((o: any) => o.tier_id === t.id)
          .map((o: any) => ({ ...o, price_brl: Number(o.price_brl) })),
      }));

      const addonsWithOffers: AdminAddonWithOffers[] = (addonsRes.data || []).map((a: any) => ({
        ...a,
        offers: (addonOffersRes.data || [])
          .filter((o: any) => o.addon_id === a.id)
          .map((o: any) => ({ ...o, price_brl: Number(o.price_brl) })),
      }));

      setTiers(tiersWithOffers);
      setAddons(addonsWithOffers);
      setSettings({ enable_annual_campaign: settingsRes.data?.enable_annual_campaign ?? false });
    } catch (err) {
      console.error('[useBillingAdminTiers] Error:', err);
      toast.error('Erro ao carregar dados');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  // ─── Offer CRUD ───
  const updateOffer = async (id: string, updates: Partial<AdminOffer>) => {
    try {
      const { error } = await supabase.from('plan_offers').update(updates).eq('id', id);
      if (error) throw error;
      toast.success('Oferta atualizada');
      await fetchData();
      return true;
    } catch (err) {
      console.error('[updateOffer]', err);
      toast.error('Erro ao atualizar oferta');
      return false;
    }
  };

  const updateAddonOffer = async (id: string, updates: Partial<AdminAddonOffer>) => {
    try {
      const { error } = await supabase.from('plan_addon_offers').update(updates).eq('id', id);
      if (error) throw error;
      toast.success('Oferta atualizada');
      await fetchData();
      return true;
    } catch (err) {
      console.error('[updateAddonOffer]', err);
      toast.error('Erro ao atualizar oferta');
      return false;
    }
  };

  const updateTier = async (id: string, updates: Partial<AdminTier>) => {
    try {
      const { error } = await supabase.from('plan_tiers').update(updates).eq('id', id);
      if (error) throw error;
      toast.success('Faixa atualizada');
      await fetchData();
      return true;
    } catch (err) {
      console.error('[updateTier]', err);
      toast.error('Erro ao atualizar faixa');
      return false;
    }
  };

  const updateAddon = async (id: string, updates: Partial<AdminAddon>) => {
    try {
      const { error } = await supabase.from('plan_addons').update(updates).eq('id', id);
      if (error) throw error;
      toast.success('Add-on atualizado');
      await fetchData();
      return true;
    } catch (err) {
      console.error('[updateAddon]', err);
      toast.error('Erro ao atualizar add-on');
      return false;
    }
  };

  const updateSettings = async (updates: Partial<PlanSettings>) => {
    try {
      const { error } = await supabase
        .from('plan_settings')
        .update({ enable_annual_campaign: updates.enable_annual_campaign })
        .eq('key', 'global');
      if (error) throw error;
      toast.success('Configurações atualizadas');
      await fetchData();
      return true;
    } catch (err) {
      toast.error('Erro ao atualizar configurações');
      return false;
    }
  };

  return {
    tiers,
    addons,
    settings,
    loading,
    refetch: fetchData,
    updateOffer,
    updateAddonOffer,
    updateTier,
    updateAddon,
    updateSettings,
  };
}
