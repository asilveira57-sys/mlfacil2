import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface QueueJob {
  id: string;
  tenant_id: string | null;
  seller_id: string;
  job_type: string;
  payload: Record<string, unknown>;
  status: string;
  priority: string;
  attempts: number;
  max_attempts: number;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
  duration_ms: number | null;
  error_message: string | null;
}

export interface QueueStats {
  pending: number;
  processing: number;
  done: number;
  error: number;
  avgDurationMs: number;
}

export function useProcessingQueue(sellerId?: string | null) {
  const [jobs, setJobs] = useState<QueueJob[]>([]);
  const [stats, setStats] = useState<QueueStats>({ pending: 0, processing: 0, done: 0, error: 0, avgDurationMs: 0 });
  const [loading, setLoading] = useState(true);

  const fetchJobs = useCallback(async () => {
    try {
      let query = supabase
        .from('processing_queue')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);

      if (sellerId) {
        query = query.eq('seller_id', sellerId);
      }

      const { data, error } = await query;
      if (error) throw error;

      const typed = (data || []) as unknown as QueueJob[];
      setJobs(typed);

      const pending = typed.filter(j => j.status === 'pending').length;
      const processing = typed.filter(j => j.status === 'processing').length;
      const done = typed.filter(j => j.status === 'done').length;
      const errCount = typed.filter(j => j.status === 'error').length;
      const completed = typed.filter(j => j.duration_ms && j.duration_ms > 0);
      const avgMs = completed.length > 0
        ? Math.round(completed.reduce((s, j) => s + (j.duration_ms || 0), 0) / completed.length)
        : 0;

      setStats({ pending, processing, done, error: errCount, avgDurationMs: avgMs });
    } catch (err) {
      console.error('[useProcessingQueue] Error:', err);
    } finally {
      setLoading(false);
    }
  }, [sellerId]);

  useEffect(() => {
    fetchJobs();
  }, [fetchJobs]);

  const enqueueJob = useCallback(async (
    jobType: string,
    targetSellerId: string,
    payload: Record<string, unknown> = {},
    priority: 'low' | 'normal' | 'high' = 'normal'
  ) => {
    const { error } = await supabase
      .from('processing_queue')
      .insert({
        seller_id: targetSellerId,
        job_type: jobType,
        payload,
        priority,
        status: 'pending',
      } as never);

    if (error) throw error;
    await fetchJobs();
  }, [fetchJobs]);

  return { jobs, stats, loading, refetch: fetchJobs, enqueueJob };
}
