import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface TrendsStatus {
  id: string;
  last_run_at: string | null;
  last_success_at: string | null;
  last_partial_at: string | null;
  last_failed_at: string | null;
  coverage_keywords: number;
  coverage_highlights: number;
  total_categories: number;
  next_run_at: string | null;
  updated_at: string | null;
}

export function useTrendsStatus() {
  return useQuery({
    queryKey: ['public-trends-status'],
    queryFn: async (): Promise<TrendsStatus | null> => {
      const { data, error } = await supabase
        .from('public_trends_status')
        .select('*')
        .eq('id', 'main')
        .maybeSingle();

      if (error) {
        console.error('[useTrendsStatus] Error:', error);
        return null;
      }

      return data as TrendsStatus | null;
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
    // DISABLED: Static mode - no polling. Use manual refresh button instead.
    // refetchInterval: 5 * 60 * 1000,
  });
}

export function usePublicCategories() {
  return useQuery({
    queryKey: ['public-categories'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('public_categories')
        .select('id, name, is_active, priority')
        .eq('is_active', true)
        .order('priority', { ascending: true });

      if (error) {
        console.error('[usePublicCategories] Error:', error);
        return [];
      }

      return data || [];
    },
    staleTime: 10 * 60 * 1000, // 10 minutes
  });
}
