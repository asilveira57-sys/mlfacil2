import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface AccessProfile {
  id: string;
  key: string;
  name: string;
  level: number;
  is_system: boolean;
  is_protected: boolean;
  company_id: string | null;
}

export interface SystemAction {
  id: string;
  key: string;
  name: string;
}

export interface FeatureWithPermission {
  feature_id: string;
  module_id: string;
  module_key: string;
  module_name: string;
  action_id: string;
  action_key: string;
  action_name: string;
  allowed: boolean;
}

export interface PermissionMatrix {
  profiles: AccessProfile[];
  actions: SystemAction[];
  modules: { id: string; key: string; name: string; layer: string; parent_module_id: string | null }[];
  // Map: profileId -> featureId -> allowed
  permissions: Record<string, Record<string, boolean>>;
  // Map: moduleId+actionId -> featureId
  featureMap: Record<string, string>;
}

export function useAccessProfiles() {
  const queryClient = useQueryClient();

  const { data: matrix, isLoading } = useQuery<PermissionMatrix>({
    queryKey: ['access-profiles-matrix'],
    queryFn: async () => {
      const [profilesRes, actionsRes, modulesRes, featuresRes, permsRes] = await Promise.all([
        supabase.from('access_profiles').select('*').order('level'),
        supabase.from('system_actions').select('*').order('key'),
        supabase.from('system_modules').select('id, key, name, layer, parent_module_id, sort_order, is_internal_only').eq('is_active', true).eq('is_internal_only', false).order('sort_order'),
        supabase.from('system_features').select('id, module_id, action_id').eq('is_active', true),
        supabase.from('profile_permissions').select('profile_id, feature_id, allowed'),
      ]);

      if (profilesRes.error) throw profilesRes.error;
      if (actionsRes.error) throw actionsRes.error;
      if (modulesRes.error) throw modulesRes.error;
      if (featuresRes.error) throw featuresRes.error;
      if (permsRes.error) throw permsRes.error;

      // Build feature map: "moduleId:actionId" -> featureId
      const featureMap: Record<string, string> = {};
      for (const f of featuresRes.data || []) {
        featureMap[`${f.module_id}:${f.action_id}`] = f.id;
      }

      // Build permissions map: profileId -> featureId -> allowed
      const permissions: Record<string, Record<string, boolean>> = {};
      for (const p of permsRes.data || []) {
        if (!permissions[p.profile_id]) permissions[p.profile_id] = {};
        permissions[p.profile_id][p.feature_id] = p.allowed;
      }

      // Only show leaf modules (those that have features)
      const moduleIdsWithFeatures = new Set((featuresRes.data || []).map(f => f.module_id));
      const leafModules = (modulesRes.data || []).filter(m => moduleIdsWithFeatures.has(m.id));

      return {
        profiles: profilesRes.data as AccessProfile[],
        actions: actionsRes.data as SystemAction[],
        modules: leafModules,
        permissions,
        featureMap,
      };
    },
    staleTime: 2 * 60 * 1000,
  });

  const togglePermission = useMutation({
    mutationFn: async ({ profileId, featureId, allowed }: { profileId: string; featureId: string; allowed: boolean }) => {
      const { error } = await supabase
        .from('profile_permissions')
        .upsert(
          { profile_id: profileId, feature_id: featureId, allowed },
          { onConflict: 'profile_id,feature_id' }
        );
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['access-profiles-matrix'] });
    },
    onError: (err: any) => {
      toast.error('Erro ao atualizar permissão: ' + err.message);
    },
  });

  return { matrix, isLoading, togglePermission };
}
