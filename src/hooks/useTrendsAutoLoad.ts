import { useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

// Key for persisting last category selection
const LAST_CATEGORY_KEY = 'trends_last_category';

interface LastCategorySelection {
  accountId: string;
  categoryId: string;
  categoryName: string;
  timestamp: number;
}

export function useTrendsAutoLoad() {
  const hasAutoLoadedRef = useRef(false);
  const accountIdRef = useRef<string | null>(null);

  // Save last category selection
  const saveLastCategory = useCallback((accountId: string, categoryId: string, categoryName: string) => {
    try {
      const selection: LastCategorySelection = {
        accountId,
        categoryId,
        categoryName,
        timestamp: Date.now(),
      };
      localStorage.setItem(`${LAST_CATEGORY_KEY}_${accountId}`, JSON.stringify(selection));
    } catch (e) {
      console.warn('[useTrendsAutoLoad] Failed to save last category:', e);
    }
  }, []);

  // Get last category selection
  const getLastCategory = useCallback((accountId: string): LastCategorySelection | null => {
    try {
      const stored = localStorage.getItem(`${LAST_CATEGORY_KEY}_${accountId}`);
      if (!stored) return null;
      
      const selection = JSON.parse(stored) as LastCategorySelection;
      
      // Check if selection is still valid (within 7 days)
      const maxAge = 7 * 24 * 60 * 60 * 1000;
      if (Date.now() - selection.timestamp > maxAge) {
        localStorage.removeItem(`${LAST_CATEGORY_KEY}_${accountId}`);
        return null;
      }
      
      return selection;
    } catch (e) {
      console.warn('[useTrendsAutoLoad] Failed to get last category:', e);
      return null;
    }
  }, []);

  // Reset auto-load flag when account changes
  const resetForAccount = useCallback((accountId: string | null) => {
    if (accountId !== accountIdRef.current) {
      hasAutoLoadedRef.current = false;
      accountIdRef.current = accountId;
    }
  }, []);

  // Mark as auto-loaded
  const markAutoLoaded = useCallback(() => {
    hasAutoLoadedRef.current = true;
  }, []);

  // Check if should auto-load
  const shouldAutoLoad = useCallback(() => {
    return !hasAutoLoadedRef.current;
  }, []);

  return {
    saveLastCategory,
    getLastCategory,
    resetForAccount,
    markAutoLoaded,
    shouldAutoLoad,
  };
}
