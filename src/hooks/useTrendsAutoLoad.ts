import { useRef, useCallback } from 'react';
import { useTrendsAccountCache } from './useTrendsAccountCache';

/**
 * Auto-load hook for Tendências module
 * 
 * Uses ACCOUNT-SPECIFIC cache (keyed by account_id) for:
 * - Last selected category per account
 * - Auto-load state management
 * 
 * This data is isolated per seller and should NOT be shared globally.
 */

export function useTrendsAutoLoad() {
  const hasAutoLoadedRef = useRef(false);
  const accountIdRef = useRef<string | null>(null);
  const accountCache = useTrendsAccountCache();

  // Save last category selection (ACCOUNT-SPECIFIC cache)
  const saveLastCategory = useCallback((accountId: string, categoryId: string, categoryName: string) => {
    accountCache.setLastSelection(accountId, categoryId, categoryName);
  }, [accountCache]);

  // Get last category selection (ACCOUNT-SPECIFIC cache)
  const getLastCategory = useCallback((accountId: string): { categoryId: string; categoryName: string } | null => {
    const cached = accountCache.getLastSelection(accountId);
    if (cached) {
      return {
        categoryId: cached.category_id,
        categoryName: cached.category_name,
      };
    }
    return null;
  }, [accountCache]);

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
