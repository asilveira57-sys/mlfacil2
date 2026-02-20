import { useState } from 'react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { MessageCircle, ExternalLink, ChevronDown, ChevronUp, Radio } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { cn } from '@/lib/utils';
import {
  useAnnouncements,
  useUnreadCount,
  useMarkAnnouncementRead,
  type AnnouncementWithRead,
} from '@/hooks/useOfficialChannel';

// ─── Badge icon no header ─────────────────────────────────────────────────────

export function OfficialChannelIcon() {
  const [open, setOpen] = useState(false);
  const unread = useUnreadCount();

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        className="relative"
        onClick={() => setOpen(true)}
        aria-label="Canal Oficial MKTPFACIL"
      >
        <MessageCircle className="h-5 w-5" />
        {unread > 0 && (
          <Badge
            variant="destructive"
            className="absolute -top-1 -right-1 h-5 min-w-5 p-0 flex items-center justify-center text-[10px] pointer-events-none"
          >
            {unread > 99 ? '99+' : unread}
          </Badge>
        )}
      </Button>

      <OfficialChannelDrawer open={open} onOpenChange={setOpen} />
    </>
  );
}

// ─── Drawer principal ─────────────────────────────────────────────────────────

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

export function OfficialChannelDrawer({ open, onOpenChange }: Props) {
  const { data: announcements = [], isLoading } = useAnnouncements();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const markRead = useMarkAnnouncementRead();

  const handleExpand = (ann: AnnouncementWithRead) => {
    const next = expandedId === ann.id ? null : ann.id;
    setExpandedId(next);
    if (next && !ann.is_read) {
      markRead.mutate(ann.id);
    }
  };

  const unread = announcements.filter((a) => !a.is_read).length;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-[420px] sm:w-[480px] p-0 flex flex-col">
        {/* Header */}
        <SheetHeader className="px-5 py-4 border-b border-border shrink-0">
          <div className="flex items-center gap-2">
            <div className="flex items-center justify-center w-8 h-8 rounded-full bg-primary/10">
              <Radio className="h-4 w-4 text-primary" />
            </div>
            <div>
              <SheetTitle className="text-base leading-tight">Canal Oficial</SheetTitle>
              <p className="text-xs text-muted-foreground">Comunicados MKTPFACIL</p>
            </div>
            {unread > 0 && (
              <Badge variant="secondary" className="ml-auto text-[10px]">
                {unread} não {unread === 1 ? 'lido' : 'lidos'}
              </Badge>
            )}
          </div>
        </SheetHeader>

        {/* Lista */}
        <ScrollArea className="flex-1">
          {isLoading ? (
            <div className="p-5 space-y-3">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="h-24 rounded-lg bg-muted animate-pulse" />
              ))}
            </div>
          ) : announcements.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center px-6">
              <div className="rounded-full bg-muted p-4 mb-4">
                <MessageCircle className="h-8 w-8 text-muted-foreground" />
              </div>
              <h3 className="text-sm font-medium">Nenhum comunicado</h3>
              <p className="text-xs text-muted-foreground mt-1">
                Novidades da plataforma aparecerão aqui.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {announcements.map((ann) => (
                <AnnouncementCard
                  key={ann.id}
                  announcement={ann}
                  expanded={expandedId === ann.id}
                  onToggle={() => handleExpand(ann)}
                />
              ))}
            </div>
          )}
        </ScrollArea>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-border bg-muted/30 shrink-0">
          <p className="text-[11px] text-muted-foreground text-center">
            Comunicados oficiais da plataforma Marketplace Fácil
          </p>
        </div>
      </SheetContent>
    </Sheet>
  );
}

// ─── Card individual ──────────────────────────────────────────────────────────

interface CardProps {
  announcement: AnnouncementWithRead;
  expanded: boolean;
  onToggle: () => void;
}

function AnnouncementCard({ announcement: ann, expanded, onToggle }: CardProps) {
  const dateStr = format(new Date(ann.created_at), "d 'de' MMMM 'de' yyyy", { locale: ptBR });

  return (
    <div
      className={cn(
        'p-4 transition-colors cursor-pointer hover:bg-muted/40',
        !ann.is_read && 'bg-primary/5 hover:bg-primary/10',
      )}
      onClick={onToggle}
    >
      {/* Top row */}
      <div className="flex items-start gap-3">
        {/* Indicador de leitura */}
        <div className="shrink-0 mt-1.5">
          {!ann.is_read ? (
            <span className="block w-2 h-2 rounded-full bg-primary" />
          ) : (
            <span className="block w-2 h-2 rounded-full bg-transparent border border-muted-foreground/30" />
          )}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <p className={cn('text-sm leading-snug', !ann.is_read && 'font-semibold')}>
              {ann.title}
            </p>
            <span className="shrink-0 text-muted-foreground mt-0.5">
              {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </span>
          </div>
          <p className="text-[11px] text-muted-foreground mt-0.5">{dateStr}</p>

          {/* Preview (collapsed) */}
          {!expanded && (
            <p className="text-xs text-muted-foreground mt-1.5 line-clamp-2 leading-relaxed">
              {ann.content}
            </p>
          )}
        </div>
      </div>

      {/* Expanded content */}
      {expanded && (
        <div className="mt-3 ml-5 space-y-3" onClick={(e) => e.stopPropagation()}>
          <Separator />

          {/* Imagem opcional */}
          {ann.image_url && (
            <img
              src={ann.image_url}
              alt={ann.title}
              className="w-full rounded-md object-cover max-h-48"
            />
          )}

          {/* Conteúdo completo */}
          <p className="text-sm leading-relaxed text-foreground whitespace-pre-wrap">
            {ann.content}
          </p>

          {/* Link opcional */}
          {ann.link_url && (
            <a
              href={ann.link_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline font-medium"
              onClick={(e) => e.stopPropagation()}
            >
              <ExternalLink className="h-3.5 w-3.5" />
              Saiba mais
            </a>
          )}
        </div>
      )}
    </div>
  );
}
