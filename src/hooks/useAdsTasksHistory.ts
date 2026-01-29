import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { Task } from '@/types/tasks';

interface AdsTaskStats {
  total: number;
  pending: number;
  inProgress: number;
  completed: number;
  violations: number;
  opportunities: number;
}

export function useAdsTasksHistory(sellerId?: string, workspaceId?: string) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [stats, setStats] = useState<AdsTaskStats>({
    total: 0,
    pending: 0,
    inProgress: 0,
    completed: 0,
    violations: 0,
    opportunities: 0,
  });
  const [loading, setLoading] = useState(true);

  const fetchTasks = useCallback(async () => {
    if (!workspaceId) {
      setTasks([]);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);

      // Fetch tasks with source_type = 'ads'
      const { data, error } = await supabase
        .from('tasks')
        .select('*')
        .eq('workspace_id', workspaceId)
        .eq('source_type', 'ads')
        .order('created_at', { ascending: false });

      if (error) throw error;

      const taskList = (data || []) as Task[];
      setTasks(taskList);

      // Calculate stats
      const newStats: AdsTaskStats = {
        total: taskList.length,
        pending: taskList.filter(t => t.status === 'todo').length,
        inProgress: taskList.filter(t => t.status === 'doing').length,
        completed: taskList.filter(t => t.status === 'done').length,
        violations: taskList.filter(t => 
          (t.source_ref as Record<string, unknown>)?.rule_type === 'violation'
        ).length,
        opportunities: taskList.filter(t => 
          (t.source_ref as Record<string, unknown>)?.rule_type === 'opportunity'
        ).length,
      };
      setStats(newStats);
    } catch (err) {
      console.error('[useAdsTasksHistory] Error:', err);
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);

  // DISABLED: Realtime subscription disabled in static mode
  // Data only updates on manual refresh or page reload
  // useEffect(() => {
  //   if (!workspaceId) return;
  //
  //   const channel = supabase
  //     .channel(`ads-tasks-${workspaceId}`)
  //     .on('postgres_changes', {
  //       event: '*',
  //       schema: 'public',
  //       table: 'tasks',
  //       filter: `workspace_id=eq.${workspaceId}`,
  //     }, (payload) => {
  //       // Only refetch if it's an ADS task
  //       const task = payload.new as Task;
  //       if (task?.source_type === 'ads') {
  //         fetchTasks();
  //       }
  //     })
  //     .subscribe();
  //
  //   return () => { supabase.removeChannel(channel); };
  // }, [workspaceId, fetchTasks]);

  return { tasks, stats, loading, refetch: fetchTasks };
}
