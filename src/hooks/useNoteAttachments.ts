import { useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { NoteAttachment } from '@/types/notes';
import { useToast } from '@/hooks/use-toast';

interface UseNoteAttachmentsOptions {
  workspaceId: string | null;
  noteId: string | null;
}

export function useNoteAttachments({ workspaceId, noteId }: UseNoteAttachmentsOptions) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const queryKey = ['note-attachments', noteId];

  const { data: attachments = [], isLoading } = useQuery({
    queryKey,
    queryFn: async () => {
      if (!noteId) return [];
      const { data, error } = await supabase
        .from('note_attachments')
        .select('*')
        .eq('note_id', noteId)
        .order('created_at', { ascending: true });
      if (error) throw error;
      return (data || []) as unknown as NoteAttachment[];
    },
    enabled: !!noteId,
  });

  // Upload a file
  const uploadMutation = useMutation({
    mutationFn: async ({ file, width, height }: { file: File; width?: number; height?: number }) => {
      if (!workspaceId || !noteId) throw new Error('Contexto inválido');

      const ext = file.name.split('.').pop() || 'bin';
      const path = `${workspaceId}/${noteId}/${crypto.randomUUID()}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from('note-attachments')
        .upload(path, file, { contentType: file.type });

      if (uploadError) throw uploadError;

      const { error: dbError } = await supabase.from('note_attachments').insert({
        workspace_id: workspaceId,
        note_id: noteId,
        storage_path: path,
        file_name: file.name,
        mime_type: file.type,
        file_size: file.size,
        width: width ?? null,
        height: height ?? null,
      } as any);

      if (dbError) throw dbError;

      return path;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
    },
    onError: (err) => {
      toast({ title: 'Erro no upload', description: String(err), variant: 'destructive' });
    },
  });

  // Get public URL for a file
  const getFileUrl = useCallback((storagePath: string) => {
    const { data } = supabase.storage
      .from('note-attachments')
      .getPublicUrl(storagePath);
    return data.publicUrl;
  }, []);

  // Upload from clipboard paste (image)
  const uploadFromClipboard = useCallback(async (clipboardData: DataTransfer) => {
    const items = Array.from(clipboardData.items);
    const imageItem = items.find((item) => item.type.startsWith('image/'));
    if (!imageItem) return null;

    const file = imageItem.getAsFile();
    if (!file) return null;

    // Get dimensions
    const img = new Image();
    const url = URL.createObjectURL(file);
    const dims = await new Promise<{ width: number; height: number }>((resolve) => {
      img.onload = () => {
        resolve({ width: img.width, height: img.height });
        URL.revokeObjectURL(url);
      };
      img.onerror = () => {
        resolve({ width: 0, height: 0 });
        URL.revokeObjectURL(url);
      };
      img.src = url;
    });

    return uploadMutation.mutateAsync({ file, ...dims });
  }, [uploadMutation]);

  return {
    attachments,
    isLoading,
    uploadFile: uploadMutation.mutateAsync,
    uploadFromClipboard,
    getFileUrl,
    isUploading: uploadMutation.isPending,
  };
}
