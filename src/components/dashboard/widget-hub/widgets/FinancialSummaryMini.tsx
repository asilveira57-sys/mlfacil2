import { useState, useEffect } from 'react';
import { Wallet, ArrowUpRight, ArrowDownRight } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useActiveAccount } from '@/contexts/ActiveAccountContext';

export default function FinancialSummaryMini() {
  const { sellerId } = useActiveAccount();
  const [data, setData] = useState<{ revenue: number; orders: number; avgTicket: number } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!sellerId) return;

    const load = async () => {
      try {
        const today = new Date();
        const thirtyDaysAgo = new Date(today);
        thirtyDaysAgo.setDate(today.getDate() - 30);

        const { data: orders, count } = await supabase
          .from('meli_orders_cache')
          .select('total_amount', { count: 'exact' })
          .eq('seller_id', sellerId)
          .eq('order_status', 'paid')
          .gte('created_at_meli', thirtyDaysAgo.toISOString());

        const revenue = (orders || []).reduce((s, o) => s + (o.total_amount || 0), 0);
        const orderCount = count || 0;
        setData({
          revenue,
          orders: orderCount,
          avgTicket: orderCount > 0 ? revenue / orderCount : 0,
        });
      } catch {
        // Silently fail
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [sellerId]);

  const formatCurrency = (v: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);

  if (loading) {
    return (
      <div className="space-y-2 py-2 animate-pulse">
        <div className="h-6 w-28 rounded bg-muted" />
        <div className="h-4 w-36 rounded bg-muted" />
      </div>
    );
  }

  if (!data || !sellerId) {
    return (
      <div className="flex flex-col items-center justify-center py-3 text-muted-foreground">
        <Wallet className="h-8 w-8 mb-1.5 opacity-40" />
        <span className="text-xs">Conecte uma conta ML</span>
      </div>
    );
  }

  return (
    <div className="py-1">
      <div className="flex items-center gap-2 mb-2">
        <Wallet className="h-4 w-4 text-primary" />
        <span className="text-xs text-muted-foreground">Últimos 30 dias</span>
      </div>
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">Faturamento</span>
          <span className="text-sm font-bold text-foreground flex items-center gap-1">
            <ArrowUpRight className="h-3 w-3 text-green-500" />
            {formatCurrency(data.revenue)}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">Ticket Médio</span>
          <span className="text-sm font-medium text-foreground">{formatCurrency(data.avgTicket)}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">Pedidos</span>
          <span className="text-sm font-medium text-foreground">{data.orders}</span>
        </div>
      </div>
    </div>
  );
}
