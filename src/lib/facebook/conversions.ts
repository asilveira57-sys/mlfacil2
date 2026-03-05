/**
 * Facebook Conversion API Client
 * Sends server-side events via edge function
 */

import { supabase } from '@/integrations/supabase/client';

// User data interface for advanced matching
export interface FacebookUserData {
  email?: string;
  phone?: string;
  firstName?: string;
  lastName?: string;
  city?: string;
  state?: string;
  country?: string;
  zipCode?: string;
  externalId?: string;
  clientIpAddress?: string;
  clientUserAgent?: string;
  fbc?: string; // Facebook Click ID
  fbp?: string; // Facebook Browser ID
}

// Event data interface
export interface FacebookEventData {
  eventName: string;
  eventTime?: number;
  eventSourceUrl?: string;
  actionSource?: 'website' | 'app' | 'email' | 'phone_call' | 'chat' | 'physical_store' | 'system_generated' | 'other';
  userData?: FacebookUserData;
  customData?: Record<string, any>;
}

// Get Facebook cookies from browser
function getFacebookCookies(): { fbc?: string; fbp?: string } {
  if (typeof document === 'undefined') return {};
  
  const cookies = document.cookie.split(';').reduce((acc, cookie) => {
    const [key, value] = cookie.trim().split('=');
    acc[key] = value;
    return acc;
  }, {} as Record<string, string>);
  
  return {
    fbc: cookies['_fbc'],
    fbp: cookies['_fbp'],
  };
}

// Send event to Conversion API via edge function
export async function sendConversionEvent(event: FacebookEventData): Promise<boolean> {
  try {
    const { fbc, fbp } = getFacebookCookies();
    
    const enrichedEvent: FacebookEventData = {
      ...event,
      eventTime: event.eventTime || Math.floor(Date.now() / 1000),
      eventSourceUrl: event.eventSourceUrl || (typeof window !== 'undefined' ? window.location.href : undefined),
      actionSource: event.actionSource || 'website',
      userData: {
        ...event.userData,
        fbc: event.userData?.fbc || fbc,
        fbp: event.userData?.fbp || fbp,
        clientUserAgent: event.userData?.clientUserAgent || (typeof navigator !== 'undefined' ? navigator.userAgent : undefined),
      },
    };

    const { data, error } = await supabase.functions.invoke('facebook-conversions', {
      body: { event: enrichedEvent },
    });

    if (error) {
      // Facebook tracking is non-critical — silently ignore ALL errors
      console.warn('[FB CAPI] Edge function error (non-critical), skipping');
      return false;
    }

    console.log('[FB CAPI] Event sent successfully:', event.eventName, data);
    return true;
  } catch (error) {
    // Facebook tracking is non-critical — silently ignore ALL errors
    console.warn('[FB CAPI] Exception (non-critical), skipping');
    return false;
  }
}

// Purchase custom data type (value and currency are required)
interface PurchaseCustomData {
  content_ids?: string[];
  content_name?: string;
  content_type?: string;
  value: number;
  currency: string;
  num_items?: number;
}

// Convenience methods for standard events
export const ConversionAPI = {
  pageView: (userData?: FacebookUserData, customData?: Record<string, any>) =>
    sendConversionEvent({ eventName: 'PageView', userData, customData }),

  viewContent: (userData?: FacebookUserData, customData?: { content_ids?: string[]; content_name?: string; content_category?: string; value?: number; currency?: string }) =>
    sendConversionEvent({ eventName: 'ViewContent', userData, customData }),

  lead: (userData?: FacebookUserData, customData?: { content_name?: string; content_category?: string; value?: number; currency?: string }) =>
    sendConversionEvent({ eventName: 'Lead', userData, customData }),

  completeRegistration: (userData?: FacebookUserData, customData?: { content_name?: string; status?: boolean; value?: number; currency?: string }) =>
    sendConversionEvent({ eventName: 'CompleteRegistration', userData, customData }),

  addToCart: (userData?: FacebookUserData, customData?: { content_ids?: string[]; content_name?: string; content_type?: string; value?: number; currency?: string }) =>
    sendConversionEvent({ eventName: 'AddToCart', userData, customData }),

  purchase: (userData: FacebookUserData | undefined, customData: PurchaseCustomData) =>
    sendConversionEvent({ eventName: 'Purchase', userData, customData }),

  initiateCheckout: (userData?: FacebookUserData, customData?: { content_ids?: string[]; content_name?: string; content_type?: string; value?: number; currency?: string; num_items?: number }) =>
    sendConversionEvent({ eventName: 'InitiateCheckout', userData, customData }),

  search: (userData?: FacebookUserData, customData?: { search_string?: string; content_category?: string; content_ids?: string[]; value?: number; currency?: string }) =>
    sendConversionEvent({ eventName: 'Search', userData, customData }),

  custom: (eventName: string, userData?: FacebookUserData, customData?: Record<string, any>) =>
    sendConversionEvent({ eventName, userData, customData }),
};
