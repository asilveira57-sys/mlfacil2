import { useState, useEffect } from 'react';
import { Package, Clock } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useActiveAccount } from '@/contexts/ActiveAccountContext';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface OrderItem {
  order_id: string;
  total_amount: number;
  created_at_meli: string;
  buyer_nickname: string | null;
}

export default function RecentOrdersMini() {
  const { sellerId } = useActiveAccount();
  const [orders, setOrders] = useState<OrderItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!sellerId) return;

    const load = async () => {
      try {
        const { data } = await supabase
          .from('meli_orders_cache')
          .select('order_id, total_amount, created_at_meli, buyer_nickname')
          .eq('seller_id', sellerId)
          .eq('order_status', 'paid')
          .order('created_at_meli', { ascending: false })
          .limit(4);

        setOrders((data || []) as OrderItem[]);
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
      <div className="space-y-2 py-1 animate-pulse">
        {[0, 1, 2].map(i => <div key={i} className="h-8 rounded bg-muted" />)}
      </div>
    );
  }

  if (orders.length === 0 || !sellerId) {
    return (
      <div className="flex flex-col items-center justify-center py-3 text-muted-foreground">
        <Package className="h-8 w-8 mb-1.5 opacity-40" />
        <span className="text-xs">Nenhum pedido recente</span>
      </div>
    );
  }

  return (
    <div className="space-y-1.5 py-1">
      {orders.map(order => (
        <div key={order.order_id} className="flex items-center gap-2 px-2 py-1 rounded-md bg-muted/30">
          <Package className="h-3.5 w-3.5 text-primary shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-foreground truncate">
                {order.buyer_nickname || 'Comprador'}
              </span>
              <span className="text-xs font-bold text-foreground shrink-0 ml-2">
                {formatCurrency(order.total_amount)}
              </span>
            </div>
            <div className="text-[10px] text-muted-foreground flex items-center gap-1">
              <Clock className="h-2.5 w-2.5" />
              {formatDistanceToNow(new Date(order.created_at_meli), { addSuffix: true, locale: ptBR })}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
