import { useState, useCallback } from 'react';
import { StickyNote, Plus } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useTranslation } from 'react-i18next';
import { useNotes } from '@/hooks/useNotes';
import { useNotePins } from '@/hooks/useNotePins';
import { useCurrentWorkspaceId } from '@/hooks/useCurrentWorkspaceId';
import { useActiveModuleKey } from '@/hooks/useActiveModuleKey';
import { QuickPostItForm } from './QuickPostItForm';
import { cn } from '@/lib/utils';

interface FloatingPostItButtonProps {
  visible?: boolean;
  companyId?: string | null;
}

export function FloatingPostItButton({ visible = true, companyId }: FloatingPostItButtonProps) {
  const { t } = useTranslation('notes');
  const [open, setOpen] = useState(false);
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

  const handleSubmit = useCallback(
    async (data: { title: string; content: string; colorHex: string; moduleKey: string }) => {
      if (!workspaceId) return;
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
        }

        setOpen(false);
      } catch (err) {
        console.error('[PostIt] Create error:', err);
      }
    },
    [workspaceId, createNote, pinNote, companyId]
  );

  if (!visible) return null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              size="icon"
              className={cn(
                'fixed bottom-20 right-6 z-50 h-12 w-12 rounded-full shadow-lg',
                'bg-amber-400 hover:bg-amber-500 border-amber-500',
                'text-amber-950 hover:text-amber-950',
                'transition-all hover:scale-105'
              )}
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
      <PopoverContent side="top" align="end" className="w-72" sideOffset={8}>
        <QuickPostItForm onSubmit={handleSubmit} isSubmitting={isCreating} />
      </PopoverContent>
    </Popover>
  );
}
