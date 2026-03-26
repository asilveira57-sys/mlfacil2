import { useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { BookOpen } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useCurrentUserId } from '@/hooks/useCurrentUserId';
import { useActiveAccount } from '@/contexts/ActiveAccountContext';
import { useModuleCards, useHasViewedModuleCard, useMarkCardViewed } from '@/hooks/useExplanatoryCards';
import { ExplanatoryCardModal } from './ExplanatoryCardModal';

interface Props {
  moduleSlug: string;
  children: React.ReactNode;
}

/**
 * Wraps a module page. If there are unviewed explanatory cards,
 * shows a blocking modal before the user can access the module.
 * 
 * - Required cards: user MUST view ALL cards before "Concluir" is enabled.
 * - Closing without completing does NOT save — modal reopens next visit.
 * - "Rever explicação" button allows manual re-open after completion.
 */
export function ExplanatoryCardGate({ moduleSlug, children }: Props) {
  const { data: cards = [], isLoading: loadingCards } = useModuleCards(moduleSlug);
  const { data: hasViewed, isLoading: loadingView } = useHasViewedModuleCard(moduleSlug);
  const markViewed = useMarkCardViewed();
  const [manualOpen, setManualOpen] = useState(false);
  const userId = useCurrentUserId();
  const { activeAccount } = useActiveAccount();

  const logAction = useCallback((action: string, meta?: Record<string, unknown>) => {
    if (!userId) return;
    void supabase.from('module_intro_logs').insert({
      user_id: userId,
      tenant_id: activeAccount?.companyId ?? null,
      module_slug: moduleSlug,
      action,
      ...(meta ? { meta } : {}),
    }).then(() => {});
  }, [userId, activeAccount?.companyId, moduleSlug]);

  const handleComplete = useCallback(() => {
    markViewed.mutate(moduleSlug);
    logAction('onboarding_completed');
  }, [markViewed, moduleSlug, logAction]);

  const handleReentryLog = useCallback(() => {
    if (hasViewed) {
      logAction('module_reentry_after_completion');
    }
  }, [hasViewed, logAction]);

  // Log re-entry once when module is accessed after completion
  useState(() => {
    if (hasViewed) {
      handleReentryLog();
    }
  });

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
          onSkip={anyRequired ? undefined : () => {
            // Non-required: allow skip but don't mark as viewed
            // Modal will reappear next time
          }}
          isRequired={anyRequired}
          onLog={(action, meta) => logAction(action, meta)}
        />
      )}

      {/* Manual "review" modal */}
      {manualOpen && hasCards && (
        <ExplanatoryCardModal
          cards={cards}
          onComplete={() => setManualOpen(false)}
          onSkip={() => setManualOpen(false)}
          isRequired={false}
          onLog={(action, meta) => logAction(`manual_${action}`, meta)}
        />
      )}

      {/* Actual page content - blocked if onboarding not completed */}
      {needsShow && anyRequired ? (
        <div className="container mx-auto p-6 flex items-center justify-center min-h-[60vh]">
          <p className="text-muted-foreground">
            Complete o onboarding para acessar este módulo.
          </p>
        </div>
      ) : (
        children
      )}

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
