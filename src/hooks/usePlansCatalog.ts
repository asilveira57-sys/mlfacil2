import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

// Match the existing edge function response structure
export interface PlanPrice {
  id: string;
  mode: string;
  period: string;
  amount_cents: number;
  currency: string;
  badge_text: string | null;
  label_sub: string | null;
  ui_order: number;
}

export interface PlanCatalogItem {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  features: string[];
  category: string;
  prices: PlanPrice[];
}

interface CatalogSettings {
  annual_enabled: boolean;
  ui_copy: Record<string, string>;
}

interface CatalogResponse {
  plans: PlanCatalogItem[];
  settings: CatalogSettings;
}

async function fetchPlansCatalog(): Promise<CatalogResponse> {
  const { data, error } = await supabase.functions.invoke<CatalogResponse>('billing-public-plans', {
    method: 'GET',
  });

  if (error) {
    console.error('Error fetching plans catalog:', error);
    throw new Error('Falha ao carregar catálogo de planos');
  }

  return data || { plans: [], settings: { annual_enabled: false, ui_copy: {} } };
}

export function usePlansCatalog() {
  return useQuery({
    queryKey: ['plans-catalog'],
    queryFn: fetchPlansCatalog,
    staleTime: 10 * 60 * 1000, // 10 minutes
    gcTime: 30 * 60 * 1000, // 30 minutes
    refetchOnWindowFocus: false,
    refetchOnMount: false,
  });
}

// Helper to format price
export function formatPrice(cents: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(cents / 100);
}

// Helper to get plan by slug
export function getPlanBySlug(plans: PlanCatalogItem[], slug: string): PlanCatalogItem | undefined {
  return plans.find(p => p.slug === slug);
}

// Helper to group plans by category
export function groupPlansByCategory(plans: PlanCatalogItem[]): Record<string, PlanCatalogItem[]> {
  return plans.reduce((acc, plan) => {
    if (!acc[plan.category]) {
      acc[plan.category] = [];
    }
    acc[plan.category].push(plan);
    return acc;
  }, {} as Record<string, PlanCatalogItem[]>);
}

// Get the best price for a plan (lowest monthly equivalent)
export function getBestPrice(plan: PlanCatalogItem): PlanPrice | null {
  if (!plan.prices || plan.prices.length === 0) return null;
  
  // Sort by ui_order (lower is better/featured)
  const sorted = [...plan.prices].sort((a, b) => a.ui_order - b.ui_order);
  return sorted[0];
}
