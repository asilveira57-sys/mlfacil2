import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { NotePin, Note } from '@/types/notes';
import { useToast } from '@/hooks/use-toast';
import { useMemo } from 'react';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface UseNotePinsOptions {
  workspaceId: string | null;
  moduleKey: string;
  companyId?: string | null;
}

export function useNotePins({ workspaceId, moduleKey, companyId }: UseNotePinsOptions) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // Only use companyId if it's a valid UUID
  const safeCompanyId = useMemo(
    () => (companyId && UUID_REGEX.test(companyId) ? companyId : null),
    [companyId]
  );

  const queryKey = ['note-pins', workspaceId, moduleKey, safeCompanyId];

  // Fetch notes pinned to the current module
  const { data: pinnedNotes = [], isLoading } = useQuery({
    queryKey,
    queryFn: async () => {
      if (!workspaceId || !moduleKey) return [];

      let query = supabase
        .from('note_pins')
        .select('*')
        .eq('workspace_id', workspaceId)
        .or(`module_key.eq.${moduleKey},module_key.eq.__global__`);

      if (safeCompanyId) {
        query = query.or(`company_id.eq.${safeCompanyId},company_id.is.null`);
      }

      const { data: pins, error } = await query;
      if (error) throw error;
      if (!pins || pins.length === 0) return [];

      const typedPins = pins as unknown as NotePin[];
      const noteIds = typedPins.map((p) => p.note_id);

      const { data: notes, error: notesError } = await supabase
        .from('notes')
        .select('*')
        .in('id', noteIds)
        .eq('status', 'active');

      if (notesError) throw notesError;

      return (notes || []).map((n) => ({
        ...(n as unknown as Note),
        pin: typedPins.find((p) => p.note_id === (n as any).id),
      }));
    },
    enabled: !!workspaceId && !!moduleKey,
    staleTime: 2 * 60 * 1000,
  });

  // Pin a note — accepts optional moduleKey and companyId override
  const pinMutation = useMutation({
    mutationFn: async ({
      noteId,
      moduleKey: targetModuleKey,
      companyId: targetCompanyId,
      routePath,
    }: {
      noteId: string;
      moduleKey?: string;
      companyId?: string;
      routePath?: string;
    }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Não autenticado');

      const effectiveModuleKey = targetModuleKey || moduleKey;

      // Use explicit companyId if provided and valid, otherwise fallback to safeCompanyId
      let effectiveCompanyId: string | null = null;
      if (targetCompanyId && UUID_REGEX.test(targetCompanyId)) {
        effectiveCompanyId = targetCompanyId;
      } else if (safeCompanyId) {
        effectiveCompanyId = safeCompanyId;
      }

      // First, delete any existing pin for this note+module+company combo
      // (handles NULL company_id correctly since UNIQUE treats NULLs as distinct)
      let deleteQuery = supabase
        .from('note_pins')
        .delete()
        .eq('note_id', noteId)
        .eq('module_key', effectiveModuleKey)
        .eq('workspace_id', workspaceId!);

      if (effectiveCompanyId) {
        deleteQuery = deleteQuery.eq('company_id', effectiveCompanyId);
      } else {
        deleteQuery = deleteQuery.is('company_id', null);
      }

      await deleteQuery;

      const { error } = await supabase.from('note_pins').insert({
        workspace_id: workspaceId!,
        company_id: effectiveCompanyId,
        note_id: noteId,
        module_key: effectiveModuleKey,
        route_path: routePath ?? null,
        created_by_user_id: user.id,
      } as any);

      if (error) throw error;

      // Log event
      await supabase.from('note_events').insert({
        workspace_id: workspaceId!,
        note_id: noteId,
        event_type: 'pinned',
        payload_json: { module_key: effectiveModuleKey, company_id: effectiveCompanyId },
        created_by_user_id: user.id,
      } as any);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['note-pins'] });
      queryClient.invalidateQueries({ queryKey: ['all-note-pins'] });
      queryClient.invalidateQueries({ queryKey: ['notes'] });
      toast({ title: 'Nota fixada neste módulo' });
    },
    onError: (err) => {
      const message = err instanceof Error ? err.message : 'Erro ao fixar nota';
      toast({ title: 'Erro ao fixar nota', description: message, variant: 'destructive' });
    },
  });

  // Unpin a note
  const unpinMutation = useMutation({
    mutationFn: async (noteId: string) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Não autenticado');

      // Delete ALL pins for this note in this module/workspace regardless of company_id
      // This ensures unpin always works even if company_id context changed
      const { error } = await supabase
        .from('note_pins')
        .delete()
        .eq('note_id', noteId)
        .eq('module_key', moduleKey)
        .eq('workspace_id', workspaceId!);
      if (error) throw error;

      // Log event
      await supabase.from('note_events').insert({
        workspace_id: workspaceId!,
        note_id: noteId,
        event_type: 'unpinned',
        payload_json: { module_key: moduleKey },
        created_by_user_id: user.id,
      } as any);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['note-pins'] });
      toast({ title: 'Nota desfixada' });
    },
  });

  // Check if a specific note is pinned
  const isNotePinned = (noteId: string) =>
    pinnedNotes.some((n) => n.id === noteId);

  return {
    pinnedNotes,
    isLoading,
    pinNote: pinMutation.mutate,
    unpinNote: unpinMutation.mutate,
    isNotePinned,
  };
}
