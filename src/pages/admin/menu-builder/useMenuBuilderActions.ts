import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import type { ModuleItem } from './types';

const QUERY_KEY = ['admin-menu-modules'];
const SIDEBAR_KEY = ['dynamic-menu-system-modules'];

export function useMenuModules() {
  return useQuery({
    queryKey: QUERY_KEY,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('system_modules')
        .select('*')
        .order('sort_order');
      if (error) throw error;
      return (data || []) as ModuleItem[];
    },
  });
}

export function useMenuBuilderActions() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: QUERY_KEY });
    queryClient.invalidateQueries({ queryKey: SIDEBAR_KEY });
  };

  const updateModule = useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Partial<ModuleItem> }) => {
      const { error } = await supabase.from('system_modules').update(updates).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      toast({ title: 'Módulo atualizado' });
    },
    onError: (e: Error) => toast({ title: 'Erro', description: e.message, variant: 'destructive' }),
  });

  const createModule = useMutation({
    mutationFn: async (data: {
      name: string;
      key: string;
      icon_key: string;
      route: string | null;
      layer: string;
      parent_module_id: string | null;
      sort_order: number;
    }) => {
      const { error } = await supabase.from('system_modules').insert([{
        ...data,
        is_active: true,
        is_internal_only: false,
        status: 'active' as const,
      }]);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      toast({ title: 'Módulo criado' });
    },
    onError: (e: Error) => toast({ title: 'Erro', description: e.message, variant: 'destructive' }),
  });

  const deleteModule = useMutation({
    mutationFn: async ({ id, promoteChildren }: { id: string; promoteChildren: boolean }) => {
      if (promoteChildren) {
        // Get the module to find its parent
        const { data: mod } = await supabase.from('system_modules').select('parent_module_id').eq('id', id).single();
        // Move children to parent
        await supabase.from('system_modules').update({ parent_module_id: mod?.parent_module_id ?? null }).eq('parent_module_id', id);
      } else {
        // Delete all children recursively (cascade via multiple levels)
        const deleteChildren = async (parentId: string) => {
          const { data: children } = await supabase.from('system_modules').select('id').eq('parent_module_id', parentId);
          if (children) {
            for (const child of children) {
              await deleteChildren(child.id);
              await supabase.from('system_modules').delete().eq('id', child.id);
            }
          }
        };
        await deleteChildren(id);
      }
      const { error } = await supabase.from('system_modules').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      toast({ title: 'Módulo excluído' });
    },
    onError: (e: Error) => toast({ title: 'Erro', description: e.message, variant: 'destructive' }),
  });

  const reorder = async (items: { id: string; sort_order: number; parent_module_id: string | null }[]) => {
    const promises = items.map(item =>
      supabase.from('system_modules').update({
        sort_order: item.sort_order,
        parent_module_id: item.parent_module_id,
      }).eq('id', item.id)
    );
    await Promise.all(promises);
    invalidate();
    toast({ title: 'Ordem atualizada' });
  };

  const renameModule = async (id: string, name: string) => {
    const { error } = await supabase.from('system_modules').update({ name }).eq('id', id);
    if (error) {
      toast({ title: 'Erro', description: error.message, variant: 'destructive' });
      return;
    }
    invalidate();
  };

  return {
    updateModule,
    createModule,
    deleteModule,
    reorder,
    renameModule,
  };
}
