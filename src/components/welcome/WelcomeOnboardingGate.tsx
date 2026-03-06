import { useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useActiveAccount } from '@/contexts/ActiveAccountContext';
import { useCurrentUserId } from '@/hooks/useCurrentUserId';
import { useActiveOnboardingFlow } from '@/hooks/useWelcomeOnboarding';
import { WelcomeOnboardingModal } from './WelcomeOnboardingModal';

// Routes where we don't show the onboarding modal
const EXCLUDED_PREFIXES = [
  '/auth', '/criar-acesso', '/primeiro-acesso', '/reconnecting',
  '/planos', '/blog', '/consultoria',
  '/termos-de-uso', '/politica-de-privacidade', '/politica-de-cookies', '/lgpd',
  '/ferramentas', '/admin',
];

export function WelcomeOnboardingGate() {
  const location = useLocation();
  const userId = useCurrentUserId();
  const { activeAccount } = useActiveAccount();
  const [dismissed, setDismissed] = useState(false);

  const companyId = activeAccount?.companyId ?? null;
  const sellerId = activeAccount?.sellerId ?? null;

  const isExcluded =
    location.pathname === '/' ||
    EXCLUDED_PREFIXES.some((p) => location.pathname.startsWith(p));

  const { data: flowData, isLoading } = useActiveOnboardingFlow(
    isExcluded ? null : userId,
    isExcluded ? null : companyId
  );

  if (isExcluded || isLoading || !flowData || dismissed || !userId || !companyId || !sellerId) {
    return null;
  }

  return (
    <WelcomeOnboardingModal
      flow={flowData.flow}
      steps={flowData.steps}
      existingProgress={flowData.progress}
      userId={userId}
      companyId={companyId}
      sellerId={sellerId}
      onClose={() => setDismissed(true)}
    />
  );
}
