import { useEffect, useCallback, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import type { AppNotification } from '@/types/notifications';
import type { NotificationCategory } from '@/types/qa';

interface UseNotificationSystemOptions {
  workspaceId?: string | null;
  sellerId?: string | null;
}

// Fetch active notifications (not dismissed, not snoozed or snooze expired)
export function useActiveNotifications(options: UseNotificationSystemOptions = {}) {
  const { workspaceId, sellerId } = options;

  return useQuery({
    queryKey: ['active-notifications', workspaceId, sellerId],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return [];

      let query = supabase
        .from('app_notifications')
        .select('*')
        .eq('user_id', user.id)
        .eq('is_dismissed', false)
        .or('is_snoozed.eq.false,snooze_until.lt.now()')
        .order('created_at', { ascending: false });

      if (workspaceId) {
        query = query.eq('workspace_id', workspaceId);
      }

      if (sellerId) {
        query = query.eq('seller_id', sellerId);
      }

      const { data, error } = await query.limit(100);

      if (error) throw error;
      return (data || []) as AppNotification[];
    },
    // STATIC MODE: No polling or refetch on focus
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    refetchOnMount: false,
  });
}

// Fetch priority notifications for dashboard (top 5 most critical)
export function usePriorityNotifications(options: UseNotificationSystemOptions = {}) {
  const { workspaceId, sellerId } = options;

  return useQuery({
    queryKey: ['priority-notifications', workspaceId, sellerId],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return [];

      // Use the view for priority ordering
      let query = supabase
        .from('priority_notifications')
        .select('*')
        .eq('user_id', user.id);

      if (workspaceId) {
        query = query.eq('workspace_id', workspaceId);
      }

      if (sellerId) {
        query = query.eq('seller_id', sellerId);
      }

      const { data, error } = await query.limit(5);

      if (error) {
        // Fallback if view doesn't work
        console.warn('Priority view error, using fallback:', error);
        return [];
      }
      return (data || []) as (AppNotification & { priority_score: number })[];
    },
    // STATIC MODE: No polling or refetch on focus
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    refetchOnMount: false,
  });
}

// Count unread and pending action notifications
export function useNotificationCounts(workspaceId?: string | null) {
  return useQuery({
    queryKey: ['notification-counts', workspaceId],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return { unread: 0, pending: 0 };

      // Count unread
      let unreadQuery = supabase
        .from('app_notifications')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('is_read', false)
        .eq('is_dismissed', false)
        .or('is_snoozed.eq.false,snooze_until.lt.now()');

      if (workspaceId) {
        unreadQuery = unreadQuery.eq('workspace_id', workspaceId);
      }

      const { count: unreadCount } = await unreadQuery;

      // Count pending action (not actioned)
      let pendingQuery = supabase
        .from('app_notifications')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('is_actioned', false)
        .eq('is_dismissed', false)
        .or('is_snoozed.eq.false,snooze_until.lt.now()');

      if (workspaceId) {
        pendingQuery = pendingQuery.eq('workspace_id', workspaceId);
      }

      const { count: pendingCount } = await pendingQuery;

      return {
        unread: unreadCount || 0,
        pending: pendingCount || 0,
      };
    },
    // STATIC MODE: No polling or refetch on focus
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    refetchOnMount: false,
  });
}

// Mark notification as read
export function useMarkNotificationRead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (notificationId: string) => {
      const { error } = await supabase
        .from('app_notifications')
        .update({ is_read: true, is_actioned: true, read_at: new Date().toISOString() } as never)
        .eq('id', notificationId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['active-notifications'] });
      queryClient.invalidateQueries({ queryKey: ['priority-notifications'] });
      queryClient.invalidateQueries({ queryKey: ['notification-counts'] });
    },
  });
}

