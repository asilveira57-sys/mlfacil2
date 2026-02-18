import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useUserRole } from './useUserRole';
import { useUserAccessState } from './useUserAccessState';
import { useMemo, useCallback } from 'react';

// Plan hierarchy for min_plan_code comparison
const PLAN_HIERARCHY: Record<string, number> = {
  zpl: 0,
  basic: 1,
  pro: 2,
  analytics_pro: 3,
};

export interface DynamicMenuItem {
  id: string;
  parent_id: string | null;
  category_root: string;
  scope: string;
  marketplace_code: string | null;
  label: string;
  icon_key: string;
  route: string | null;
  order_index: number;
  status: 'active' | 'beta' | 'coming_soon' | 'hidden';
  feature_key: string | null;
  permission_key: string | null;
  // From rules join
  rule?: {
    allowed_roles: string[];
    min_plan_code: string | null;
    allowed_plans: string[] | null;
    requires_marketplace_connected: boolean;
    required_feature_flags: string[] | null;
    is_enabled: boolean;
  } | null;
  // Computed
  children: DynamicMenuItem[];
}

interface UseDynamicMenuReturn {
  menuTree: DynamicMenuItem[];
  isLoading: boolean;
  error: string | null;
  refetch: () => void;
}

async function fetchMenuData() {
  const { data: items, error: itemsError } = await supabase
    .from('menu_items')
    .select('*')
    .order('order_index', { ascending: true });

  if (itemsError) throw itemsError;

  const { data: rules, error: rulesError } = await supabase
    .from('menu_item_rules')
    .select('*');

  if (rulesError) throw rulesError;

  // Map rules by menu_item_id
  const rulesMap = new Map<string, typeof rules[0]>();
  (rules || []).forEach(r => rulesMap.set(r.menu_item_id, r));

  return { items: items || [], rulesMap };
}

