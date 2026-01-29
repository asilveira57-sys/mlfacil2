import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { Notification, SystemEvent } from '@/types/tasks';

interface UseNotificationsResult {
  notifications: Notification[];
  unreadCount: number;
  loading: boolean;
  markAsRead: (id: string) => Promise<void>;
  markAllAsRead: () => Promise<void>;
  refetch: () => Promise<void>;
}

export function useNotifications(workspaceId: string | null): UseNotificationsResult {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchNotifications = useCallback(async () => {
    if (!workspaceId) {
      setNotifications([]);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .eq('workspace_id', workspaceId)
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;

      setNotifications((data as Notification[]) || []);
    } catch (err) {
      console.error('[useNotifications] Error:', err);
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  // DISABLED: Realtime subscription disabled in static mode
  // Data only updates on manual refresh or page reload
  // useEffect(() => {
  //   if (!workspaceId) return;
  //
  //   const setupRealtime = async () => {
  //     const { data: { user } } = await supabase.auth.getUser();
  //     if (!user) return;
  //
  //     const channel = supabase
  //       .channel(`notifications-${user.id}`)
  //       .on(
  //         'postgres_changes',
  //         {
  //           event: 'INSERT',
  //           schema: 'public',
  //           table: 'notifications',
  //           filter: `user_id=eq.${user.id}`,
  //         },
  //         (payload) => {
  //           setNotifications(prev => [payload.new as Notification, ...prev]);
  //         }
  //       )
  //       .subscribe();
  //
  //     return () => {
  //       supabase.removeChannel(channel);
  //     };
  //   };
  //
  //   setupRealtime();
  // }, [workspaceId]);

  const markAsRead = async (id: string) => {
    const { error } = await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('id', id);

    if (!error) {
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n));
    }
  };

  const markAllAsRead = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user || !workspaceId) return;

    const { error } = await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('workspace_id', workspaceId)
      .eq('user_id', user.id)
      .eq('is_read', false);

    if (!error) {
      setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
    }
  };

  const unreadCount = notifications.filter(n => !n.is_read).length;

  return {
    notifications,
    unreadCount,
    loading,
    markAsRead,
    markAllAsRead,
    refetch: fetchNotifications,
  };
}

interface UseSystemEventsResult {
  events: SystemEvent[];
  loading: boolean;
  refetch: () => Promise<void>;
}

export function useSystemEvents(workspaceId: string | null, accountId?: string | null): UseSystemEventsResult {
  const [events, setEvents] = useState<SystemEvent[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchEvents = useCallback(async () => {
    if (!workspaceId) {
      setEvents([]);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);

      let query = supabase
        .from('system_events')
        .select('*')
        .eq('workspace_id', workspaceId)
        .is('processed_at', null)
        .order('created_at', { ascending: false });

      if (accountId) {
        query = query.eq('account_id', accountId);
      }

      const { data, error } = await query;

      if (error) throw error;

      setEvents((data as SystemEvent[]) || []);
    } catch (err) {
      console.error('[useSystemEvents] Error:', err);
    } finally {
      setLoading(false);
    }
  }, [workspaceId, accountId]);

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  return {
    events,
    loading,
    refetch: fetchEvents,
  };
}