// Mark all as read
export function useMarkAllNotificationsRead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (workspaceId?: string) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      let query = supabase
        .from('app_notifications')
        .update({ is_read: true, is_actioned: true, read_at: new Date().toISOString() } as never)
        .eq('user_id', user.id)
        .eq('is_dismissed', false)
        .or('is_read.eq.false,is_actioned.eq.false');

      if (workspaceId) {
        query = query.eq('workspace_id', workspaceId);
      }

      const { error } = await query;
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['active-notifications'] });
      queryClient.invalidateQueries({ queryKey: ['priority-notifications'] });
      queryClient.invalidateQueries({ queryKey: ['notification-counts'] });
    },
  });
}

// Snooze notification
export function useSnoozeNotification() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ notificationId, hours }: { notificationId: string; hours: number }) => {
      const { error } = await supabase.rpc('snooze_notification', {
        p_notification_id: notificationId,
        p_snooze_hours: hours,
      });

      if (error) throw error;
    },
    onSuccess: (_, { hours }) => {
      queryClient.invalidateQueries({ queryKey: ['active-notifications'] });
      queryClient.invalidateQueries({ queryKey: ['priority-notifications'] });
      queryClient.invalidateQueries({ queryKey: ['notification-counts'] });
      
      const label = hours === 24 ? 'amanhã' : `em ${hours} hora${hours > 1 ? 's' : ''}`;
      toast({
        title: 'Notificação adiada',
        description: `Você será lembrado ${label}.`,
      });
    },
  });
}

// Resolve notification (mark as actioned)
export function useResolveNotification() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (notificationId: string) => {
      const { error } = await supabase.rpc('resolve_notification', {
        p_notification_id: notificationId,
      });

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['active-notifications'] });
      queryClient.invalidateQueries({ queryKey: ['priority-notifications'] });
      queryClient.invalidateQueries({ queryKey: ['notification-counts'] });
      
      toast({
        title: 'Resolvido',
        description: 'Notificação marcada como resolvida.',
      });
    },
  });
}

// Dismiss notification
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
      queryClient.invalidateQueries({ queryKey: ['active-notifications'] });
      queryClient.invalidateQueries({ queryKey: ['priority-notifications'] });
      queryClient.invalidateQueries({ queryKey: ['notification-counts'] });
    },
  });
}

// DISABLED: Realtime subscription disabled in static mode
// Data only updates on manual refresh or page reload
// If you need realtime notifications, enable autoRefreshEnabled in RefreshPolicyContext
export function useNotificationsRealtime(
  userId: string | null,
  onNewNotification: (notification: AppNotification) => void
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

// REMOVED: useCurrentUserId was duplicated here.
// Use the centralized version from src/hooks/useCurrentUserId.ts instead.
// import { useCurrentUserId } from '@/hooks/useCurrentUserId';

// Group notifications by category
export function groupNotificationsByCategory(notifications: AppNotification[]) {
  const groups: Record<NotificationCategory, AppNotification[]> = {} as Record<NotificationCategory, AppNotification[]>;

  for (const notification of notifications) {
    const key = notification.category;
    if (!groups[key]) {
      groups[key] = [];
    }
    groups[key].push(notification);
  }

  return groups;
}

// Calculate priority score for sorting
export function calculatePriorityScore(notification: AppNotification): number {
  let score = 0;

  // Priority base score
  switch (notification.priority) {
    case 'urgent': score += 100; break;
    case 'high': score += 75; break;
    case 'normal': score += 50; break;
    case 'low': score += 25; break;
  }

  // Category boost
  if (['qa_sla_breached', 'qa_blocked', 'post_sale_blocked'].includes(notification.category)) {
    score += 50;
  } else if (['qa_sla_warning', 'qa_send_error', 'post_sale_error'].includes(notification.category)) {
    score += 30;
  }

  // Age factor (older = higher priority, max 48 hours)
  const ageHours = (Date.now() - new Date(notification.created_at).getTime()) / (1000 * 60 * 60);
  score += Math.min(ageHours, 48);

  return score;
}
