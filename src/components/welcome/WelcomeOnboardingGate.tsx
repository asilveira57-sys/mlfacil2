import { useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useActiveAccount } from '@/contexts/ActiveAccountContext';
import { useCurrentUserId } from '@/hooks/useCurrentUserId';
import { useActiveOnboardingFlow } from '@/hooks/useWelcomeOnboarding';
import { useUserAccess } from '@/contexts/UserAccessContext';
import { useCollaboratorAccess } from '@/hooks/useCollaboratorAccess';
import { WelcomeOnboardingModal } from './WelcomeOnboardingModal';
import { supabase } from '@/integrations/supabase/client';

// Routes where we don't show the onboarding modal
const EXCLUDED_PREFIXES = [
  '/auth', '/criar-acesso', '/primeiro-acesso', '/reconnecting',
  '/planos', '/blog', '/consultoria',
  '/termos-de-uso', '/politica-de-privacidade', '/politica-de-cookies', '/lgpd',
  '/ferramentas', '/admin',
];

/**
 * Fallback: fetch user's primary company directly when ActiveAccount context
 * doesn't have one yet (e.g. new user with no ML account connected).
 */
function useUserPrimaryCompany(userId: string | null, skip: boolean) {
  return useQuery({
    queryKey: ['user-primary-company', userId],
    enabled: !!userId && !skip,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      if (!userId) return null;
      const { data } = await supabase
        .from('companies')
        .select('id')
        .eq('user_id', userId)
        .eq('is_primary', true)
        .maybeSingle();
      return data?.id ?? null;
    },
  });
}

export function WelcomeOnboardingGate() {
  const location = useLocation();
  const userId = useCurrentUserId();
  const { activeAccount } = useActiveAccount();
  const { requiresOnboarding, loading: accessLoading } = useUserAccess();
  const { isCollaborator } = useCollaboratorAccess();
  const [dismissed, setDismissed] = useState(false);

  // Block Welcome Cards for users who completed /primeiro-acesso onboarding
  const onboardingCompleted = !accessLoading && !requiresOnboarding;

  const accountCompanyId = activeAccount?.companyId ?? null;
  const sellerId = activeAccount?.sellerId ?? null;

  // Fallback: if no companyId from active account, fetch user's primary company
  // Skip entirely for collaborators — they don't have their own company.
  const { data: fallbackCompanyId } = useUserPrimaryCompany(
    userId,
    isCollaborator || !!accountCompanyId
  );

  const companyId = accountCompanyId || fallbackCompanyId || null;
  // For new users without ML account, use a placeholder sellerId
  const effectiveSellerId = sellerId || 'pending';

  const isExcluded =
    location.pathname === '/' ||
    EXCLUDED_PREFIXES.some((p) => location.pathname.startsWith(p));

  const { data: flowData, isLoading } = useActiveOnboardingFlow(
    isExcluded || isCollaborator ? null : userId,
    isExcluded || isCollaborator ? null : companyId
  );

  // Collaborators never see the welcome flow — it belongs to the titular.
  if (isCollaborator) return null;

  if (isExcluded || onboardingCompleted || isLoading || !flowData || dismissed || !userId || !companyId) {
    return null;
  }

  return (
    <WelcomeOnboardingModal
      flow={flowData.flow}
      steps={flowData.steps}
      existingProgress={flowData.progress}
      userId={userId}
      companyId={companyId}
      sellerId={effectiveSellerId}
      onClose={() => setDismissed(true)}
    />
  );
}
