/**
 * Facebook Tracking Hook
 * Unified interface for Pixel + Conversion API tracking
 */

import { useEffect, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import {
  initFacebookPixel,
  trackPageView as pixelPageView,
  trackViewContent as pixelViewContent,
  trackLead as pixelLead,
  trackCompleteRegistration as pixelCompleteRegistration,
  trackAddToCart as pixelAddToCart,
  trackPurchase as pixelPurchase,
  trackInitiateCheckout as pixelInitiateCheckout,
  trackSearch as pixelSearch,
  trackCustomEvent as pixelCustomEvent,
} from '@/lib/facebook/pixel';
import { ConversionAPI, FacebookUserData } from '@/lib/facebook/conversions';

// Get current user data for enhanced matching
async function getCurrentUserData(): Promise<FacebookUserData | undefined> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return undefined;

    return {
      email: user.email,
      externalId: user.id,
    };
  } catch {
    return undefined;
  }
}

export function useFacebookTracking() {
  const location = useLocation();

  // Initialize Pixel on mount
  useEffect(() => {
    // Fetch pixel ID from edge function (stored in secrets)
    supabase.functions.invoke('facebook-get-pixel-id').then(({ data }) => {
      if (data?.pixelId) {
        initFacebookPixel(data.pixelId);
        // Track initial page view
        pixelPageView();
        getCurrentUserData().then(userData => {
          ConversionAPI.pageView(userData);
        });
      }
    }).catch(console.error);
  }, []);

  // Track page views on route change
  useEffect(() => {
    pixelPageView();
    getCurrentUserData().then(userData => {
      ConversionAPI.pageView(userData, { page_path: location.pathname });
    });
  }, [location.pathname]);

  // Unified tracking methods (Pixel + CAPI)
  const trackViewContent = useCallback(async (params: {
    content_name?: string;
    content_category?: string;
    content_ids?: string[];
    content_type?: string;
    value?: number;
    currency?: string;
  }) => {
    pixelViewContent(params);
    const userData = await getCurrentUserData();
    await ConversionAPI.viewContent(userData, params);
  }, []);

  const trackLead = useCallback(async (params?: {
    content_name?: string;
    content_category?: string;
    value?: number;
    currency?: string;
  }) => {
    pixelLead(params);
    const userData = await getCurrentUserData();
    await ConversionAPI.lead(userData, params);
  }, []);

  const trackCompleteRegistration = useCallback(async (params?: {
    content_name?: string;
    status?: boolean;
    value?: number;
    currency?: string;
  }) => {
    pixelCompleteRegistration(params);
    const userData = await getCurrentUserData();
    await ConversionAPI.completeRegistration(userData, params);
  }, []);

  const trackAddToCart = useCallback(async (params: {
    content_ids?: string[];
    content_name?: string;
    content_type?: string;
    value?: number;
    currency?: string;
  }) => {
    pixelAddToCart(params);
    const userData = await getCurrentUserData();
    await ConversionAPI.addToCart(userData, params);
  }, []);

  const trackPurchase = useCallback(async (params: {
    content_ids?: string[];
    content_name?: string;
    content_type?: string;
    value: number;
    currency: string;
    num_items?: number;
  }) => {
    pixelPurchase(params);
    const userData = await getCurrentUserData();
    await ConversionAPI.purchase(userData, params);
  }, []);

  const trackInitiateCheckout = useCallback(async (params?: {
    content_ids?: string[];
    content_name?: string;
    content_type?: string;
    value?: number;
    currency?: string;
    num_items?: number;
  }) => {
    pixelInitiateCheckout(params);
    const userData = await getCurrentUserData();
    await ConversionAPI.initiateCheckout(userData, params);
  }, []);

  const trackSearch = useCallback(async (params?: {
    search_string?: string;
    content_category?: string;
    content_ids?: string[];
    value?: number;
    currency?: string;
  }) => {
    pixelSearch(params);
    const userData = await getCurrentUserData();
    await ConversionAPI.search(userData, params);
  }, []);

  const trackCustomEvent = useCallback(async (eventName: string, params?: Record<string, any>) => {
    pixelCustomEvent(eventName, params);
    const userData = await getCurrentUserData();
    await ConversionAPI.custom(eventName, userData, params);
  }, []);

  return {
    trackViewContent,
    trackLead,
    trackCompleteRegistration,
    trackAddToCart,
    trackPurchase,
    trackInitiateCheckout,
    trackSearch,
    trackCustomEvent,
  };
}
