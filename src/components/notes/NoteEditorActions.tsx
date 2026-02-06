import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pin, Send, Archive, ChevronDown, MapPin } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import { getAvailableModules, MODULE_LABELS } from '@/hooks/useActiveModuleKey';

interface NoteEditorActionsProps {
  isPinned?: boolean;
  currentModuleKey: string;
  onPin: (moduleKey: string) => void;
  onUnpin?: () => void;
  onSendToTasks?: () => void;
  onArchive?: () => void;
}

export function NoteEditorActions({
  isPinned,
  currentModuleKey,
  onPin,
  onUnpin,
  onSendToTasks,
  onArchive,
}: NoteEditorActionsProps) {
  const { t } = useTranslation('notes');
  const [moduleSelectorOpen, setModuleSelectorOpen] = useState(false);
  const modules = getAvailableModules();

  return (
    <div className="flex items-center gap-1 px-3 py-2 border-t bg-muted/30 flex-wrap">
      {/* Pin / Module selector */}
      {isPinned ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={onUnpin}
            >
              <Pin className="h-3.5 w-3.5 fill-current" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>{t('actions.unpin_module')}</TooltipContent>
        </Tooltip>
      ) : (
        <Popover open={moduleSelectorOpen} onOpenChange={setModuleSelectorOpen}>
          <Tooltip>
            <TooltipTrigger asChild>
              <PopoverTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs gap-1"
                >
                  <MapPin className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">{t('actions.pin_module')}</span>
                  <ChevronDown className="h-3 w-3" />
                </Button>
              </PopoverTrigger>
            </TooltipTrigger>
            <TooltipContent>{t('actions.pin_module')}</TooltipContent>
          </Tooltip>
          <PopoverContent align="start" className="w-48 p-1">
            <ScrollArea className="max-h-[200px]">
              {modules.map((mod) => (
                <button
                  key={mod.key}
                  className={`w-full text-left px-3 py-1.5 text-xs rounded hover:bg-accent transition-colors ${
                    mod.key === currentModuleKey ? 'bg-accent font-medium' : ''
                  }`}
                  onClick={() => {
                    onPin(mod.key);
                    setModuleSelectorOpen(false);
                  }}
                >
                  {mod.label}
                </button>
              ))}
            </ScrollArea>
          </PopoverContent>
        </Popover>
      )}

      {/* Send to tasks */}
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={onSendToTasks}
          >
            <Send className="h-3.5 w-3.5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>{t('actions.send_to_tasks')}</TooltipContent>
      </Tooltip>

      <div className="flex-1" />

      {/* Archive */}
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-destructive hover:text-destructive"
            onClick={onArchive}
          >
            <Archive className="h-3.5 w-3.5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>{t('actions.archive')}</TooltipContent>
      </Tooltip>
    </div>
  );
}
