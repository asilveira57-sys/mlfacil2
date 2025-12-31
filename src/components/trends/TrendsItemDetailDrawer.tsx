import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ExternalLink, Eye, Package, TrendingUp, TrendingDown } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
} from 'recharts';

interface TrendsItemDetailDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item: {
    item_id: string;
    title: string;
    thumbnail: string | null;
    visits?: number;
    quantity?: number;
    revenue?: number;
  } | null;
  sellerId: string;
}

interface ItemHistory {
  visits: Array<{ date: string; visits: number }>;
  sales: Array<{ date: string; quantity: number; revenue: number }>;
  totals: {
    visits_7d: number;
    visits_30d: number;
    sales_7d: number;
    sales_30d: number;
    revenue_7d: number;
    revenue_30d: number;
  };
}

async function fetchItemHistory(sellerId: string, itemId: string): Promise<ItemHistory> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Not authenticated');

  const response = await fetch(
    `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/trends-api/seller/item-history?seller_id=${sellerId}&item_id=${itemId}`,
    {
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
      },
    }
  );

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || `API error: ${response.status}`);
  }

  return response.json();
}

export function TrendsItemDetailDrawer({ open, onOpenChange, item, sellerId }: TrendsItemDetailDrawerProps) {
  const { data: history, isLoading } = useQuery({
    queryKey: ['trends', 'item-history', sellerId, item?.item_id],
    queryFn: () => fetchItemHistory(sellerId, item!.item_id),
    enabled: open && !!item && !!sellerId,
    staleTime: 60 * 1000,
  });

  if (!item) return null;

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr + 'T00:00:00');
    return date.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
  };

  const mlLink = `https://produto.mercadolivre.com.br/${item.item_id.replace(/^(MLB)(\d+)$/, '$1-$2')}`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-start gap-4">
            {item.thumbnail && (
              <img 
                src={item.thumbnail} 
                alt="" 
                className="w-20 h-20 rounded-lg object-cover border border-border flex-shrink-0"
              />
            )}
            <div className="flex-1 min-w-0">
              <p className="font-medium text-base leading-tight">{item.title}</p>
              <div className="flex items-center gap-2 mt-2">
                <Badge variant="outline" className="font-mono text-xs">
                  {item.item_id}
                </Badge>
                <a
                  href={mlLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-muted-foreground hover:text-primary"
                >
                  <ExternalLink className="h-4 w-4" />
                </a>
              </div>
            </div>
          </DialogTitle>
        </DialogHeader>

        {/* Summary Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4">
          {isLoading ? (
            <>
              {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-20" />)}
            </>
          ) : (
            <>
              <SummaryCard
                icon={<Eye className="h-4 w-4 text-blue-500" />}
                label="Visitas 7d"
                value={history?.totals.visits_7d || 0}
                comparison={history?.totals.visits_30d ? Math.round((history.totals.visits_7d / (history.totals.visits_30d / 4.3) - 1) * 100) : null}
              />
              <SummaryCard
                icon={<Eye className="h-4 w-4 text-blue-400" />}
                label="Visitas 30d"
                value={history?.totals.visits_30d || 0}
              />
              <SummaryCard
                icon={<Package className="h-4 w-4 text-green-500" />}
                label="Vendas 7d"
                value={history?.totals.sales_7d || 0}
                comparison={history?.totals.sales_30d ? Math.round((history.totals.sales_7d / (history.totals.sales_30d / 4.3) - 1) * 100) : null}
              />
              <SummaryCard
                icon={<Package className="h-4 w-4 text-green-400" />}
                label="Faturamento 30d"
                value={history?.totals.revenue_30d || 0}
                isCurrency
              />
            </>
          )}
        </div>

        {/* Charts */}
        <Tabs defaultValue="visits" className="mt-6">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="visits" className="gap-2">
              <Eye className="h-4 w-4" />
              Visitas
            </TabsTrigger>
            <TabsTrigger value="sales" className="gap-2">
              <Package className="h-4 w-4" />
              Vendas
            </TabsTrigger>
          </TabsList>

          <TabsContent value="visits" className="mt-4">
            {isLoading ? (
              <Skeleton className="h-[250px] w-full" />
            ) : history?.visits?.length ? (
              <ResponsiveContainer width="100%" height={250}>
                <AreaChart data={history.visits}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis 
                    dataKey="date" 
                    tickFormatter={formatDate}
                    tick={{ fontSize: 12 }}
                    className="text-muted-foreground"
                  />
                  <YAxis 
                    tick={{ fontSize: 12 }}
                    className="text-muted-foreground"
                  />
                  <Tooltip 
                    labelFormatter={(label) => formatDate(label)}
                    formatter={(value: number) => [value.toLocaleString('pt-BR'), 'Visitas']}
                    contentStyle={{ 
                      backgroundColor: 'hsl(var(--card))', 
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px',
                    }}
                  />
                  <Area 
                    type="monotone" 
                    dataKey="visits" 
                    stroke="hsl(var(--primary))" 
                    fill="hsl(var(--primary) / 0.2)" 
                    strokeWidth={2}
                  />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[250px] flex items-center justify-center text-muted-foreground">
                Sem dados de visitas disponíveis
              </div>
            )}
          </TabsContent>

          <TabsContent value="sales" className="mt-4">
            {isLoading ? (
              <Skeleton className="h-[250px] w-full" />
            ) : history?.sales?.length ? (
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={history.sales}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis 
                    dataKey="date" 
                    tickFormatter={formatDate}
                    tick={{ fontSize: 12 }}
                    className="text-muted-foreground"
                  />
                  <YAxis 
                    tick={{ fontSize: 12 }}
                    className="text-muted-foreground"
                  />
                  <Tooltip 
                    labelFormatter={(label) => formatDate(label)}
                    formatter={(value: number, name: string) => [
                      name === 'revenue' 
                        ? `R$ ${value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` 
                        : value.toLocaleString('pt-BR'),
                      name === 'revenue' ? 'Faturamento' : 'Unidades'
                    ]}
                    contentStyle={{ 
                      backgroundColor: 'hsl(var(--card))', 
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px',
                    }}
                  />
                  <Bar 
                    dataKey="quantity" 
                    fill="hsl(var(--primary))" 
                    radius={[4, 4, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[250px] flex items-center justify-center text-muted-foreground">
                Sem dados de vendas disponíveis
              </div>
            )}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

function SummaryCard({ 
  icon, 
  label, 
  value, 
  comparison, 
  isCurrency = false 
}: { 
  icon: React.ReactNode; 
  label: string; 
  value: number; 
  comparison?: number | null; 
  isCurrency?: boolean;
}) {
  const formattedValue = isCurrency 
    ? `R$ ${value.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}` 
    : value.toLocaleString('pt-BR');

  return (
    <div className="bg-muted/50 rounded-lg p-3">
      <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
        {icon}
        {label}
      </div>
      <div className="flex items-end gap-2">
        <span className="text-lg font-bold">{formattedValue}</span>
        {comparison !== undefined && comparison !== null && (
          <span className={`text-xs flex items-center gap-0.5 ${comparison >= 0 ? 'text-green-500' : 'text-red-500'}`}>
            {comparison >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
            {Math.abs(comparison)}%
          </span>
        )}
      </div>
    </div>
  );
}
