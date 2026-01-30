import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import type { AdLifecycleAction } from '@/types/ad-timeline';
import type { Json } from '@/integrations/supabase/types';

interface CloneChecklist {
  title?: boolean;
  description?: boolean;
  pictures?: boolean;
  attributes?: boolean;
  price?: boolean;
  source?: string;
  source_url?: string;
}

/**
 * Update a DRAFT action's item_id, reason, and checklist.
 */
export function useUpdateAction() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      actionId,
      itemId,
      reason,
      checklist,
    }: {
      actionId: string;
      itemId: string;
      reason?: string;
      checklist?: CloneChecklist;
    }) => {
      const updateData: Record<string, unknown> = {
        item_id: itemId,
        updated_at: new Date().toISOString(),
      };

      if (reason !== undefined) {
        updateData.reason = reason || null;
      }

      if (checklist) {
        updateData.checklist = checklist;
      }

      const { error } = await supabase
        .from('ad_lifecycle_actions')
        .update(updateData)
        .eq('id', actionId)
        .eq('action_status', 'DRAFT'); // Only allow updating drafts

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ad-lifecycle-actions'] });
      toast.success('Rascunho atualizado');
    },
    onError: (error) => {
      toast.error('Erro ao atualizar rascunho', {
        description: error.message,
      });
    },
  });
}

/**
 * Duplicate an action as a new DRAFT (preserves original).
 */
export function useDuplicateAction() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      originalAction,
      itemId,
      reason,
      checklist,
    }: {
      originalAction: AdLifecycleAction;
      itemId: string;
      reason?: string;
      checklist?: CloneChecklist;
    }) => {
      const { data: { user } } = await supabase.auth.getUser();

      const newChecklist = checklist || (originalAction.checklist as CloneChecklist) || {};

      const { data, error } = await supabase
        .from('ad_lifecycle_actions')
        .insert([{
          workspace_id: originalAction.workspace_id,
          ml_account_id: originalAction.ml_account_id,
          item_id: itemId,
          action_type: originalAction.action_type,
          action_status: 'DRAFT',
          reason: reason || originalAction.reason || 'RETRY',
          checklist: newChecklist as unknown as Json,
          created_by: user?.id || originalAction.created_by,
        }])
        .select()
        .single();

      if (error) throw error;
      return data as AdLifecycleAction;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ad-lifecycle-actions'] });
      toast.success('Novo rascunho criado', {
        description: 'Vá para a aba Rascunhos para executar',
      });
    },
    onError: (error) => {
      toast.error('Erro ao criar rascunho', {
        description: error.message,
      });
    },
  });
}

/**
 * Reopen a FAILED/CANCELLED action as DRAFT (modifies in place).
 */
export function useReopenAction() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (actionId: string) => {
      const { error } = await supabase
        .from('ad_lifecycle_actions')
        .update({
          action_status: 'DRAFT',
          result: null,
          source_snapshot: null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', actionId)
        .in('action_status', ['FAILED', 'CANCELLED']);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ad-lifecycle-actions'] });
      toast.success('Ação reaberta como rascunho');
    },
    onError: (error) => {
      toast.error('Erro ao reabrir ação', {
        description: error.message,
      });
    },
  });
}
