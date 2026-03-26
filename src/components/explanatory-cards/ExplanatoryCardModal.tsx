import { useState, useCallback, useMemo } from 'react';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight, X, Lock } from 'lucide-react';
import type { ExplanatoryCard } from '@/hooks/useExplanatoryCards';
import { cn } from '@/lib/utils';

/** A flat virtual card — either a standalone card or one slide extracted from a carousel */
interface FlatCard {
  /** Original card id (for logging) */
  cardId: string;
  titulo: string;
  tipo: 'texto' | 'imagem' | 'video';
  conteudo: Record<string, unknown>;
}

interface Props {
  cards: ExplanatoryCard[];
  onComplete: () => void;
  onSkip?: () => void;
  isRequired: boolean;
  onLog?: (action: string, meta?: Record<string, unknown>) => void;
}

/**
 * Flatten cards so that carousel / texto-with-slides expand into individual virtual cards.
 * This ensures the progress counter and "Concluir" button track every slide.
 */
function flattenCards(cards: ExplanatoryCard[]): FlatCard[] {
  const flat: FlatCard[] = [];
  for (const card of cards) {
    const c = card.conteudo as Record<string, unknown>;
    const slides = Array.isArray(c.slides) ? (c.slides as Record<string, unknown>[]) : null;

    if (slides && slides.length > 0) {
      // Expand each slide into a virtual card
      for (const slide of slides) {
        const tipo = String(slide.tipo ?? 'texto') as FlatCard['tipo'];
        flat.push({
          cardId: card.id,
          titulo: card.titulo,
          tipo,
          conteudo: slide,
        });
      }
    } else {
      flat.push({
        cardId: card.id,
        titulo: card.titulo,
        tipo: card.tipo as FlatCard['tipo'],
        conteudo: c,
      });
    }
  }
  return flat;
}

