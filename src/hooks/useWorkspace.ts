import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { Workspace, WorkspaceMember, WorkspaceAccount, WorkspaceRole } from '@/types/tasks';

interface UseWorkspaceResult {
  workspaces: Workspace[];
  currentWorkspace: Workspace | null;
  members: WorkspaceMember[];
  accounts: WorkspaceAccount[];
  myRole: WorkspaceRole | null;
  loading: boolean;
  error: string | null;
  setCurrentWorkspace: (workspace: Workspace) => void;
  createWorkspace: (name: string) => Promise<Workspace | null>;
  refetch: () => Promise<void>;
}

export function useWorkspace(): UseWorkspaceResult {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [currentWorkspace, setCurrentWorkspace] = useState<Workspace | null>(null);
  const [members, setMembers] = useState<WorkspaceMember[]>([]);
  const [accounts, setAccounts] = useState<WorkspaceAccount[]>([]);
  const [myRole, setMyRole] = useState<WorkspaceRole | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchWorkspaces = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setWorkspaces([]);
        setCurrentWorkspace(null);
        setLoading(false);
        return;
      }

      // Fetch workspaces where user is a member
      const { data: memberData, error: memberError } = await supabase
        .from('workspace_members')
        .select('workspace_id, role')
        .eq('user_id', user.id);

      if (memberError) throw memberError;

      if (!memberData || memberData.length === 0) {
        setWorkspaces([]);
        setCurrentWorkspace(null);
        setLoading(false);
        return;
      }

      const workspaceIds = memberData.map(m => m.workspace_id);
      
      const { data: wsData, error: wsError } = await supabase
        .from('workspaces')
        .select('*')
        .in('id', workspaceIds)
        .order('created_at', { ascending: false });

      if (wsError) throw wsError;

      setWorkspaces(wsData || []);

      // Set current workspace from localStorage or first one
      const storedWsId = localStorage.getItem('current_workspace_id');
      const current = wsData?.find(w => w.id === storedWsId) || wsData?.[0] || null;
      
      if (current) {
        setCurrentWorkspace(current);
        localStorage.setItem('current_workspace_id', current.id);
        
        // Find my role
        const myMembership = memberData.find(m => m.workspace_id === current.id);
        setMyRole(myMembership?.role as WorkspaceRole || null);
      }
    } catch (err) {
      console.error('[useWorkspace] Error:', err);
      setError(err instanceof Error ? err.message : 'Erro ao carregar workspaces');
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch members and accounts when workspace changes
  useEffect(() => {
    if (!currentWorkspace) {
      setMembers([]);
      setAccounts([]);
      return;
    }

    const fetchDetails = async () => {
      const [membersRes, accountsRes] = await Promise.all([
        supabase
          .from('workspace_members')
          .select('*')
          .eq('workspace_id', currentWorkspace.id),
        supabase
          .from('workspace_accounts')
          .select('*')
          .eq('workspace_id', currentWorkspace.id)
          .eq('is_active', true)
          .order('name'),
      ]);

      if (membersRes.data) {
        // Fetch profile names for members
        const userIds = membersRes.data.map((m: any) => m.user_id);
        const { data: profiles } = await supabase
          .from('profiles')
          .select('user_id, full_name')
          .in('user_id', userIds);
        
        const profileMap = new Map(
          (profiles || []).map((p: any) => [p.user_id, p.full_name])
        );
        
        const enrichedMembers = membersRes.data.map((m: any) => ({
          ...m,
          full_name: profileMap.get(m.user_id) || null,
        }));
        
        setMembers(enrichedMembers as WorkspaceMember[]);
      }
      if (accountsRes.data) setAccounts(accountsRes.data as WorkspaceAccount[]);
    };

    fetchDetails();
  }, [currentWorkspace]);

  useEffect(() => {
    fetchWorkspaces();
  }, [fetchWorkspaces]);

  const handleSetCurrentWorkspace = useCallback((workspace: Workspace) => {
    setCurrentWorkspace(workspace);
    localStorage.setItem('current_workspace_id', workspace.id);
  }, []);

  const createWorkspace = useCallback(async (name: string): Promise<Workspace | null> => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Usuário não autenticado');

      // Create workspace
      const { data: wsData, error: wsError } = await supabase
        .from('workspaces')
        .insert({ name })
        .select()
        .single();

      if (wsError) throw wsError;

      // Add self as admin
      const { error: memberError } = await supabase
        .from('workspace_members')
        .insert({
          workspace_id: wsData.id,
          user_id: user.id,
          role: 'admin',
        });

      if (memberError) throw memberError;

      await fetchWorkspaces();
      return wsData as Workspace;
    } catch (err) {
      console.error('[useWorkspace] Create error:', err);
      setError(err instanceof Error ? err.message : 'Erro ao criar workspace');
      return null;
    }
  }, [fetchWorkspaces]);

  return {
    workspaces,
    currentWorkspace,
    members,
    accounts,
    myRole,
    loading,
    error,
    setCurrentWorkspace: handleSetCurrentWorkspace,
    createWorkspace,
    refetch: fetchWorkspaces,
  };
}
