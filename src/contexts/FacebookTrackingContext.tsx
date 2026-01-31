/**
 * Facebook Tracking Provider
 * Initializes Pixel and provides tracking context throughout the app
 */

import { createContext, useContext, useEffect, ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import {
  initFacebookPixel,
  trackPageView as pixelPageView,
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

interface FacebookTrackingContextValue {
  isInitialized: boolean;
}

const FacebookTrackingContext = createContext<FacebookTrackingContextValue>({
  isInitialized: false,
});

export function useFacebookTrackingContext() {
  return useContext(FacebookTrackingContext);
}

interface FacebookTrackingProviderProps {
  children: ReactNode;
}

export function FacebookTrackingProvider({ children }: FacebookTrackingProviderProps) {
  const location = useLocation();

  // Initialize Pixel on mount
  useEffect(() => {
    supabase.functions.invoke('facebook-get-pixel-id').then(({ data }) => {
      // Handle standardized response format { ok, data }
      const pixelId = data?.data?.pixelId || data?.pixelId;
      if (pixelId) {
        initFacebookPixel(pixelId);
        // Track initial page view
        pixelPageView();
        getCurrentUserData().then(userData => {
          ConversionAPI.pageView(userData);
        });
      }
    }).catch(err => {
      console.warn('[FB Tracking] Failed to initialize:', err);
    });
  }, []);

  // Track page views on route change
  useEffect(() => {
    pixelPageView();
    getCurrentUserData().then(userData => {
      ConversionAPI.pageView(userData, { page_path: location.pathname });
    });
  }, [location.pathname]);

  return (
    <FacebookTrackingContext.Provider value={{ isInitialized: true }}>
      {children}
    </FacebookTrackingContext.Provider>
  );
}
