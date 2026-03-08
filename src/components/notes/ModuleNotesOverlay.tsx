import { useState, useCallback, useRef } from 'react';
import { useActiveModuleKey } from '@/hooks/useActiveModuleKey';
import { useNotePins } from '@/hooks/useNotePins';
import { useCurrentWorkspaceId } from '@/hooks/useCurrentWorkspaceId';
import { useTasks } from '@/hooks/useTasks';
import { useToast } from '@/hooks/use-toast';
import { useTranslation } from 'react-i18next';
import { ModulePostIt } from './ModulePostIt';
import { NotesDrawer } from './NotesDrawer';
import type { Note } from '@/types/notes';

const OVERLAY_POS_KEY = 'postit-overlay-position';

function loadOverlayPos(): { x: number; y: number } | null {
  try {
    const raw = localStorage.getItem(OVERLAY_POS_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return null;
}

function saveOverlayPos(pos: { x: number; y: number }) {
  try {
    localStorage.setItem(OVERLAY_POS_KEY, JSON.stringify(pos));
  } catch {}
}

interface ModuleNotesOverlayProps {
  companyId?: string | null;
}

export function ModuleNotesOverlay({ companyId }: ModuleNotesOverlayProps) {
  const { t } = useTranslation('notes');
  const { toast } = useToast();
  const { data: workspaceId } = useCurrentWorkspaceId();
  const moduleKey = useActiveModuleKey();

  // Drag state for the overlay container
  const savedPos = loadOverlayPos();
  const [position, setPosition] = useState<{ x: number; y: number }>({
    x: savedPos?.x ?? -1, // -1 = use default CSS position
    y: savedPos?.y ?? -1,
  });
  const dragRef = useRef<{ startX: number; startY: number; originX: number; originY: number } | null>(null);
  const isDragging = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);

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

  // Edit opens the drawer with the note
  const handleEdit = useCallback((note: Note) => {
    // Dispatch custom event so NotesDrawer can listen and open with this note
    window.dispatchEvent(new CustomEvent('postit:edit-note', { detail: { note } }));
  }, []);

  // Drag handlers for the overlay container
  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    if (!(e.target as HTMLElement).closest('[data-drag-handle]')) return;
    e.preventDefault();
    isDragging.current = false;
    const rect = containerRef.current?.getBoundingClientRect();
    const curX = position.x >= 0 ? position.x : (rect?.left ?? 0);
    const curY = position.y >= 0 ? position.y : (rect?.top ?? 0);
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      originX: curX,
      originY: curY,
    };
    containerRef.current?.setPointerCapture(e.pointerId);
  }, [position]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragRef.current) return;
    const dx = e.clientX - dragRef.current.startX;
    const dy = e.clientY - dragRef.current.startY;
    if (Math.abs(dx) > 4 || Math.abs(dy) > 4) isDragging.current = true;
    const w = window.innerWidth;
    const h = window.innerHeight;
    const newX = Math.max(0, Math.min(dragRef.current.originX + dx, w - 60));
    const newY = Math.max(0, Math.min(dragRef.current.originY + dy, h - 60));
    setPosition({ x: newX, y: newY });
  }, []);

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    if (dragRef.current) {
      if (isDragging.current) saveOverlayPos(position);
      containerRef.current?.releasePointerCapture(e.pointerId);
      dragRef.current = null;
    }
  }, [position]);

  if (!pinnedNotes || pinnedNotes.length === 0) return null;

  const useCustomPosition = position.x >= 0 && position.y >= 0;

  return (
    <div
      ref={containerRef}
      className={useCustomPosition ? 'fixed z-30 flex flex-col gap-2 touch-none' : 'fixed top-16 right-4 z-30 flex flex-col gap-2 touch-none'}
      style={useCustomPosition ? { left: position.x, top: position.y } : undefined}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
    >
      {pinnedNotes.map((note) => (
        <ModulePostIt
          key={note.id}
          note={note as any}
          onEdit={handleEdit}
          onUnpin={() => unpinNote(note.id)}
          onSendToTasks={() => handleSendToTasks(note as any)}
        />
      ))}
    </div>
  );
}
