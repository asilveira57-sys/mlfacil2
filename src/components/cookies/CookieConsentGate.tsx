/**
 * CookieConsentGate
 * Wraps the app to:
 * 1. Show cookie consent banner if needed
 * 2. Only load analytics/tracking scripts after consent
 * 3. Sync consent to DB on login
 * 4. Sync pending terms consent from signup on login
 */

import { useState, useEffect, useCallback, ReactNode } from 'react';
import { CookieConsentBanner } from '@/components/cookies/CookieConsentBanner';
import { FacebookTrackingProvider } from '@/contexts/FacebookTrackingContext';
import { getStoredConsent, CookieConsent } from '@/lib/cookies/consent';
import { syncPendingConsent } from '@/lib/cookies/sync';
import { recordConsentOnServer } from '@/lib/cookies/api';
import { syncPendingTermsConsent } from '@/lib/cookies/terms-sync';
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
        // Sync pending terms consent from signup
        syncPendingTermsConsent();
        // Also sync via edge function for IP/UA capture
        const stored = getStoredConsent();
        if (stored && !stored.synced) {
          recordConsentOnServer({
            consent_scope: 'cookies',
            consent_type: stored.type,
            performance: stored.performance,
            analytics: stored.analytics,
            source: 'banner',
          });
        }
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
