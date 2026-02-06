import { useState, useCallback } from 'react';
import { useActiveModuleKey } from '@/hooks/useActiveModuleKey';
import { useNotePins } from '@/hooks/useNotePins';
import { useCurrentWorkspaceId } from '@/hooks/useCurrentWorkspaceId';
import { useTasks } from '@/hooks/useTasks';
import { useToast } from '@/hooks/use-toast';
import { useTranslation } from 'react-i18next';
import { ModulePostIt } from './ModulePostIt';
import { NotesDrawer } from './NotesDrawer';
import type { Note } from '@/types/notes';

interface ModuleNotesOverlayProps {
  companyId?: string | null;
}

export function ModuleNotesOverlay({ companyId }: ModuleNotesOverlayProps) {
  const { t } = useTranslation('notes');
  const { toast } = useToast();
  const { data: workspaceId } = useCurrentWorkspaceId();
  const moduleKey = useActiveModuleKey();
  const [editNoteInDrawer, setEditNoteInDrawer] = useState(false);

  const { pinnedNotes, unpinNote } = useNotePins({
    workspaceId: workspaceId ?? null,
    moduleKey,
    companyId,
  });

  const { createTask } = useTasks(workspaceId ?? null);

  const handleSendToTasks = useCallback(
    async (note: Note) => {
      if (!workspaceId) return;
      try {
        const task = await createTask({
          title: note.title || note.content_plain?.split('\n')[0]?.slice(0, 100) || 'Nota',
          description: note.content_plain || '',
          source_type: 'note' as any,
          source_id: note.id,
          source_ref: {
            note_id: note.id,
            module_key: moduleKey,
            color_hex: note.color_hex,
          },
        });
        if (task) {
          toast({ title: t('task.sent_success') });
        }
      } catch {
        toast({ title: t('task.sent_error'), variant: 'destructive' });
      }
    },
    [workspaceId, createTask, moduleKey, toast, t]
  );

  if (!pinnedNotes || pinnedNotes.length === 0) return null;

  return (
    <div className="fixed top-16 right-4 z-30 flex flex-col gap-2 pointer-events-auto">
      {pinnedNotes.map((note) => (
        <ModulePostIt
          key={note.id}
          note={note as any}
          onEdit={() => setEditNoteInDrawer(true)}
          onUnpin={() => unpinNote(note.id)}
          onSendToTasks={() => handleSendToTasks(note as any)}
        />
      ))}
    </div>
  );
}
