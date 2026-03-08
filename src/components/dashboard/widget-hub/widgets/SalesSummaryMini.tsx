import { useState, useEffect } from 'react';
import { ShoppingCart, TrendingUp } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useActiveAccount } from '@/contexts/ActiveAccountContext';

export default function SalesSummaryMini() {
  const { sellerId } = useActiveAccount();
  const [stats, setStats] = useState<{ orders: number; revenue: number } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!sellerId) return;

    const load = async () => {
      try {
        const today = new Date();
        const sevenDaysAgo = new Date(today);
        sevenDaysAgo.setDate(today.getDate() - 7);

        const { data, count } = await supabase
          .from('meli_orders_cache')
          .select('total_amount', { count: 'exact' })
          .eq('seller_id', sellerId)
          .eq('order_status', 'paid')
          .gte('created_at_meli', sevenDaysAgo.toISOString());

        const revenue = (data || []).reduce((s, o) => s + (o.total_amount || 0), 0);
        setStats({ orders: count || 0, revenue });
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
        <div className="h-6 w-24 rounded bg-muted" />
        <div className="h-4 w-32 rounded bg-muted" />
      </div>
    );
  }

  if (!stats || !sellerId) {
    return (
      <div className="flex flex-col items-center justify-center py-3 text-muted-foreground">
        <ShoppingCart className="h-8 w-8 mb-1.5 opacity-40" />
        <span className="text-xs">Conecte uma conta ML</span>
      </div>
    );
  }

  return (
    <div className="py-1">
      <div className="flex items-center gap-2 mb-2">
        <TrendingUp className="h-4 w-4 text-primary" />
        <span className="text-xs text-muted-foreground">Últimos 7 dias</span>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <div className="text-lg font-bold text-foreground">{stats.orders}</div>
          <div className="text-[10px] text-muted-foreground">Pedidos</div>
        </div>
        <div>
          <div className="text-lg font-bold text-foreground">{formatCurrency(stats.revenue)}</div>
          <div className="text-[10px] text-muted-foreground">Faturamento</div>
        </div>
      </div>
    </div>
  );
}
