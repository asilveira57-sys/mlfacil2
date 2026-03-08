import { useState, useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { StickyNote, Plus, Search } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { useNotes } from '@/hooks/useNotes';
import { useNotePins } from '@/hooks/useNotePins';
import { useNoteAttachments } from '@/hooks/useNoteAttachments';
import { useActiveModuleKey } from '@/hooks/useActiveModuleKey';
import { useCurrentWorkspaceId } from '@/hooks/useCurrentWorkspaceId';
import { useTasks } from '@/hooks/useTasks';
import { useToast } from '@/hooks/use-toast';
import { NotesList } from './NotesList';
import { NoteEditor } from './NoteEditor';
import type { Note } from '@/types/notes';

interface NotesDrawerProps {
  companyId?: string | null;
}

export function NotesDrawer({ companyId }: NotesDrawerProps) {
  const { t } = useTranslation('notes');
  const { toast } = useToast();
  const { data: workspaceId } = useCurrentWorkspaceId();
  const moduleKey = useActiveModuleKey();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [editingNote, setEditingNote] = useState<Note | null>(null);

  const {
    notes,
    isLoading,
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
    createNote,
    autoSave,
    archiveNote,
    isCreating,
  } = useNotes({
    workspaceId: workspaceId ?? null,
    companyId,
    search,
  });

  const {
    pinNote,
    unpinNote,
    isNotePinned,
  } = useNotePins({
    workspaceId: workspaceId ?? null,
    moduleKey,
    companyId,
  });

  const {
    uploadFromClipboard,
    uploadFile,
  } = useNoteAttachments({
    workspaceId: workspaceId ?? null,
    noteId: editingNote?.id ?? null,
  });

  const { createTask } = useTasks(workspaceId ?? null);

  // Listen for edit-note events from ModuleNotesOverlay
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.note) {
        setEditingNote(detail.note as Note);
        setOpen(true);
      }
    };
    window.addEventListener('postit:edit-note', handler);
    return () => window.removeEventListener('postit:edit-note', handler);
  }, []);

  // Handle creating a new note
  const handleNewNote = useCallback(async () => {
    setEditingNote(null);
    try {
      const note = await createNote({
        company_id: companyId ?? null,
        title: '',
        content_plain: '',
        color_hex: '#FBBF24',
      });
      if (note) {
        setEditingNote(note);
      }
    } catch (err) {
      console.error('[Notes] Create error:', err);
    }
  }, [createNote, companyId]);

  // Handle auto-save from editor
  const handleUpdate = useCallback(
    (updates: Partial<Note>) => {
      if (!editingNote) return;
      setEditingNote((prev) => (prev ? { ...prev, ...updates } : prev));
      autoSave(editingNote.id, updates);
    },
    [editingNote, autoSave]
  );

  // Send note to tasks
  const handleSendToTasks = useCallback(
    async (note: Note) => {
      if (!workspaceId) return;
      try {
        const task = await createTask({
          title: note.title || (note.content_plain?.split('\n')[0]?.slice(0, 100) || 'Nota'),
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

  // Handle paste image in editor
  const handlePasteImage = useCallback(
    async (data: DataTransfer): Promise<string | null> => {
      return uploadFromClipboard(data);
    },
    [uploadFromClipboard]
  );

  // Handle file upload in editor
  const handleUploadImage = useCallback(
    async (file: File): Promise<string> => {
      return uploadFile({ file });
    },
    [uploadFile]
  );

  // Handle non-image file attachment
  const handleAttachFile = useCallback(
    async (file: File): Promise<void> => {
      await uploadFile({ file });
    },
    [uploadFile]
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Tooltip>
        <TooltipTrigger asChild>
          <DialogTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8">
              <StickyNote className="h-4 w-4" />
            </Button>
          </DialogTrigger>
        </TooltipTrigger>
        <TooltipContent>{t('title')}</TooltipContent>
      </Tooltip>
      <DialogContent className="max-w-3xl h-[80vh] p-0 flex flex-col overflow-hidden">
        <DialogDescription className="sr-only">
          {t('description')}
        </DialogDescription>
        {editingNote ? (
          <NoteEditor
            key={editingNote.id}
            note={editingNote}
            isPinned={isNotePinned(editingNote.id)}
            currentModuleKey={moduleKey}
            onBack={() => setEditingNote(null)}
            onUpdate={handleUpdate}
            onPin={(targetModule, targetCompanyId) =>
              pinNote({ noteId: editingNote.id, moduleKey: targetModule, companyId: targetCompanyId })
            }
            onUnpin={() => unpinNote(editingNote.id)}
            onSendToTasks={() => handleSendToTasks(editingNote)}
            onArchive={() => {
              archiveNote(editingNote.id);
              setEditingNote(null);
            }}
            onPasteImage={handlePasteImage}
            onUploadImage={handleUploadImage}
            onAttachFile={handleAttachFile}
          />
        ) : (
          <>
            <DialogHeader className="px-6 pt-6 pb-2">
              <div className="flex items-center justify-between">
                <DialogTitle className="flex items-center gap-2 text-base">
                  <StickyNote className="h-4 w-4" />
                  {t('title')}
                </DialogTitle>
                <Button
                  size="sm"
                  className="h-7 gap-1 text-xs"
                  onClick={handleNewNote}
                  disabled={isCreating}
                >
                  <Plus className="h-3.5 w-3.5" />
                  {t('new_note')}
                </Button>
              </div>
            </DialogHeader>

            {/* Search */}
            <div className="px-6 pb-2">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={t('search_placeholder')}
                  className="pl-8 h-8 text-sm"
                />
              </div>
            </div>

            {/* Notes list */}
            <div className="flex-1 overflow-y-auto px-6 pb-4">
              <NotesList
                notes={notes}
                isLoading={isLoading}
                hasNextPage={hasNextPage}
                isFetchingNextPage={isFetchingNextPage}
                fetchNextPage={fetchNextPage}
                isPinnedFn={isNotePinned}
                onNoteClick={setEditingNote}
                onPin={(id) => pinNote({ noteId: id })}
                onUnpin={unpinNote}
                onSendToTasks={handleSendToTasks}
                onArchive={archiveNote}
              />
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
