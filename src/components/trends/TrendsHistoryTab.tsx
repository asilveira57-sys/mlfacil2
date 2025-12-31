import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import { History, Calendar, TrendingUp, Store, AlertTriangle } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

interface TrendsHistoryTabProps {
  sellerId: string | null;
}

// Generate list of months from jan/2025 to today
function generateMonthOptions() {
  const months = [];
  const start = new Date(2025, 0, 1); // Jan 2025
  const now = new Date();
  
  let current = new Date(start);
  while (current <= now) {
    const key = `${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, '0')}`;
    const label = current.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
    months.push({ key, label });
    current.setMonth(current.getMonth() + 1);
  }
  
  return months.reverse(); // Most recent first
}

export function TrendsHistoryTab({ sellerId }: TrendsHistoryTabProps) {
  const monthOptions = generateMonthOptions();
  const [selectedMonth, setSelectedMonth] = useState(monthOptions[0]?.key || '');
  const [sourceType, setSourceType] = useState<'seller' | 'market'>('seller');

  // Fetch seller monthly history
  const { data: sellerHistory, isLoading: sellerLoading } = useQuery({
    queryKey: ['trends', 'history', 'seller', sellerId, selectedMonth],
    queryFn: async () => {
      if (!sellerId) return null;
      
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
        .order('revenue', { ascending: false })
        .limit(20);

      if (error) throw error;
      return data || [];
    },
    enabled: !!sellerId && sourceType === 'seller',
  });

  // Fetch market snapshots history
  const { data: marketHistory, isLoading: marketLoading } = useQuery({
    queryKey: ['trends', 'history', 'market', selectedMonth],
    queryFn: async () => {
      const monthStart = `${selectedMonth}-01`;
      const [year, month] = selectedMonth.split('-').map(Number);
      const nextMonth = month === 12 ? 1 : month + 1;
      const nextYear = month === 12 ? year + 1 : year;
      const monthEnd = `${nextYear}-${String(nextMonth).padStart(2, '0')}-01`;

      const { data, error } = await supabase
        .from('trend_snapshots')
        .select('snapshot_date, trends_data')
        .eq('site_id', 'MLB')
        .is('category_id', null)
        .gte('snapshot_date', monthStart)
        .lt('snapshot_date', monthEnd)
        .order('snapshot_date', { ascending: false });

      if (error) throw error;
      return data || [];
    },
    enabled: sourceType === 'market',
  });

  const isLoading = sourceType === 'seller' ? sellerLoading : marketLoading;

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
              {monthOptions.map((month) => (
                <SelectItem key={month.key} value={month.key}>
                  {month.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-2">
          <Select value={sourceType} onValueChange={(v) => setSourceType(v as 'seller' | 'market')}>
            <SelectTrigger className="w-[160px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="seller">
                <div className="flex items-center gap-2">
                  <Store className="h-4 w-4" />
                  Seller
                </div>
              </SelectItem>
              <SelectItem value="market">
                <div className="flex items-center gap-2">
                  <TrendingUp className="h-4 w-4" />
                  Mercado
                </div>
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Content */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <History className="h-5 w-5 text-primary" />
            Histórico - {monthOptions.find(m => m.key === selectedMonth)?.label}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3, 4, 5].map(i => <Skeleton key={i} className="h-16 w-full" />)}
            </div>
          ) : sourceType === 'seller' ? (
            sellerHistory && sellerHistory.length > 0 ? (
              <ScrollArea className="h-[400px]">
                <div className="space-y-2 pr-4">
                  {sellerHistory.map((item, idx) => (
                    <div 
                      key={item.item_id} 
                      className="flex items-center gap-4 p-3 bg-muted/50 rounded-lg"
                    >
                      <span className="text-xl font-bold text-muted-foreground w-8 text-center">
                        {idx + 1}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">{item.item_id}</p>
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
                <p className="text-muted-foreground font-medium">Dados disponíveis a partir de jan/2025</p>
                <p className="text-sm text-muted-foreground mt-2">
                  Fonte: dados agregados do seller
                </p>
                {!sellerId && (
                  <p className="text-sm text-amber-600 mt-4">
                    Selecione uma conta para visualizar o histórico do seller
                  </p>
                )}
              </div>
            )
          ) : (
            marketHistory && marketHistory.length > 0 ? (
              <ScrollArea className="h-[400px]">
                <div className="space-y-4 pr-4">
                  {marketHistory.map((snapshot) => (
                    <div 
                      key={snapshot.snapshot_date} 
                      className="p-4 bg-muted/50 rounded-lg"
                    >
                      <div className="flex items-center justify-between mb-3">
                        <Badge variant="outline">
                          {new Date(snapshot.snapshot_date + 'T00:00:00').toLocaleDateString('pt-BR')}
                        </Badge>
                        <span className="text-sm text-muted-foreground">
                          {Array.isArray(snapshot.trends_data) ? snapshot.trends_data.length : 0} tendências
                        </span>
                      </div>
                      {Array.isArray(snapshot.trends_data) && snapshot.trends_data.length > 0 && (
                        <div className="flex flex-wrap gap-2">
                          {snapshot.trends_data.slice(0, 10).map((trend: { keyword: string }, idx: number) => (
                            <Badge key={idx} variant="secondary" className="text-xs">
                              {trend.keyword}
                            </Badge>
                          ))}
                          {snapshot.trends_data.length > 10 && (
                            <Badge variant="outline" className="text-xs">
                              +{snapshot.trends_data.length - 10} mais
                            </Badge>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </ScrollArea>
            ) : (
              <div className="text-center py-12">
                <AlertTriangle className="h-12 w-12 text-amber-500 mx-auto mb-4" />
                <p className="text-muted-foreground font-medium">Histórico indisponível antes da ativação do módulo</p>
                <p className="text-sm text-muted-foreground mt-2">
                  Fonte: snapshots do app
                </p>
              </div>
            )
          )}
        </CardContent>
      </Card>

      {/* Source Info */}
      <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
        <AlertTriangle className="h-3 w-3" />
        <span>
          {sourceType === 'seller' 
            ? 'Lacunas no histórico são sinalizadas visualmente'
            : 'Dados de mercado dependem de snapshots coletados periodicamente'
          }
        </span>
      </div>
    </div>
  );
}
