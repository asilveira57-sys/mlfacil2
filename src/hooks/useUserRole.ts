import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';

export type AppRole = 'admin' | 'seller';

interface UseUserRoleResult {
  role: AppRole;
  isAdmin: boolean;
  isSeller: boolean;
  loading: boolean;
  userId: string | null;
}

/**
 * Hook to fetch and manage the current user's role.
 * Uses the get_user_role database function for security.
 * Returns 'seller' as default if no role is assigned.
 */
export function useUserRole(): UseUserRoleResult {
  const [role, setRole] = useState<AppRole>('seller');
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  // Track if initial load completed - after that, refetches are silent
  const initialLoadDoneRef = useRef(false);

  useEffect(() => {
    let isMounted = true;

    const fetchRole = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        
        if (!user) {
          if (isMounted) {
            setRole('seller');
            setUserId(null);
            setLoading(false);
            initialLoadDoneRef.current = true;
          }
          return;
        }

        if (isMounted) {
          setUserId(user.id);
        }

        // Call the security definer function to get role
        const { data, error } = await supabase.rpc('get_user_role', {
          _user_id: user.id
        });

        if (error) {
          console.error('[useUserRole] Error fetching role:', error);
          if (isMounted) {
            setRole('seller');
            setLoading(false);
            initialLoadDoneRef.current = true;
          }
          return;
        }

        if (isMounted) {
          setRole((data as AppRole) || 'seller');
          setLoading(false);
          initialLoadDoneRef.current = true;
        }
      } catch (error) {
        console.error('[useUserRole] Unexpected error:', error);
        if (isMounted) {
          setRole('seller');
          setLoading(false);
          initialLoadDoneRef.current = true;
        }
      }
    };

    fetchRole();

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') {
        if (isMounted) {
          setRole('seller');
          setUserId(null);
          setLoading(false);
        }
      } else if (event === 'SIGNED_IN') {
        // CRITICAL: Only show loading on initial load, not on background refetches
        // This prevents the "flash" when switching browser tabs
        if (!initialLoadDoneRef.current) {
          setLoading(true);
        }
        fetchRole();
      }
      // Ignore TOKEN_REFRESHED and INITIAL_SESSION to prevent tab-switch flicker
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  return {
    role,
    isAdmin: role === 'admin',
    isSeller: role === 'seller',
    loading,
    userId
  };
}
