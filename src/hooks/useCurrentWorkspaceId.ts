import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/**
 * Hook to resolve the current user's active workspace ID.
 * Resolution order:
 * 1. user_preferences.active_workspace_id
 * 2. First workspace_id from workspace_members
 */
export function useCurrentWorkspaceId() {
  return useQuery({
    queryKey: ['current-workspace-id'],
    queryFn: async () => {
      const { data: authData } = await supabase.auth.getUser();
      const userId = authData?.user?.id;
      
      if (!userId) {
        return null;
      }

      // Try user_preferences first
      const { data: prefs } = await supabase
        .from('user_preferences')
        .select('active_workspace_id')
        .eq('user_id', userId)
        .maybeSingle();

      if ((prefs as any)?.active_workspace_id) {
        return (prefs as any).active_workspace_id as string;
      }

      // Fallback to first workspace membership
      const { data: member } = await supabase
        .from('workspace_members')
        .select('workspace_id')
        .eq('user_id', userId)
        .limit(1)
        .maybeSingle();

      return (member as any)?.workspace_id as string | null;
    },
    staleTime: 30 * 60 * 1000, // 30 minutes
    gcTime: 60 * 60 * 1000, // 60 minutes
  });
}
