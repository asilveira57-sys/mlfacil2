// Admin Module Types

export interface AdminDashboardStats {
  total_users: number;
  trial_users: number;
  active_subscriptions: number;
  expired_subscriptions: number;
  pending_webhooks: number;
  recent_signups_7d: number;
  trials_expiring_soon: number;
}

export interface AdminUser {
  id: string;
  email: string;
  created_at: string;
  last_sign_in_at: string | null;
  // From user_access_state
  subscription_status: string | null;
  trial_end_at: string | null;
  selected_plan_id: string | null;
  // From user_roles
  roles: string[];
}

export interface OnboardingCard {
  id: string;
  title: string;
  description: string | null;
  link_url: string | null;
  icon_name: string | null;
  display_condition: string | null;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface OnboardingCardInsert {
  title: string;
  description?: string;
  link_url?: string;
  icon_name?: string;
  display_condition?: string;
  sort_order?: number;
  is_active?: boolean;
}

export interface PlatformSetting {
  id: string;
  key: string;
  value: unknown;
  description: string | null;
  category: string;
  is_public: boolean;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface SeoPageSetting {
  id: string;
  page_path: string;
  meta_title: string | null;
  meta_description: string | null;
  canonical_url: string | null;
  og_title: string | null;
  og_description: string | null;
  og_image: string | null;
  robots_index: boolean;
  robots_follow: boolean;
  structured_data: unknown;
  created_at: string;
  updated_at: string;
}

export interface IntegrationStatus {
  id: string;
  integration_name: string;
  display_name: string;
  status: 'active' | 'inactive' | 'error';
  config: Record<string, unknown>;
  last_sync_at: string | null;
  last_error: string | null;
  error_count: number;
  created_at: string;
  updated_at: string;
}

export interface AdminActionLog {
  id: string;
  admin_user_id: string;
  action_type: string;
  target_table: string | null;
  target_id: string | null;
  old_value: unknown;
  new_value: unknown;
  description: string | null;
  ip_address: string | null;
  created_at: string;
}

// Webhook log for payments
export interface WebhookLog {
  id: string;
  event_type: string;
  payload: unknown;
  processed_at: string | null;
  error_message: string | null;
  created_at: string;
}
