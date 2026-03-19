import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface ConfigMenuItem {
  id: string;
  group_id: string;
  parent_id: string | null;
  name: string;
  slug: string;
  route: string | null;
  icon: string;
  display_order: number;
  active: boolean;
  children: ConfigMenuItem[];
}

export interface ConfigMenuGroup {
  id: string;
  name: string;
  slug: string;
  icon: string;
  display_order: number;
  active: boolean;
  items: ConfigMenuItem[];
}

/**
 * Shared query function for config-menu.
 * Returns flat top-level items sorted by display_order.
 * "mensagem-do-dia" is always forced to the end.
 */
export async function fetchConfigMenuItems(): Promise<ConfigMenuItem[]> {
  const { data, error } = await supabase
    .from('config_menu_items')
    .select('*')
    .eq('active', true)
    .is('parent_id', null)
    .order('display_order', { ascending: true });

  if (error) throw error;

  const items: ConfigMenuItem[] = (data || []).map(item => ({
    ...item,
    icon: item.icon || 'Settings',
    children: [],
  }));

  // Force mensagem-do-dia to always be last
  const msgIdx = items.findIndex(i => i.slug === 'mensagem-do-dia');
  if (msgIdx > -1) {
    const [msg] = items.splice(msgIdx, 1);
    items.push(msg);
  }

  return items;
}

export function useConfigMenu() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['config-menu'],
    queryFn: fetchConfigMenuItems,
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });

  if (error) {
    console.error('[useConfigMenu] Query failed:', (error as Error).message);
  }

  return {
    menuItems: data || [],
    /** @deprecated Use menuItems instead */
    menuGroups: [],
    isLoading,
    error: error ? (error as Error).message : null,
  };
}
