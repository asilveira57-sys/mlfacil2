/**
 * Cookie Consent Management
 * Dual-layer persistence: HTTP cookie (365 days) + localStorage
 * Revalidation on policy version change
 */

const STORAGE_KEY = 'mktp_cookie_consent';
const COOKIE_NAME = 'mktp_cookie_consent';
const COOKIE_MAX_AGE = 365 * 24 * 60 * 60; // 365 days in seconds
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

  let hash = 0;
  for (let i = 0; i < raw.length; i++) {
    const char = raw.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(36);
}

// ─── Cookie helpers ───

function setCookie(value: string): void {
  try {
    document.cookie = `${COOKIE_NAME}=${encodeURIComponent(value)}; path=/; max-age=${COOKIE_MAX_AGE}; SameSite=Lax`;
  } catch {
    // cookies disabled
  }
}

function getCookie(): string | null {
  try {
    const match = document.cookie.match(new RegExp(`(?:^|;\\s*)${COOKIE_NAME}=([^;]*)`));
    return match ? decodeURIComponent(match[1]) : null;
  } catch {
    return null;
  }
}

// ─── Read / Write (dual-layer) ───

function parseConsent(raw: string | null): CookieConsent | null {
  if (!raw) return null;
  try {
    const consent = JSON.parse(raw) as CookieConsent;
    if (consent.version !== CURRENT_VERSION) return null;
    return consent;
  } catch {
    return null;
  }
}

/** Get stored consent: cookie first, then localStorage fallback */
export function getStoredConsent(): CookieConsent | null {
  // 1. Try cookie first (survives localStorage clears)
  const fromCookie = parseConsent(getCookie());
  if (fromCookie) return fromCookie;

  // 2. Fallback to localStorage
  const fromStorage = parseConsent(localStorage.getItem(STORAGE_KEY));
  if (fromStorage) {
    // Re-sync to cookie so it persists next time
    setCookie(JSON.stringify(fromStorage));
    return fromStorage;
  }

  return null;
}

/** Save consent to both cookie (365d) and localStorage */
export function saveConsent(consent: CookieConsent): void {
  const json = JSON.stringify(consent);
  try {
    localStorage.setItem(STORAGE_KEY, json);
  } catch { /* storage full */ }
  setCookie(json);
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
  return getStoredConsent()?.analytics === true;
}

/** Check if performance scripts should load */
export function canLoadPerformance(): boolean {
  return getStoredConsent()?.performance === true;
}

/** Get current policy version */
export function getCurrentPolicyVersion(): string {
  return CURRENT_VERSION;
}
