import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { fetchAllRows } from '@/lib/supabaseHelpers';
import type {
  Template,
  TemplateVariant,
  TemplateRule,
  DesignTokens,
  ResolvedTheme,
  ThemeResolverInput,
} from '@/types/templates';

/**
 * Theme Resolver — priority-based template resolution engine.
 * 
 * Resolution order (lower priority number wins):
 * 1. company_override (company-specific)
 * 2. global_default (workspace default)
 * 3. category / subcategory (auto by navigation context)
 * 4. seasonal (overlay applied by date)
 * 5. system_default (fallback)
 */

interface ResolverData {
  templates: Template[];
  variants: TemplateVariant[];
  rules: TemplateRule[];
}

function isDateInRange(
  date: Date,
  startMonth: number | null,
  startDay: number | null,
  endMonth: number | null,
  endDay: number | null
): boolean {
  if (!startMonth || !startDay || !endMonth || !endDay) return false;
  
  const month = date.getMonth() + 1;
  const day = date.getDate();
  
  // Handle wrap-around (e.g., Dec 1 - Jan 15)
  if (startMonth > endMonth || (startMonth === endMonth && startDay > endDay)) {
    return (month > startMonth || (month === startMonth && day >= startDay)) ||
           (month < endMonth || (month === endMonth && day <= endDay));
  }
  
  return (month > startMonth || (month === startMonth && day >= startDay)) &&
         (month < endMonth || (month === endMonth && day <= endDay));
}

function mergeTokens(base: DesignTokens, overlay: DesignTokens): DesignTokens {
  const merged = { ...base };
  for (const [key, value] of Object.entries(overlay)) {
    if (value !== undefined && value !== null && value !== '') {
      (merged as any)[key] = value;
    }
  }
  return merged;
}

function resolveTheme(
  input: ThemeResolverInput,
  data: ResolverData
): ResolvedTheme | null {
  const { company_id, category_key, subcategory_key, current_date = new Date(), user_theme_preference = 'light' } = input;
  const { templates, variants, rules } = data;

  if (!templates.length || !rules.length) return null;

  const activeTemplates = templates.filter(t => t.is_active);
  const enabledRules = rules.filter(r => r.is_enabled);

  // Sort rules by priority (lower = higher priority)
  const sortedRules = [...enabledRules].sort((a, b) => a.priority - b.priority);

  // Find matching rules
  let baseRule: TemplateRule | null = null;
  let seasonalRule: TemplateRule | null = null;
  const chain: string[] = [];

  for (const rule of sortedRules) {
    const template = activeTemplates.find(t => t.id === rule.template_id);
    if (!template) continue;

    switch (rule.rule_type) {
      case 'company_override':
        if (company_id && rule.company_id === company_id && !baseRule) {
          baseRule = rule;
          chain.push(`Override empresa (prioridade ${rule.priority})`);
        }
        break;

      case 'global_default':
        if (!baseRule) {
          baseRule = rule;
          chain.push(`Default global (prioridade ${rule.priority})`);
        }
        break;

      case 'subcategory':
        if (subcategory_key && rule.subcategory_key === subcategory_key && !baseRule) {
          baseRule = rule;
          chain.push(`Subcategoria: ${subcategory_key} (prioridade ${rule.priority})`);
        }
        break;

      case 'category':
        if (category_key && rule.category_key === category_key && !baseRule) {
          baseRule = rule;
          chain.push(`Categoria: ${category_key} (prioridade ${rule.priority})`);
        }
        break;

      case 'seasonal':
        if (!seasonalRule && isDateInRange(current_date, rule.start_month, rule.start_day, rule.end_month, rule.end_day)) {
          seasonalRule = rule;
          chain.push(`Sazonal: ${rule.seasonal_key} (${rule.start_day}/${rule.start_month} - ${rule.end_day}/${rule.end_month})`);
        }
        break;
    }
  }

  // Fallback: system default template
  if (!baseRule) {
    const systemDefault = activeTemplates.find(t => t.is_system_default);
    if (systemDefault) {
      chain.push('Template padrão do sistema (fallback)');
      // Create a virtual rule
      baseRule = {
        id: 'system-fallback',
        template_id: systemDefault.id,
        rule_type: 'global_default',
        company_id: null,
        category_key: null,
        subcategory_key: null,
        seasonal_key: null,
        start_month: null,
        start_day: null,
        end_month: null,
        end_day: null,
        priority: 9999,
        is_enabled: true,
        created_at: '',
        updated_at: '',
      };
    }
  }

  if (!baseRule) return null;

  const baseTemplate = activeTemplates.find(t => t.id === baseRule!.template_id);
  if (!baseTemplate) return null;

  // Find variant matching user preference
  const baseVariant = variants.find(
    v => v.template_id === baseTemplate.id && v.variant_key === user_theme_preference
  ) || variants.find(
    v => v.template_id === baseTemplate.id && v.variant_key === 'light'
  );

  if (!baseVariant) return null;

  // Resolve seasonal overlay
  let seasonalOverlay: TemplateVariant | null = null;
  let resolvedTokens = baseVariant.design_tokens as DesignTokens;

  if (seasonalRule) {
    const seasonalTemplate = activeTemplates.find(t => t.id === seasonalRule!.template_id);
    if (seasonalTemplate) {
      seasonalOverlay = variants.find(
        v => v.template_id === seasonalTemplate.id && v.variant_key === user_theme_preference
      ) || variants.find(
        v => v.template_id === seasonalTemplate.id && v.variant_key === 'light'
      ) || null;

      if (seasonalOverlay) {
        resolvedTokens = mergeTokens(resolvedTokens, seasonalOverlay.design_tokens as DesignTokens);
      }
    }
  }

  // Build resolution source description
  const source = chain.length > 0 ? chain[0] : 'Não resolvido';

  return {
    template: baseTemplate,
    variant: baseVariant,
    seasonal_overlay: seasonalOverlay,
    resolved_tokens: resolvedTokens,
    resolution_source: source,
    resolution_chain: chain,
  };
}

