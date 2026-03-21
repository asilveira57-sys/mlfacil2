import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useUserAccessState } from './useUserAccessState';
import { useCallback, useMemo } from 'react';

/**
 * Complementary access layer: checks if the user's active plan includes a given module.
 * Works alongside existing trial/billing/RBAC — never replaces them.
 *
 * If no plan_modules are configured for the user's plan, access is granted (fail-open).
 */

interface UserPlanModules {
  planCode: string | null;
  allowedModuleKeys: Set<string>;
  hasPlanModuleConfig: boolean; // true if plan_modules rows exist for this plan
}

export function useCanAccessModule() {
  const { status } = useUserAccessState();
  const userId = status?.user_id;

  const { data, isLoading } = useQuery({
    queryKey: ['user-plan-modules', userId],
    queryFn: async (): Promise<UserPlanModules> => {
      if (!userId) return { planCode: null, allowedModuleKeys: new Set(), hasPlanModuleConfig: false };

      // 1. Get user's active plan via user_access_state -> selected_plan
      // Or fallback: check tenant_subscriptions for active subscription
      const { data: accessState } = await supabase
        .from('user_access_state')
        .select('selected_plan_id')
        .eq('user_id', userId)
        .maybeSingle();

      const planId = accessState?.selected_plan_id;
      if (!planId) return { planCode: null, allowedModuleKeys: new Set(), hasPlanModuleConfig: false };

      // 2. Get plan code
      const { data: tier } = await supabase
        .from('plan_tiers')
        .select('code')
        .eq('id', planId)
        .maybeSingle();

      // 3. Get enabled modules for this plan
      const { data: planModules } = await supabase
        .from('plan_modules')
        .select('module_id, is_enabled')
        .eq('plan_id', planId)
        .eq('is_enabled', true);

      if (!planModules || planModules.length === 0) {
        return { planCode: tier?.code || null, allowedModuleKeys: new Set(), hasPlanModuleConfig: false };
      }

      // 4. Resolve module keys
      const moduleIds = planModules.map(pm => pm.module_id);
      const { data: modules } = await supabase
        .from('system_modules')
        .select('id, key')
        .in('id', moduleIds);

      const keys = new Set((modules || []).map(m => m.key));
      return { planCode: tier?.code || null, allowedModuleKeys: keys, hasPlanModuleConfig: true };
    },
    enabled: !!userId,
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });

  const canAccessModule = useCallback((moduleKey: string): boolean => {
    if (!data) return true; // loading → fail-open
    if (!data.hasPlanModuleConfig) return true; // no config → all access (backwards compatible)
    return data.allowedModuleKeys.has(moduleKey);
  }, [data]);

  return {
    canAccessModule,
    planCode: data?.planCode || null,
    hasPlanConfig: data?.hasPlanModuleConfig || false,
    allowedModules: data?.allowedModuleKeys || new Set<string>(),
    isLoading,
  };
}

/**
 * Hook to get the list of module keys allowed by the user's plan.
 * Used by the dynamic menu to filter visible items.
 */
export function usePlanAllowedModuleKeys(): { keys: Set<string>; hasConfig: boolean; isLoading: boolean } {
  const { allowedModules, hasPlanConfig, isLoading } = useCanAccessModule();
  return { keys: allowedModules, hasConfig: hasPlanConfig, isLoading };
}
