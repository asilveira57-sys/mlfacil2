import { useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useCurrentUserId } from '@/hooks/useCurrentUserId';
import { ExplanatoryCardGate } from './ExplanatoryCardGate';

/**
 * Global gate that automatically resolves the current route to a module_slug
 * via system_modules and renders the ExplanatoryCardGate if applicable.
 * Place this inside the shell layout to avoid modifying every page.
 */
export function GlobalExplanatoryCardGate() {
  const location = useLocation();
  const userId = useCurrentUserId();

  // Fetch route → module_slug mapping once
  const { data: routeMap } = useQuery({
    queryKey: ['system-modules-route-map'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('system_modules')
        .select('key, route')
        .eq('is_active', true)
        .not('route', 'is', null);
      if (error) throw error;
      const map: Record<string, string> = {};
      for (const m of data ?? []) {
        if (m.route) map[m.route] = m.key;
      }
      return map;
    },
    staleTime: 10 * 60 * 1000,
  });

  if (!userId || !routeMap) return null;

  // Find matching module_slug for current path
  const moduleSlug = routeMap[location.pathname];
  if (!moduleSlug) return null;

  // Render as an overlay (no children wrapping needed)
  return <ExplanatoryCardGate moduleSlug={moduleSlug}><span /></ExplanatoryCardGate>;
}
