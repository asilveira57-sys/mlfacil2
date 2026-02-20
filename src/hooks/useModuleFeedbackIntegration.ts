import { useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useActiveAccount } from '@/contexts/ActiveAccountContext';
import { useTrackModuleUsage } from '@/hooks/useFeedback';
import { useQuery } from '@tanstack/react-query';

/**
 * Hook that integrates module feedback tracking into any module page.
 * 
 * - Automatically tracks a "view" on mount (once per session).
 * - Provides userId and sellerId needed by FeedbackPromptCard.
 * - Call `trackAction()` when the user performs a meaningful action.
 * 
 * Usage:
 * ```tsx
 * const { userId, sellerId, trackAction } = useModuleFeedbackIntegration('dashboard-analises');
 * // Render <FeedbackPromptCard kind="module" moduleSlug="dashboard-analises" userId={userId} sellerId={sellerId} />
 * ```
 */
export function useModuleFeedbackIntegration(moduleSlug: string) {
  const { sellerId } = useActiveAccount();
  const trackUsage = useTrackModuleUsage();
  const viewTracked = useRef(false);

  const { data: userId } = useQuery({
    queryKey: ['current-user-id'],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      return user?.id ?? null;
    },
    staleTime: 10 * 60 * 1000,
  });

  // Track view once per mount
  useEffect(() => {
    if (!userId || !sellerId || viewTracked.current) return;
    viewTracked.current = true;
    trackUsage.mutate({ userId, sellerId, moduleSlug, isAction: false });
  }, [userId, sellerId, moduleSlug]);

  const trackAction = () => {
    if (!userId || !sellerId) return;
    trackUsage.mutate({ userId, sellerId, moduleSlug, isAction: true });
  };

  return {
    userId: userId ?? undefined,
    sellerId: sellerId ?? undefined,
    trackAction,
    ready: !!userId && !!sellerId,
  };
}