export function ExplanatoryCardModal({ cards, onComplete, onSkip, isRequired, onLog }: Props) {
  const flatCards = useMemo(() => flattenCards(cards), [cards]);

  const [currentIndex, setCurrentIndex] = useState(0);
  const [viewedIndices, setViewedIndices] = useState<Set<number>>(() => new Set([0]));
  const card = flatCards[currentIndex];
  const isLast = currentIndex === flatCards.length - 1;
  const isFirst = currentIndex === 0;

  const allViewed = useMemo(
    () => flatCards.length > 0 && viewedIndices.size >= flatCards.length,
    [viewedIndices.size, flatCards.length]
  );

  const markCurrentViewed = useCallback((idx: number) => {
    setViewedIndices((prev) => {
      if (prev.has(idx)) return prev;
      const next = new Set(prev);
      next.add(idx);
      onLog?.('card_viewed', { card_index: idx, card_id: flatCards[idx]?.cardId });
      return next;
    });
  }, [flatCards, onLog]);

  // Log opening on mount
  useState(() => {
    onLog?.('onboarding_opened', { total_cards: flatCards.length });
  });

  const next = useCallback(() => {
    if (isLast) {
      if (!allViewed && isRequired) {
        onLog?.('complete_blocked', { viewed: viewedIndices.size, total: flatCards.length });
        return;
      }
      onComplete();
    } else {
      const nextIdx = currentIndex + 1;
      setCurrentIndex(nextIdx);
      markCurrentViewed(nextIdx);
    }
  }, [isLast, allViewed, isRequired, onComplete, currentIndex, markCurrentViewed, onLog, viewedIndices.size, flatCards.length]);

  const prev = useCallback(() => {
    if (!isFirst) {
      const prevIdx = currentIndex - 1;
      setCurrentIndex(prevIdx);
      markCurrentViewed(prevIdx);
    }
  }, [isFirst, currentIndex, markCurrentViewed]);

  const goToIndex = useCallback((idx: number) => {
    setCurrentIndex(idx);
    markCurrentViewed(idx);
  }, [markCurrentViewed]);

  if (!card) return null;

  const canComplete = isLast && allViewed;

  return (
    <Dialog open onOpenChange={() => { if (!isRequired) onSkip?.(); }}>
      <DialogContent
        className="max-w-2xl w-[95vw] max-h-[90vh] overflow-y-auto p-0 gap-0 [&>button.absolute]:hidden"
        onPointerDownOutside={(e) => { if (isRequired) e.preventDefault(); }}
        onEscapeKeyDown={(e) => { if (isRequired) e.preventDefault(); }}
      >
        <DialogTitle className="sr-only">{card.titulo}</DialogTitle>

        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="text-lg font-semibold">{card.titulo}</h2>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">
              {currentIndex + 1} / {flatCards.length}
            </span>
            {!isRequired && (
              <Button variant="ghost" size="icon" onClick={onSkip}>
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>

        {/* Progress bar */}
        <div className="px-4 pt-3">
          <div className="flex items-center gap-1.5 mb-1">
            <span className="text-xs text-muted-foreground">
              {viewedIndices.size} de {flatCards.length} visualizado{flatCards.length > 1 ? 's' : ''}
            </span>
          </div>
          <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-primary rounded-full transition-all duration-300"
              style={{ width: `${(viewedIndices.size / flatCards.length) * 100}%` }}
            />
          </div>
        </div>

        {/* Content */}
        <div className="p-6">
          <FlatCardContent card={card} />
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-4 border-t">
          <Button variant="outline" onClick={prev} disabled={isFirst}>
            <ChevronLeft className="h-4 w-4 mr-1" /> Voltar
          </Button>
          <div className="flex gap-2">
            {!isRequired && (
              <Button variant="ghost" onClick={onSkip}>
                Pular
              </Button>
            )}
            {isLast ? (
              <Button onClick={next} disabled={!canComplete}>
                {!allViewed && <Lock className="h-4 w-4 mr-1" />}
                Concluir
              </Button>
            ) : (
              <Button onClick={next}>
                Avançar
                <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            )}
          </div>
        </div>

        {/* Dots */}
        {flatCards.length > 1 && (
          <div className="flex justify-center gap-1.5 pb-4">
            {flatCards.map((_, i) => (
              <button
                key={i}
                onClick={() => goToIndex(i)}
                className={cn(
                  'h-2 rounded-full transition-all',
                  i === currentIndex
                    ? 'w-6 bg-primary'
                    : viewedIndices.has(i)
                      ? 'w-2 bg-primary/50'
                      : 'w-2 bg-muted-foreground/30'
                )}
              />
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ─── Render flat card content by type ──────────────────────────────
function FlatCardContent({ card }: { card: FlatCard }) {
  const c = card.conteudo;

  switch (card.tipo) {
    case 'texto':
      return (
        <div className="prose prose-sm dark:prose-invert max-w-none">
          <p className="whitespace-pre-wrap">{String(c.texto ?? c.conteudo ?? '')}</p>
        </div>
      );

    case 'imagem':
      return (
        <div className="space-y-3">
          {c.imagem_url && (
            <img
              src={String(c.imagem_url)}
              alt={String(c.descricao ?? card.titulo)}
              className="w-full rounded-lg object-contain max-h-[50vh]"
            />
          )}
          {c.descricao && (
            <p className="text-sm text-muted-foreground">{String(c.descricao)}</p>
          )}
        </div>
      );

    case 'video':
      return (
        <div className="space-y-3">
          {c.video_url && (
            <div className="aspect-video rounded-lg overflow-hidden bg-black">
              <iframe
                src={String(c.video_url)}
                className="w-full h-full"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
                title={card.titulo}
              />
            </div>
          )}
          {c.descricao && (
            <p className="text-sm text-muted-foreground">{String(c.descricao)}</p>
          )}
        </div>
      );

    default:
      return <p className="text-muted-foreground">Tipo desconhecido.</p>;
  }
}
