import { useEffect } from 'react';
import { useThemeResolver, applyDesignTokens } from '@/hooks/useThemeResolver';
import { useCurrentWorkspaceId } from '@/hooks/useCurrentWorkspaceId';
import { useActiveAccount } from '@/contexts/ActiveAccountContext';

/**
 * Automatically resolves and applies the current theme tokens
 * as CSS custom properties on <html>.
 * 
 * Mount this once in DashboardLayout.
 */
export function useApplyTheme() {
  const { data: workspaceId } = useCurrentWorkspaceId();
  const { activeAccountId } = useActiveAccount();

  const { resolved, isLoading } = useThemeResolver({
    workspace_id: workspaceId,
    company_id: activeAccountId,
    current_date: new Date(),
    user_theme_preference: 'light',
  });

  useEffect(() => {
    if (!resolved?.resolved_tokens) return;
    applyDesignTokens(resolved.resolved_tokens);

    // Cleanup: remove custom properties when unmounting
    return () => {
      const root = document.documentElement;
      const cssVars = [
        '--primary', '--primary-foreground', '--secondary', '--secondary-foreground',
        '--background', '--foreground', '--card', '--card-foreground',
        '--muted', '--muted-foreground', '--accent', '--accent-foreground',
        '--border', '--radius', '--sidebar-background', '--sidebar-foreground', '--sidebar-primary',
      ];
      cssVars.forEach(v => root.style.removeProperty(v));
    };
  }, [resolved?.resolved_tokens]);

  return { resolved, isLoading };
}
