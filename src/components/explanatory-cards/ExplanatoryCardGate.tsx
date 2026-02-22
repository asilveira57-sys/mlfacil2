import { useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { BookOpen } from 'lucide-react';
import { useModuleCards, useHasViewedModuleCard, useMarkCardViewed } from '@/hooks/useExplanatoryCards';
import { ExplanatoryCardModal } from './ExplanatoryCardModal';

interface Props {
  moduleSlug: string;
  children: React.ReactNode;
}

/**
 * Wraps a module page. If there are unviewed explanatory cards,
 * shows a blocking modal before the user can access the module.
 * Also renders a "Rever explicação" button.
 */
export function ExplanatoryCardGate({ moduleSlug, children }: Props) {
  const { data: cards = [], isLoading: loadingCards } = useModuleCards(moduleSlug);
  const { data: hasViewed, isLoading: loadingView } = useHasViewedModuleCard(moduleSlug);
  const markViewed = useMarkCardViewed();
  const [manualOpen, setManualOpen] = useState(false);

  const handleComplete = useCallback(() => {
    markViewed.mutate(moduleSlug);
    setManualOpen(false);
  }, [markViewed, moduleSlug]);

  const handleSkip = useCallback(() => {
    markViewed.mutate(moduleSlug);
    setManualOpen(false);
  }, [markViewed, moduleSlug]);

  const isLoading = loadingCards || loadingView;
  const hasCards = cards.length > 0;
  const needsShow = hasCards && hasViewed === false && !isLoading;
  const anyRequired = cards.some((c) => c.obrigatorio);

  return (
    <>
      {/* Blocking modal for first-time view */}
      {needsShow && !manualOpen && (
        <ExplanatoryCardModal
          cards={cards}
          onComplete={handleComplete}
          onSkip={anyRequired ? undefined : handleSkip}
          isRequired={anyRequired}
        />
      )}

      {/* Manual "review" modal */}
      {manualOpen && hasCards && (
        <ExplanatoryCardModal
          cards={cards}
          onComplete={() => setManualOpen(false)}
          onSkip={() => setManualOpen(false)}
          isRequired={false}
        />
      )}

      {/* Actual page content */}
      {children}

      {/* "Rever explicação" button (only if cards exist and user already viewed) */}
      {hasCards && hasViewed && (
        <div className="fixed bottom-6 right-6 z-40">
          <Button
            variant="outline"
            size="sm"
            className="shadow-lg gap-2"
            onClick={() => setManualOpen(true)}
          >
            <BookOpen className="h-4 w-4" />
            Rever explicação
          </Button>
        </div>
      )}
    </>
  );
}
