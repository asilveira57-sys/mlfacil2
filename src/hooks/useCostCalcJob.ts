import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface CalcJob {
  id: string;
  seller_id: string;
  status: 'queued' | 'running' | 'done' | 'error' | 'cancelled';
  total_orders: number | null;
  processed_orders: number;
  last_error: string | null;
  started_at: string | null;
  finished_at: string | null;
}

interface UseCalcJobOptions {
  sellerId: string | null;
  onComplete?: () => void;
}

export function useCostCalcJob({ sellerId, onComplete }: UseCalcJobOptions) {
  const [job, setJob] = useState<CalcJob | null>(null);
  const [starting, setStarting] = useState(false);
  const pollRef = useRef<NodeJS.Timeout | null>(null);

  const isActive = job?.status === 'queued' || job?.status === 'running';

  const pollJob = useCallback(async (jobId: string) => {
    try {
      // Query the cost_calc_jobs table directly instead of calling edge function
      const { data, error } = await supabase
        .from('cost_calc_jobs')
        .select('*')
        .eq('id', jobId)
        .maybeSingle();

      if (error || !data) return;
      setJob(data as unknown as CalcJob);

      if (data.status === 'done' || data.status === 'error' || data.status === 'cancelled') {
        if (pollRef.current) clearInterval(pollRef.current);
        pollRef.current = null;
        if (data.status === 'done') onComplete?.();
      }
    } catch {
      // silently retry
    }
  }, [onComplete]);

  const startPolling = useCallback((jobId: string) => {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(() => pollJob(jobId), 3000);
    pollJob(jobId);
  }, [pollJob]);

  // Check for active job on mount
  useEffect(() => {
    if (!sellerId) return;
    const checkActive = async () => {
      try {
        const { data, error } = await supabase
          .from('cost_calc_jobs')
          .select('*')
          .eq('seller_id', sellerId)
          .in('status', ['queued', 'running'])
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (error || !data) return;
        if (data.status === 'queued' || data.status === 'running') {
          setJob(data as unknown as CalcJob);
          startPolling(data.id);
        }
      } catch { /* ignore */ }
    };
    checkActive();
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [sellerId, startPolling]);

  const startCalc = useCallback(async (periodDays: number, dateFrom?: string, dateTo?: string) => {
    if (!sellerId) return;
    setStarting(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID || 'rfckrbqwdsejicjlxqdv';
      const baseUrl = `https://${projectId}.supabase.co`;

      const res = await fetch(`${baseUrl}/functions/v1/cost-engine/recalculate`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          seller_id: sellerId,
          period_days: periodDays,
          date_from: dateFrom,
          date_to: dateTo,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        if (data?.job_id) {
          setJob({ ...data, id: data.job_id, processed_orders: 0 } as CalcJob);
          startPolling(data.job_id);
        }
        return data;
      }
    } catch {
      // error
    } finally {
      setStarting(false);
    }
  }, [sellerId, startPolling]);

  const progress = job?.total_orders && job.total_orders > 0
    ? Math.round((job.processed_orders / job.total_orders) * 100)
    : 0;

  return {
    job,
    isActive,
    starting,
    progress,
    startCalc,
  };
}
