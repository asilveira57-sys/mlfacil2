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

export type SeoPageType = 'external_page' | 'nlog_post';

export interface SeoPageSetting {
  id: string;
  page_path: string;
  page_type: SeoPageType;
  meta_title: string | null;
  meta_description: string | null;
  meta_keywords: string | null;
  canonical_url: string | null;
  og_title: string | null;
  og_description: string | null;
  og_image: string | null;
  robots_index: boolean;
  robots_follow: boolean;
  structured_data: unknown;
  seo_roadmap: string | null;
  // Nlog-specific fields
  primary_keyword: string | null;
  secondary_keywords: string | null;
  seo_cluster: string | null;
  evergreen_content: boolean;
  suggested_update_date: string | null;
  created_at: string;
  updated_at: string;
}

export interface SeoValidationIssue {
  type: 'error' | 'warning';
  field: string;
  message: string;
}

export function validateSeoPage(page: Partial<SeoPageSetting>): SeoValidationIssue[] {
  const issues: SeoValidationIssue[] = [];
  
  // Meta title validation
  if (!page.meta_title || page.meta_title.length === 0) {
    issues.push({ type: 'error', field: 'meta_title', message: 'Meta Title vazio' });
  } else if (page.meta_title.length > 60) {
    issues.push({ type: 'warning', field: 'meta_title', message: 'Meta Title excede 60 caracteres' });
  }
  
  // Meta description validation
  if (!page.meta_description || page.meta_description.length === 0) {
    issues.push({ type: 'error', field: 'meta_description', message: 'Meta Description vazia' });
  } else if (page.meta_description.length > 160) {
    issues.push({ type: 'warning', field: 'meta_description', message: 'Meta Description excede 160 caracteres' });
  }
  
  // Indexable page without roadmap
  if (page.robots_index && (!page.seo_roadmap || page.seo_roadmap.length === 0)) {
    issues.push({ type: 'warning', field: 'seo_roadmap', message: 'Página indexável sem roadmap' });
  }
  
  // Nlog without primary keyword
  if (page.page_type === 'nlog_post' && (!page.primary_keyword || page.primary_keyword.length === 0)) {
    issues.push({ type: 'error', field: 'primary_keyword', message: 'Conteúdo Nlog sem palavra-chave principal' });
  }
  
  return issues;
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
