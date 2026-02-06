import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { NotePin, Note } from '@/types/notes';
import { useToast } from '@/hooks/use-toast';

interface UseNotePinsOptions {
  workspaceId: string | null;
  moduleKey: string;
  companyId?: string | null;
}

export function useNotePins({ workspaceId, moduleKey, companyId }: UseNotePinsOptions) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const queryKey = ['note-pins', workspaceId, moduleKey, companyId];

  // Fetch notes pinned to the current module
  const { data: pinnedNotes = [], isLoading } = useQuery({
    queryKey,
    queryFn: async () => {
      if (!workspaceId || !moduleKey) return [];

      // Get pins for this module
      let query = supabase
        .from('note_pins')
        .select('*')
        .eq('workspace_id', workspaceId)
        .eq('module_key', moduleKey);

      if (companyId) {
        query = query.or(`company_id.eq.${companyId},company_id.is.null`);
      }

      const { data: pins, error } = await query;
      if (error) throw error;
      if (!pins || pins.length === 0) return [];

      const typedPins = pins as unknown as NotePin[];
      const noteIds = typedPins.map((p) => p.note_id);

      // Fetch the actual notes
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

  // Pin a note
  const pinMutation = useMutation({
    mutationFn: async ({ noteId, routePath }: { noteId: string; routePath?: string }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Não autenticado');

      const { error } = await supabase.from('note_pins').insert({
        workspace_id: workspaceId!,
        company_id: companyId ?? null,
        note_id: noteId,
        module_key: moduleKey,
        route_path: routePath ?? null,
        created_by_user_id: user.id,
      } as any);

      if (error) throw error;

      // Log event
      await supabase.from('note_events').insert({
        workspace_id: workspaceId!,
        note_id: noteId,
        event_type: 'pinned',
        payload_json: { module_key: moduleKey, company_id: companyId },
        created_by_user_id: user.id,
      } as any);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['note-pins'] });
      toast({ title: 'Nota fixada neste módulo' });
    },
    onError: (err) => {
      toast({ title: 'Erro ao fixar nota', description: String(err), variant: 'destructive' });
    },
  });

  // Unpin a note
  const unpinMutation = useMutation({
    mutationFn: async (noteId: string) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Não autenticado');

      let query = supabase
        .from('note_pins')
        .delete()
        .eq('note_id', noteId)
        .eq('module_key', moduleKey)
        .eq('workspace_id', workspaceId!);

      if (companyId) {
        query = query.eq('company_id', companyId);
      } else {
        query = query.is('company_id', null);
      }

      const { error } = await query;
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
