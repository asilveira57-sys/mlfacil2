import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';

/**
 * Hook that listens to account changes and invalidates relevant query caches.
 * This ensures that when switching accounts, stale data from the previous account
 * is cleared and fresh data for the new account is fetched.
 * 
 * Usage: Call this hook once at app root level (e.g., in App.tsx or a layout component)
 */
export function useAccountChangeInvalidation() {
  const queryClient = useQueryClient();

  useEffect(() => {
    const handleAccountChange = (event: CustomEvent<{ accountId: string; sellerId: string }>) => {
      if (import.meta.env.DEV) {
        console.info('[Cache] Account changed, invalidating ALL queries');
      }

      // Invalidate everything — account change means all data is stale
      queryClient.invalidateQueries();
      
      // Dispatch event to clear local sales cache (useSalesDataCache)
      window.dispatchEvent(new CustomEvent('clear_sales_cache'));
    };

    // Listen to the custom event dispatched by ActiveAccountContext
    window.addEventListener('active_account_changed', handleAccountChange as EventListener);

    return () => {
      window.removeEventListener('active_account_changed', handleAccountChange as EventListener);
    };
  }, [queryClient]);
}
