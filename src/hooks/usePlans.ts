import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface Plan {
  id: string;
  code: string;
  plan_type: string;
  name: string;
  description: string | null;
  min_sales: number | null;
  max_sales: number | null;
  features: string[];
  is_active: boolean;
  sort_order: number;
}

export interface PlanPrice {
  id: string;
  plan_id: string;
  billing_cycle: string;
  price_cents: number;
  duration_days: number;
  is_active: boolean;
}

export interface PlanWithPrices extends Plan {
  prices: {
    monthly?: PlanPrice;
    quarterly?: PlanPrice;
    semiannual?: PlanPrice;
    annual?: PlanPrice;
  };
}

export function usePlans() {
  const [plans, setPlans] = useState<PlanWithPrices[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadPlans();
  }, []);

  const loadPlans = async () => {
    try {
      setLoading(true);
      
      // Fetch plans
      const { data: plansData, error: plansError } = await supabase
        .from('plans')
        .select('*')
        .eq('is_active', true)
        .order('sort_order', { ascending: true });

      if (plansError) throw plansError;

      // Fetch prices
      const { data: pricesData, error: pricesError } = await supabase
        .from('plan_prices')
        .select('*')
        .eq('is_active', true);

      if (pricesError) throw pricesError;

      // Combine plans with prices
      const plansWithPrices: PlanWithPrices[] = (plansData || []).map(plan => {
        const planPrices = (pricesData || []).filter(p => p.plan_id === plan.id);
        const prices: PlanWithPrices['prices'] = {};
        
        planPrices.forEach(price => {
          prices[price.billing_cycle as keyof typeof prices] = price;
        });

        // Parse features from JSONB
        let features: string[] = [];
        if (Array.isArray(plan.features)) {
          features = plan.features.map(f => String(f));
        }

        return {
          id: plan.id,
          code: plan.code,
          plan_type: plan.plan_type,
          name: plan.name,
          description: plan.description,
          min_sales: plan.min_sales,
          max_sales: plan.max_sales,
          features,
          is_active: plan.is_active ?? true,
          sort_order: plan.sort_order ?? 0,
          prices,
        };
      });

      setPlans(plansWithPrices);
      setError(null);
    } catch (err) {
      console.error('Error loading plans:', err);
      setError(err instanceof Error ? err.message : 'Erro ao carregar planos');
    } finally {
      setLoading(false);
    }
  };

  const volumePlans = plans.filter(p => p.plan_type === 'volume' && p.code !== 'volume_custom');
  const zplPlan = plans.find(p => p.plan_type === 'zpl_full');
  const customPlan = plans.find(p => p.code === 'volume_custom');

  return {
    plans,
    volumePlans,
    zplPlan,
    customPlan,
    loading,
    error,
    reload: loadPlans,
  };
}

export function formatPrice(cents: number): string {
  return (cents / 100).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  });
}

export function formatPricePerMonth(cents: number, durationDays: number): string {
  const months = durationDays / 30;
  const perMonth = cents / months;
  return (perMonth / 100).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  });
}