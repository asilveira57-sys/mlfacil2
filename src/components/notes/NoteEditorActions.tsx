import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pin, Send, Archive, ChevronDown, MapPin, Building2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { useSystemModules } from '@/hooks/useSystemModules';
import { useWorkspaceCompanies } from '@/hooks/useWorkspaceCompanies';

interface NoteEditorActionsProps {
  isPinned?: boolean;
  currentModuleKey: string;
  onPin: (moduleKey: string, companyId?: string) => void;
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
  const [selectedModuleKey, setSelectedModuleKey] = useState<string | null>(null);
  const [selectedCompanyId, setSelectedCompanyId] = useState<string | undefined>(undefined);

  const { modules } = useSystemModules();
  const { companies } = useWorkspaceCompanies();

  const handleConfirmPin = () => {
    if (!selectedModuleKey) return;
    onPin(selectedModuleKey, selectedCompanyId);
    setModuleSelectorOpen(false);
    setSelectedModuleKey(null);
    setSelectedCompanyId(undefined);
  };

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
        <Popover open={moduleSelectorOpen} onOpenChange={(open) => {
          setModuleSelectorOpen(open);
          if (!open) {
            setSelectedModuleKey(null);
            setSelectedCompanyId(undefined);
          }
        }}>
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
          <PopoverContent align="start" className="w-64 p-2">
            {/* Module selector */}
            <p className="text-xs font-medium text-muted-foreground px-2 mb-1">
              {t('pin.select_module')}
            </p>
            <ScrollArea className="max-h-[160px]">
              {modules.map((mod) => (
                <button
                  key={mod.key}
                  className={`w-full text-left px-3 py-1.5 text-xs rounded hover:bg-accent transition-colors ${
                    mod.key === selectedModuleKey
                      ? 'bg-accent font-medium'
                      : mod.key === currentModuleKey && !selectedModuleKey
                      ? 'text-muted-foreground'
                      : ''
                  }`}
                  onClick={() => setSelectedModuleKey(mod.key)}
                >
                  {mod.label}
                </button>
              ))}
            </ScrollArea>

            {/* Company selector */}
            {companies.length > 0 && (
              <>
                <Separator className="my-2" />
                <p className="text-xs font-medium text-muted-foreground px-2 mb-1 flex items-center gap-1">
                  <Building2 className="h-3 w-3" />
                  {t('pin.select_company')}
                </p>
                <ScrollArea className="max-h-[120px]">
                  <button
                    className={`w-full text-left px-3 py-1.5 text-xs rounded hover:bg-accent transition-colors ${
                      selectedCompanyId === undefined ? 'bg-accent/50' : ''
                    }`}
                    onClick={() => setSelectedCompanyId(undefined)}
                  >
                    {t('pin.all_companies')}
                  </button>
                  {companies.map((company) => (
                    <button
                      key={company.id}
                      className={`w-full text-left px-3 py-1.5 text-xs rounded hover:bg-accent transition-colors ${
                        selectedCompanyId === company.id ? 'bg-accent font-medium' : ''
                      }`}
                      onClick={() => setSelectedCompanyId(company.id)}
                    >
                      {company.displayName}
                    </button>
                  ))}
                </ScrollArea>
              </>
            )}

            {/* Confirm button */}
            <Separator className="my-2" />
            <Button
              size="sm"
              className="w-full h-7 text-xs"
              disabled={!selectedModuleKey}
              onClick={handleConfirmPin}
            >
              <Pin className="h-3 w-3 mr-1" />
              {t('actions.pin_module')}
            </Button>
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
