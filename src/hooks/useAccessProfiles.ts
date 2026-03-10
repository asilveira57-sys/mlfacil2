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

export interface PermissionMatrix {
  profiles: AccessProfile[];
  actions: SystemAction[];
  modules: { id: string; key: string; name: string; layer: string; parent_module_id: string | null }[];
  permissions: Record<string, Record<string, boolean>>;
  featureMap: Record<string, string>;
}

interface UseAccessProfilesOptions {
  companyId?: string | null;
}

export function useAccessProfiles(options?: UseAccessProfilesOptions) {
  const queryClient = useQueryClient();
  const companyId = options?.companyId;

  const queryKey = companyId
    ? ['access-profiles-matrix', companyId]
    : ['access-profiles-matrix'];

  const { data: matrix, isLoading } = useQuery<PermissionMatrix>({
    queryKey,
    queryFn: async () => {
      // Build profiles query with optional company filter
      let profilesQuery = supabase.from('access_profiles').select('*').order('level');
      if (companyId) {
        profilesQuery = profilesQuery.or(`company_id.is.null,company_id.eq.${companyId}`);
      }

      const [profilesRes, actionsRes, modulesRes, featuresRes, permsRes] = await Promise.all([
        profilesQuery,
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

      const featureMap: Record<string, string> = {};
      for (const f of featuresRes.data || []) {
        featureMap[`${f.module_id}:${f.action_id}`] = f.id;
      }

      const permissions: Record<string, Record<string, boolean>> = {};
      for (const p of permsRes.data || []) {
        if (!permissions[p.profile_id]) permissions[p.profile_id] = {};
        permissions[p.profile_id][p.feature_id] = p.allowed;
      }

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
    staleTime: 30 * 60 * 1000, // 30 minutes
    gcTime: 60 * 60 * 1000, // 60 minutes
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
      queryClient.invalidateQueries({ queryKey });
    },
    onError: (err: any) => {
      toast.error('Erro ao atualizar permissão: ' + err.message);
    },
  });

  const duplicateProfile = useMutation({
    mutationFn: async ({ baseProfileId, newName, targetCompanyId }: { baseProfileId: string; newName: string; targetCompanyId: string }) => {
      // Get the base profile
      const { data: baseProfile, error: fetchErr } = await supabase
        .from('access_profiles')
        .select('*')
        .eq('id', baseProfileId)
        .single();
      if (fetchErr) throw fetchErr;

      // Create the new profile with the company_id
      const { data: newProfile, error: insertErr } = await supabase
        .from('access_profiles')
        .insert({
          key: `${baseProfile.key}_custom_${Date.now()}`,
          name: newName,
          level: baseProfile.level,
          is_system: false,
          is_protected: false,
          company_id: targetCompanyId,
        })
        .select()
        .single();
      if (insertErr) throw insertErr;

      // Copy permissions from base profile
      const { data: basePerms, error: permsErr } = await supabase
        .from('profile_permissions')
        .select('feature_id, allowed')
        .eq('profile_id', baseProfileId);
      if (permsErr) throw permsErr;

      if (basePerms && basePerms.length > 0) {
        const newPerms = basePerms.map(p => ({
          profile_id: newProfile.id,
          feature_id: p.feature_id,
          allowed: p.allowed,
        }));
        const { error: copyErr } = await supabase
          .from('profile_permissions')
          .insert(newPerms);
        if (copyErr) throw copyErr;
      }

      return newProfile;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      toast.success('Perfil duplicado com sucesso!');
    },
    onError: (err: any) => {
      toast.error('Erro ao duplicar perfil: ' + err.message);
    },
  });

  const renameProfile = useMutation({
    mutationFn: async ({ profileId, newName }: { profileId: string; newName: string }) => {
      const { error } = await supabase
        .from('access_profiles')
        .update({ name: newName })
        .eq('id', profileId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      toast.success('Perfil renomeado!');
    },
    onError: (err: any) => {
      toast.error('Erro ao renomear perfil: ' + err.message);
    },
  });

  return { matrix, isLoading, togglePermission, duplicateProfile, renameProfile };
}
