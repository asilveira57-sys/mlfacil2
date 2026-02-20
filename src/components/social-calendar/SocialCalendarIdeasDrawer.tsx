import { useState } from 'react';
import { Copy, Bookmark, X, FileDown } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
  DrawerClose,
} from '@/components/ui/drawer';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import {
  SocialCalendarEvent,
  SocialCalendarTemplate,
  UserPreferences,
  useEventTemplates,
  useSaveIdea,
  useCurrentUser,
  logCalendarEngagement,
} from '@/hooks/useSocialCalendar';

const FORMAT_LABELS: Record<string, string> = {
  reels: '🎬 Reels',
  stories: '📱 Stories',
  feed: '🖼️ Feed',
  carrossel: '🎠 Carrossel',
  shorts: '📹 Shorts',
};

const NICHE_LABELS: Record<string, string> = {
  geral: '🌐 Geral',
  beleza: '💄 Beleza',
  autopeças: '🔧 Autopeças',
  pet: '🐾 Pet',
  papelaria: '📝 Papelaria',
  'eletrônicos': '⚡ Eletrônicos',
  moda: '👗 Moda',
};

function fillTemplate(text: string, eventTitle: string): string {
  return text
    .replace(/\{\{evento\}\}/g, eventTitle)
    .replace(/\{\{tema\}\}/g, eventTitle.toLowerCase())
    .replace(/\{\{acao\}\}/g, 'aproveitar essa oportunidade');
}

interface Props {
  open: boolean;
  onClose: () => void;
  event: SocialCalendarEvent;
  preferences: UserPreferences | null | undefined;
}

export function SocialCalendarIdeasDrawer({ open, onClose, event, preferences }: Props) {
  const userId = useCurrentUser();
  const niches = (preferences?.selected_niches as string[]) ?? ['geral'];
  const formats = (preferences?.preferred_formats as string[]) ?? ['feed', 'stories'];
  const { data: templates = [], isLoading } = useEventTemplates(event.category, niches, formats);
  const saveIdea = useSaveIdea();
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());

  const handleCopy = async (template: SocialCalendarTemplate) => {
    const text = `${fillTemplate(template.hook, event.title)}\n\n${fillTemplate(template.script, event.title)}\n\n${template.cta ?? ''}`;
    await navigator.clipboard.writeText(text);
    toast.success('Texto copiado!');
    await logCalendarEngagement(userId, 'export', event.id, { template_id: template.id, action: 'copy' });
  };

  const handleSave = async (template: SocialCalendarTemplate) => {
    if (savedIds.has(template.id)) return;
    await saveIdea.mutateAsync({
      event_id: event.id,
      chosen_template_id: template.id,
      custom_title: `${event.title} — ${FORMAT_LABELS[template.format] ?? template.format}`,
    });
    setSavedIds((prev) => new Set([...prev, template.id]));
    await logCalendarEngagement(userId, 'save', event.id, { template_id: template.id });
  };

  const handleExport = async (template: SocialCalendarTemplate) => {
    const text = [
      `📅 DATA: ${format(new Date(event.event_date + 'T12:00:00'), "dd 'de' MMMM 'de' yyyy", { locale: ptBR })}`,
      `📌 EVENTO: ${event.title}`,
      `🎯 FORMATO: ${FORMAT_LABELS[template.format] ?? template.format}`,
      `🏷️ NICHO: ${NICHE_LABELS[template.niche] ?? template.niche}`,
      '',
      `🪝 HOOK:`,
      fillTemplate(template.hook, event.title),
      '',
      `📝 ROTEIRO:`,
      fillTemplate(template.script, event.title),
      '',
      `📢 CTA:`,
      template.cta ?? '',
    ].join('\n');

    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `pauta-${event.event_date}-${template.format}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Pauta exportada!');
    await logCalendarEngagement(userId, 'export', event.id, { template_id: template.id, action: 'download' });
  };

  return (
    <Drawer open={open} onClose={onClose} direction="right">
      <DrawerContent className="fixed inset-y-0 right-0 h-full w-full sm:w-[480px] rounded-none flex flex-col">
        <DrawerHeader className="border-b">
          <div className="flex items-start justify-between">
            <div>
              <DrawerTitle className="text-lg">{event.title}</DrawerTitle>
              <DrawerDescription className="capitalize">
                {format(new Date(event.event_date + 'T12:00:00'), "dd 'de' MMMM", { locale: ptBR })}
                {event.description && ` · ${event.description}`}
              </DrawerDescription>
            </div>
            <DrawerClose asChild>
              <Button variant="ghost" size="icon" onClick={onClose}>
                <X className="h-4 w-4" />
              </Button>
            </DrawerClose>
          </div>
        </DrawerHeader>

        <ScrollArea className="flex-1">
          <div className="p-4 space-y-4">
            {isLoading ? (
              <div className="text-center py-8 text-muted-foreground animate-pulse">Gerando ideias...</div>
            ) : templates.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <p>Nenhuma sugestão para seus nichos/formatos configurados.</p>
                <p className="text-xs mt-1">Ajuste suas preferências na aba Configurações.</p>
              </div>
            ) : (
              templates.map((tpl) => (
                <div key={tpl.id} className="border rounded-xl p-4 space-y-3 bg-card">
                  {/* Header */}
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant="secondary" className="text-xs">{FORMAT_LABELS[tpl.format] ?? tpl.format}</Badge>
                    <Badge variant="outline" className="text-xs">{NICHE_LABELS[tpl.niche] ?? tpl.niche}</Badge>
                  </div>

                  {/* Hook */}
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">🪝 Hook</p>
                    <p className="text-sm font-medium">{fillTemplate(tpl.hook, event.title)}</p>
                  </div>

                  <Separator />

                  {/* Script */}
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">📝 Roteiro</p>
                    <p className="text-sm text-muted-foreground whitespace-pre-line">{fillTemplate(tpl.script, event.title)}</p>
                  </div>

                  {/* CTA */}
                  {tpl.cta && (
                    <div className="bg-muted/50 rounded-lg p-2">
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">📢 CTA</p>
                      <p className="text-sm">{tpl.cta}</p>
                    </div>
                  )}

                  {/* Actions */}
                  <div className="flex gap-2 flex-wrap pt-1">
                    <Button variant="outline" size="sm" className="gap-1 text-xs" onClick={() => handleCopy(tpl)}>
                      <Copy className="h-3 w-3" /> Copiar
                    </Button>
                    <Button
                      variant={savedIds.has(tpl.id) ? 'secondary' : 'outline'}
                      size="sm"
                      className="gap-1 text-xs"
                      onClick={() => handleSave(tpl)}
                      disabled={savedIds.has(tpl.id) || saveIdea.isPending}
                    >
                      <Bookmark className="h-3 w-3" />
                      {savedIds.has(tpl.id) ? 'Salvo!' : 'Salvar pauta'}
                    </Button>
                    <Button variant="ghost" size="sm" className="gap-1 text-xs" onClick={() => handleExport(tpl)}>
                      <FileDown className="h-3 w-3" /> Exportar
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>
        </ScrollArea>
      </DrawerContent>
    </Drawer>
  );
}