/**
 * Main hook: resolves which template to apply given current context
 */
export function useThemeResolver(input: ThemeResolverInput) {
  const { data: resolverData, isLoading } = useQuery({
    queryKey: ['theme-resolver', 'data'],
    queryFn: async () => {
      const [templates, variants, rules] = await Promise.all([
        fetchAllRows<Template>(supabase.from('templates').select('*').eq('is_active', true)),
        fetchAllRows<TemplateVariant>(supabase.from('template_variants').select('*')),
        fetchAllRows<TemplateRule>(supabase.from('template_rules').select('*').eq('is_enabled', true)),
      ]);

      return {
        templates,
        variants,
        rules,
      };
    },
    staleTime: 5 * 60 * 1000, // 5min cache
  });

  const resolved = useMemo(() => {
    if (!resolverData) return null;
    return resolveTheme(input, resolverData);
  }, [input, resolverData]);

  return {
    resolved,
    isLoading,
    templates: resolverData?.templates || [],
    rules: resolverData?.rules || [],
  };
}

/**
 * Simulator hook: resolves theme for arbitrary inputs (preview/simulator)
 */
export function useThemeSimulator(data: ResolverData | null) {
  return useMemo(() => {
    if (!data) return null;
    return (input: ThemeResolverInput) => resolveTheme(input, data);
  }, [data]);
}

/**
 * Apply resolved tokens to CSS custom properties
 */
export function applyDesignTokens(tokens: DesignTokens): void {
  const root = document.documentElement;
  
  const cssMap: Record<string, string> = {
    primary: '--primary',
    primary_foreground: '--primary-foreground',
    secondary: '--secondary',
    secondary_foreground: '--secondary-foreground',
    background: '--background',
    foreground: '--foreground',
    card: '--card',
    card_foreground: '--card-foreground',
    muted: '--muted',
    muted_foreground: '--muted-foreground',
    accent: '--accent',
    accent_foreground: '--accent-foreground',
    border: '--border',
    radius: '--radius',
    sidebar_background: '--sidebar-background',
    sidebar_foreground: '--sidebar-foreground',
    sidebar_primary: '--sidebar-primary',
  };

  for (const [tokenKey, cssVar] of Object.entries(cssMap)) {
    const value = tokens[tokenKey];
    if (value && typeof value === 'string') {
      root.style.setProperty(cssVar, value);
    }
  }
}
