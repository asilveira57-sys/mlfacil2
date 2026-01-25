// Types for billing system

export interface PlanPrice {
  id: string;
  mode: 'one_time' | 'subscription';
  period: 'monthly' | 'quarterly' | 'semiannual' | 'annual_campaign';
  amount_cents: number;
  currency: string;
  badge_text: string | null;
  label_sub: string | null;
  ui_order: number;
}

export interface Plan {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  features: string[];
  category: 'volume' | 'zpl';
  prices: PlanPrice[];
}

export interface BillingSettings {
  annual_enabled: boolean;
  ui_copy: {
    one_time_note?: string;
    subscription_note?: string;
  };
}

export interface PublicPlansResponse {
  plans: Plan[];
  settings: BillingSettings;
}

export interface CheckoutResponse {
  status: 'created' | 'not_configured' | 'error';
  init_point: string | null;
  provider_mode: 'preference' | 'preapproval_plan';
  provider_id?: string;
  message?: string;
  error?: string;
}
