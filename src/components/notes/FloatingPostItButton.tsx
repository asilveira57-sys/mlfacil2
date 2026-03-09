import { useState, useCallback, useRef, useEffect } from 'react';
import { StickyNote, Plus, X } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { useTranslation } from 'react-i18next';
import { useNotes } from '@/hooks/useNotes';
import { useNotePins } from '@/hooks/useNotePins';
import { useCurrentWorkspaceId } from '@/hooks/useCurrentWorkspaceId';
import { useActiveModuleKey } from '@/hooks/useActiveModuleKey';
import { QuickPostItForm } from './QuickPostItForm';
import { cn } from '@/lib/utils';

const POSITION_KEY = 'postit-fab-position';
const DISMISSED_KEY = 'postit-fab-dismissed';

interface Position {
  x: number;
  y: number;
}

function getDefaultPosition(): Position {
  return {
    x: window.innerWidth - 150,
    y: window.innerHeight - 80,
  };
}

function loadPosition(): Position {
  try {
    const saved = localStorage.getItem(POSITION_KEY);
    if (saved) {
      const pos = JSON.parse(saved) as Position;
      return {
        x: Math.min(Math.max(16, pos.x), window.innerWidth - 72),
        y: Math.min(Math.max(16, pos.y), window.innerHeight - 72),
      };
    }
  } catch { /* ignore */ }
  return getDefaultPosition();
}

interface FloatingPostItButtonProps {
  visible?: boolean;
  companyId?: string | null;
}

export function FloatingPostItButton({ visible = true, companyId }: FloatingPostItButtonProps) {
  const { t } = useTranslation('notes');
  const [isOpen, setIsOpen] = useState(false);
  const [dismissed, setDismissed] = useState(() => localStorage.getItem(DISMISSED_KEY) === 'true');
  const [hovered, setHovered] = useState(false);
  const [position, setPosition] = useState<Position>(loadPosition);
  const [dragging, setDragging] = useState(false);
  const dragOffset = useRef<Position>({ x: 0, y: 0 });
  const didDrag = useRef(false);
  const buttonRef = useRef<HTMLDivElement>(null);

  const { data: workspaceId } = useCurrentWorkspaceId();
  const moduleKey = useActiveModuleKey();

  const { createNote, isCreating } = useNotes({
    workspaceId: workspaceId ?? null,
    companyId,
  });

  const { pinNote } = useNotePins({
    workspaceId: workspaceId ?? null,
    moduleKey,
    companyId,
  });

  // Recalculate position on window resize
  useEffect(() => {
    const handleResize = () => {
      setPosition(prev => ({
        x: Math.min(prev.x, window.innerWidth - 72),
        y: Math.min(prev.y, window.innerHeight - 72),
      }));
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Dragging handlers — same pattern as FloatingSupportButton
  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest('[data-close-btn]')) return;
    e.preventDefault();
    didDrag.current = false;
    setDragging(true);
    dragOffset.current = {
      x: e.clientX - position.x,
      y: e.clientY - position.y,
    };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }, [position]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragging) return;
    didDrag.current = true;
    const newX = Math.min(Math.max(16, e.clientX - dragOffset.current.x), window.innerWidth - 72);
    const newY = Math.min(Math.max(16, e.clientY - dragOffset.current.y), window.innerHeight - 72);
    setPosition({ x: newX, y: newY });
  }, [dragging]);

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    if (!dragging) return;
    setDragging(false);
    (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    localStorage.setItem(POSITION_KEY, JSON.stringify(position));
  }, [dragging, position]);

  const handleDismiss = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setDismissed(true);
    localStorage.setItem(DISMISSED_KEY, 'true');
    setIsOpen(false);
  }, []);

  // Listen for reactivation from other components
  useEffect(() => {
    const handler = () => {
      setDismissed(false);
      localStorage.removeItem(DISMISSED_KEY);
    };
    window.addEventListener('postit-fab-reactivate', handler);
    return () => window.removeEventListener('postit-fab-reactivate', handler);
  }, []);

  const handleSubmit = useCallback(
    async (data: { title: string; content: string; colorHex: string; moduleKey: string; files?: File[] }) => {
      if (!workspaceId) {
        console.warn('[PostIt] workspaceId is null, cannot create note');
        return;
      }
      try {
        const note = await createNote({
          title: data.title,
          content_plain: data.content,
          color_hex: data.colorHex,
          company_id: companyId ?? undefined,
        } as any);

        if (note?.id) {
          pinNote({
            noteId: note.id,
            moduleKey: data.moduleKey,
            companyId: companyId ?? undefined,
            routePath: window.location.pathname,
          });

          if (data.files && data.files.length > 0) {
            for (const file of data.files) {
              try {
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

        setIsOpen(false);
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
      style={{
        left: position.x,
        top: position.y,
        touchAction: 'none',
        cursor: dragging ? 'grabbing' : 'grab',
      }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Close button - appears on hover */}
      {hovered && !dragging && (
        <button
          data-close-btn
          onClick={handleDismiss}
          className="absolute -top-2 -right-2 z-[51] h-5 w-5 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center shadow-md hover:scale-110 transition-transform"
          aria-label={t('postit.close', { defaultValue: 'Fechar' })}
        >
          <X className="h-3 w-3" />
        </button>
      )}

      <Popover open={isOpen} onOpenChange={(open) => {
        if (didDrag.current) {
          didDrag.current = false;
          return;
        }
        setIsOpen(open);
      }}>
        <PopoverTrigger asChild>
          <div className="relative">
            <Button
              size="icon"
              className={cn(
                'h-14 w-14 rounded-full shadow-lg',
                'bg-primary hover:bg-primary/90 text-primary-foreground',
                'transition-all duration-200',
                !dragging && 'hover:scale-105',
              )}
            >
              <div className="relative">
                <StickyNote className="h-6 w-6" />
                <Plus className="h-3 w-3 absolute -top-1 -right-1" />
              </div>
            </Button>
          </div>
        </PopoverTrigger>

        <PopoverContent data-close-btn side="top" align="end" className="w-80" sideOffset={8}>
          <QuickPostItForm onSubmit={handleSubmit} isSubmitting={isCreating} />
        </PopoverContent>
      </Popover>
    </div>
  );
}
