import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useUserRole } from './useUserRole';
import { useUserAccessState } from './useUserAccessState';
import { usePlanAllowedModuleKeys } from './useCanAccessModule';
import { useMemo } from 'react';

export interface DynamicMenuItem {
  id: string;
  key: string;
  name: string;
  layer: string;
  parent_module_id: string | null;
  sort_order: number;
  icon_key: string;
  route: string | null;
  is_active: boolean;
  status: 'active' | 'beta' | 'coming_soon' | 'hidden';
  // Compatibility aliases
  label: string;
  children: DynamicMenuItem[];
}

interface UseDynamicMenuReturn {
  menuTree: DynamicMenuItem[];
  isLoading: boolean;
  error: string | null;
  refetch: () => void;
}

export function useDynamicMenu(): UseDynamicMenuReturn {
  const { isAdmin } = useUserRole();
  const { mlConnected } = useUserAccessState();
  const { keys: planModuleKeys, hasConfig: hasPlanConfig } = usePlanAllowedModuleKeys();

  const { data: modules, isLoading, error, refetch } = useQuery({
    queryKey: ['dynamic-menu-system-modules'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('system_modules')
        .select('id, key, name, layer, parent_module_id, sort_order, icon_key, route, is_active, is_internal_only, status')
        .eq('is_active', true)
        .order('sort_order', { ascending: true });

      if (error) throw error;
      return data || [];
    },
    staleTime: 30 * 60 * 1000, // 30 minutes
    gcTime: 60 * 60 * 1000, // 60 minutes
  });

  const menuTree = useMemo(() => {
    if (!modules) return [];

    // Filter: hide internal-only items for non-admins
    const filtered = modules.filter(m => {
      if (m.is_internal_only && !isAdmin) return false;
      if (m.layer === 'admin' && !isAdmin) return false;
      // Plan-based module filtering (complementary — only if config exists)
      if (hasPlanConfig && !isAdmin && m.route) {
        if (!planModuleKeys.has(m.key)) return false;
      }
      return true;
    });

    // Build tree
    const nodeMap = new Map<string, DynamicMenuItem>();
    const roots: DynamicMenuItem[] = [];

    filtered.forEach(m => {
      const node: DynamicMenuItem = {
        id: m.id,
        key: m.key,
        name: m.name,
        layer: m.layer,
        parent_module_id: m.parent_module_id,
        sort_order: m.sort_order,
        icon_key: m.icon_key || 'Settings',
        route: m.route,
        is_active: m.is_active,
        status: (m as any).status || 'active',
        label: m.name,
        children: [],
      };
      nodeMap.set(m.id, node);
    });

    nodeMap.forEach(node => {
      if (node.parent_module_id && nodeMap.has(node.parent_module_id)) {
        nodeMap.get(node.parent_module_id)!.children.push(node);
      } else if (!node.parent_module_id) {
        roots.push(node);
      }
    });

    // Prune empty groups
    const prune = (nodes: DynamicMenuItem[]): DynamicMenuItem[] => {
      return nodes.filter(n => {
        n.children = prune(n.children);
        if (!n.route && n.children.length === 0 && n.status !== 'coming_soon') return false;
        return true;
      });
    };

    // Sort
    const sortTree = (nodes: DynamicMenuItem[]) => {
      nodes.sort((a, b) => a.sort_order - b.sort_order);
      nodes.forEach(n => sortTree(n.children));
    };

    const pruned = prune(roots);
    sortTree(pruned);
    return pruned;
  }, [modules, isAdmin, hasPlanConfig, planModuleKeys]);

  return {
    menuTree,
    isLoading,
    error: error ? (error as Error).message : null,
    refetch,
  };
}
