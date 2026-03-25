import { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useCurrentUserId } from '@/hooks/useCurrentUserId';
import { useActiveAccount } from '@/contexts/ActiveAccountContext';
import { useModuleCards } from '@/hooks/useExplanatoryCards';
import { ExplanatoryCardModal } from '@/components/explanatory-cards/ExplanatoryCardModal';

interface ModuleIntroContextValue {
  /** Set of module_slugs (keys) that have active explanatory cards */
  modulesWithCards: Set<string>;
  /** Open the intro modal for a given module slug */
  openModuleIntro: (moduleSlug: string) => void;
  isLoading: boolean;
}

const ModuleIntroContext = createContext<ModuleIntroContextValue | undefined>(undefined);

export function useModuleIntro() {
  const ctx = useContext(ModuleIntroContext);
  if (!ctx) throw new Error('useModuleIntro must be used within ModuleIntroProvider');
  return ctx;
}

export function ModuleIntroProvider({ children }: { children: ReactNode }) {
  const [activeSlug, setActiveSlug] = useState<string | null>(null);
  const userId = useCurrentUserId();
  const { activeAccount } = useActiveAccount();

  // Fetch distinct module slugs that have active cards
  const { data: slugSet = new Set<string>(), isLoading } = useQuery({
    queryKey: ['modules-with-explanatory-cards'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('module_explanatory_cards')
        .select('module_slug')
        .eq('ativo', true);
      if (error) throw error;
      const set = new Set<string>();
      for (const row of data ?? []) {
        set.add(row.module_slug);
      }
      return set;
    },
    staleTime: 15 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });

  const openModuleIntro = useCallback((moduleSlug: string) => {
    // Log the manual open
    if (userId) {
      void supabase.from('module_intro_logs').insert({
        user_id: userId,
        tenant_id: activeAccount?.companyId ?? null,
        module_slug: moduleSlug,
        action: 'open_intro_manual',
      });
    }
    setActiveSlug(moduleSlug);
  }, [userId, activeAccount?.companyId]);

  return (
    <ModuleIntroContext.Provider value={{ modulesWithCards: slugSet, openModuleIntro, isLoading }}>
      {children}
      {activeSlug && (
        <IntroModalRenderer
          moduleSlug={activeSlug}
          onClose={() => setActiveSlug(null)}
        />
      )}
    </ModuleIntroContext.Provider>
  );
}

/** Loads cards for the active slug and renders the modal */
function IntroModalRenderer({ moduleSlug, onClose }: { moduleSlug: string; onClose: () => void }) {
  const { data: cards = [], isLoading } = useModuleCards(moduleSlug);

  if (isLoading || cards.length === 0) {
    // If no cards found, just close
    if (!isLoading && cards.length === 0) {
      onClose();
    }
    return null;
  }

  return (
    <ExplanatoryCardModal
      cards={cards}
      onComplete={onClose}
      onSkip={onClose}
      isRequired={false}
    />
  );
}
