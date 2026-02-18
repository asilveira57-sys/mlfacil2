/**
 * Sync cookie consent to database
 * Handles both logged-in and anonymous users
 */

import { supabase } from '@/integrations/supabase/client';
import { CookieConsent, getStoredConsent, saveConsent, generateFingerprint } from './consent';

/** Sync consent to database for logged-in users */
export async function syncConsentToDb(consent: CookieConsent): Promise<void> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { error } = await supabase
      .from('cookie_consents')
      .insert({
        user_id: user.id,
        consent_type: consent.type,
        essential: true,
        performance: consent.performance,
        analytics: consent.analytics,
        policy_version: consent.version,
        ip_address: null, // Will be set server-side if needed
        user_agent: navigator.userAgent.substring(0, 500),
        fingerprint: consent.fingerprint || generateFingerprint(),
        accepted_at: consent.date,
      });

    if (!error) {
      // Mark as synced
      saveConsent({ ...consent, synced: true });
    }
  } catch (err) {
    console.warn('[Cookie Consent] Failed to sync to DB:', err);
  }
}

/** Try to sync pending consent on login */
export async function syncPendingConsent(): Promise<void> {
  const consent = getStoredConsent();
  if (consent && !consent.synced) {
    await syncConsentToDb(consent);
  }
}
