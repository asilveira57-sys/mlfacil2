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
      const { sellerId } = event.detail;
      
      if (import.meta.env.DEV) {
        console.info('[Cache] Account changed, invalidating queries for seller:', sellerId);
      }

      // Invalidate all account-specific query caches
      // This forces a refetch with the new account's data
      queryClient.invalidateQueries({ queryKey: ['post-sale-conversations'] });
      queryClient.invalidateQueries({ queryKey: ['post-sale-conversation'] });
      queryClient.invalidateQueries({ queryKey: ['post-sale-unread-count'] });
      queryClient.invalidateQueries({ queryKey: ['ads'] });
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      queryClient.invalidateQueries({ queryKey: ['costs'] });
      queryClient.invalidateQueries({ queryKey: ['questions'] });
      queryClient.invalidateQueries({ queryKey: ['billing'] });
      
      // Clear specific cached data to prevent showing stale results
      queryClient.removeQueries({ queryKey: ['post-sale-conversations'] });
    };

    // Listen to the custom event dispatched by ActiveAccountContext
    window.addEventListener('active_account_changed', handleAccountChange as EventListener);

    return () => {
      window.removeEventListener('active_account_changed', handleAccountChange as EventListener);
    };
  }, [queryClient]);
}
