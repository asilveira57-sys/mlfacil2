import { useState, useCallback, useRef, useEffect } from 'react';
import { StickyNote, Plus, X, GripVertical } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useTranslation } from 'react-i18next';
import { useNotes } from '@/hooks/useNotes';
import { useNotePins } from '@/hooks/useNotePins';
import { useNoteAttachments } from '@/hooks/useNoteAttachments';
import { useCurrentWorkspaceId } from '@/hooks/useCurrentWorkspaceId';
import { useActiveModuleKey } from '@/hooks/useActiveModuleKey';
import { QuickPostItForm } from './QuickPostItForm';
import { cn } from '@/lib/utils';

const POSITION_KEY = 'postit-fab-position';

function loadPosition(): { x: number; y: number } | null {
  try {
    const raw = localStorage.getItem(POSITION_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return null;
}

function savePosition(pos: { x: number; y: number }) {
  try {
    localStorage.setItem(POSITION_KEY, JSON.stringify(pos));
  } catch {}
}

interface FloatingPostItButtonProps {
  visible?: boolean;
  companyId?: string | null;
}

export function FloatingPostItButton({ visible = true, companyId }: FloatingPostItButtonProps) {
  const { t } = useTranslation('notes');
  const [open, setOpen] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const { data: workspaceId } = useCurrentWorkspaceId();
  const moduleKey = useActiveModuleKey();

  // Drag state
  const savedPos = loadPosition();
  const [position, setPosition] = useState<{ x: number; y: number }>({
    x: savedPos?.x ?? window.innerWidth - 72,
    y: savedPos?.y ?? window.innerHeight - 160,
  });
  const dragRef = useRef<{ startX: number; startY: number; originX: number; originY: number } | null>(null);
  const isDragging = useRef(false);
  const buttonRef = useRef<HTMLDivElement>(null);

  // Pending files for upload after note creation
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);

  const { createNote, isCreating } = useNotes({
    workspaceId: workspaceId ?? null,
    companyId,
  });

  const { pinNote } = useNotePins({
    workspaceId: workspaceId ?? null,
    moduleKey,
    companyId,
  });

  const { uploadFile } = useNoteAttachments({
    workspaceId: workspaceId ?? null,
    noteId: null, // will be set after creation
  });

  // Clamp position to viewport
  const clamp = useCallback((x: number, y: number) => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    return {
      x: Math.max(8, Math.min(x, w - 56)),
      y: Math.max(8, Math.min(y, h - 56)),
    };
  }, []);

  // Pointer handlers for drag
  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    // Only drag from the grip area
    if (!(e.target as HTMLElement).closest('[data-drag-handle]')) return;
    e.preventDefault();
    isDragging.current = false;
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      originX: position.x,
      originY: position.y,
    };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }, [position]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragRef.current) return;
    const dx = e.clientX - dragRef.current.startX;
    const dy = e.clientY - dragRef.current.startY;
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) isDragging.current = true;
    const newPos = clamp(dragRef.current.originX + dx, dragRef.current.originY + dy);
    setPosition(newPos);
  }, [clamp]);

  const handlePointerUp = useCallback(() => {
    if (dragRef.current) {
      savePosition(position);
      dragRef.current = null;
    }
  }, [position]);

  // Ensure position stays valid on resize
  useEffect(() => {
    const handler = () => setPosition((p) => clamp(p.x, p.y));
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, [clamp]);

  const handleSubmit = useCallback(
    async (data: { title: string; content: string; colorHex: string; moduleKey: string; files?: File[] }) => {
      if (!workspaceId) return;
      try {
        const note = await createNote({
          title: data.title,
          content_plain: data.content,
          color_hex: data.colorHex,
          company_id: companyId ?? undefined,
        } as any);

        if (note?.id) {
          // Pin to selected module
          pinNote({
            noteId: note.id,
            moduleKey: data.moduleKey,
            companyId: companyId ?? undefined,
            routePath: window.location.pathname,
          });

          // Upload pending files
          if (data.files && data.files.length > 0) {
            for (const file of data.files) {
              try {
                // We need to upload with noteId context - call supabase directly
                const ext = file.name.split('.').pop() || 'bin';
                const path = `${workspaceId}/${note.id}/${crypto.randomUUID()}.${ext}`;
                const { supabase } = await import('@/integrations/supabase/client');

                await supabase.storage.from('note-attachments').upload(path, file, { contentType: file.type });
                await supabase.from('note_attachments').insert({
                  workspace_id: workspaceId,
                  note_id: note.id,
                  storage_path: path,
                  file_name: file.name,
                  mime_type: file.type,
                  file_size: file.size,
                } as any);
              } catch (uploadErr) {
                console.error('[PostIt] Upload error:', uploadErr);
              }
            }
          }
        }

        setOpen(false);
        setPendingFiles([]);
      } catch (err) {
        console.error('[PostIt] Create error:', err);
      }
    },
    [workspaceId, createNote, pinNote, companyId]
  );

  if (!visible || dismissed) return null;

  return (
    <div
      ref={buttonRef}
      className="fixed z-50"
      style={{ left: position.x, top: position.y }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
    >
      <Popover open={open} onOpenChange={(v) => { if (!isDragging.current) setOpen(v); }}>
        <div className="relative group">
          {/* Drag handle */}
          <div
            data-drag-handle
            className={cn(
              'absolute -top-2 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100',
              'bg-muted/80 rounded-full px-1.5 py-0.5 cursor-grab active:cursor-grabbing transition-opacity'
            )}
          >
            <GripVertical className="h-3 w-3 text-muted-foreground" />
          </div>

          {/* Close button */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              setDismissed(true);
            }}
            className={cn(
              'absolute -top-1 -right-1 z-10 opacity-0 group-hover:opacity-100 transition-opacity',
              'h-5 w-5 rounded-full bg-destructive text-destructive-foreground',
              'flex items-center justify-center shadow-sm hover:scale-110'
            )}
            title={t('postit.close', { defaultValue: 'Fechar' })}
          >
            <X className="h-3 w-3" />
          </button>

          <Tooltip>
            <TooltipTrigger asChild>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  size="icon"
                  className={cn(
                    'h-12 w-12 rounded-full shadow-lg',
                    'bg-primary hover:bg-primary/90 border-primary',
                    'text-primary-foreground hover:text-primary-foreground',
                    'transition-all hover:scale-105'
                  )}
                  onClick={(e) => {
                    if (isDragging.current) {
                      e.preventDefault();
                      e.stopPropagation();
                    }
                  }}
                >
                  <div className="relative">
                    <StickyNote className="h-5 w-5" />
                    <Plus className="h-3 w-3 absolute -top-1 -right-1" />
                  </div>
                </Button>
              </PopoverTrigger>
            </TooltipTrigger>
            <TooltipContent side="left">
              <p>{t('postit.new_postit', { defaultValue: 'Novo Post-it' })}</p>
            </TooltipContent>
          </Tooltip>
        </div>

        <PopoverContent side="top" align="end" className="w-80" sideOffset={8}>
          <QuickPostItForm onSubmit={handleSubmit} isSubmitting={isCreating} />
        </PopoverContent>
      </Popover>
    </div>
  );
}
