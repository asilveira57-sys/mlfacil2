import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import { History, Calendar, Store, AlertTriangle, Package, Download } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

interface TrendsHistoryTabProps {
  sellerId: string | null;
}

// Export seller history to CSV
function exportSellerHistoryCSV(
  items: Array<{ item_id: string; title: string | null; quantity_sold: number; revenue: number }>,
  monthLabel: string
) {
  const header = 'Posição,Item ID,Título,Quantidade Vendida,Receita\n';
  const rows = items.map((item, idx) => 
    `${idx + 1},${item.item_id},"${(item.title || item.item_id).replace(/"/g, '""')}",${item.quantity_sold},${item.revenue.toFixed(2)}`
  ).join('\n');
  
  const blob = new Blob([header + rows], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `historico-seller-${monthLabel.replace(/\s+/g, '-').toLowerCase()}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function TrendsHistoryTab({ sellerId }: TrendsHistoryTabProps) {
  const [selectedMonth, setSelectedMonth] = useState('');

  // Fetch available months from seller_item_sales_monthly
  const { data: availableMonths } = useQuery({
    queryKey: ['trends', 'available-months', 'seller', sellerId],
    queryFn: async () => {
      if (!sellerId) return [];

      const { data, error } = await supabase
        .from('seller_item_sales_monthly')
        .select('sale_month')
        .eq('seller_id', sellerId)
        .order('sale_month', { ascending: false });

      if (error) throw error;

      // Extract unique months
      const months = new Set<string>();
      (data || []).forEach(item => {
        const monthKey = item.sale_month.substring(0, 7);
        months.add(monthKey);
      });

      return Array.from(months).map(key => {
        const [year, month] = key.split('-').map(Number);
        const date = new Date(year, month - 1, 1);
        return {
          key,
          label: date.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
        };
      });
    },
    enabled: !!sellerId,
  });

  const monthOptions = availableMonths || [];
  
  // Set default month when options change
  if (monthOptions.length > 0 && !selectedMonth) {
    setSelectedMonth(monthOptions[0].key);
  }

  // Fetch seller monthly history with product details (limit 50)
  const { data: sellerHistory, isLoading } = useQuery({
    queryKey: ['trends', 'history', 'seller', sellerId, selectedMonth],
    queryFn: async () => {
      if (!sellerId || !selectedMonth) return null;
      
      const monthStart = `${selectedMonth}-01`;
      const [year, month] = selectedMonth.split('-').map(Number);
      const nextMonth = month === 12 ? 1 : month + 1;
      const nextYear = month === 12 ? year + 1 : year;
      const monthEnd = `${nextYear}-${String(nextMonth).padStart(2, '0')}-01`;

      const { data, error } = await supabase
        .from('seller_item_sales_monthly')
        .select('item_id, quantity_sold, revenue')
        .eq('seller_id', sellerId)
        .gte('sale_month', monthStart)
        .lt('sale_month', monthEnd)
        .order('revenue', { ascending: false });

      if (error) throw error;
      if (!data || data.length === 0) return [];

      // Fetch product details (title, thumbnail) from meli_order_items_cache
      const itemIds = [...new Set(data.map(d => d.item_id))];
      const { data: itemDetails } = await supabase
        .from('meli_order_items_cache')
        .select('item_id, title, thumbnail')
        .in('item_id', itemIds)
        .order('created_at_meli', { ascending: false });

      // Create a map for quick lookup (use first occurrence for each item_id)
      const detailsMap = new Map<string, { title: string | null; thumbnail: string | null }>();
      if (itemDetails) {
        for (const detail of itemDetails) {
          if (!detailsMap.has(detail.item_id)) {
            detailsMap.set(detail.item_id, { 
              title: detail.title, 
              thumbnail: detail.thumbnail 
            });
          }
        }
      }

      // Merge details with sales data
      return data.map(item => ({
        ...item,
        title: detailsMap.get(item.item_id)?.title || null,
        thumbnail: detailsMap.get(item.item_id)?.thumbnail || null,
      }));
    },
    enabled: !!sellerId && !!selectedMonth,
  });

  const currentMonthLabel = monthOptions.find(m => m.key === selectedMonth)?.label || 'Selecione um mês';

  const handleExportCSV = () => {
    if (sellerHistory && sellerHistory.length > 0) {
      exportSellerHistoryCSV(sellerHistory, currentMonthLabel);
    }
  };

  if (!sellerId) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <div className="text-center">
            <Store className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-muted-foreground">Selecione uma conta para visualizar o histórico do seller.</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Filters */}
      <div className="flex items-center gap-4 flex-wrap">
        <div className="flex items-center gap-2">
          <Calendar className="h-4 w-4 text-muted-foreground" />
          <Select value={selectedMonth} onValueChange={setSelectedMonth}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="Selecione o mês" />
            </SelectTrigger>
            <SelectContent>
              {monthOptions.length > 0 ? (
                monthOptions.map((month) => (
                  <SelectItem key={month.key} value={month.key}>
                    {month.label}
                  </SelectItem>
                ))
              ) : (
                <SelectItem value="none" disabled>
                  Nenhum dado disponível
                </SelectItem>
              )}
            </SelectContent>
          </Select>
        </div>

        {sellerHistory && sellerHistory.length > 0 && (
          <Button variant="outline" size="sm" onClick={handleExportCSV}>
            <Download className="h-4 w-4 mr-2" />
            Exportar CSV
          </Button>
        )}
      </div>

      {/* Content */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <History className="h-5 w-5 text-primary" />
            Histórico do Seller - {currentMonthLabel}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {monthOptions.length === 0 ? (
            <div className="text-center py-12">
              <AlertTriangle className="h-12 w-12 text-amber-500 mx-auto mb-4" />
              <p className="text-muted-foreground font-medium">
                Nenhum dado de vendas disponível para este seller
              </p>
              <p className="text-sm text-muted-foreground mt-2">
                Os dados aparecem após a coleta periódica do sistema
              </p>
            </div>
          ) : isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3, 4, 5].map(i => <Skeleton key={i} className="h-16 w-full" />)}
            </div>
          ) : sellerHistory && sellerHistory.length > 0 ? (
            <ScrollArea className="h-[500px]">
              <div className="space-y-2 pr-4">
                {sellerHistory.map((item, idx) => (
                  <div 
                    key={item.item_id} 
                    className="flex items-center gap-4 p-3 bg-muted/50 rounded-lg hover:bg-muted transition-colors"
                  >
                    <span className={`text-xl font-bold w-8 text-center ${
                      idx < 3 ? 'text-primary' : 
                      idx < 10 ? 'text-amber-500' : 
                      'text-muted-foreground'
                    }`}>
                      {idx + 1}
                    </span>
                    {item.thumbnail ? (
                      <img 
                        src={item.thumbnail} 
                        alt="" 
                        className="w-12 h-12 rounded-lg object-cover border border-border flex-shrink-0"
                      />
                    ) : (
                      <div className="w-12 h-12 rounded-lg bg-muted flex items-center justify-center flex-shrink-0">
                        <Package className="h-5 w-5 text-muted-foreground" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">
                        {item.title || item.item_id}
                      </p>
                      {item.title && (
                        <p className="text-xs text-muted-foreground">{item.item_id}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-4">
                      <Badge variant="secondary">{item.quantity_sold} un</Badge>
                      <Badge variant="default">
                        R$ {Number(item.revenue).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          ) : (
            <div className="text-center py-12">
              <AlertTriangle className="h-12 w-12 text-amber-500 mx-auto mb-4" />
              <p className="text-muted-foreground font-medium">Nenhuma venda neste período</p>
              <p className="text-sm text-muted-foreground mt-2">
                Fonte: dados agregados do seller
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Source Info */}
      <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
        <AlertTriangle className="h-3 w-3" />
        <span>Mostrando os 50 produtos mais vendidos do período</span>
      </div>
    </div>
  );
}
