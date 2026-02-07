// Templates & Themed Layouts Types

export interface Template {
  id: string;
  name: string;
  description: string | null;
  is_system_default: boolean;
  is_active: boolean;
  scope: TemplateScope;
  owner_workspace_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export type TemplateScope = 'global' | 'category' | 'subcategory' | 'seasonal' | 'company';

export interface TemplateVariant {
  id: string;
  template_id: string;
  variant_key: string; // 'light' | 'dark' | 'compact' | 'spacious'
  design_tokens: DesignTokens;
  preview_image_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface DesignTokens {
  // Colors
  primary?: string;
  primary_foreground?: string;
  secondary?: string;
  secondary_foreground?: string;
  background?: string;
  foreground?: string;
  card?: string;
  card_foreground?: string;
  muted?: string;
  muted_foreground?: string;
  accent?: string;
  accent_foreground?: string;
  border?: string;
  // Typography
  font_family_heading?: string;
  font_family_body?: string;
  font_size_base?: string;
  // Layout
  radius?: string;
  spacing_base?: string;
  // Shadows
  shadow_sm?: string;
  shadow_md?: string;
  shadow_lg?: string;
  // Gradients
  gradient_primary?: string;
  gradient_accent?: string;
  // Sidebar
  sidebar_background?: string;
  sidebar_foreground?: string;
  sidebar_primary?: string;
  // Seasonal overlay
  overlay_pattern_url?: string;
  overlay_opacity?: number;
  overlay_blend_mode?: string;
  overlay_accent_icons?: string[];
  // Custom tokens
  [key: string]: string | number | string[] | undefined;
}

export interface TemplateAsset {
  id: string;
  template_id: string;
  asset_type: 'background' | 'pattern' | 'icon_pack' | 'banner' | 'logo_mark';
  file_url: string;
  meta: Record<string, unknown>;
  created_at: string;
}

export type RuleType = 'global_default' | 'company_override' | 'category' | 'subcategory' | 'seasonal';

export interface TemplateRule {
  id: string;
  template_id: string;
  rule_type: RuleType;
  company_id: string | null;
  category_key: string | null;
  subcategory_key: string | null;
  seasonal_key: string | null;
  start_month: number | null;
  start_day: number | null;
  end_month: number | null;
  end_day: number | null;
  priority: number;
  is_enabled: boolean;
  created_at: string;
  updated_at: string;
  // Joined
  template?: Template;
}

export interface TemplateAuditLog {
  id: string;
  actor_user_id: string;
  action: string;
  template_id: string | null;
  payload: Record<string, unknown>;
  created_at: string;
}

// Theme resolver types
export interface ThemeResolverInput {
  workspace_id?: string | null;
  company_id?: string | null;
  category_key?: string | null;
  subcategory_key?: string | null;
  current_date?: Date;
  user_theme_preference?: 'light' | 'dark';
}

export interface ResolvedTheme {
  template: Template;
  variant: TemplateVariant;
  seasonal_overlay: TemplateVariant | null;
  resolved_tokens: DesignTokens;
  resolution_source: string; // Human-readable explanation
  resolution_chain: string[]; // All rules that participated
}

// Wizard form data
export interface TemplateFormData {
  name: string;
  description: string;
  scope: TemplateScope;
  base_template_id?: string; // duplicate from
  design_tokens_light: DesignTokens;
  design_tokens_dark?: DesignTokens;
}

// Seasonal presets
export const SEASONAL_PRESETS: Record<string, { label: string; key: string; start_month: number; start_day: number; end_month: number; end_day: number; emoji: string }> = {
  natal: { label: 'Natal', key: 'natal', start_month: 12, start_day: 1, end_month: 12, end_day: 31, emoji: '🎄' },
  ano_novo: { label: 'Ano Novo', key: 'ano_novo', start_month: 1, start_day: 1, end_month: 1, end_day: 15, emoji: '🎆' },
  carnaval: { label: 'Carnaval', key: 'carnaval', start_month: 2, start_day: 1, end_month: 3, end_day: 5, emoji: '🎭' },
  pascoa: { label: 'Páscoa', key: 'pascoa', start_month: 3, start_day: 15, end_month: 4, end_day: 25, emoji: '🐰' },
  dia_maes: { label: 'Dia das Mães', key: 'dia_maes', start_month: 5, start_day: 1, end_month: 5, end_day: 15, emoji: '💐' },
  dia_namorados: { label: 'Dia dos Namorados', key: 'dia_namorados', start_month: 6, start_day: 1, end_month: 6, end_day: 12, emoji: '💕' },
  dia_pais: { label: 'Dia dos Pais', key: 'dia_pais', start_month: 8, start_day: 1, end_month: 8, end_day: 15, emoji: '👔' },
  black_friday: { label: 'Black Friday', key: 'black_friday', start_month: 11, start_day: 15, end_month: 11, end_day: 30, emoji: '🏷️' },
};
