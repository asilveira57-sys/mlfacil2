/**
 * Sync pending terms consent from signup to the database
 * Called on first authenticated login after signup
 */

import { recordConsentOnServer } from './api';

const PENDING_KEY = 'mktp_pending_terms_consent';

export async function syncPendingTermsConsent(): Promise<void> {
  const pending = localStorage.getItem(PENDING_KEY);
  if (!pending) return;

  try {
    const result = await recordConsentOnServer({
      consent_scope: 'terms',
      consent_type: 'accepted',
      source: 'signup',
    });

    if (result) {
      localStorage.removeItem(PENDING_KEY);
      console.log('[Terms Sync] Signup consent recorded successfully');
    }
  } catch (err) {
    console.warn('[Terms Sync] Failed to sync pending terms consent:', err);
  }
}
