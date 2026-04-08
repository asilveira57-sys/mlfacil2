import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useUserAccessState } from './useUserAccessState';
import { useCallback, useMemo } from 'react';

/**
 * Complementary access layer: checks if the user's active plan includes a given module.
 * Works alongside existing trial/billing/RBAC — never replaces them.
 *
 * Sources (in priority order):
 * 1. user_plan_assignments (status = 'active')
 * 2. user_access_state.selected_plan_id (fallback)
 *
 * If no plan_modules are configured for the user's plan, access is granted (fail-open).
 */

interface UserPlanModules {
  planCode: string | null;
  planGroup: string | null;
  allowedModuleKeys: Set<string>;
  hasPlanModuleConfig: boolean;
}

export function useCanAccessModule() {
  const { status, trialActive } = useUserAccessState();
  const userId = status?.user_id;

  const { data, isLoading } = useQuery({
    queryKey: ['user-plan-modules', userId, trialActive],
    queryFn: async (): Promise<UserPlanModules> => {
      if (!userId) return { planCode: null, planGroup: null, allowedModuleKeys: new Set(), hasPlanModuleConfig: false };

      // Active trial must never hide modules. Trial users evaluate the full product,
      // even if onboarding stored a restrictive plan like ZPL as a usage preference.
      if (trialActive) {
        return { planCode: 'trial-full-access', planGroup: 'full', allowedModuleKeys: new Set(), hasPlanModuleConfig: false };
      }

      // 1. Try user_plan_assignments first (active assignment)
      let planId: string | null = null;

      const { data: assignment } = await (supabase as any)
        .from('user_plan_assignments')
        .select('plan_tier_id')
        .eq('user_id', userId)
        .eq('status', 'active')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (assignment?.plan_tier_id) {
        planId = assignment.plan_tier_id;
      }

      // 2. Fallback to user_access_state.selected_plan_id
      if (!planId) {
        const { data: accessState } = await supabase
          .from('user_access_state')
          .select('selected_plan_id')
          .eq('user_id', userId)
          .maybeSingle();

        planId = accessState?.selected_plan_id || null;
      }

      if (!planId) return { planCode: null, planGroup: null, allowedModuleKeys: new Set(), hasPlanModuleConfig: false };

      // 3. Get plan info
      const { data: tier } = await supabase
        .from('plan_tiers')
        .select('code, plan_group')
        .eq('id', planId)
        .maybeSingle();

      // 4. Get enabled modules for this plan
      const { data: planModules } = await supabase
        .from('plan_modules')
        .select('module_id, is_enabled')
        .eq('plan_id', planId)
        .eq('is_enabled', true);

      if (!planModules || planModules.length === 0) {
        return { planCode: tier?.code || null, planGroup: tier?.plan_group || null, allowedModuleKeys: new Set(), hasPlanModuleConfig: false };
      }

      // 5. Resolve module keys
      const moduleIds = planModules.map(pm => pm.module_id);
      const { data: modules } = await supabase
        .from('system_modules')
        .select('id, key')
        .in('id', moduleIds);

      const keys = new Set((modules || []).map(m => m.key));
      return { planCode: tier?.code || null, planGroup: tier?.plan_group || null, allowedModuleKeys: keys, hasPlanModuleConfig: true };
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
    planGroup: data?.planGroup || null,
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
