import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useActiveAccount } from '@/contexts/ActiveAccountContext';
import { COMPANY_COLORS, AVAILABLE_SHORTCUTS, getCompanyColor } from '@/lib/companyColors';
import type { CompanyColor, DashboardShortcut } from '@/lib/companyColors';

interface ShortcutPreference {
  key: string;
  isEnabled: boolean;
  sortOrder: number;
}

interface UseCompanyCustomizationResult {
  // Color
  activeColor: CompanyColor;
  setCompanyColor: (colorKey: string) => Promise<void>;
  availableColors: CompanyColor[];
  // Shortcuts
  shortcuts: ShortcutPreference[];
  enabledShortcuts: DashboardShortcut[];
  toggleShortcut: (shortcutKey: string) => Promise<void>;
  reorderShortcuts: (shortcuts: ShortcutPreference[]) => Promise<void>;
  availableShortcuts: DashboardShortcut[];
  // Account info
  accountName: string | null;
  // State
  loading: boolean;
  error: string | null;
}

export function useCompanyCustomization(): UseCompanyCustomizationResult {
  const { activeAccountId, activeAccount } = useActiveAccount();
  const [colorKey, setColorKey] = useState<string>('blue');
  const [shortcuts, setShortcuts] = useState<ShortcutPreference[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Use activeAccountId as company identifier
  const companyId = activeAccountId;

  // Fetch customization data
  const fetchData = useCallback(async () => {
    if (!companyId) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setLoading(false);
        return;
      }

      // Fetch color preference
      const { data: colorData } = await supabase
        .from('company_customization')
        .select('color_key')
        .eq('company_id', companyId)
        .eq('user_id', user.id)
        .single();

      if (colorData) {
        setColorKey(colorData.color_key);
      }

      // Fetch shortcuts
      const { data: shortcutsData } = await supabase
        .from('user_dashboard_shortcuts')
        .select('shortcut_key, is_enabled, sort_order')
        .eq('company_id', companyId)
        .eq('user_id', user.id)
        .order('sort_order', { ascending: true });

      if (shortcutsData && shortcutsData.length > 0) {
        setShortcuts(shortcutsData.map(s => ({
          key: s.shortcut_key,
          isEnabled: s.is_enabled,
          sortOrder: s.sort_order,
        })));
      } else {
        // Default: first 6 shortcuts enabled
        const defaultShortcuts = AVAILABLE_SHORTCUTS.slice(0, 6).map((s, i) => ({
          key: s.key,
          isEnabled: true,
          sortOrder: i,
        }));
        setShortcuts(defaultShortcuts);
      }
    } catch (err) {
      console.error('[useCompanyCustomization] Error:', err);
      setError(err instanceof Error ? err.message : 'Erro ao carregar personalização');
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Set company color
  const setCompanyColor = useCallback(async (newColorKey: string) => {
    if (!companyId) return;

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    try {
      const { error: upsertError } = await supabase
        .from('company_customization')
        .upsert({
          company_id: companyId,
          user_id: user.id,
          color_key: newColorKey,
          updated_at: new Date().toISOString(),
        }, {
          onConflict: 'company_id,user_id',
        });

      if (upsertError) throw upsertError;
      setColorKey(newColorKey);
    } catch (err) {
      console.error('[useCompanyCustomization] setCompanyColor error:', err);
      setError(err instanceof Error ? err.message : 'Erro ao salvar cor');
    }
  }, [companyId]);

  // Toggle shortcut
  const toggleShortcut = useCallback(async (shortcutKey: string) => {
    if (!companyId) return;

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const existingShortcut = shortcuts.find(s => s.key === shortcutKey);
    const newIsEnabled = existingShortcut ? !existingShortcut.isEnabled : true;
    const newSortOrder = existingShortcut ? existingShortcut.sortOrder : shortcuts.length;

    try {
      const { error: upsertError } = await supabase
        .from('user_dashboard_shortcuts')
        .upsert({
          user_id: user.id,
          company_id: companyId,
          shortcut_key: shortcutKey,
          is_enabled: newIsEnabled,
          sort_order: newSortOrder,
          updated_at: new Date().toISOString(),
        }, {
          onConflict: 'user_id,company_id,shortcut_key',
        });

      if (upsertError) throw upsertError;

      setShortcuts(prev => {
        const existing = prev.find(s => s.key === shortcutKey);
        if (existing) {
          return prev.map(s => s.key === shortcutKey ? { ...s, isEnabled: newIsEnabled } : s);
        }
        return [...prev, { key: shortcutKey, isEnabled: true, sortOrder: prev.length }];
      });
    } catch (err) {
      console.error('[useCompanyCustomization] toggleShortcut error:', err);
      setError(err instanceof Error ? err.message : 'Erro ao salvar atalho');
    }
  }, [companyId, shortcuts]);

  // Reorder shortcuts
  const reorderShortcuts = useCallback(async (newShortcuts: ShortcutPreference[]) => {
    if (!companyId) return;

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    try {
      // Update all shortcuts with new order
      const updates = newShortcuts.map((s, index) => ({
        user_id: user.id,
        company_id: companyId,
        shortcut_key: s.key,
        is_enabled: s.isEnabled,
        sort_order: index,
        updated_at: new Date().toISOString(),
      }));

      for (const update of updates) {
        await supabase
          .from('user_dashboard_shortcuts')
          .upsert(update, {
            onConflict: 'user_id,company_id,shortcut_key',
          });
      }

      setShortcuts(newShortcuts.map((s, i) => ({ ...s, sortOrder: i })));
    } catch (err) {
      console.error('[useCompanyCustomization] reorderShortcuts error:', err);
      setError(err instanceof Error ? err.message : 'Erro ao reordenar atalhos');
    }
  }, [companyId]);

  // Get enabled shortcuts as DashboardShortcut objects
  const enabledShortcuts = shortcuts
    .filter(s => s.isEnabled)
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map(s => AVAILABLE_SHORTCUTS.find(as => as.key === s.key))
    .filter(Boolean) as DashboardShortcut[];

  return {
    activeColor: getCompanyColor(colorKey),
    setCompanyColor,
    availableColors: COMPANY_COLORS,
    shortcuts,
    enabledShortcuts,
    toggleShortcut,
    reorderShortcuts,
    availableShortcuts: AVAILABLE_SHORTCUTS,
    accountName: activeAccount?.nickname || activeAccount?.email || null,
    loading,
    error,
  };
}
