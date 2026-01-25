import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { Json } from '@/integrations/supabase/types';
import type { Task, TaskStatus, TaskPriority, TaskChecklist, TaskComment, TaskWatcher } from '@/types/tasks';

interface TaskFilters {
  search?: string;
  status?: TaskStatus[];
  priority?: TaskPriority[];
  assignee_user_id?: string | null;
  account_id?: string | null;
  due_filter?: 'today' | '7days' | 'overdue' | null;
  tags?: string[];
}

interface UseTasksResult {
  tasks: Task[];
  loading: boolean;
  error: string | null;
  filters: TaskFilters;
  setFilters: (filters: TaskFilters) => void;
  createTask: (task: Partial<Task>) => Promise<Task | null>;
  updateTask: (id: string, updates: Partial<Task>) => Promise<boolean>;
  deleteTask: (id: string) => Promise<boolean>;
  bulkUpdateStatus: (ids: string[], status: TaskStatus) => Promise<boolean>;
  bulkUpdateAssignee: (ids: string[], assignee_user_id: string | null) => Promise<boolean>;
  bulkUpdatePriority: (ids: string[], priority: TaskPriority) => Promise<boolean>;
  refetch: () => Promise<void>;
}

export function useTasks(workspaceId: string | null): UseTasksResult {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<TaskFilters>({});

  const fetchTasks = useCallback(async () => {
    if (!workspaceId) {
      setTasks([]);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      let query = supabase
        .from('tasks')
        .select('*')
        .eq('workspace_id', workspaceId)
        .order('created_at', { ascending: false });

      // Apply filters
      if (filters.status && filters.status.length > 0) {
        query = query.in('status', filters.status);
      }

      if (filters.priority && filters.priority.length > 0) {
        query = query.in('priority', filters.priority);
      }

      if (filters.assignee_user_id !== undefined) {
        if (filters.assignee_user_id === null) {
          query = query.is('assignee_user_id', null);
        } else if (filters.assignee_user_id) {
          query = query.eq('assignee_user_id', filters.assignee_user_id);
        }
      }

      if (filters.account_id) {
        query = query.eq('account_id', filters.account_id);
      }

      if (filters.search) {
        query = query.ilike('title', `%${filters.search}%`);
      }

      if (filters.due_filter) {
        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const todayEnd = new Date(today.getTime() + 24 * 60 * 60 * 1000 - 1);
        const in7Days = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000);

        if (filters.due_filter === 'today') {
          query = query.gte('due_at', today.toISOString()).lte('due_at', todayEnd.toISOString());
        } else if (filters.due_filter === '7days') {
          query = query.gte('due_at', today.toISOString()).lte('due_at', in7Days.toISOString());
        } else if (filters.due_filter === 'overdue') {
          query = query.lt('due_at', today.toISOString()).neq('status', 'done');
        }
      }

      if (filters.tags && filters.tags.length > 0) {
        query = query.overlaps('tags', filters.tags);
      }

      const { data, error: fetchError } = await query;

      if (fetchError) throw fetchError;

      setTasks((data as Task[]) || []);
    } catch (err) {
      console.error('[useTasks] Error:', err);
      setError(err instanceof Error ? err.message : 'Erro ao carregar tarefas');
    } finally {
      setLoading(false);
    }
  }, [workspaceId, filters]);

  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);

  // Realtime subscription
  useEffect(() => {
    if (!workspaceId) return;

    const channel = supabase
      .channel(`tasks-${workspaceId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'tasks',
          filter: `workspace_id=eq.${workspaceId}`,
        },
        () => {
          fetchTasks();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [workspaceId, fetchTasks]);

  const createTask = useCallback(async (task: Partial<Task>): Promise<Task | null> => {
    if (!workspaceId) return null;

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Usuário não autenticado');

      const { data, error } = await supabase
        .from('tasks')
        .insert([{
          workspace_id: workspaceId,
          created_by_user_id: user.id,
          title: task.title || 'Nova tarefa',
          description: task.description || null,
          status: task.status || 'todo',
          priority: task.priority || 'medium',
          due_at: task.due_at || null,
          assignee_user_id: task.assignee_user_id || null,
          account_id: task.account_id || null,
          tags: task.tags || [],
          source_type: task.source_type || null,
          source_id: task.source_id || null,
          source_ref: (task.source_ref || null) as Json,
        }])
        .select()
        .single();

      if (error) throw error;

      return data as Task;
    } catch (err) {
      console.error('[useTasks] Create error:', err);
      setError(err instanceof Error ? err.message : 'Erro ao criar tarefa');
      return null;
    }
  }, [workspaceId]);

  const updateTask = useCallback(async (id: string, updates: Partial<Task>): Promise<boolean> => {
    try {
      const dbUpdates: Record<string, unknown> = { ...updates };
      if (updates.source_ref !== undefined) {
        dbUpdates.source_ref = updates.source_ref as Record<string, unknown> | null;
      }
      const { error } = await supabase
        .from('tasks')
        .update(dbUpdates)
        .eq('id', id);

      if (error) throw error;

      return true;
    } catch (err) {
      console.error('[useTasks] Update error:', err);
      setError(err instanceof Error ? err.message : 'Erro ao atualizar tarefa');
      return false;
    }
  }, []);

  const deleteTask = useCallback(async (id: string): Promise<boolean> => {
    try {
      const { error } = await supabase
        .from('tasks')
        .delete()
        .eq('id', id);

      if (error) throw error;

      return true;
    } catch (err) {
      console.error('[useTasks] Delete error:', err);
      setError(err instanceof Error ? err.message : 'Erro ao excluir tarefa');
      return false;
    }
  }, []);

  const bulkUpdateStatus = useCallback(async (ids: string[], status: TaskStatus): Promise<boolean> => {
    try {
      const { error } = await supabase
        .from('tasks')
        .update({ status })
        .in('id', ids);

      if (error) throw error;

      return true;
    } catch (err) {
      console.error('[useTasks] Bulk status update error:', err);
      return false;
    }
  }, []);

  const bulkUpdateAssignee = useCallback(async (ids: string[], assignee_user_id: string | null): Promise<boolean> => {
    try {
      const { error } = await supabase
        .from('tasks')
        .update({ assignee_user_id })
        .in('id', ids);

      if (error) throw error;

      return true;
    } catch (err) {
      console.error('[useTasks] Bulk assignee update error:', err);
      return false;
    }
  }, []);

  const bulkUpdatePriority = useCallback(async (ids: string[], priority: TaskPriority): Promise<boolean> => {
    try {
      const { error } = await supabase
        .from('tasks')
        .update({ priority })
        .in('id', ids);

      if (error) throw error;

      return true;
    } catch (err) {
      console.error('[useTasks] Bulk priority update error:', err);
      return false;
    }
  }, []);

  return {
    tasks,
    loading,
    error,
    filters,
    setFilters,
    createTask,
    updateTask,
    deleteTask,
    bulkUpdateStatus,
    bulkUpdateAssignee,
    bulkUpdatePriority,
    refetch: fetchTasks,
  };
}

// Additional hook for task details
export function useTaskDetails(taskId: string | null) {
  const [task, setTask] = useState<Task | null>(null);
  const [checklists, setChecklists] = useState<TaskChecklist[]>([]);
  const [comments, setComments] = useState<TaskComment[]>([]);
  const [watchers, setWatchers] = useState<TaskWatcher[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchDetails = useCallback(async () => {
    if (!taskId) {
      setTask(null);
      setLoading(false);
      return;
    }

    setLoading(true);

    const [taskRes, checklistRes, commentsRes, watchersRes] = await Promise.all([
      supabase.from('tasks').select('*').eq('id', taskId).single(),
      supabase.from('task_checklists').select('*').eq('task_id', taskId).order('sort_order'),
      supabase.from('task_comments').select('*').eq('task_id', taskId).order('created_at', { ascending: false }),
      supabase.from('task_watchers').select('*').eq('task_id', taskId),
    ]);

    if (taskRes.data) setTask(taskRes.data as Task);
    if (checklistRes.data) setChecklists(checklistRes.data as TaskChecklist[]);
    if (commentsRes.data) setComments(commentsRes.data as TaskComment[]);
    if (watchersRes.data) setWatchers(watchersRes.data as TaskWatcher[]);

    setLoading(false);
  }, [taskId]);

  useEffect(() => {
    fetchDetails();
  }, [fetchDetails]);

  const addChecklist = async (title: string) => {
    if (!taskId) return null;
    const { data, error } = await supabase
      .from('task_checklists')
      .insert({ task_id: taskId, title, sort_order: checklists.length })
      .select()
      .single();
    if (!error && data) {
      setChecklists(prev => [...prev, data as TaskChecklist]);
    }
    return data as TaskChecklist | null;
  };

  const toggleChecklist = async (id: string, is_done: boolean) => {
    const { error } = await supabase
      .from('task_checklists')
      .update({ is_done })
      .eq('id', id);
    if (!error) {
      setChecklists(prev => prev.map(c => c.id === id ? { ...c, is_done } : c));
    }
  };

  const deleteChecklist = async (id: string) => {
    const { error } = await supabase
      .from('task_checklists')
      .delete()
      .eq('id', id);
    if (!error) {
      setChecklists(prev => prev.filter(c => c.id !== id));
    }
  };

  const addComment = async (comment: string) => {
    if (!taskId) return null;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;

    const { data, error } = await supabase
      .from('task_comments')
      .insert({ task_id: taskId, user_id: user.id, comment })
      .select()
      .single();
    if (!error && data) {
      setComments(prev => [data as TaskComment, ...prev]);
    }
    return data as TaskComment | null;
  };

  const toggleWatch = async () => {
    if (!taskId) return;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const isWatching = watchers.some(w => w.user_id === user.id);
    
    if (isWatching) {
      await supabase.from('task_watchers').delete().eq('task_id', taskId).eq('user_id', user.id);
      setWatchers(prev => prev.filter(w => w.user_id !== user.id));
    } else {
      const { data } = await supabase
        .from('task_watchers')
        .insert({ task_id: taskId, user_id: user.id })
        .select()
        .single();
      if (data) setWatchers(prev => [...prev, data as TaskWatcher]);
    }
  };

  return {
    task,
    checklists,
    comments,
    watchers,
    loading,
    refetch: fetchDetails,
    addChecklist,
    toggleChecklist,
    deleteChecklist,
    addComment,
    toggleWatch,
  };
}
