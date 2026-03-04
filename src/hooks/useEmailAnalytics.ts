import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface EmailAnalyticsDay {
  id: string;
  metric_date: string;
  total_queued: number;
  total_sent: number;
  total_failed: number;
  total_retried: number;
  total_cancelled: number;
  total_events: number;
  total_schedules: number;
  total_campaigns: number;
  top_template_id: string | null;
  top_event_key: string | null;
}

export function useEmailAnalytics(days = 30) {
  return useQuery({
    queryKey: ['admin', 'email-analytics', days],
    queryFn: async () => {
      const fromDate = new Date();
      fromDate.setDate(fromDate.getDate() - days);

      const { data, error } = await (supabase as any)
        .from('email_analytics_daily')
        .select('*')
        .gte('metric_date', fromDate.toISOString().split('T')[0])
        .order('metric_date', { ascending: true });
      if (error) throw error;
      return (data || []) as EmailAnalyticsDay[];
    },
  });
}

export function useEmailAnalyticsSummary() {
  return useQuery({
    queryKey: ['admin', 'email-analytics-summary'],
    queryFn: async () => {
      // Get today's live stats from email_logs
      const today = new Date().toISOString().split('T')[0];

      const { count: todayQueued } = await (supabase as any)
        .from('email_logs')
        .select('*', { count: 'exact', head: true })
        .eq('action', 'enqueue')
        .gte('created_at', `${today}T00:00:00`);

      const { count: todaySent } = await (supabase as any)
        .from('email_logs')
        .select('*', { count: 'exact', head: true })
        .eq('action', 'sent')
        .gte('created_at', `${today}T00:00:00`);

      const { count: todayFailed } = await (supabase as any)
        .from('email_logs')
        .select('*', { count: 'exact', head: true })
        .eq('action', 'fail')
        .gte('created_at', `${today}T00:00:00`);

      const { count: pendingQueue } = await (supabase as any)
        .from('email_queue')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'queued');

      // Get 30-day totals from analytics
      const fromDate = new Date();
      fromDate.setDate(fromDate.getDate() - 30);
      const { data: monthly } = await (supabase as any)
        .from('email_analytics_daily')
        .select('total_sent, total_failed, total_queued')
        .gte('metric_date', fromDate.toISOString().split('T')[0]);

      const monthTotals = (monthly || []).reduce(
        (acc: any, d: any) => ({
          sent: acc.sent + (d.total_sent || 0),
          failed: acc.failed + (d.total_failed || 0),
          queued: acc.queued + (d.total_queued || 0),
        }),
        { sent: 0, failed: 0, queued: 0 }
      );

      return {
        today: {
          queued: todayQueued || 0,
          sent: todaySent || 0,
          failed: todayFailed || 0,
        },
        pendingQueue: pendingQueue || 0,
        month: monthTotals,
        deliveryRate: monthTotals.queued > 0
          ? Math.round((monthTotals.sent / monthTotals.queued) * 100)
          : 0,
      };
    },
  });
}
