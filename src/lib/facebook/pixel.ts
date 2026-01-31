/**
 * Facebook Pixel Client-Side Implementation
 * Handles all browser-side tracking events
 */

declare global {
  interface Window {
    fbq: any;
    _fbq: any;
  }
}

// Initialize Facebook Pixel
export function initFacebookPixel(pixelId: string) {
  if (typeof window === 'undefined') return;
  
  // Don't initialize twice
  if (window.fbq) return;

  const f = window;
  const b = document;
  const e = 'script';
  
  if (f.fbq) return;
  
  const n: any = f.fbq = function() {
    n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments);
  };
  
  if (!f._fbq) f._fbq = n;
  n.push = n;
  n.loaded = true;
  n.version = '2.0';
  n.queue = [];
  
  const t = b.createElement(e) as HTMLScriptElement;
  t.async = true;
  t.src = 'https://connect.facebook.net/en_US/fbevents.js';
  
  const s = b.getElementsByTagName(e)[0];
  s?.parentNode?.insertBefore(t, s);

  // Initialize with pixel ID
  window.fbq('init', pixelId);
  
  console.log('[FB Pixel] Initialized with ID:', pixelId);
}

// Standard Events
export function trackPageView() {
  if (typeof window !== 'undefined' && window.fbq) {
    window.fbq('track', 'PageView');
    console.log('[FB Pixel] PageView tracked');
  }
}

export function trackViewContent(params: {
  content_name?: string;
  content_category?: string;
  content_ids?: string[];
  content_type?: string;
  value?: number;
  currency?: string;
}) {
  if (typeof window !== 'undefined' && window.fbq) {
    window.fbq('track', 'ViewContent', params);
    console.log('[FB Pixel] ViewContent tracked:', params);
  }
}

export function trackLead(params?: {
  content_name?: string;
  content_category?: string;
  value?: number;
  currency?: string;
}) {
  if (typeof window !== 'undefined' && window.fbq) {
    window.fbq('track', 'Lead', params || {});
    console.log('[FB Pixel] Lead tracked:', params);
  }
}

export function trackCompleteRegistration(params?: {
  content_name?: string;
  status?: boolean;
  value?: number;
  currency?: string;
}) {
  if (typeof window !== 'undefined' && window.fbq) {
    window.fbq('track', 'CompleteRegistration', params || {});
    console.log('[FB Pixel] CompleteRegistration tracked:', params);
  }
}

export function trackAddToCart(params: {
  content_ids?: string[];
  content_name?: string;
  content_type?: string;
  value?: number;
  currency?: string;
}) {
  if (typeof window !== 'undefined' && window.fbq) {
    window.fbq('track', 'AddToCart', params);
    console.log('[FB Pixel] AddToCart tracked:', params);
  }
}

export function trackPurchase(params: {
  content_ids?: string[];
  content_name?: string;
  content_type?: string;
  value: number;
  currency: string;
  num_items?: number;
}) {
  if (typeof window !== 'undefined' && window.fbq) {
    window.fbq('track', 'Purchase', params);
    console.log('[FB Pixel] Purchase tracked:', params);
  }
}

export function trackInitiateCheckout(params?: {
  content_ids?: string[];
  content_name?: string;
  content_type?: string;
  value?: number;
  currency?: string;
  num_items?: number;
}) {
  if (typeof window !== 'undefined' && window.fbq) {
    window.fbq('track', 'InitiateCheckout', params || {});
    console.log('[FB Pixel] InitiateCheckout tracked:', params);
  }
}

export function trackSearch(params?: {
  search_string?: string;
  content_category?: string;
  content_ids?: string[];
  value?: number;
  currency?: string;
}) {
  if (typeof window !== 'undefined' && window.fbq) {
    window.fbq('track', 'Search', params || {});
    console.log('[FB Pixel] Search tracked:', params);
  }
}

// Custom Events
export function trackCustomEvent(eventName: string, params?: Record<string, any>) {
  if (typeof window !== 'undefined' && window.fbq) {
    window.fbq('trackCustom', eventName, params || {});
    console.log('[FB Pixel] Custom event tracked:', eventName, params);
  }
}
