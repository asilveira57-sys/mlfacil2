import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface EmailAnalyticsSummaryData {
  today: { pending: number; sent: number; failed: number };
  pendingQueue: number;
  month: { sent: number; failed: number; total: number };
  deliveryRate: number;
}

export function useEmailAnalyticsSummary() {
  return useQuery({
    queryKey: ['admin', 'email-analytics-summary'],
    queryFn: async (): Promise<EmailAnalyticsSummaryData> => {
      const today = new Date().toISOString().split('T')[0];

      // Today's stats from email_send_log (the real pipeline)
      const { count: todayPending } = await supabase
        .from('email_send_log')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'pending')
        .gte('created_at', `${today}T00:00:00`);

      const { count: todaySent } = await supabase
        .from('email_send_log')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'sent')
        .gte('created_at', `${today}T00:00:00`);

      const { count: todayFailed } = await supabase
        .from('email_send_log')
        .select('*', { count: 'exact', head: true })
        .in('status', ['failed', 'dlq', 'rate_limited'])
        .gte('created_at', `${today}T00:00:00`);

      // Pending in queue right now (pending without a corresponding sent)
      const { count: pendingQueue } = await supabase
        .from('email_send_log')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'pending')
        .gte('created_at', new Date(Date.now() - 30 * 60 * 1000).toISOString());

      // 30-day totals from email_send_log
      const fromDate = new Date();
      fromDate.setDate(fromDate.getDate() - 30);

      const { count: monthSent } = await supabase
        .from('email_send_log')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'sent')
        .gte('created_at', fromDate.toISOString());

      const { count: monthFailed } = await supabase
        .from('email_send_log')
        .select('*', { count: 'exact', head: true })
        .in('status', ['failed', 'dlq', 'rate_limited'])
        .gte('created_at', fromDate.toISOString());

      const { count: monthTotal } = await supabase
        .from('email_send_log')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'pending')
        .gte('created_at', fromDate.toISOString());

      const sent = monthSent || 0;
      const total = (monthTotal || 0);

      return {
        today: {
          pending: todayPending || 0,
          sent: todaySent || 0,
          failed: todayFailed || 0,
        },
        pendingQueue: pendingQueue || 0,
        month: {
          sent,
          failed: monthFailed || 0,
          total,
        },
        deliveryRate: total > 0 ? Math.round((sent / total) * 100) : sent > 0 ? 100 : 0,
      };
    },
  });
}
