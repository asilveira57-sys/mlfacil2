import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { History, Calendar, TrendingUp, Store, AlertTriangle, ChevronRight, Package } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

interface TrendsHistoryTabProps {
  sellerId: string | null;
}

// Categories available for filtering
const CATEGORIES = [
  { id: '__ROOT__', label: 'Todas (Geral)' },
  { id: 'MLB5672', label: 'Acessórios para Veículos' },
  { id: 'MLB1051', label: 'Celulares e Telefones' },
  { id: 'MLB1648', label: 'Computadores' },
  { id: 'MLB1144', label: 'Eletrodomésticos' },
  { id: 'MLB1000', label: 'Eletrônicos' },
  { id: 'MLB1276', label: 'Esportes e Fitness' },
  { id: 'MLB263532', label: 'Ferramentas' },
  { id: 'MLB1574', label: 'Casa, Móveis e Decoração' },
  { id: 'MLB1499', label: 'Indústria e Comércio' },
  { id: 'MLB1384', label: 'Bebês' },
  { id: 'MLB1430', label: 'Artigos de Papelaria' },
  { id: 'MLB1367', label: 'Antiguidades e Coleções' },
  { id: 'MLB1368', label: 'Arte, Papelaria e Armarinho' },
  { id: 'MLB1132', label: 'Brinquedos e Hobbies' },
  { id: 'MLB1196', label: 'Calçados, Roupas e Bolsas' },
];

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

interface TrendKeyword {
  keyword: string;
  url?: string;
}

interface SnapshotData {
  snapshot_date: string;
  trends_data: TrendKeyword[];
}

export function TrendsHistoryTab({ sellerId }: TrendsHistoryTabProps) {
  const monthOptions = generateMonthOptions();
  const [selectedMonth, setSelectedMonth] = useState(monthOptions[0]?.key || '');
  const [sourceType, setSourceType] = useState<'seller' | 'market'>('seller');
  const [selectedCategory, setSelectedCategory] = useState('__ROOT__');
  const [expandedSnapshot, setExpandedSnapshot] = useState<SnapshotData | null>(null);

  // Fetch seller monthly history with product details
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
    enabled: !!sellerId && sourceType === 'seller',
  });

  // Fetch market snapshots history with category filter
  const { data: marketHistory, isLoading: marketLoading } = useQuery({
    queryKey: ['trends', 'history', 'market', selectedMonth, selectedCategory],
    queryFn: async () => {
      const monthStart = `${selectedMonth}-01`;
      const [year, month] = selectedMonth.split('-').map(Number);
      const nextMonth = month === 12 ? 1 : month + 1;
      const nextYear = month === 12 ? year + 1 : year;
      const monthEnd = `${nextYear}-${String(nextMonth).padStart(2, '0')}-01`;

      let query = supabase
        .from('trend_snapshots')
        .select('snapshot_date, trends_data')
        .eq('site_id', 'MLB')
        .gte('snapshot_date', monthStart)
        .lt('snapshot_date', monthEnd)
        .order('snapshot_date', { ascending: false });

      // Filter by category
      if (selectedCategory === '__ROOT__') {
        query = query.or('category_id.is.null,category_id.eq.__ROOT__');
      } else {
        query = query.eq('category_id', selectedCategory);
      }

      const { data, error } = await query;

      if (error) throw error;
      
      // Parse trends_data from Json to TrendKeyword[]
      return (data || []).map(item => ({
        snapshot_date: item.snapshot_date,
        trends_data: Array.isArray(item.trends_data) ? item.trends_data as unknown as TrendKeyword[] : []
      })) as SnapshotData[];
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

        {/* Category filter - only for market */}
        {sourceType === 'market' && (
          <div className="flex items-center gap-2">
            <Select value={selectedCategory} onValueChange={setSelectedCategory}>
              <SelectTrigger className="w-[220px]">
                <SelectValue placeholder="Categoria" />
              </SelectTrigger>
              <SelectContent>
                {CATEGORIES.map((cat) => (
                  <SelectItem key={cat.id} value={cat.id}>
                    {cat.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      {/* Content */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <History className="h-5 w-5 text-primary" />
            Histórico - {monthOptions.find(m => m.key === selectedMonth)?.label}
            {sourceType === 'market' && selectedCategory !== '__ROOT__' && (
              <Badge variant="secondary" className="ml-2">
                {CATEGORIES.find(c => c.id === selectedCategory)?.label}
              </Badge>
            )}
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
                      className="flex items-center gap-4 p-3 bg-muted/50 rounded-lg hover:bg-muted transition-colors"
                    >
                      <span className="text-xl font-bold text-muted-foreground w-8 text-center">
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
                          {Array.isArray(snapshot.trends_data) ? snapshot.trends_data.length : 0} palavras-chave
                        </span>
                      </div>
                      {Array.isArray(snapshot.trends_data) && snapshot.trends_data.length > 0 && (
                        <div className="flex flex-wrap gap-2">
                          {snapshot.trends_data.slice(0, 10).map((trend: TrendKeyword, idx: number) => (
                            <Badge key={idx} variant="secondary" className="text-xs">
                              <span className="text-muted-foreground mr-1">{idx + 1}.</span>
                              {trend.keyword}
                            </Badge>
                          ))}
                          {snapshot.trends_data.length > 10 && (
                            <Badge 
                              variant="outline" 
                              className="text-xs cursor-pointer hover:bg-primary hover:text-primary-foreground transition-colors"
                              onClick={() => setExpandedSnapshot(snapshot)}
                            >
                              +{snapshot.trends_data.length - 10} mais
                              <ChevronRight className="h-3 w-3 ml-1" />
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
                <p className="text-muted-foreground font-medium">
                  {selectedCategory !== '__ROOT__' 
                    ? `Nenhum dado coletado para ${CATEGORIES.find(c => c.id === selectedCategory)?.label}`
                    : 'Histórico indisponível antes da ativação do módulo'
                  }
                </p>
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

      {/* Dialog for expanded keywords */}
      <Dialog open={!!expandedSnapshot} onOpenChange={() => setExpandedSnapshot(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-primary" />
              Palavras-chave em Alta
              {expandedSnapshot && (
                <Badge variant="outline" className="ml-2">
                  {new Date(expandedSnapshot.snapshot_date + 'T00:00:00').toLocaleDateString('pt-BR')}
                </Badge>
              )}
            </DialogTitle>
          </DialogHeader>
          <ScrollArea className="h-[60vh] pr-4">
            <div className="grid grid-cols-1 gap-2">
              {expandedSnapshot?.trends_data.map((trend: TrendKeyword, idx: number) => (
                <div 
                  key={idx} 
                  className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg hover:bg-muted/80 transition-colors"
                >
                  <span className={`text-lg font-bold w-8 text-center ${
                    idx < 3 ? 'text-primary' : 
                    idx < 10 ? 'text-amber-500' : 
                    'text-muted-foreground'
                  }`}>
                    {idx + 1}
                  </span>
                  <span className="font-medium flex-1">{trend.keyword}</span>
                  {trend.url && (
                    <a 
                      href={trend.url} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="text-xs text-primary hover:underline"
                    >
                      Ver no ML
                    </a>
                  )}
                </div>
              ))}
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </div>
  );
}
