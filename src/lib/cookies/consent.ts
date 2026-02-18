/**
 * Cookie Consent Management
 * Handles localStorage persistence, fingerprinting, and DB sync
 */

const STORAGE_KEY = 'mktp_cookie_consent';
const CURRENT_VERSION = '1.0';

export interface CookieConsent {
  type: 'all' | 'custom';
  essential: true;
  performance: boolean;
  analytics: boolean;
  date: string;
  version: string;
  fingerprint?: string;
  synced?: boolean;
}

/** Generate a simple browser fingerprint for recognizing returning visitors */
export function generateFingerprint(): string {
  const nav = navigator;
  const screen = window.screen;
  const raw = [
    nav.userAgent,
    nav.language,
    screen.width,
    screen.height,
    screen.colorDepth,
    new Date().getTimezoneOffset(),
    nav.hardwareConcurrency || '',
    (nav as any).deviceMemory || '',
  ].join('|');

  // Simple hash
  let hash = 0;
  for (let i = 0; i < raw.length; i++) {
    const char = raw.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash).toString(36);
}

/** Get stored consent from localStorage */
export function getStoredConsent(): CookieConsent | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const consent = JSON.parse(raw) as CookieConsent;
    // Revalidate if version changed
    if (consent.version !== CURRENT_VERSION) return null;
    return consent;
  } catch {
    return null;
  }
}

/** Save consent to localStorage */
export function saveConsent(consent: CookieConsent): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(consent));
  } catch {
    // Storage full or disabled
  }
}

/** Create a full consent object */
export function createConsent(
  type: 'all' | 'custom',
  performance: boolean,
  analytics: boolean,
): CookieConsent {
  return {
    type,
    essential: true,
    performance,
    analytics,
    date: new Date().toISOString(),
    version: CURRENT_VERSION,
    fingerprint: generateFingerprint(),
    synced: false,
  };
}

/** Check if analytics scripts should load */
export function canLoadAnalytics(): boolean {
  const consent = getStoredConsent();
  return consent?.analytics === true;
}

/** Check if performance scripts should load */
export function canLoadPerformance(): boolean {
  const consent = getStoredConsent();
  return consent?.performance === true;
}

/** Get current policy version */
export function getCurrentPolicyVersion(): string {
  return CURRENT_VERSION;
}
