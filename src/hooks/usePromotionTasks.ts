import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface CreateTaskParams {
  workspaceId: string;
  sellerId: string;
  promotionId: string;
  promotionName: string | null;
  itemId?: string;
  taskType: 'ineligible' | 'expiring' | 'review' | 'custom';
  customTitle?: string;
  customDescription?: string;
}

export function usePromotionTasks() {
  const [creating, setCreating] = useState(false);

  const createTask = async (params: CreateTaskParams): Promise<boolean> => {
    setCreating(true);
    
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast.error('Usuário não autenticado');
        return false;
      }

      // Build task title and description based on type
      let title = params.customTitle;
      let description = params.customDescription;
      let priority = 'medium';
      const tags: string[] = ['promoção'];

      if (!title) {
        switch (params.taskType) {
          case 'ineligible':
            title = `Corrigir item inelegível - ${params.promotionName || 'Promoção'}`;
            description = params.itemId 
              ? `O item ${params.itemId} está inelegível na promoção "${params.promotionName}". Verifique os requisitos e corrija.`
              : `Itens inelegíveis na promoção "${params.promotionName}". Verifique e corrija.`;
            priority = 'high';
            tags.push('inelegível');
            break;
          case 'expiring':
            title = `Renovar promoção - ${params.promotionName || 'Promoção'}`;
            description = `A promoção "${params.promotionName}" está expirando em breve. Avalie se deve ser renovada.`;
            priority = 'medium';
            tags.push('expiração');
            break;
          case 'review':
            title = `Revisar resultados - ${params.promotionName || 'Promoção'}`;
            description = `Analisar o desempenho da promoção "${params.promotionName}" e documentar aprendizados.`;
            priority = 'low';
            tags.push('revisão');
            break;
          default:
            title = `Tarefa - ${params.promotionName || 'Promoção'}`;
            description = `Tarefa relacionada à promoção "${params.promotionName}".`;
        }
      }

      // Create task with source reference for deduplication
      const sourceId = params.itemId 
        ? `${params.promotionId}_${params.itemId}` 
        : params.promotionId;

      // Check for existing open task with same source
      const { data: existing } = await supabase
        .from('tasks')
        .select('id')
        .eq('workspace_id', params.workspaceId)
        .eq('source_type', 'promotion')
        .eq('source_id', sourceId)
        .neq('status', 'done')
        .limit(1);

      if (existing && existing.length > 0) {
        toast.info('Já existe uma tarefa aberta para este item');
        return false;
      }

      const { error } = await supabase
        .from('tasks')
        .insert([{
          workspace_id: params.workspaceId,
          title: title!,
          description: description || null,
          priority: priority as 'high' | 'medium' | 'low' | 'urgent',
          tags,
          status: 'todo' as const,
          source_type: 'promotion',
          source_id: sourceId,
          source_ref: {
            promotion_id: params.promotionId,
            promotion_name: params.promotionName,
            item_id: params.itemId,
            seller_id: params.sellerId,
          },
          created_by_user_id: user.id,
        }]);

      if (error) {
        console.error('[usePromotionTasks] Error creating task:', error);
        toast.error('Erro ao criar tarefa');
        return false;
      }

      toast.success('Tarefa criada com sucesso');
      return true;
    } catch (err) {
      console.error('[usePromotionTasks] Error:', err);
      toast.error('Erro ao criar tarefa');
      return false;
    } finally {
      setCreating(false);
    }
  };

  return { createTask, creating };
}
