import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { StickyNote, Loader2 } from 'lucide-react';
import type { Note } from '@/types/notes';
import { NoteCard } from './NoteCard';

interface NotesListProps {
  notes: Note[];
  isLoading: boolean;
  hasNextPage?: boolean;
  isFetchingNextPage?: boolean;
  fetchNextPage?: () => void;
  isPinnedFn?: (noteId: string) => boolean;
  onNoteClick: (note: Note) => void;
  onPin?: (noteId: string) => void;
  onUnpin?: (noteId: string) => void;
  onSendToTasks?: (note: Note) => void;
  onArchive?: (noteId: string) => void;
}

export function NotesList({
  notes,
  isLoading,
  hasNextPage,
  isFetchingNextPage,
  fetchNextPage,
  isPinnedFn,
  onNoteClick,
  onPin,
  onUnpin,
  onSendToTasks,
  onArchive,
}: NotesListProps) {
  const { t } = useTranslation('notes');
  const sentinelRef = useRef<HTMLDivElement>(null);

  // Infinite scroll observer
  useEffect(() => {
    if (!hasNextPage || !fetchNextPage) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !isFetchingNextPage) {
          fetchNextPage();
        }
      },
      { threshold: 0.1 }
    );

    const el = sentinelRef.current;
    if (el) observer.observe(el);

    return () => {
      if (el) observer.unobserve(el);
    };
  }, [hasNextPage, fetchNextPage, isFetchingNextPage]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (notes.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-muted-foreground gap-2">
        <StickyNote className="h-8 w-8" />
        <p className="text-sm font-medium">{t('no_notes')}</p>
        <p className="text-xs">{t('no_notes_hint')}</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {notes.map((note) => (
        <NoteCard
          key={note.id}
          note={note}
          isPinned={isPinnedFn?.(note.id)}
          onClick={() => onNoteClick(note)}
          onPin={() => onPin?.(note.id)}
          onUnpin={() => onUnpin?.(note.id)}
          onSendToTasks={() => onSendToTasks?.(note)}
          onArchive={() => onArchive?.(note.id)}
        />
      ))}

      {/* Infinite scroll sentinel */}
      <div ref={sentinelRef} className="h-4" />
      {isFetchingNextPage && (
        <div className="flex justify-center py-2">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        </div>
      )}
    </div>
  );
}
