import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Eye, Package, Bell, TrendingUp, TrendingDown, ExternalLink, RefreshCw, CheckCircle, AlertCircle, BarChart3 } from 'lucide-react';
import { useSellerTopVisited, useSellerTopSold, useAlerts, useTriggerCollection, useDismissAlert, useMarkAlertRead, SellerItem } from '@/hooks/useTrendsApi';
import { TrendsItemDetailDrawer } from './TrendsItemDetailDrawer';
import { SellerMarketComparison } from './SellerMarketComparison';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';

interface TrendsSellerTabProps {
  sellerId: string | null;
}

export function TrendsSellerTab({ sellerId }: TrendsSellerTabProps) {
  const [periodDays, setPeriodDays] = useState<number>(7);
  const [activeSubTab, setActiveSubTab] = useState('comparison');
  const [selectedItem, setSelectedItem] = useState<SellerItem | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const { data: topVisited, isLoading: visitedLoading, refetch: refetchVisited } = useSellerTopVisited(sellerId, periodDays);
  const { data: topSold, isLoading: soldLoading, refetch: refetchSold } = useSellerTopSold(sellerId, periodDays);
  const { data: alertsData, isLoading: alertsLoading } = useAlerts(sellerId, true);
  const triggerCollection = useTriggerCollection();
  const dismissAlert = useDismissAlert();
  const markRead = useMarkAlertRead();
  const queryClient = useQueryClient();

  const handleSync = async () => {
    if (!sellerId) return;
    
    toast.loading('Iniciando coleta de dados...', { id: 'collect-data' });
    
    triggerCollection.mutate(
      { sellerId, collectType: 'all' },
      {
        onSuccess: () => {
          toast.success('Coleta iniciada! Os dados serão atualizados em breve.', { 
            id: 'collect-data',
            duration: 5000,
            icon: <CheckCircle className="h-4 w-4 text-green-500" />
          });
          // Invalidate queries after a delay to allow backend processing
          setTimeout(() => {
            queryClient.invalidateQueries({ queryKey: ['trends'] });
            refetchVisited();
            refetchSold();
          }, 3000);
        },
        onError: (error) => {
          toast.error(`Erro ao iniciar coleta: ${error.message}`, { 
            id: 'collect-data',
            icon: <AlertCircle className="h-4 w-4 text-red-500" />
          });
        }
      }
    );
  };

  const handleRefresh = () => {
    refetchVisited();
    refetchSold();
  };

  const handleItemClick = (item: SellerItem) => {
    setSelectedItem(item);
    setDrawerOpen(true);
  };

  if (!sellerId) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <p className="text-muted-foreground">Selecione uma conta para visualizar métricas do seller.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Controls */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Select value={String(periodDays)} onValueChange={(v) => setPeriodDays(Number(v))}>
            <SelectTrigger className="w-[140px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7">Últimos 7 dias</SelectItem>
              <SelectItem value="30">Últimos 30 dias</SelectItem>
              <SelectItem value="90">Últimos 90 dias</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleRefresh}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Atualizar
          </Button>
          <Button 
            size="sm" 
            onClick={handleSync}
            disabled={triggerCollection.isPending}
          >
            {triggerCollection.isPending ? (
              <>
                <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                Coletando...
              </>
            ) : (
              <>
                <TrendingUp className="h-4 w-4 mr-2" />
                Coletar Dados
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Sub Tabs */}
      <Tabs value={activeSubTab} onValueChange={setActiveSubTab}>
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="comparison" className="gap-2">
            <BarChart3 className="h-4 w-4" />
            Comparativo
          </TabsTrigger>
          <TabsTrigger value="visited" className="gap-2">
            <Eye className="h-4 w-4" />
            Visitados
          </TabsTrigger>
          <TabsTrigger value="sold" className="gap-2">
            <Package className="h-4 w-4" />
            Vendidos
          </TabsTrigger>
          <TabsTrigger value="alerts" className="gap-2">
            <Bell className="h-4 w-4" />
            Alertas
            {alertsData && alertsData.unread_count > 0 && (
              <Badge variant="destructive" className="ml-1">{alertsData.unread_count}</Badge>
            )}
          </TabsTrigger>
        </TabsList>

        {/* Market Comparison */}
        <TabsContent value="comparison">
          <SellerMarketComparison sellerId={sellerId} />
        </TabsContent>

        {/* Top Visited */}
        <TabsContent value="visited">
          <Card className="border-blue-500/20">
            <CardHeader className="bg-blue-500/5">
              <CardTitle className="flex items-center gap-2 text-lg">
                <Eye className="h-5 w-5 text-blue-500" />
                Produtos Mais Visitados ({periodDays}d)
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                Ranking por número de visualizações no período
              </p>
            </CardHeader>
            <CardContent className="pt-4">
              {visitedLoading ? (
                <div className="space-y-3">
                  {[1, 2, 3, 4, 5].map(i => <Skeleton key={i} className="h-16 w-full" />)}
                </div>
              ) : topVisited?.items?.length ? (
                <ScrollArea className="h-[400px]">
                  <div className="space-y-2 pr-4">
                    {topVisited.items.map((item, idx) => (
                      <div 
                        key={item.item_id} 
                        className="flex items-center gap-4 p-3 bg-blue-500/5 rounded-lg hover:bg-blue-500/10 transition-colors cursor-pointer border border-blue-500/10"
                        onClick={() => handleItemClick(item)}
                      >
                        <span className="text-2xl font-bold text-blue-500 w-8 text-center">
                          {idx + 1}
                        </span>
                        {item.thumbnail && (
                          <img 
                            src={item.thumbnail} 
                            alt="" 
                            className="w-14 h-14 rounded-lg object-cover border border-border"
                          />
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="font-medium truncate">{item.title}</p>
                          <p className="text-sm text-muted-foreground">{item.item_id}</p>
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="flex items-center gap-2 bg-blue-500/10 px-3 py-1.5 rounded-lg">
                            <Eye className="h-4 w-4 text-blue-500" />
                            <span className="font-bold text-blue-600 dark:text-blue-400">
                              {item.visits?.toLocaleString('pt-BR')}
                            </span>
                          </div>
                          <a
                            href={`https://produto.mercadolivre.com.br/${item.item_id.replace(/^(MLB)(\d+)$/, '$1-$2')}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-muted-foreground hover:text-primary"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <ExternalLink className="h-4 w-4" />
                          </a>
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              ) : (
                <div className="text-center py-8">
                  <Eye className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <p className="text-muted-foreground">Nenhum dado de visitas disponível</p>
                  <p className="text-sm text-muted-foreground mt-2">Clique em "Coletar Dados" para sincronizar</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Top Sold */}
        <TabsContent value="sold">
          <Card className="border-green-500/20">
            <CardHeader className="bg-green-500/5">
              <CardTitle className="flex items-center gap-2 text-lg">
                <Package className="h-5 w-5 text-green-500" />
                Produtos Mais Vendidos ({periodDays}d)
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                Ranking por quantidade vendida e receita gerada
              </p>
            </CardHeader>
            <CardContent className="pt-4">
              {soldLoading ? (
                <div className="space-y-3">
                  {[1, 2, 3, 4, 5].map(i => <Skeleton key={i} className="h-16 w-full" />)}
                </div>
              ) : topSold?.items?.length ? (
                <ScrollArea className="h-[400px]">
                  <div className="space-y-2 pr-4">
                    {topSold.items.map((item, idx) => (
                      <div 
                        key={item.item_id} 
                        className="flex items-center gap-4 p-3 bg-green-500/5 rounded-lg hover:bg-green-500/10 transition-colors cursor-pointer border border-green-500/10"
                        onClick={() => handleItemClick(item)}
                      >
                        <span className="text-2xl font-bold text-green-500 w-8 text-center">
                          {idx + 1}
                        </span>
                        {item.thumbnail && (
                          <img 
                            src={item.thumbnail} 
                            alt="" 
                            className="w-14 h-14 rounded-lg object-cover border border-border"
                          />
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="font-medium truncate">{item.title}</p>
                          <p className="text-sm text-muted-foreground">{item.item_id}</p>
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="flex flex-col items-end gap-1">
                            <div className="flex items-center gap-2 bg-green-500/10 px-3 py-1.5 rounded-lg">
                              <Package className="h-4 w-4 text-green-500" />
                              <span className="font-bold text-green-600 dark:text-green-400">
                                {item.quantity} un
                              </span>
                            </div>
                            {item.revenue !== undefined && (
                              <span className="text-sm font-medium text-green-600 dark:text-green-400">
                                R$ {item.revenue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                              </span>
                            )}
                          </div>
                          <a
                            href={`https://produto.mercadolivre.com.br/${item.item_id.replace(/^(MLB)(\d+)$/, '$1-$2')}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-muted-foreground hover:text-primary"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <ExternalLink className="h-4 w-4" />
                          </a>
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              ) : (
                <div className="text-center py-8">
                  <Package className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <p className="text-muted-foreground">Nenhum dado de vendas disponível</p>
                  <p className="text-sm text-muted-foreground mt-2">Clique em "Coletar Dados" para sincronizar</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Alerts */}
        <TabsContent value="alerts">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Bell className="h-5 w-5 text-orange-500" />
                Alertas
              </CardTitle>
            </CardHeader>
            <CardContent>
              {alertsLoading ? (
                <div className="space-y-3">
                  {[1, 2, 3].map(i => <Skeleton key={i} className="h-20 w-full" />)}
                </div>
              ) : alertsData?.alerts?.length ? (
                <ScrollArea className="h-[400px]">
                  <div className="space-y-3 pr-4">
                    {alertsData.alerts.map((alert) => (
                      <div 
                        key={alert.id} 
                        className={`p-4 rounded-lg border ${
                          alert.is_read ? 'bg-muted/30' : 'bg-muted/50 border-primary/20'
                        }`}
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex items-start gap-3">
                            {alert.alert_type.includes('spike') ? (
                              <TrendingUp className="h-5 w-5 text-green-500 mt-0.5" />
                            ) : (
                              <TrendingDown className="h-5 w-5 text-red-500 mt-0.5" />
                            )}
                            <div>
                              <p className="font-medium">{alert.title}</p>
                              {alert.message && (
                                <p className="text-sm text-muted-foreground mt-1">{alert.message}</p>
                              )}
                              <p className="text-xs text-muted-foreground mt-2">
                                {new Date(alert.triggered_at).toLocaleString('pt-BR')}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge variant={
                              alert.severity === 'critical' ? 'destructive' : 
                              alert.severity === 'warning' ? 'secondary' : 'outline'
                            }>
                              {alert.severity}
                            </Badge>
                            {!alert.is_read && (
                              <Button 
                                variant="ghost" 
                                size="sm"
                                onClick={() => markRead.mutate(alert.id)}
                              >
                                Marcar lido
                              </Button>
                            )}
                            {!alert.is_dismissed && (
                              <Button 
                                variant="ghost" 
                                size="sm"
                                onClick={() => dismissAlert.mutate(alert.id)}
                              >
                                Dispensar
                              </Button>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              ) : (
                <div className="text-center py-8">
                  <Bell className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <p className="text-muted-foreground">Nenhum alerta disponível</p>
                  <p className="text-sm text-muted-foreground mt-2">
                    Alertas são gerados automaticamente quando há mudanças significativas
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Item Detail Drawer */}
      <TrendsItemDetailDrawer
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        item={selectedItem}
        sellerId={sellerId || ''}
      />
    </div>
  );
}
