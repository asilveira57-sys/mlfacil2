import { useState, useEffect } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  RefreshCw, ExternalLink, Package, TrendingUp, TrendingDown,
  Star, Search, ArrowUpDown, Users, TrendingUp as TrendingUpIcon
} from 'lucide-react';
import { CompetitorSeller, CompetitorSellerItem, useCompetitorSellers, CompetitorSalesReportDay } from '@/hooks/useCompetitorSellers';

interface SellerDetailDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sellerId: string;
  competitorSeller: CompetitorSeller;
  onSync: () => void;
  syncing: boolean;
}

type SortKey = 'sales' | 'price' | 'title';

export function SellerDetailDrawer({ open, onOpenChange, sellerId, competitorSeller, onSync, syncing }: SellerDetailDrawerProps) {
  const { getDetail, getSalesReport } = useCompetitorSellers(sellerId);
  const [items, setItems] = useState<CompetitorSellerItem[]>([]);
  const [deltas, setDeltas] = useState<Record<string, { sales_delta: number; price_change: number; first_seen: string }>>({});
  const [salesReport, setSalesReport] = useState<CompetitorSalesReportDay[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState<SortKey>('sales');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  useEffect(() => {
    if (open && competitorSeller) {
      loadDetail();
    }
  }, [open, competitorSeller?.id]);

  const loadDetail = async () => {
    setLoading(true);
    try {
      // Load detail and sales report in parallel
      const [detailData, reportData] = await Promise.all([
        getDetail(competitorSeller.id),
        getSalesReport(competitorSeller.id, 7),
      ]);
      
      if (detailData) {
        setItems(detailData.items);
        setDeltas(detailData.deltas);
      }
      setSalesReport(reportData);
    } catch (error) {
      console.error('loadDetail error:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (value: number | null) => {
    if (value === null || value === undefined) return '-';
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
  };

  const getDisplayName = () => {
    // LGPD masking: prefer user_alias, fallback to last 4 digits
    if (competitorSeller.user_alias) {
      return competitorSeller.user_alias;
    }
    const last4 = competitorSeller.ml_seller_id.slice(-4);
    return `Concorrente ${last4}`;
  };

  // Filter & sort
  const filteredItems = items
    .filter(item => {
      if (statusFilter !== 'all' && item.status !== statusFilter) return false;
      if (searchTerm && !item.title?.toLowerCase().includes(searchTerm.toLowerCase()) && !item.item_id.toLowerCase().includes(searchTerm.toLowerCase())) return false;
      return true;
    })
    .sort((a, b) => {
      switch (sortBy) {
        case 'sales':
          return (deltas[b.item_id]?.sales_delta || 0) - (deltas[a.item_id]?.sales_delta || 0);
        case 'price':
          return (b.price || 0) - (a.price || 0);
        case 'title':
          return (a.title || '').localeCompare(b.title || '');
        default:
          return 0;
      }
    });

  const totalEstimatedSales = Object.values(deltas).reduce((sum, d) => sum + d.sales_delta, 0);
  const totalRevenue = items.reduce((sum, item) => {
    const delta = deltas[item.item_id];
    return sum + (delta ? delta.sales_delta * (item.price || 0) : 0);
  }, 0);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            {getDisplayName()}
          </SheetTitle>
        </SheetHeader>

        <div className="mt-4 space-y-4">
          {/* Summary Cards */}
          <div className="grid grid-cols-3 gap-3">
            <Card>
              <CardContent className="p-3 text-center">
                <p className="text-xs text-muted-foreground">Anúncios</p>
                <p className="text-xl font-bold">{competitorSeller.total_items_tracked}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-3 text-center">
                <p className="text-xs text-muted-foreground">Vendas Est.</p>
                <p className="text-xl font-bold">{totalEstimatedSales}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-3 text-center">
                <p className="text-xs text-muted-foreground">Receita Est.</p>
                <p className="text-lg font-bold">{formatCurrency(totalRevenue)}</p>
              </CardContent>
            </Card>
          </div>

          {/* Daily Sales Report */}
          {salesReport.length >= 2 && (
            <Card>
              <CardContent className="p-4">
                <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                  <TrendingUpIcon className="h-4 w-4" />
                  Relatório Diário Estimado
                </h3>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-xs text-muted-foreground">Ontem</p>
                    <p className="text-lg font-bold">
                      {salesReport[salesReport.length - 2]?.estimated_sales || 0} vendas
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Anteontem</p>
                    <p className="text-lg font-bold">
                      {salesReport[salesReport.length - 3]?.estimated_sales || 0} vendas
                    </p>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  Estimado por variação de sold_quantity
                </p>
              </CardContent>
            </Card>
          )}

          {/* Reputation */}
          {competitorSeller.seller_reputation && (
            <div className="flex items-center gap-2 text-sm">
              <Star className="h-4 w-4 text-yellow-500" />
              <span>
                {competitorSeller.seller_reputation?.power_seller_status || 'N/A'}
              </span>
              {competitorSeller.seller_reputation?.transactions?.completed && (
                <Badge variant="secondary">{competitorSeller.seller_reputation.transactions.completed} vendas totais</Badge>
              )}
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={onSync} disabled={syncing}>
              <RefreshCw className={`h-4 w-4 mr-2 ${syncing ? 'animate-spin' : ''}`} />
              Sincronizar
            </Button>
          </div>

          {/* Filters */}
          <div className="flex gap-2">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar anúncio..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-8"
                />
              </div>
            </div>
            <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortKey)}>
              <SelectTrigger className="w-36">
                <ArrowUpDown className="h-4 w-4 mr-1" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="sales">Mais vendidos</SelectItem>
                <SelectItem value="price">Maior preço</SelectItem>
                <SelectItem value="title">Título A-Z</SelectItem>
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-28">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="active">Ativos</SelectItem>
                <SelectItem value="closed">Fechados</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Items List */}
          {loading ? (
            <div className="space-y-3">
              {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-20" />)}
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">{filteredItems.length} anúncios</p>
              {filteredItems.map((item) => {
                const delta = deltas[item.item_id];
                return (
                  <Card key={item.id} className={`overflow-hidden ${item.status !== 'active' ? 'opacity-50' : ''}`}>
                    <CardContent className="p-3">
                      <div className="flex items-start gap-3">
                        {item.thumbnail ? (
                          <img src={item.thumbnail} alt="" className="w-14 h-14 object-cover rounded flex-shrink-0" />
                        ) : (
                          <div className="w-14 h-14 bg-muted rounded flex items-center justify-center flex-shrink-0">
                            <Package className="h-5 w-5 text-muted-foreground" />
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{item.title || item.item_id}</p>
                          <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground flex-wrap">
                            <span className="font-semibold text-foreground text-sm">{formatCurrency(item.price)}</span>
                            {item.original_price && item.original_price > (item.price || 0) && (
                              <span className="line-through">{formatCurrency(item.original_price)}</span>
                            )}
                            <span>Ref: {item.sold_quantity_ref} vendidos</span>
                            {item.free_shipping && <Badge variant="outline" className="text-xs py-0">Frete grátis</Badge>}
                            {item.catalog_listing && <Badge variant="secondary" className="text-xs py-0">Catálogo</Badge>}
                          </div>
                          {delta && (
                            <div className="flex items-center gap-3 mt-1 text-xs">
                              {delta.sales_delta > 0 ? (
                                <span className="flex items-center gap-1 text-green-600">
                                  <TrendingUp className="h-3 w-3" />
                                  +{delta.sales_delta} vendas estimadas
                                </span>
                              ) : (
                                <span className="text-muted-foreground">Sem variação</span>
                              )}
                              {delta.price_change !== 0 && (
                                <span className={`flex items-center gap-1 ${delta.price_change > 0 ? 'text-red-500' : 'text-green-600'}`}>
                                  {delta.price_change > 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                                  {formatCurrency(Math.abs(delta.price_change))}
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                        {item.permalink && (
                          <Button variant="ghost" size="icon" asChild className="flex-shrink-0">
                            <a href={item.permalink} target="_blank" rel="noopener noreferrer">
                              <ExternalLink className="h-4 w-4" />
                            </a>
                          </Button>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
