import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { Workspace } from '@/types/tasks';

interface UserPreferences {
  user_id: string;
  active_workspace_id: string | null;
  tasks_enabled: boolean;
  created_at: string;
  updated_at: string;
}

interface EnsureWorkspaceResult {
  user_id: string;
  active_workspace_id: string | null;
  tasks_enabled: boolean;
  created: boolean;
}

interface UseUserPreferencesResult {
  preferences: UserPreferences | null;
  activeWorkspace: Workspace | null;
  workspaces: Workspace[];
  tasksEnabled: boolean;
  loading: boolean;
  error: string | null;
  ensureWorkspace: () => Promise<EnsureWorkspaceResult | null>;
  enableTasks: () => Promise<boolean>;
  switchWorkspace: (workspaceId: string) => Promise<boolean>;
  refetch: () => Promise<void>;
}

export function useUserPreferences(): UseUserPreferencesResult {
  const [preferences, setPreferences] = useState<UserPreferences | null>(null);
  const [activeWorkspace, setActiveWorkspace] = useState<Workspace | null>(null);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const ensureWorkspace = useCallback(async (): Promise<EnsureWorkspaceResult | null> => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setError('Usuário não autenticado');
        return null;
      }

      const { data, error: rpcError } = await supabase
        .rpc('ensure_workspace', { p_user_id: user.id });

      if (rpcError) {
        console.error('[useUserPreferences] ensureWorkspace error:', rpcError);
        throw rpcError;
      }

      return data as unknown as EnsureWorkspaceResult;
    } catch (err) {
      console.error('[useUserPreferences] ensureWorkspace failed:', err);
      setError(err instanceof Error ? err.message : 'Erro ao garantir workspace');
      return null;
    }
  }, []);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setPreferences(null);
        setActiveWorkspace(null);
        setWorkspaces([]);
        setLoading(false);
        return;
      }

      // Ensure workspace exists
      const result = await ensureWorkspace();
      if (!result) {
        setLoading(false);
        return;
      }

      // Fetch preferences
      const { data: prefsData, error: prefsError } = await supabase
        .from('user_preferences')
        .select('*')
        .eq('user_id', user.id)
        .single();

      if (prefsError && prefsError.code !== 'PGRST116') {
        throw prefsError;
      }

      setPreferences(prefsData);

      // Fetch workspaces where user is member
      const { data: memberData } = await supabase
        .from('workspace_members')
        .select('workspace_id')
        .eq('user_id', user.id);

      if (memberData && memberData.length > 0) {
        const wsIds = memberData.map(m => m.workspace_id);
        const { data: wsData } = await supabase
          .from('workspaces')
          .select('*')
          .in('id', wsIds)
          .order('created_at', { ascending: false });

        setWorkspaces(wsData || []);

        // Set active workspace
        const activeWsId = prefsData?.active_workspace_id;
        const activeWs = wsData?.find(w => w.id === activeWsId) || wsData?.[0] || null;
        setActiveWorkspace(activeWs);
      }
    } catch (err) {
      console.error('[useUserPreferences] fetchData error:', err);
      setError(err instanceof Error ? err.message : 'Erro ao carregar preferências');
    } finally {
      setLoading(false);
    }
  }, [ensureWorkspace]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const enableTasks = useCallback(async (): Promise<boolean> => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return false;

      const { error: updateError } = await supabase
        .from('user_preferences')
        .update({ tasks_enabled: true })
        .eq('user_id', user.id);

      if (updateError) throw updateError;

      setPreferences(prev => prev ? { ...prev, tasks_enabled: true } : null);
      return true;
    } catch (err) {
      console.error('[useUserPreferences] enableTasks error:', err);
      return false;
    }
  }, []);

  const switchWorkspace = useCallback(async (workspaceId: string): Promise<boolean> => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return false;

      // Validate user is member of this workspace
      const { data: membership } = await supabase
        .from('workspace_members')
        .select('id')
        .eq('workspace_id', workspaceId)
        .eq('user_id', user.id)
        .single();

      if (!membership) {
        setError('Você não é membro deste workspace');
        return false;
      }

      const { error: updateError } = await supabase
        .from('user_preferences')
        .update({ active_workspace_id: workspaceId })
        .eq('user_id', user.id);

      if (updateError) throw updateError;

      // Update local state
      setPreferences(prev => prev ? { ...prev, active_workspace_id: workspaceId } : null);
      const newActive = workspaces.find(w => w.id === workspaceId) || null;
      setActiveWorkspace(newActive);

      return true;
    } catch (err) {
      console.error('[useUserPreferences] switchWorkspace error:', err);
      return false;
    }
  }, [workspaces]);

  return {
    preferences,
    activeWorkspace,
    workspaces,
    tasksEnabled: preferences?.tasks_enabled ?? false,
    loading,
    error,
    ensureWorkspace,
    enableTasks,
    switchWorkspace,
    refetch: fetchData,
  };
}
