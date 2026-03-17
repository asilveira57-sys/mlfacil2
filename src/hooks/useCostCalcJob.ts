import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';

const POLL_INTERVAL_MS = 3000;
const STALE_JOB_TIMEOUT_MS = 20 * 60 * 1000; // 20 minutes without heartbeat/progress

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

type CalcJobRow = CalcJob & {
  created_at?: string | null;
  updated_at?: string | null;
  last_heartbeat?: string | null;
};

interface UseCalcJobOptions {
  sellerId: string | null;
  onComplete?: () => void;
}

function getReferenceTimestamp(job: Partial<CalcJobRow>): number | null {
  const ref = job.last_heartbeat || job.started_at || job.updated_at || job.created_at;
  if (!ref) return null;
  const ts = new Date(ref).getTime();
  return Number.isFinite(ts) ? ts : null;
}

function isStaleJob(job: Partial<CalcJobRow>): boolean {
  const referenceTs = getReferenceTimestamp(job);
  if (!referenceTs) return false;
  return Date.now() - referenceTs > STALE_JOB_TIMEOUT_MS;
}

export function useCostCalcJob({ sellerId, onComplete }: UseCalcJobOptions) {
  const [job, setJob] = useState<CalcJob | null>(null);
  const [starting, setStarting] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const isActive = job?.status === 'queued' || job?.status === 'running';

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const cancelStaleJob = useCallback(async (jobId: string) => {
    await supabase
      .from('cost_calc_jobs')
      .update({
        status: 'cancelled',
        last_error: 'Job cancelado automaticamente por inatividade prolongada.',
      } as never)
      .eq('id', jobId)
      .in('status', ['queued', 'running']);
  }, []);

  const pollJob = useCallback(async (jobId: string) => {
    try {
      const { data, error } = await supabase
        .from('cost_calc_jobs')
        .select('*')
        .eq('id', jobId)
        .maybeSingle();

      if (error || !data) return;

      const jobData = data as unknown as CalcJobRow;

      if ((jobData.status === 'queued' || jobData.status === 'running') && isStaleJob(jobData)) {
        await cancelStaleJob(jobData.id);
        setJob({
          ...jobData,
          status: 'cancelled',
          last_error: jobData.last_error || 'Job cancelado automaticamente por inatividade prolongada.',
        } as CalcJob);
        stopPolling();
        return;
      }

      setJob(jobData as CalcJob);

      if (jobData.status === 'done' || jobData.status === 'error' || jobData.status === 'cancelled') {
        stopPolling();
        if (jobData.status === 'done') onComplete?.();
      }
    } catch {
      // silently retry
    }
  }, [cancelStaleJob, onComplete, stopPolling]);

  const startPolling = useCallback((jobId: string) => {
    stopPolling();
    pollRef.current = setInterval(() => pollJob(jobId), POLL_INTERVAL_MS);
    pollJob(jobId);
  }, [pollJob, stopPolling]);

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

        const jobData = data as unknown as CalcJobRow;

        if (isStaleJob(jobData)) {
          await cancelStaleJob(jobData.id);
          setJob({
            ...jobData,
            status: 'cancelled',
            last_error: jobData.last_error || 'Job cancelado automaticamente por inatividade prolongada.',
          } as CalcJob);
          return;
        }

        if (jobData.status === 'queued' || jobData.status === 'running') {
          setJob(jobData as CalcJob);
          startPolling(jobData.id);
        }
      } catch {
        // ignore
      }
    };

    checkActive();

    return () => {
      stopPolling();
    };
  }, [sellerId, startPolling, stopPolling, cancelStaleJob]);

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
