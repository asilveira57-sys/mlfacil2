// Types for unified user access state system

export type OnboardingStatus = 'pending' | 'completed';
export type TrialStatus = 'none' | 'active' | 'expired';
export type PaymentStatus = 'free' | 'trial' | 'active' | 'blocked' | 'cancelled';
export type MlAccountRole = 'none' | 'owner' | 'collaborator';

export interface UserAccessState {
  onboarding_status: OnboardingStatus;
  onboarding_objective: string[] | null;
  trial_status: TrialStatus;
  trial_start_at: string | null;
  trial_end_at: string | null;
  payment_status: PaymentStatus;
  ml_connected: boolean;
  ml_role: MlAccountRole;
  default_print_mode: string;
  default_label_size: string;
}

export interface SelectedPlan {
  id: string;
  slug: string;
  name: string;
  plan_type: string;
  price_cents: number;
  billing_period: string;
  requires_ml_owner: boolean;
  features: string[];
}

export interface FeatureFlags {
  // Onboarding
  requires_onboarding: boolean;
  onboarding_completed: boolean;
  
  // Trial
  trial_active: boolean;
  trial_expired: boolean;
  trial_days_remaining: number;
  trial_end_at: string | null;
  
  // Pagamento
  requires_payment: boolean;
  has_active_subscription: boolean;
  
  // Dados Fiscais
  billing_complete: boolean;
  requires_billing: boolean;
  
  // Mercado Livre
  ml_connected: boolean;
  ml_is_owner: boolean;
  ml_is_collaborator: boolean;
  ml_requires_owner_warning: boolean;
  
  // ML API Access Gate
  ml_api_access_allowed: boolean;
  ml_api_access_reason: string | null;
  ml_api_access_message: string | null;
  
  // Recursos
  can_print_labels: boolean;
  can_import_sales: boolean;
  can_access_reports: boolean;
  can_manage_integrations: boolean;
  
  // Avisos
  trial_warnings: string[];
  
  // Meta
  computed_at: string;
  state_version: number;
}

export interface UserStatus {
  user_id: string;
  state: UserAccessState;
  selected_plan: SelectedPlan | null;
  feature_flags: FeatureFlags;
}

export interface UserStatusError {
  error: string;
}

export type UserStatusResponse = UserStatus | UserStatusError;

// Standard messages (as per spec)
export const ACCESS_MESSAGES = {
  ML_COLLABORATOR_BLOCKED: 
    'Esse recurso depende de uma conta titular do Mercado Livre conectada. A conta conectada agora está como colaborador, e o Mercado Livre não libera permissão de importação nesse caso. Caminhos: conectar uma conta titular ou usar o modo de impressão (ZPL/EPL).',
  
  TRIAL_INFO: 
    'Você começa com 14 dias de teste. Sua escolha de plano fica salva. Quando o teste acabar, o sistema pede o pagamento do plano escolhido para continuar.',
  
  TRIAL_EXPIRED: 
    'Seu período de teste expirou. Escolha um plano para continuar usando todas as funcionalidades.',
  
  ONBOARDING_REQUIRED: 
    'Complete a configuração inicial para acessar todas as funcionalidades.',
  
  PAYMENT_REQUIRED: 
    'É necessário escolher um plano para continuar.',
} as const;
