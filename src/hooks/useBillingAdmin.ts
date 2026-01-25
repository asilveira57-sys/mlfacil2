import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

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
      const { data, error } = await supabase.functions.invoke('billing-admin', {
        body: {},
        method: 'GET',
      });

      // Workaround: invoke doesn't support GET query params well, use fetch
      const session = await supabase.auth.getSession();
      const token = session.data.session?.access_token;
      
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/billing-admin?action=list`,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        }
      );

      if (!response.ok) {
        throw new Error('Failed to fetch admin data');
      }

      const result = await response.json();
      setPlans(result.plans || []);
      setSettings(result.settings || {});
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
      const session = await supabase.auth.getSession();
      const token = session.data.session?.access_token;

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/billing-admin?action=update-plan`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(plan),
        }
      );

      if (!response.ok) throw new Error('Failed to update plan');
      
      toast.success('Plano atualizado');
      await fetchData();
    } catch (err) {
      toast.error('Erro ao atualizar plano');
    }
  };

  const updatePrice = async (price: Partial<AdminPlanPrice> & { id: string }) => {
    try {
      const session = await supabase.auth.getSession();
      const token = session.data.session?.access_token;

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/billing-admin?action=update-price`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(price),
        }
      );

      if (!response.ok) throw new Error('Failed to update price');
      
      toast.success('Preço atualizado');
      await fetchData();
    } catch (err) {
      toast.error('Erro ao atualizar preço');
    }
  };

  const publishPrice = async (priceId: string) => {
    try {
      const session = await supabase.auth.getSession();
      const token = session.data.session?.access_token;

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/billing-admin?action=publish-price`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ id: priceId }),
        }
      );

      if (!response.ok) throw new Error('Failed to publish price');
      
      toast.success('Preço publicado');
      await fetchData();
    } catch (err) {
      toast.error('Erro ao publicar preço');
    }
  };

  const unpublishPrice = async (priceId: string) => {
    try {
      const session = await supabase.auth.getSession();
      const token = session.data.session?.access_token;

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/billing-admin?action=unpublish-price`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ id: priceId }),
        }
      );

      if (!response.ok) throw new Error('Failed to unpublish price');
      
      toast.success('Preço despublicado');
      await fetchData();
    } catch (err) {
      toast.error('Erro ao despublicar preço');
    }
  };

  const updateSettings = async (key: string, value: unknown) => {
    try {
      const session = await supabase.auth.getSession();
      const token = session.data.session?.access_token;

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/billing-admin?action=update-settings`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ key, value }),
        }
      );

      if (!response.ok) throw new Error('Failed to update settings');
      
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
