/**
 * ModuleTipBanner — exibe a primeira dica ativa relacionada ao módulo
 * no topo de qualquer página de módulo.
 * 
 * Uso:
 *   <ModuleTipBanner moduloSlug="precificacao" />
 */
import { useState } from 'react';
import { X, Sparkles, ChevronDown, ChevronUp } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { useModuleTips, useRegisterTipView } from '@/hooks/useConsultantTips';

interface Props {
  moduloSlug: string;
  className?: string;
}

export function ModuleTipBanner({ moduloSlug, className }: Props) {
  const { data: tips } = useModuleTips(moduloSlug);
  const registerView = useRegisterTipView();
  const [dismissed, setDismissed] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const tip = tips?.[0];
  if (!tip || dismissed) return null;

  const body = tip.conteudo_json?.body ?? '';
  const highlights = tip.conteudo_json?.highlights ?? [];

  const handleExpand = () => {
    if (!expanded) registerView(tip.id);
    setExpanded(v => !v);
  };

  return (
    <div
      className={cn(
        'rounded-lg border border-primary/20 bg-primary/5 mb-4 overflow-hidden',
        className
      )}
    >
      <div className="flex items-start gap-3 p-3">
        <Sparkles className="h-4 w-4 text-primary shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[11px] font-semibold text-primary uppercase tracking-wide">
              Dica de Consultor
            </span>
            {tip.categoria && (
              <span className="text-[10px] text-muted-foreground">· {tip.categoria}</span>
            )}
          </div>
          <p className="text-sm font-medium text-foreground">{tip.titulo}</p>
          {expanded && (
            <div className="mt-2">
              {body && (
                <p className="text-xs text-muted-foreground leading-relaxed">{body}</p>
              )}
              {highlights.length > 0 && (
                <ul className="mt-2 space-y-1">
                  {highlights.map((h, i) => (
                    <li key={i} className="flex items-start gap-2 text-xs text-foreground/80">
                      <span className="mt-0.5 h-1.5 w-1.5 rounded-full bg-primary shrink-0" />
                      {h}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={handleExpand}>
            {expanded
              ? <ChevronUp className="h-3.5 w-3.5" />
              : <ChevronDown className="h-3.5 w-3.5" />
            }
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 text-muted-foreground"
            onClick={() => setDismissed(true)}
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    </div>
  );
}
