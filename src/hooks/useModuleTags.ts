import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import type { ModuleTag, SystemModule, ModuleTagAssignment, TagInsert, TagUpdate } from '@/types/module-tags';

// Fetch all tags
export function useModuleTags() {
  return useQuery({
    queryKey: ['module-tags'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('module_tags')
        .select('*')
        .order('priority', { ascending: true });
      if (error) throw error;
      return data as ModuleTag[];
    },
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    refetchOnMount: false,
  });
}

// Fetch all system modules with their tags
export function useSystemModules() {
  return useQuery({
    queryKey: ['system-modules'],
    queryFn: async () => {
      const { data: modules, error: modulesError } = await supabase
        .from('system_modules')
        .select('*')
        .order('name', { ascending: true });
      if (modulesError) throw modulesError;
      // Map to SystemModule type
      return (modules || []).map(m => ({
        id: m.id,
        key: m.key,
        name: m.name,
        description: m.description,
        icon_key: m.icon_key,
        route: m.route,
        is_active: m.is_active,
        layer: m.layer,
        parent_module_id: m.parent_module_id,
        sort_order: m.sort_order,
        is_internal_only: m.is_internal_only,
        created_at: m.created_at,
        updated_at: m.updated_at,
      })) as SystemModule[];
    },
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    refetchOnMount: false,
  });
}

// Fetch module tag assignments
export function useModuleTagAssignments() {
  return useQuery({
    queryKey: ['module-tag-assignments'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('module_tag_assignments')
        .select('*');
      if (error) throw error;
      return data as ModuleTagAssignment[];
    },
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    refetchOnMount: false,
  });
}

// Get tags for a specific module (for sidebar display)
export function useModuleTagsMap() {
  const { data: tags } = useModuleTags();
  const { data: assignments } = useModuleTagAssignments();

  const tagsMap = new Map<string, ModuleTag[]>();

  if (tags && assignments) {
    for (const assignment of assignments) {
      const tag = tags.find(t => t.id === assignment.tag_id);
      if (tag && tag.is_active) {
        const existing = tagsMap.get(assignment.module_id) || [];
        existing.push(tag);
        tagsMap.set(assignment.module_id, existing.sort((a, b) => a.priority - b.priority));
      }
    }
  }

  return tagsMap;
}

// Admin mutations for tags
export function useTagMutations() {
  const queryClient = useQueryClient();

  const createTag = useMutation({
    mutationFn: async (tag: TagInsert) => {
      const { data, error } = await supabase
        .from('module_tags')
        .insert(tag)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['module-tags'] });
      toast.success('Tag criada com sucesso');
    },
    onError: (error) => {
      toast.error(`Erro ao criar tag: ${error.message}`);
    },
  });

  const updateTag = useMutation({
    mutationFn: async ({ id, ...updates }: TagUpdate & { id: string }) => {
      const { data, error } = await supabase
        .from('module_tags')
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['module-tags'] });
      toast.success('Tag atualizada');
    },
    onError: (error) => {
      toast.error(`Erro ao atualizar tag: ${error.message}`);
    },
  });

  const deleteTag = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('module_tags')
        .delete()
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['module-tags'] });
      queryClient.invalidateQueries({ queryKey: ['module-tag-assignments'] });
      toast.success('Tag excluída');
    },
    onError: (error) => {
      toast.error(`Erro ao excluir tag: ${error.message}`);
    },
  });

  return { createTag, updateTag, deleteTag };
}

// Admin mutations for tag assignments
export function useTagAssignmentMutations() {
  const queryClient = useQueryClient();

  const assignTag = useMutation({
    mutationFn: async ({ moduleId, tagId }: { moduleId: string; tagId: string }) => {
      const { data, error } = await supabase
        .from('module_tag_assignments')
        .insert({ module_id: moduleId, tag_id: tagId })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['module-tag-assignments'] });
      toast.success('Tag atribuída ao módulo');
    },
    onError: (error) => {
      toast.error(`Erro ao atribuir tag: ${error.message}`);
    },
  });

  const removeTag = useMutation({
    mutationFn: async ({ moduleId, tagId }: { moduleId: string; tagId: string }) => {
      const { error } = await supabase
        .from('module_tag_assignments')
        .delete()
        .eq('module_id', moduleId)
        .eq('tag_id', tagId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['module-tag-assignments'] });
      toast.success('Tag removida do módulo');
    },
    onError: (error) => {
      toast.error(`Erro ao remover tag: ${error.message}`);
    },
  });

  return { assignTag, removeTag };
}
