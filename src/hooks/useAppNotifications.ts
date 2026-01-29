import { useState, useEffect, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { AppNotification, NotificationCategory } from '@/types/qa';

interface UseAppNotificationsOptions {
  workspaceId?: string | null;
  sellerId?: string | null;
  categories?: NotificationCategory[];
  unreadOnly?: boolean;
}

export function useAppNotifications(options: UseAppNotificationsOptions = {}) {
  const { workspaceId, sellerId, categories, unreadOnly = false } = options;

  return useQuery({
    queryKey: ['app-notifications', workspaceId, sellerId, categories, unreadOnly],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return [];

      let query = supabase
        .from('app_notifications')
        .select('*')
        .eq('user_id', user.id)
        .eq('is_dismissed', false)
        .order('created_at', { ascending: false });

      if (workspaceId) {
        query = query.eq('workspace_id', workspaceId);
      }

      if (sellerId) {
        query = query.eq('seller_id', sellerId);
      }

      if (categories && categories.length > 0) {
        query = query.in('category', categories);
      }

      if (unreadOnly) {
        query = query.eq('is_read', false);
      }

      const { data, error } = await query.limit(50);

      if (error) throw error;
      return (data || []) as AppNotification[];
    },
  });
}

export function useUnreadNotificationsCount(workspaceId?: string | null) {
  return useQuery({
    queryKey: ['unread-notifications-count', workspaceId],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return 0;

      let query = supabase
        .from('app_notifications')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('is_read', false)
        .eq('is_dismissed', false);

      if (workspaceId) {
        query = query.eq('workspace_id', workspaceId);
      }

      const { count, error } = await query;

      if (error) throw error;
      return count || 0;
    },
    // DISABLED: Static mode - no polling. Use manual refresh button instead.
    // refetchInterval: 30000,
  });
}

export function useMarkNotificationRead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (notificationId: string) => {
      const { error } = await supabase
        .from('app_notifications')
        .update({ is_read: true, read_at: new Date().toISOString() } as never)
        .eq('id', notificationId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['app-notifications'] });
      queryClient.invalidateQueries({ queryKey: ['unread-notifications-count'] });
    },
  });
}

export function useMarkAllNotificationsRead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (workspaceId?: string) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      let query = supabase
        .from('app_notifications')
        .update({ is_read: true, read_at: new Date().toISOString() } as never)
        .eq('user_id', user.id)
        .eq('is_read', false);

      if (workspaceId) {
        query = query.eq('workspace_id', workspaceId);
      }

      const { error } = await query;

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['app-notifications'] });
      queryClient.invalidateQueries({ queryKey: ['unread-notifications-count'] });
    },
  });
}

export function useDismissNotification() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (notificationId: string) => {
      const { error } = await supabase
        .from('app_notifications')
        .update({ is_dismissed: true } as never)
        .eq('id', notificationId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['app-notifications'] });
      queryClient.invalidateQueries({ queryKey: ['unread-notifications-count'] });
    },
  });
}

// DISABLED: Realtime subscription disabled in static mode
// Data only updates on manual refresh or page reload
export function useNotificationsRealtime(
  userId: string | null,
  onNewNotification: (n: AppNotification) => void
) {
  // Realtime disabled in static mode
  // useEffect(() => {
  //   if (!userId) return;
  //
  //   const channel = supabase
  //     .channel(`notifications-${userId}`)
  //     .on(
  //       'postgres_changes',
  //       {
  //         event: 'INSERT',
  //         schema: 'public',
  //         table: 'app_notifications',
  //         filter: `user_id=eq.${userId}`,
  //       },
  //       (payload) => {
  //         onNewNotification(payload.new as AppNotification);
  //       }
  //     )
  //     .subscribe();
  //
  //   return () => {
  //     supabase.removeChannel(channel);
  //   };
  // }, [userId, onNewNotification]);
}

// Group notifications by category for the bell dropdown
export function groupNotificationsByCategory(notifications: AppNotification[]) {
  const groups: Record<string, AppNotification[]> = {};
  
  for (const notification of notifications) {
    const key = notification.category;
    if (!groups[key]) {
      groups[key] = [];
    }
    groups[key].push(notification);
  }

  return groups;
}
