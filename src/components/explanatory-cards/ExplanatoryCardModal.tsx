import { useState, useCallback } from 'react';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import type { ExplanatoryCard } from '@/hooks/useExplanatoryCards';
import { cn } from '@/lib/utils';

interface Props {
  cards: ExplanatoryCard[];
  onComplete: () => void;
  onSkip?: () => void;
  /** True if at least one card is obrigatório */
  isRequired: boolean;
}

export function ExplanatoryCardModal({ cards, onComplete, onSkip, isRequired }: Props) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const card = cards[currentIndex];
  const isLast = currentIndex === cards.length - 1;
  const isFirst = currentIndex === 0;

  const next = useCallback(() => {
    if (isLast) {
      onComplete();
    } else {
      setCurrentIndex((i) => i + 1);
    }
  }, [isLast, onComplete]);

  const prev = useCallback(() => {
    if (!isFirst) setCurrentIndex((i) => i - 1);
  }, [isFirst]);

  if (!card) return null;

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
              {currentIndex + 1} / {cards.length}
            </span>
            {!isRequired && (
              <Button variant="ghost" size="icon" onClick={onSkip}>
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>

        {/* Content */}
        <div className="p-6">
          <CardContent card={card} />
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
            <Button onClick={next}>
              {isLast ? 'Concluir' : 'Avançar'}
              {!isLast && <ChevronRight className="h-4 w-4 ml-1" />}
            </Button>
          </div>
        </div>

        {/* Dots */}
        {cards.length > 1 && (
          <div className="flex justify-center gap-1.5 pb-4">
            {cards.map((_, i) => (
              <button
                key={i}
                onClick={() => setCurrentIndex(i)}
                className={cn(
                  'h-2 rounded-full transition-all',
                  i === currentIndex ? 'w-6 bg-primary' : 'w-2 bg-muted-foreground/30'
                )}
              />
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ─── Render card content by type ──────────────────────────────
function CardContent({ card }: { card: ExplanatoryCard }) {
  const c = card.conteudo as Record<string, unknown>;

  switch (card.tipo) {
    case 'texto': {
      // Support both { texto: "..." } and { slides: [...] } formats
      if (Array.isArray(c.slides)) {
        return <CarouselContent slides={c.slides as unknown[]} titulo={card.titulo} />;
      }
      return (
        <div className="prose prose-sm dark:prose-invert max-w-none">
          <p className="whitespace-pre-wrap">{String(c.texto ?? '')}</p>
        </div>
      );
    }

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

    case 'carrossel':
      return <CarouselContent slides={(c.slides as unknown[]) ?? []} titulo={card.titulo} />;

    default:
      return <p className="text-muted-foreground">Tipo desconhecido.</p>;
  }
}

function CarouselContent({ slides, titulo }: { slides: unknown[]; titulo: string }) {
  const [idx, setIdx] = useState(0);
  const slide = (slides[idx] ?? {}) as Record<string, unknown>;
  const tipo = String(slide.tipo ?? 'texto');

  return (
    <div className="space-y-4">
      <div className="min-h-[200px]">
        {tipo === 'texto' && (
          <p className="whitespace-pre-wrap">{String(slide.conteudo ?? '')}</p>
        )}
        {tipo === 'imagem' && (
          <div className="space-y-2">
            {slide.imagem_url && (
              <img
                src={String(slide.imagem_url)}
                alt={String(slide.descricao ?? titulo)}
                className="w-full rounded-lg object-contain max-h-[40vh]"
              />
            )}
            {slide.descricao && (
              <p className="text-sm text-muted-foreground">{String(slide.descricao)}</p>
            )}
          </div>
        )}
        {tipo === 'video' && slide.video_url && (
          <div className="aspect-video rounded-lg overflow-hidden bg-black">
            <iframe
              src={String(slide.video_url)}
              className="w-full h-full"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
              title={titulo}
            />
          </div>
        )}
      </div>

      {/* Slide navigation */}
      <div className="flex items-center justify-center gap-2">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setIdx((i) => Math.max(0, i - 1))}
          disabled={idx === 0}
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span className="text-xs text-muted-foreground">
          Slide {idx + 1} / {slides.length}
        </span>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setIdx((i) => Math.min(slides.length - 1, i + 1))}
          disabled={idx === slides.length - 1}
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
