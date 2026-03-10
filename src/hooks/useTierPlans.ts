import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

// Types for tier-based plans
export type PricingMode = 'avulso' | 'assinatura';
export type BillingCycle = 'mensal' | 'trimestral' | 'semestral' | 'anual' | 'vitalicio';

export interface TierPlanPrice {
  id: string;
  mode: PricingMode;
  period: BillingCycle;
  price_cents: number;
  currency: string;
  recurring: boolean;
  auto_renew: boolean;
  badge_text: string | null;
}

export interface TierPlan {
  id: string;
  slug: string;
  name: string;
  category: 'volume' | 'zpl';
  description: string | null;
  features: string[];
  badge_text?: string | null;
  sort_order: number;
  prices: TierPlanPrice[];
}

export interface TrialPolicy {
  trial_days: number;
  requires_card: boolean;
  one_trial_per_account: boolean;
}

interface TierPlansData {
  plans: TierPlan[];
  trialPolicy: TrialPolicy;
  volumePlans: TierPlan[];
  zplPlan: TierPlan | null;
}

async function fetchTierPlans(): Promise<TierPlansData> {
  // Fetch plans with prices in parallel with trial policy
  const [plansResult, trialResult] = await Promise.all([
    supabase
      .from('public_plans_v1')
      .select('*')
      .or('visible.eq.true,visible.is.null'),
    supabase
      .from('trial_policy')
      .select('*')
      .eq('is_active', true)
      .single()
  ]);

  if (plansResult.error) {
    console.error('[useTierPlans] Error fetching plans:', plansResult.error);
    throw plansResult.error;
  }

  // Parse trial policy
  const trialPolicy: TrialPolicy = {
    trial_days: trialResult.data?.trial_days ?? 14,
    requires_card: trialResult.data?.requires_card ?? false,
    one_trial_per_account: trialResult.data?.one_trial_per_account ?? true,
  };

  // Group rows by plan
  const plansMap = new Map<string, TierPlan>();
  
  for (const row of plansResult.data || []) {
    const planId = row.plan_id;
    
    if (!plansMap.has(planId)) {
      // Parse features - ensure they're strings
      let features: string[] = [];
      if (Array.isArray(row.features)) {
        features = row.features.map((f: unknown) => String(f));
      }
      
      plansMap.set(planId, {
        id: planId,
        slug: row.slug,
        name: row.name,
        category: row.category as 'volume' | 'zpl',
        description: row.description,
        features,
        sort_order: row.plan_sort_order,
        prices: [],
      });
    }

    // Add price if exists
    if (row.price_id) {
      const plan = plansMap.get(planId)!;
      plan.prices.push({
        id: row.price_id,
        mode: row.mode as PricingMode,
        period: row.period as BillingCycle,
        price_cents: row.price_cents,
        currency: row.currency || 'BRL',
        recurring: row.recurring ?? false,
        auto_renew: row.auto_renew ?? false,
        badge_text: row.badge_text,
      });
    }
  }

  // Convert to array and sort
  const allPlans = Array.from(plansMap.values())
    .sort((a, b) => a.sort_order - b.sort_order);

  // Sort prices within each plan
  allPlans.forEach(plan => {
    plan.prices.sort((a, b) => {
      // assinatura first, then by period
      const modeOrder = { assinatura: 0, avulso: 1 };
      const periodOrder = { mensal: 1, trimestral: 2, semestral: 3, anual: 4 };
      
      if (a.mode !== b.mode) {
        return modeOrder[a.mode] - modeOrder[b.mode];
      }
      return periodOrder[a.period] - periodOrder[b.period];
    });
  });

  // Separate by category
  const volumePlans = allPlans.filter(p => p.category === 'volume');
  const zplPlan = allPlans.find(p => p.category === 'zpl') || null;

  return {
    plans: allPlans,
    trialPolicy,
    volumePlans,
    zplPlan,
  };
}

export function useTierPlans() {
  return useQuery({
    queryKey: ['tier-plans'],
    queryFn: fetchTierPlans,
    staleTime: 30 * 60 * 1000, // 30 minutes
    gcTime: 60 * 60 * 1000, // 60 minutes
    refetchOnWindowFocus: false,
  });
}

// Helper to format price in BRL
export function formatPriceBRL(cents: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(cents / 100);
}

// Get price for specific mode and period
export function getPlanPrice(
  plan: TierPlan, 
  mode: PricingMode, 
  period: BillingCycle
): TierPlanPrice | undefined {
  return plan.prices.find(p => p.mode === mode && p.period === period);
}

// Get the default/featured price (subscription monthly)
export function getDefaultPrice(plan: TierPlan): TierPlanPrice | undefined {
  return plan.prices.find(p => p.mode === 'assinatura' && p.period === 'mensal') 
    || plan.prices[0];
}

// Get period label in Portuguese
export function getPeriodLabel(period: BillingCycle): string {
  const labels: Record<BillingCycle, string> = {
    mensal: 'Mensal',
    trimestral: 'Trimestral',
    semestral: 'Semestral',
    anual: 'Anual',
    vitalicio: 'Vitalício',
  };
  return labels[period] || period;
}
