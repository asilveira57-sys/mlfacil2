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

export function useConfigMenu() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['config-menu'],
    queryFn: async () => {
      const [groupsRes, itemsRes] = await Promise.all([
        supabase
          .from('config_menu_groups')
          .select('*')
          .eq('active', true)
          .order('display_order', { ascending: true }),
        supabase
          .from('config_menu_items')
          .select('*')
          .eq('active', true)
          .order('display_order', { ascending: true }),
      ]);

      if (groupsRes.error) throw groupsRes.error;
      if (itemsRes.error) throw itemsRes.error;

      const items = itemsRes.data || [];
      const groups = groupsRes.data || [];

      // Build item tree
      const itemMap = new Map<string, ConfigMenuItem>();
      items.forEach(item => {
        itemMap.set(item.id, {
          ...item,
          icon: item.icon || 'Settings',
          children: [],
        });
      });

      // Attach children to parents
      const rootItems: ConfigMenuItem[] = [];
      itemMap.forEach(item => {
        if (item.parent_id && itemMap.has(item.parent_id)) {
          itemMap.get(item.parent_id)!.children.push(item);
        } else if (!item.parent_id) {
          rootItems.push(item);
        }
      });

      // Sort children
      const sortChildren = (items: ConfigMenuItem[]) => {
        items.sort((a, b) => a.display_order - b.display_order);
        items.forEach(i => sortChildren(i.children));
      };
      rootItems.forEach(i => sortChildren(i.children));

      // Attach items to groups
      const menuGroups: ConfigMenuGroup[] = groups.map(g => ({
        ...g,
        items: rootItems
          .filter(i => i.group_id === g.id)
          .sort((a, b) => a.display_order - b.display_order),
      }));

      // Only return groups that have at least one item
      return menuGroups.filter(g => g.items.length > 0);
    },
    staleTime: 30 * 60 * 1000, // 30 minutes
    gcTime: 60 * 60 * 1000, // 60 minutes
  });

  if (error) {
    console.error('[useConfigMenu] Query failed:', (error as Error).message);
  }

  return {
    menuGroups: data || [],
    isLoading,
    error: error ? (error as Error).message : null,
  };
}
