import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface PromotionSyncLog {
  id: string;
  workspace_id: string;
  account_id: string;
  started_at: string;
  ended_at: string | null;
  status: 'running' | 'success' | 'error' | 'partial';
  promotions_fetched: number | null;
  promotions_synced: number | null;
  items_synced: number | null;
  events_created: number | null;
  error_message: string | null;
  sync_source: 'manual' | 'scheduled' | 'webhook';
  duration_ms: number | null;
  created_at: string;
}

export function usePromotionSyncLogs(workspaceId: string | null, sellerId: string | null) {
  const [logs, setLogs] = useState<PromotionSyncLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastSync, setLastSync] = useState<PromotionSyncLog | null>(null);

  const fetchLogs = useCallback(async () => {
    if (!workspaceId || !sellerId) {
      setLogs([]);
      setLastSync(null);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      
      const { data, error } = await supabase
        .from('promotion_sync_logs')
        .select('*')
        .eq('workspace_id', workspaceId)
        .eq('account_id', sellerId)
        .order('started_at', { ascending: false });

      if (error) throw error;

      const typedLogs = (data || []) as unknown as PromotionSyncLog[];
      setLogs(typedLogs);
      setLastSync(typedLogs[0] || null);
    } catch (err) {
      console.error('[usePromotionSyncLogs] Error:', err);
    } finally {
      setLoading(false);
    }
  }, [workspaceId, sellerId]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  return { logs, lastSync, loading, refetch: fetchLogs };
}
