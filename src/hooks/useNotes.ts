import { useCallback, useRef, useState } from 'react';
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Note } from '@/types/notes';
import { useToast } from '@/hooks/use-toast';

const PAGE_SIZE = 20;

interface UseNotesOptions {
  workspaceId: string | null;
  companyId?: string | null;
  search?: string;
  status?: string;
}

export function useNotes({ workspaceId, companyId, search, status = 'active' }: UseNotesOptions) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [autoSaveTimers] = useState(() => new Map<string, NodeJS.Timeout>());
  const lastSaveRef = useRef<Record<string, number>>({});

  const queryKey = ['notes', workspaceId, companyId, search, status];

  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
    refetch,
  } = useInfiniteQuery({
    queryKey,
    queryFn: async ({ pageParam }: { pageParam: string | null }) => {
      if (!workspaceId) return { notes: [] as Note[], nextCursor: null };

      let query = supabase
        .from('notes')
        .select('*')
        .eq('workspace_id', workspaceId)
        .eq('status', status)
        .order('updated_at', { ascending: false })
        .limit(PAGE_SIZE);

      // Filter: company notes + global notes (company_id IS NULL)
      if (companyId) {
        query = query.or(`company_id.eq.${companyId},company_id.is.null`);
      }

      // Search
      if (search && search.trim()) {
        const term = `%${search.trim()}%`;
        query = query.or(`title.ilike.${term},content_plain.ilike.${term}`);
      }

      // Cursor pagination
      if (pageParam) {
        query = query.lt('updated_at', pageParam);
      }

      const { data: notes, error } = await query;
      if (error) throw error;

      const typedNotes = (notes || []) as unknown as Note[];
      const nextCursor = typedNotes.length === PAGE_SIZE
        ? typedNotes[typedNotes.length - 1].updated_at
        : null;

      return { notes: typedNotes, nextCursor };
    },
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    initialPageParam: null as string | null,
    enabled: !!workspaceId,
  });

  const allNotes = data?.pages.flatMap((p) => p.notes) ?? [];

  // Create note
  const createMutation = useMutation({
    mutationFn: async (note: Partial<Note>) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Não autenticado');

      const { data, error } = await supabase
        .from('notes')
        .insert({
          workspace_id: workspaceId!,
          company_id: note.company_id ?? null,
          created_by_user_id: user.id,
          title: note.title || '',
          content_rich: (note.content_rich || null) as any,
          content_plain: note.content_plain || '',
          color_hex: note.color_hex || '#FBBF24',
          status: 'active',
        } as any)
        .select()
        .single();

      if (error) throw error;

      // Log creation event
      await supabase.from('note_events').insert({
        workspace_id: workspaceId!,
        note_id: (data as any).id,
        event_type: 'created',
        created_by_user_id: user.id,
      } as any);

      return data as unknown as Note;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notes'] });
    },
    onError: (err) => {
      toast({ title: 'Erro', description: String(err), variant: 'destructive' });
    },
  });

  // Update note
  const updateMutation = useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Partial<Note> }) => {
      const dbUpdates: Record<string, unknown> = {};
      if (updates.title !== undefined) dbUpdates.title = updates.title;
      if (updates.content_rich !== undefined) dbUpdates.content_rich = updates.content_rich;
      if (updates.content_plain !== undefined) dbUpdates.content_plain = updates.content_plain;
      if (updates.color_hex !== undefined) dbUpdates.color_hex = updates.color_hex;
      if (updates.status !== undefined) dbUpdates.status = updates.status;

      const { error } = await supabase
        .from('notes')
        .update(dbUpdates)
        .eq('id', id);

      if (error) throw error;
      return { id, updates };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notes'] });
    },
  });

  // Archive note
  const archiveMutation = useMutation({
    mutationFn: async (noteId: string) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Não autenticado');

      const { error } = await supabase
        .from('notes')
        .update({ status: 'archived' })
        .eq('id', noteId);
      if (error) throw error;

      await supabase.from('note_events').insert({
        workspace_id: workspaceId!,
        note_id: noteId,
        event_type: 'archived',
        created_by_user_id: user.id,
      } as any);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notes'] });
      toast({ title: 'Nota arquivada' });
    },
  });

  // Auto-save with debounce
  const autoSave = useCallback((noteId: string, updates: Partial<Note>) => {
    const existingTimer = autoSaveTimers.get(noteId);
    if (existingTimer) clearTimeout(existingTimer);

    const timer = setTimeout(() => {
      updateMutation.mutate({ id: noteId, updates });
      lastSaveRef.current[noteId] = Date.now();
      autoSaveTimers.delete(noteId);
    }, 1500);

    autoSaveTimers.set(noteId, timer);
  }, [autoSaveTimers, updateMutation]);

  return {
    notes: allNotes,
    isLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    refetch,
    createNote: createMutation.mutateAsync,
    updateNote: updateMutation.mutate,
    archiveNote: archiveMutation.mutate,
    autoSave,
    isCreating: createMutation.isPending,
  };
}
