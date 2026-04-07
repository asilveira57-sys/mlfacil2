import { useState } from 'react';
import { Heart, Bookmark, Share2, ChevronRight, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import type { ConsultantTip } from '@/hooks/useConsultantTips';
import {
  useUserTipInteractions,
  useToggleTipInteraction,
  useRegisterTipView,
} from '@/hooks/useConsultantTips';

const NIVEL_COLORS = {
  iniciante: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20',
  intermediario: 'bg-amber-500/10 text-amber-600 border-amber-500/20',
  avancado: 'bg-rose-500/10 text-rose-600 border-rose-500/20',
};

const NIVEL_LABELS = {
  iniciante: 'Iniciante',
  intermediario: 'Intermediário',
  avancado: 'Avançado',
};

interface Props {
  tip: ConsultantTip;
  compact?: boolean;
  className?: string;
}

export function ConsultantTipCard({ tip, compact = false, className }: Props) {
  const { toast } = useToast();
  const [expanded, setExpanded] = useState(false);
  const { data: interactions } = useUserTipInteractions(tip.id);
  const toggle = useToggleTipInteraction();
  const registerView = useRegisterTipView();

  const handleExpand = () => {
    if (!expanded) registerView(tip.id);
    setExpanded(v => !v);
  };

  const handleInteraction = (tipo: 'like' | 'salvar' | 'compartilhar') => {
    if (tipo === 'compartilhar') {
      const publishedOrigin = 'https://mlfacil2.lovable.app';
      const url = `${publishedOrigin}/dica/${tip.slug}`;
      navigator.clipboard.writeText(url).catch(() => {});
      toast({ title: 'Link copiado!', description: 'Link da dica copiado para a área de transferência.' });
      toggle.mutate({ tipId: tip.id, tipo });
      return;
    }
    toggle.mutate({ tipId: tip.id, tipo });
  };

  const body = tip.conteudo_json?.body ?? '';
  const highlights = tip.conteudo_json?.highlights ?? [];

  return (
    <div
      className={cn(
        'rounded-xl border border-border/60 bg-card shadow-sm overflow-hidden transition-all duration-200 flex flex-col',
        'hover:shadow-md hover:border-primary/20',
        className
      )}
      style={{ maxWidth: compact ? undefined : 360 }}
    >
      {/* Header strip */}
      <div className="flex items-center gap-2 px-4 py-3 bg-primary/5 border-b border-border/40">
        <Sparkles className="h-3.5 w-3.5 text-primary shrink-0" />
        <span className="text-[11px] font-semibold text-primary uppercase tracking-wide">
          Dica de Consultor
        </span>
        {tip.nivel && (
          <Badge
            variant="outline"
            className={cn('ml-auto text-[10px] px-1.5 py-0', NIVEL_COLORS[tip.nivel])}
          >
            {NIVEL_LABELS[tip.nivel]}
          </Badge>
        )}
      </div>

      {/* Body */}
      <div className="flex flex-col flex-1 p-4 gap-3">
        {/* Title */}
        <h3 className={cn(
          'font-bold text-foreground leading-snug',
          compact ? 'text-sm' : 'text-base'
        )}>
          {tip.titulo}
        </h3>

        {/* Category */}
        {tip.categoria && (
          <span className="text-[11px] text-muted-foreground">{tip.categoria}</span>
        )}

        {/* Content */}
        {!compact && (
          <div className="flex-1">
            {/* Main text */}
            {body && (
              <p className={cn(
                'text-sm text-muted-foreground leading-relaxed',
                !expanded && 'line-clamp-4'
              )}>
                {body}
              </p>
            )}

            {/* Highlights */}
            {expanded && highlights.length > 0 && (
              <ul className="mt-3 space-y-1.5">
                {highlights.map((h, i) => (
                  <li key={i} className="flex items-start gap-2 text-xs text-foreground/80">
                    <span className="mt-0.5 h-1.5 w-1.5 rounded-full bg-primary shrink-0" />
                    {h}
                  </li>
                ))}
              </ul>
            )}

            {/* Expand toggle */}
            {body.length > 180 && (
              <button
                onClick={handleExpand}
                className="mt-2 flex items-center gap-1 text-xs text-primary hover:underline"
              >
                {expanded ? 'Ver menos' : 'Ver mais'}
                <ChevronRight className={cn('h-3 w-3 transition-transform', expanded && 'rotate-90')} />
              </button>
            )}
          </div>
        )}

        {/* Tags */}
        {!compact && tip.tags && tip.tags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {tip.tags.slice(0, 3).map(tag => (
              <Badge key={tag} variant="secondary" className="text-[10px] px-1.5 py-0">
                #{tag}
              </Badge>
            ))}
          </div>
        )}
      </div>

      {/* Footer actions */}
      <div className="flex items-center gap-1 px-3 py-2 border-t border-border/40 bg-muted/20">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => handleInteraction('like')}
          className={cn(
            'h-7 gap-1.5 px-2 text-xs',
            interactions?.liked && 'text-rose-500'
          )}
        >
          <Heart className={cn('h-3.5 w-3.5', interactions?.liked && 'fill-rose-500')} />
          Gostei
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => handleInteraction('salvar')}
          className={cn(
            'h-7 gap-1.5 px-2 text-xs',
            interactions?.saved && 'text-primary'
          )}
        >
          <Bookmark className={cn('h-3.5 w-3.5', interactions?.saved && 'fill-primary')} />
          Salvar
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => handleInteraction('compartilhar')}
          className="h-7 gap-1.5 px-2 text-xs ml-auto"
        >
          <Share2 className="h-3.5 w-3.5" />
          Compartilhar
        </Button>
      </div>
    </div>
  );
}
