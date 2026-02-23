import { useEffect, useMemo } from 'react';
import { useThemeResolver, applyDesignTokens } from '@/hooks/useThemeResolver';
import { useCurrentWorkspaceId } from '@/hooks/useCurrentWorkspaceId';
import { useActiveAccount } from '@/contexts/ActiveAccountContext';
import { useSellerVisualPreferences } from '@/hooks/useSellerVisualPreferences';
import type { ResolvedTheme } from '@/types/templates';

const CSS_VARS = [
  '--primary', '--primary-foreground', '--secondary', '--secondary-foreground',
  '--background', '--foreground', '--card', '--card-foreground',
  '--muted', '--muted-foreground', '--accent', '--accent-foreground',
  '--border', '--radius', '--sidebar-background', '--sidebar-foreground', '--sidebar-primary',
];

/**
 * Resolves and applies the current theme tokens as CSS custom properties.
 * 
 * Respects seller_visual_preferences:
 * - mode "fixed" → uses fixed_template_id directly (bypasses rule resolver)
 * - mode "clean" → removes all theme tokens
 * - mode "auto"  → uses rule-based resolver (category, seasonal, etc.)
 */
export function useApplyTheme() {
  const { data: workspaceId } = useCurrentWorkspaceId();
  const { activeAccountId } = useActiveAccount();
  const { mode, fixedTemplateId } = useSellerVisualPreferences();

  const { resolved: autoResolved, isLoading, templates, variants } = useThemeResolver({
    workspace_id: workspaceId,
    company_id: activeAccountId,
    current_date: new Date(),
    user_theme_preference: 'light',
  });

  // Build the final resolved theme based on seller mode
  const resolved = useMemo<ResolvedTheme | null>(() => {
    if (mode === 'clean') return null;

    if (mode === 'fixed' && fixedTemplateId) {
      const template = templates.find(t => t.id === fixedTemplateId);
      if (!template) return autoResolved; // fallback if template not found yet

      const variant = variants.find(
        v => v.template_id === fixedTemplateId && v.variant_key === 'light'
      );
      if (!variant) return autoResolved; // fallback if variant not found

      return {
        template,
        variant,
        seasonal_overlay: null,
        resolved_tokens: variant.design_tokens,
        resolution_source: 'Preferência fixa do seller',
        resolution_chain: [`Template fixo: ${template.name}`],
      } as ResolvedTheme;
    }

    // mode === 'auto'
    return autoResolved;
  }, [mode, fixedTemplateId, autoResolved, templates, variants]);

  // Apply or clean CSS variables
  useEffect(() => {
    if (mode === 'clean') {
      const root = document.documentElement;
      CSS_VARS.forEach(v => root.style.removeProperty(v));
      return;
    }

    if (resolved?.resolved_tokens) {
      applyDesignTokens(resolved.resolved_tokens);
    }

    return () => {
      const root = document.documentElement;
      CSS_VARS.forEach(v => root.style.removeProperty(v));
    };
  }, [resolved?.resolved_tokens, mode]);

  return { resolved, isLoading };
}
