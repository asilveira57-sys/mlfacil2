import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import type { Locale } from 'date-fns';
import { formatDistanceToNow } from 'date-fns';
import { ptBR, enUS, es } from 'date-fns/locale';
import { Pin, MoreVertical, Send, Archive } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Note } from '@/types/notes';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';

const LOCALE_MAP: Record<string, Locale> = {
  'pt-BR': ptBR,
  en: enUS,
  es: es,
};

interface NoteCardProps {
  note: Note;
  isPinned?: boolean;
  onClick: () => void;
  onPin?: () => void;
  onUnpin?: () => void;
  onSendToTasks?: () => void;
  onArchive?: () => void;
}

export const NoteCard = memo(function NoteCard({
  note,
  isPinned,
  onClick,
  onPin,
  onUnpin,
  onSendToTasks,
  onArchive,
}: NoteCardProps) {
  const { t, i18n } = useTranslation('notes');
  const locale = LOCALE_MAP[i18n.language] || ptBR;

  const preview = note.content_plain
    ? note.content_plain.slice(0, 100)
    : '';

  const timeAgo = formatDistanceToNow(new Date(note.updated_at), {
    addSuffix: true,
    locale,
  });

  return (
    <div
      className="group relative rounded-lg border p-3 cursor-pointer transition-all hover:shadow-md"
      style={{ borderLeftColor: note.color_hex, borderLeftWidth: 4 }}
      onClick={onClick}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <h4 className="text-sm font-medium truncate text-foreground">
              {note.title || t('untitled')}
            </h4>
            {isPinned && (
              <Pin className="h-3 w-3 text-muted-foreground shrink-0" />
            )}
          </div>
          {preview && (
            <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">
              {preview}
            </p>
          )}
          <span className="text-[10px] text-muted-foreground mt-1 block">
            {timeAgo}
          </span>
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
            >
              <MoreVertical className="h-3.5 w-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
            {isPinned ? (
              <DropdownMenuItem onClick={() => onUnpin?.()}>
                <Pin className="h-4 w-4 mr-2" />
                {t('actions.unpin_module')}
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem onClick={() => onPin?.()}>
                <Pin className="h-4 w-4 mr-2" />
                {t('actions.pin_module')}
              </DropdownMenuItem>
            )}
            <DropdownMenuItem onClick={() => onSendToTasks?.()}>
              <Send className="h-4 w-4 mr-2" />
              {t('actions.send_to_tasks')}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onArchive?.()}>
              <Archive className="h-4 w-4 mr-2" />
              {t('actions.archive')}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Color indicator dot */}
      <div
        className="absolute top-2 right-10 h-2.5 w-2.5 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
        style={{ backgroundColor: note.color_hex }}
      />
    </div>
  );
});
