import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import type { 
  Collaborator, 
  CollaboratorWithModules,
  CollaboratorStatus 
} from '@/types/collaborator';

interface UseCollaboratorsResult {
  collaborators: CollaboratorWithModules[];
  loading: boolean;
  error: string | null;
  statusFilter: CollaboratorStatus | 'all';
  setStatusFilter: (filter: CollaboratorStatus | 'all') => void;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  createCollaborator: (data: CreateCollaboratorData) => Promise<Collaborator | null>;
  updateCollaborator: (id: string, data: UpdateCollaboratorData) => Promise<boolean>;
  updateModuleAccess: (collaboratorId: string, modules: Record<string, boolean>) => Promise<boolean>;
  sendInvite: (collaboratorId: string) => Promise<boolean>;
  disableCollaborator: (id: string) => Promise<boolean>;
  enableCollaborator: (id: string) => Promise<boolean>;
  deleteCollaborator: (id: string) => Promise<boolean>;
  refetch: () => Promise<void>;
}

interface CreateCollaboratorData {
  workspaceId: string;
  name: string;
  email: string;
  modules: Record<string, boolean>;
}

interface UpdateCollaboratorData {
  name?: string;
  email?: string;
}

export function useCollaborators(workspaceId: string | null): UseCollaboratorsResult {
  const [collaborators, setCollaborators] = useState<CollaboratorWithModules[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<CollaboratorStatus | 'all'>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const fetchCollaborators = useCallback(async () => {
    if (!workspaceId) {
      setCollaborators([]);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      let query = supabase
        .from('collaborators')
        .select('*')
        .eq('workspace_id', workspaceId)
        .is('deleted_at', null)
        .order('created_at', { ascending: false });

      if (statusFilter !== 'all') {
        query = query.eq('status', statusFilter);
      }

      const { data: collabData, error: collabError } = await query;

      if (collabError) throw collabError;

      if (!collabData || collabData.length === 0) {
        setCollaborators([]);
        setLoading(false);
        return;
      }

      // Map collaborators with empty modules array (legacy module access removed)
      const combined: CollaboratorWithModules[] = collabData.map(collab => ({
        ...collab,
        status: collab.status as CollaboratorStatus,
        modules: [],
      }));

      let filtered = combined;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        filtered = combined.filter(c => 
          c.name.toLowerCase().includes(q) || 
          c.email.toLowerCase().includes(q)
        );
      }

      setCollaborators(filtered);
    } catch (err) {
      console.error('[useCollaborators] Error:', err);
      setError(err instanceof Error ? err.message : 'Erro ao carregar colaboradores');
    } finally {
      setLoading(false);
    }
  }, [workspaceId, statusFilter, searchQuery]);

  useEffect(() => {
    fetchCollaborators();
  }, [fetchCollaborators]);

  const createCollaborator = useCallback(async (data: CreateCollaboratorData): Promise<Collaborator | null> => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Usuário não autenticado');

      const { data: newCollab, error: insertError } = await supabase
        .from('collaborators')
        .insert({
          workspace_id: data.workspaceId,
          name: data.name,
          email: data.email.toLowerCase().trim(),
          status: 'invited',
          invited_at: new Date().toISOString(),
          created_by: user.id,
        })
        .select()
        .single();

      if (insertError) {
        if (insertError.message.includes('idx_collaborators_unique_email')) {
          toast.error('Este e-mail já está cadastrado neste workspace');
          return null;
        }
        throw insertError;
      }

      const typedCollab: Collaborator = {
        ...newCollab,
        status: newCollab.status as CollaboratorStatus,
      };

      // TODO: Assign profile via company_users + profile_permissions instead of old module access
      toast.success('Colaborador criado com sucesso!');
      await fetchCollaborators();
      return typedCollab;
    } catch (err) {
      console.error('[createCollaborator] Error:', err);
      toast.error('Erro ao criar colaborador');
      return null;
    }
  }, [fetchCollaborators]);

  const updateCollaborator = useCallback(async (id: string, data: UpdateCollaboratorData): Promise<boolean> => {
    try {
      const updateData: Record<string, unknown> = {};
      if (data.name) updateData.name = data.name;
      if (data.email) updateData.email = data.email.toLowerCase().trim();

      const { error } = await supabase
        .from('collaborators')
        .update(updateData)
        .eq('id', id);

      if (error) throw error;

      toast.success('Colaborador atualizado!');
      await fetchCollaborators();
      return true;
    } catch (err) {
      console.error('[updateCollaborator] Error:', err);
      toast.error('Erro ao atualizar colaborador');
      return false;
    }
  }, [fetchCollaborators]);

  const updateModuleAccess = useCallback(async (
    _collaboratorId: string, 
    _modules: Record<string, boolean>
  ): Promise<boolean> => {
    // TODO: Implement via profile_permissions in new RBAC system
    toast.info('Permissões serão gerenciadas via Perfis de Acesso');
    return true;
  }, []);

  const sendInvite = useCallback(async (collaboratorId: string): Promise<boolean> => {
    try {
      const { data: collab, error: fetchError } = await supabase
        .from('collaborators')
        .select('*, workspace_id')
        .eq('id', collaboratorId)
        .single();

      if (fetchError || !collab) throw new Error('Colaborador não encontrado');

      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Não autenticado');

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/collaborator-invite`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            collaboratorId: collab.id,
            workspaceId: collab.workspace_id,
          }),
        }
      );

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Erro ao enviar convite');
      }

      toast.success(`Convite enviado para ${collab.email}!`);
      await fetchCollaborators();
      return true;
    } catch (err) {
      console.error('[sendInvite] Error:', err);
      toast.error(err instanceof Error ? err.message : 'Erro ao enviar convite');
      return false;
    }
  }, [fetchCollaborators]);

  const disableCollaborator = useCallback(async (id: string): Promise<boolean> => {
    try {
      const { error } = await supabase
        .from('collaborators')
        .update({ status: 'disabled', disabled_at: new Date().toISOString() })
        .eq('id', id);
      if (error) throw error;
      toast.success('Colaborador desativado');
      await fetchCollaborators();
      return true;
    } catch (err) {
      console.error('[disableCollaborator] Error:', err);
      toast.error('Erro ao desativar colaborador');
      return false;
    }
  }, [fetchCollaborators]);

  const enableCollaborator = useCallback(async (id: string): Promise<boolean> => {
    try {
      const { error } = await supabase
        .from('collaborators')
        .update({ status: 'active', disabled_at: null })
        .eq('id', id);
      if (error) throw error;
      toast.success('Colaborador reativado');
      await fetchCollaborators();
      return true;
    } catch (err) {
      console.error('[enableCollaborator] Error:', err);
      toast.error('Erro ao reativar colaborador');
      return false;
    }
  }, [fetchCollaborators]);

  const deleteCollaborator = useCallback(async (id: string): Promise<boolean> => {
    try {
      const { error } = await supabase
        .from('collaborators')
        .update({ status: 'deleted', deleted_at: new Date().toISOString() })
        .eq('id', id);
      if (error) throw error;
      toast.success('Colaborador excluído');
      await fetchCollaborators();
      return true;
    } catch (err) {
      console.error('[deleteCollaborator] Error:', err);
      toast.error('Erro ao excluir colaborador');
      return false;
    }
  }, [fetchCollaborators]);

  return {
    collaborators,
    loading,
    error,
    statusFilter,
    setStatusFilter,
    searchQuery,
    setSearchQuery,
    createCollaborator,
    updateCollaborator,
    updateModuleAccess,
    sendInvite,
    disableCollaborator,
    enableCollaborator,
    deleteCollaborator,
    refetch: fetchCollaborators,
  };
}
