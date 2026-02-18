/**
 * CookieConsentGate
 * Wraps the app to:
 * 1. Show cookie consent banner if needed
 * 2. Only load analytics/tracking scripts after consent
 * 3. Sync consent to DB on login
 */

import { useState, useEffect, useCallback, ReactNode } from 'react';
import { CookieConsentBanner } from '@/components/cookies/CookieConsentBanner';
import { FacebookTrackingProvider } from '@/contexts/FacebookTrackingContext';
import { getStoredConsent, CookieConsent } from '@/lib/cookies/consent';
import { syncPendingConsent } from '@/lib/cookies/sync';
import { supabase } from '@/integrations/supabase/client';

interface Props {
  children: ReactNode;
}

export function CookieConsentGate({ children }: Props) {
  const [consent, setConsent] = useState<CookieConsent | null>(() => getStoredConsent());

  // Sync pending consent on auth state change (user logs in)
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_IN') {
        syncPendingConsent();
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  const handleConsent = useCallback((c: CookieConsent) => {
    setConsent(c);
  }, []);

  const analyticsAllowed = consent?.analytics === true;

  return (
    <>
      {/* Only load Facebook Pixel if analytics consent given */}
      {analyticsAllowed ? (
        <FacebookTrackingProvider>
          {children}
        </FacebookTrackingProvider>
      ) : (
        children
      )}

      {/* Banner renders itself only when no consent stored */}
      <CookieConsentBanner onConsent={handleConsent} />
    </>
  );
}
