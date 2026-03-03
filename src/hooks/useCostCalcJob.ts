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
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/cost-engine/calc-job-status?job_id=${jobId}`,
        { headers: { Authorization: `Bearer ${session.access_token}` } }
      );
      if (!res.ok) return;
      const data = await res.json();
      setJob(data);

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
    pollJob(jobId); // immediate first poll
  }, [pollJob]);

  // Check for active job on mount
  useEffect(() => {
    if (!sellerId) return;
    const checkActive = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return;
        const res = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/cost-engine/calc-job-status?seller_id=${sellerId}`,
          { headers: { Authorization: `Bearer ${session.access_token}` } }
        );
        if (!res.ok) return;
        const data = await res.json();
        if (data?.id && (data.status === 'queued' || data.status === 'running')) {
          setJob(data);
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

      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/cost-engine/recalculate`,
        {
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
        }
      );

      if (res.ok) {
        const data = await res.json();
        if (data.job_id) {
          setJob({ ...data, id: data.job_id, processed_orders: 0 });
          startPolling(data.job_id);
        } else {
          setJob(null);
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
