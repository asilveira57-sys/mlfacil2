import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface SyncSchedulerStatus {
  nightlyLastRun: Date | null;
  hourlyLastRun: Date | null;
  nightlyStatus: string;
  hourlyStatus: string;
  isLoading: boolean;
}

/**
 * Hook to fetch sync scheduler status for displaying last sync time
 */
export function useSyncSchedulerStatus(): SyncSchedulerStatus {
  const [status, setStatus] = useState<SyncSchedulerStatus>({
    nightlyLastRun: null,
    hourlyLastRun: null,
    nightlyStatus: 'idle',
    hourlyStatus: 'idle',
    isLoading: true,
  });

  const fetchStatus = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('sync_scheduler')
        .select('job_name, last_run_at, status')
        .in('job_name', ['orders-nightly-sync', 'orders-hourly-sync']);

      if (error) {
        console.error('[useSyncSchedulerStatus] Error fetching status:', error);
        return;
      }

      const nightlyJob = data?.find(j => j.job_name === 'orders-nightly-sync');
      const hourlyJob = data?.find(j => j.job_name === 'orders-hourly-sync');

      setStatus({
        nightlyLastRun: nightlyJob?.last_run_at ? new Date(nightlyJob.last_run_at) : null,
        hourlyLastRun: hourlyJob?.last_run_at ? new Date(hourlyJob.last_run_at) : null,
        nightlyStatus: nightlyJob?.status || 'idle',
        hourlyStatus: hourlyJob?.status || 'idle',
        isLoading: false,
      });
    } catch (err) {
      console.error('[useSyncSchedulerStatus] Error:', err);
      setStatus(prev => ({ ...prev, isLoading: false }));
    }
  }, []);

  useEffect(() => {
    fetchStatus();
    
    // Refresh every 5 minutes
    const interval = setInterval(fetchStatus, 5 * 60 * 1000);
    
    return () => clearInterval(interval);
  }, [fetchStatus]);

  return status;
}

/**
 * Get the most recent sync time from either nightly or hourly jobs
 */
export function getMostRecentSyncTime(
  nightlyLastRun: Date | null,
  hourlyLastRun: Date | null
): Date | null {
  if (!nightlyLastRun && !hourlyLastRun) return null;
  if (!nightlyLastRun) return hourlyLastRun;
  if (!hourlyLastRun) return nightlyLastRun;
  return nightlyLastRun > hourlyLastRun ? nightlyLastRun : hourlyLastRun;
}

/**
 * Format relative time in Portuguese
 */
export function formatRelativeTime(date: Date | null): string {
  if (!date) return 'Nunca sincronizado';
  
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  
  if (diffMins < 1) return 'Agora mesmo';
  if (diffMins < 60) return `Há ${diffMins} min`;
  if (diffHours < 24) return `Há ${diffHours}h`;
  return `Há ${diffDays} dia${diffDays > 1 ? 's' : ''}`;
}
