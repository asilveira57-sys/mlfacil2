import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';

/**
 * Module-level cache for user ID.
 * This prevents redundant network calls to supabase.auth.getUser() across components.
 * The cache is shared between all instances of useCurrentUserId hook.
 */
let cachedUserId: string | null = null;
let fetchPromise: Promise<string | null> | null = null;
let isInitialized = false;

/**
 * Hook to get the current authenticated user's ID.
 * 
 * Uses a shared module-level cache to prevent multiple components
 * from making redundant auth calls during mount/navigation.
 * 
 * This hook is designed to be STABLE and prevent re-renders from:
 * - Tab focus/blur events
 * - Token refresh events
 * - Navigation between pages
 * 
 * @returns The user ID if authenticated, null otherwise
 */
export function useCurrentUserId(): string | null {
  const [userId, setUserId] = useState<string | null>(cachedUserId);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;

    // If already cached, use it immediately
    if (cachedUserId !== null && isInitialized) {
      if (userId !== cachedUserId) {
        setUserId(cachedUserId);
      }
      return;
    }

    // If a fetch is already in progress, wait for it
    if (fetchPromise) {
      fetchPromise.then((id) => {
        if (mountedRef.current && userId !== id) {
          setUserId(id);
        }
      });
      return;
    }

    // Start the fetch (only once across all components)
    fetchPromise = supabase.auth.getUser()
      .then(({ data }) => {
        const id = data.user?.id || null;
        cachedUserId = id;
        isInitialized = true;
        return id;
      })
      .catch((error) => {
        console.error('[useCurrentUserId] Error fetching user:', error);
        isInitialized = true;
        return null;
      });

    fetchPromise.then((id) => {
      if (mountedRef.current) {
        setUserId(id);
      }
    });

    return () => {
      mountedRef.current = false;
    };
  }, [userId]);

  // Listen for auth state changes (logout only)
  // CRITICAL: Only react to SIGNED_OUT, not SIGNED_IN or TOKEN_REFRESHED
  // to prevent cascading re-renders on tab switch
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') {
        // Clear cache on logout
        cachedUserId = null;
        fetchPromise = null;
        isInitialized = false;
        if (mountedRef.current) {
          setUserId(null);
        }
      }
      // SIGNED_IN and TOKEN_REFRESHED are intentionally ignored
      // The initial fetch handles the login case
    });

    return () => subscription.unsubscribe();
  }, []);

  return userId;
}

/**
 * Imperatively clear the user ID cache.
 * Useful when you know the user has logged out from outside React.
 */
export function clearUserIdCache(): void {
  cachedUserId = null;
  fetchPromise = null;
  isInitialized = false;
}

/**
 * Get the cached user ID synchronously (if available).
 * Returns null if not yet fetched or user is not authenticated.
 */
export function getCachedUserId(): string | null {
  return cachedUserId;
}
