/**
 * Consent API - calls edge functions for recording consent and generating PDFs
 */

import { supabase } from '@/integrations/supabase/client';

export async function recordConsentOnServer(params: {
  consent_scope: 'cookies' | 'terms';
  consent_type: string;
  performance?: boolean;
  analytics?: boolean;
  source: 'banner' | 'settings' | 'system';
}): Promise<{ consent_id: string; document_version: string } | null> {
  try {
    const { data, error } = await supabase.functions.invoke('record-consent', {
      body: params,
    });

    if (error) {
      console.warn('[Consent API] record-consent error:', error);
      return null;
    }
    return data;
  } catch (err) {
    console.warn('[Consent API] record-consent failed:', err);
    return null;
  }
}

export async function generateConsentPdf(consentId: string): Promise<string | null> {
  try {
    const { data, error } = await supabase.functions.invoke('generate-consent-pdf', {
      body: { consent_id: consentId },
    });

    if (error) {
      console.warn('[Consent API] generate-consent-pdf error:', error);
      return null;
    }

    const url = data?.pdf_url || null;
    if (url) {
      // Open in new tab for download
      window.open(url, '_blank');
    }
    return url;
  } catch (err) {
    console.warn('[Consent API] generate-consent-pdf failed:', err);
    return null;
  }
}
