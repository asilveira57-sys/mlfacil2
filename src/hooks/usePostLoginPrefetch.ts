import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { fetchConfigMenuItems } from '@/hooks/useConfigMenu';

/**
 * Prefetches critical data right after login so pages load instantly.
 * Runs once per session (tracked via ref).
 */
export function usePostLoginPrefetch() {
  const queryClient = useQueryClient();
  const hasPrefetched = useRef(false);

  useEffect(() => {
    if (hasPrefetched.current) return;

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_IN' && !hasPrefetched.current) {
        hasPrefetched.current = true;
        
        setTimeout(() => {
          // Prefetch config menu — uses the SAME queryFn as useConfigMenu
          queryClient.prefetchQuery({
            queryKey: ['config-menu'],
            queryFn: fetchConfigMenuItems,
            staleTime: 30 * 60 * 1000,
          });

          // Prefetch workspace companies
          queryClient.prefetchQuery({
            queryKey: ['workspace-companies'],
            queryFn: async () => {
              const { data } = await (supabase as any).from('company_members').select('company_id, role, companies(id, name, slug)');
              return data;
            },
            staleTime: 30 * 60 * 1000,
          });

          // Prefetch visual identity
          queryClient.prefetchQuery({
            queryKey: ['visual-identity'],
            queryFn: async () => {
              const { data } = await (supabase as any).from('visual_identity').select('*').limit(1).maybeSingle();
              return data;
            },
            staleTime: 30 * 60 * 1000,
          });

          if (import.meta.env.DEV) {
            console.info('[Prefetch] Post-login prefetch triggered');
          }
        }, 300);
      }
    });

    return () => subscription.unsubscribe();
  }, [queryClient]);
}