export function useDynamicMenu(): UseDynamicMenuReturn {
  const { role, isAdmin, userId } = useUserRole();
  const { mlConnected } = useUserAccessState();

  // Fetch collaborator permissions if needed
  const { data: collabPerms } = useQuery({
    queryKey: ['collaborator-menu-permissions', userId],
    queryFn: async () => {
      if (!userId) return [];
      const { data } = await supabase
        .from('collaborator_menu_permissions')
        .select('permission_key, is_allowed')
        .eq('user_id', userId);
      return data || [];
    },
    enabled: !!userId,
    staleTime: 5 * 60 * 1000,
  });

  // Fetch feature flags
  const { data: featureFlags } = useQuery({
    queryKey: ['dynamic-feature-flags'],
    queryFn: async () => {
      const { data } = await supabase
        .from('dynamic_feature_flags')
        .select('feature_key, is_enabled')
        .eq('is_enabled', true);
      return new Set((data || []).map(f => f.feature_key));
    },
    staleTime: 5 * 60 * 1000,
  });

  const { data: menuData, isLoading, error, refetch } = useQuery({
    queryKey: ['dynamic-menu-items'],
    queryFn: fetchMenuData,
    staleTime: 5 * 60 * 1000,
  });

  // Determine user role for menu purposes
  const effectiveRole = useMemo(() => {
    if (isAdmin) return 'admin';
    // Check collaborator based on collabPerms existence
    // For now, if not admin, treat as owner (the existing collaborator system handles the rest)
    return 'owner';
  }, [isAdmin]);

  // Current plan - default to 'basic' for now (can be enhanced)
  const currentPlan = 'basic'; // TODO: integrate with subscription system

  // ML connected status
  const meliConnected = mlConnected;

  const menuTree = useMemo(() => {
    if (!menuData) return [];
    const { items, rulesMap } = menuData;

    // Build permission set for collaborators
    const permissionSet = new Set<string>();
    const isCollaborator = effectiveRole as string === 'collaborator';
    if (isCollaborator && collabPerms) {
      collabPerms.forEach(p => {
        if (p.is_allowed) permissionSet.add(p.permission_key);
      });
    }

    // Filter function
    const isItemVisible = (item: typeof items[0]): boolean => {
      // Hidden items never show
      if (item.status === 'hidden') return false;

      const rule = rulesMap.get(item.id);

      // If rule exists and is disabled
      if (rule && !rule.is_enabled) return false;

      // Check allowed_roles
      if (rule?.allowed_roles && rule.allowed_roles.length > 0) {
        if (!rule.allowed_roles.includes(effectiveRole)) return false;
      }

      // Check min_plan_code
      if (rule?.min_plan_code) {
        const minLevel = PLAN_HIERARCHY[rule.min_plan_code] ?? 0;
        const currentLevel = PLAN_HIERARCHY[currentPlan] ?? 0;
        // Admin bypasses plan checks
        if (!isAdmin && currentLevel < minLevel) return false;
      }

      // Check allowed_plans
      if (rule?.allowed_plans && rule.allowed_plans.length > 0) {
        if (!isAdmin && !rule.allowed_plans.includes(currentPlan)) return false;
      }

      // Check marketplace connected
      if (rule?.requires_marketplace_connected) {
        if (item.marketplace_code === 'meli' && !meliConnected && !isAdmin) return false;
        if (item.marketplace_code === 'shopee') return false; // Shopee not supported yet
      }

      // Check feature flags
      if (rule?.required_feature_flags && rule.required_feature_flags.length > 0 && featureFlags) {
        const allEnabled = rule.required_feature_flags.every(f => featureFlags.has(f));
        if (!allEnabled && !isAdmin) return false;
      }

      // Collaborator permission check
      if (isCollaborator && item.permission_key) {
        if (!permissionSet.has(item.permission_key)) return false;
      }

      return true;
    };

    // Build tree
    const itemMap = new Map<string, DynamicMenuItem>();
    const roots: DynamicMenuItem[] = [];

    // First pass: create nodes
    items.forEach(item => {
      if (!isItemVisible(item)) return;
      
      const rule = rulesMap.get(item.id);
      const node: DynamicMenuItem = {
        ...item,
        status: item.status as DynamicMenuItem['status'],
        rule: rule ? {
          allowed_roles: rule.allowed_roles || [],
          min_plan_code: rule.min_plan_code,
          allowed_plans: rule.allowed_plans || null,
          requires_marketplace_connected: rule.requires_marketplace_connected,
          required_feature_flags: rule.required_feature_flags || null,
          is_enabled: rule.is_enabled,
        } : null,
        children: [],
      };
      itemMap.set(item.id, node);
    });

    // Second pass: build hierarchy
    itemMap.forEach(node => {
      if (node.parent_id && itemMap.has(node.parent_id)) {
        itemMap.get(node.parent_id)!.children.push(node);
      } else if (!node.parent_id) {
        roots.push(node);
      }
      // If parent was filtered out but node is visible, it becomes orphan (skip it)
    });

    // For collaborators: remove groups with no visible children
    const pruneEmpty = (nodes: DynamicMenuItem[]): DynamicMenuItem[] => {
      return nodes.filter(node => {
        node.children = pruneEmpty(node.children);
        // If it's a group (no route) and has no children, remove it
        if (!node.route && node.children.length === 0) return false;
        return true;
      });
    };

    // Sort children by order_index
    const sortTree = (nodes: DynamicMenuItem[]) => {
      nodes.sort((a, b) => a.order_index - b.order_index);
      nodes.forEach(n => sortTree(n.children));
    };

    const pruned = pruneEmpty(roots);
    sortTree(pruned);

    return pruned;
  }, [menuData, effectiveRole, currentPlan, meliConnected, isAdmin, collabPerms, featureFlags]);

  return {
    menuTree,
    isLoading,
    error: error ? (error as Error).message : null,
    refetch,
  };
}
