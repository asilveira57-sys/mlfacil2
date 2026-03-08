import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pin, X, Send, Edit2, ChevronDown, ChevronUp, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { Note } from '@/types/notes';

interface ModulePostItProps {
  note: Note & { pin?: any };
  onEdit: () => void;
  onUnpin: () => void;
  onSendToTasks: () => void;
}

export function ModulePostIt({ note, onEdit, onUnpin, onSendToTasks }: ModulePostItProps) {
  const { t } = useTranslation('notes');
  const [expanded, setExpanded] = useState(false);

  return (
    <div
      className={cn(
        'rounded-lg shadow-md border transition-all cursor-pointer max-w-[240px]',
        expanded ? 'max-h-[300px]' : 'max-h-[80px]'
      )}
      style={{
        backgroundColor: note.color_hex + '20',
        borderColor: note.color_hex + '60',
      }}
    >
      {/* Color accent bar */}
      <div className="h-1 rounded-t-lg" style={{ backgroundColor: note.color_hex }} />

      {/* Compact view */}
      <div
        className="flex items-center gap-2 px-3 py-2"
        onClick={() => setExpanded(!expanded)}
      >
        <Pin className="h-3 w-3 shrink-0" style={{ color: note.color_hex }} />
        <span className="text-xs font-medium truncate flex-1 text-foreground">
          {note.title || t('untitled')}
        </span>
        {note.assigned_to && (
          <User className="h-3 w-3 shrink-0 text-muted-foreground" />
        )}
        {expanded ? (
          <ChevronUp className="h-3 w-3 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground" />
        )}
      </div>

      {/* Expanded content */}
      {expanded && (
        <div className="px-3 pb-2 space-y-2">
          <p className="text-xs text-foreground/80 line-clamp-4 whitespace-pre-wrap">
            {note.content_plain || ''}
          </p>

          <div className="flex items-center gap-1 pt-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={(e) => { e.stopPropagation(); onEdit(); }}
              title={t('actions.edit')}
            >
              <Edit2 className="h-3 w-3" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={(e) => { e.stopPropagation(); onSendToTasks(); }}
              title={t('actions.send_to_tasks')}
            >
              <Send className="h-3 w-3" />
            </Button>
            <div className="flex-1" />
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={(e) => { e.stopPropagation(); onUnpin(); }}
              title={t('actions.unpin_module')}
            >
              <X className="h-3 w-3" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
