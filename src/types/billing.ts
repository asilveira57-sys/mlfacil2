// Types for the new billing system (plans, plan_prices, plan_settings)

export type PlanCategory = 'volume' | 'zpl';
export type PriceMode = 'avulso' | 'assinatura';
export type PricePeriod = 'mensal' | 'trimestral' | 'semestral' | 'anual' | 'vitalicio';

export interface PlanPrice {
  id: string;
  plan_id: string;
  mode: PriceMode;
  period: PricePeriod;
  price_cents: number;
  currency: string;
  recurring: boolean;
  auto_renew: boolean;
  badge_text: string | null;
  visible: boolean;
  is_campaign: boolean;
  campaign_notes: string | null;
  mp_preapproval_plan_id: string | null;
  mp_checkout_url: string | null;
  sort_order: number;
}

export interface Plan {
  id: string;
  slug: string;
  name: string;
  category: PlanCategory;
  description: string | null;
  features: string[];
  active: boolean;
  sort_order: number;
  prices: PlanPrice[];
}

export interface PlanSettings {
  enable_annual_campaign: boolean;
}

// For the public_plans_v1 view row
export interface PublicPlanViewRow {
  plan_id: string;
  slug: string;
  name: string;
  category: string;
  description: string | null;
  features: unknown;
  active: boolean;
  plan_sort_order: number;
  price_id: string | null;
  mode: string | null;
  period: string | null;
  price_cents: number | null;
  currency: string | null;
  recurring: boolean | null;
  auto_renew: boolean | null;
  badge_text: string | null;
  visible: boolean | null;
  is_campaign: boolean | null;
  campaign_notes: string | null;
  mp_preapproval_plan_id: string | null;
  mp_checkout_url: string | null;
  price_sort_order: number | null;
}

// Checkout response
export interface CheckoutResponse {
  status: 'created' | 'not_configured' | 'error';
  init_point: string | null;
  provider_mode: 'preference' | 'preapproval';
  provider_id?: string;
  message?: string;
  error?: string;
}

// Admin types
export interface AdminPlanPrice extends PlanPrice {
  created_at?: string;
  updated_at?: string;
}

export interface AdminPlan extends Omit<Plan, 'prices'> {
  created_at?: string;
  updated_at?: string;
  plan_prices: AdminPlanPrice[];
}
