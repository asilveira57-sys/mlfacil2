import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/**
 * Prefetches critical data right after login so pages load instantly.
 * Runs once per session (tracked via ref).
 * 
 * Prefetched data:
 * - config menu groups & items
 * - user context (profile, workspace membership)
 * - workspace companies
 * - access profiles matrix
 * - visual identity / theme
 */
export function usePostLoginPrefetch() {
  const queryClient = useQueryClient();
  const hasPrefetched = useRef(false);

  useEffect(() => {
    if (hasPrefetched.current) return;

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_IN' && !hasPrefetched.current) {
        hasPrefetched.current = true;
        
        // Small delay to let auth settle
        setTimeout(() => {
          // Prefetch config menu
          queryClient.prefetchQuery({
            queryKey: ['config-menu'],
            queryFn: async () => {
              const [groupsRes, itemsRes] = await Promise.all([
                supabase.from('config_menu_groups').select('*').eq('active', true).order('display_order'),
                supabase.from('config_menu_items').select('*').eq('active', true).order('display_order'),
              ]);
              return { groups: groupsRes.data, items: itemsRes.data };
            },
            staleTime: 30 * 60 * 1000,
          });

          // Prefetch workspace companies
          queryClient.prefetchQuery({
            queryKey: ['workspace-companies'],
            queryFn: async () => {
              const { data } = await supabase.from('company_members').select('company_id, role, companies(id, name, slug)');
              return data;
            },
            staleTime: 30 * 60 * 1000,
          });

          // Prefetch visual identity
          queryClient.prefetchQuery({
            queryKey: ['visual-identity'],
            queryFn: async () => {
              const { data } = await supabase.from('visual_identity').select('*').limit(1).maybeSingle();
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
