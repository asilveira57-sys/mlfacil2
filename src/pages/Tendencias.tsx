import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { TrendingUp, BarChart3, Store, History, Bell, Package, Eye, ShoppingCart, AlertTriangle } from 'lucide-react';
import { useOverview, useAlerts, useMarketTrends, useSellerTopVisited, useSellerTopSold } from '@/hooks/useTrendsApi';

interface MlAccount {
  id: string;
  ml_user_id: string;
  nickname: string | null;
}

export default function Tendencias() {
  const navigate = useNavigate();
  const [accounts, setAccounts] = useState<MlAccount[]>([]);
  const [selectedSellerId, setSelectedSellerId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('overview');

  useEffect(() => {
    const checkAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        navigate('/auth');
        return;
      }

      const { data: mlAccounts } = await supabase
        .from('ml_accounts')
        .select('id, ml_user_id, nickname')
        .eq('user_id', session.user.id)
        .eq('is_active', true);

      if (mlAccounts && mlAccounts.length > 0) {
        setAccounts(mlAccounts);
        setSelectedSellerId(mlAccounts[0].ml_user_id);
      }
    };

    checkAuth();
  }, [navigate]);

  const { data: overview, isLoading: overviewLoading } = useOverview(selectedSellerId);
  const { data: alerts } = useAlerts(selectedSellerId);
  const { data: trends, isLoading: trendsLoading } = useMarketTrends();
  const { data: topVisited, isLoading: visitedLoading } = useSellerTopVisited(selectedSellerId, 7);
  const { data: topSold, isLoading: soldLoading } = useSellerTopSold(selectedSellerId, 7);

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <TrendingUp className="h-6 w-6 text-primary" />
              <h1 className="text-xl font-semibold">Tendências</h1>
            </div>
            
            {accounts.length > 0 && (
              <Select value={selectedSellerId || ''} onValueChange={setSelectedSellerId}>
                <SelectTrigger className="w-[200px]">
                  <SelectValue placeholder="Selecionar conta" />
                </SelectTrigger>
                <SelectContent>
                  {accounts.map((acc) => (
                    <SelectItem key={acc.id} value={acc.ml_user_id}>
                      {acc.nickname || acc.ml_user_id}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-6">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="grid w-full grid-cols-4 lg:w-auto lg:inline-grid">
            <TabsTrigger value="overview" className="gap-2">
              <BarChart3 className="h-4 w-4" />
              <span className="hidden sm:inline">Visão Geral</span>
            </TabsTrigger>
            <TabsTrigger value="market" className="gap-2">
              <TrendingUp className="h-4 w-4" />
              <span className="hidden sm:inline">Mercado</span>
            </TabsTrigger>
            <TabsTrigger value="seller" className="gap-2">
              <Store className="h-4 w-4" />
              <span className="hidden sm:inline">Seller</span>
            </TabsTrigger>
            <TabsTrigger value="history" className="gap-2">
              <History className="h-4 w-4" />
              <span className="hidden sm:inline">Histórico</span>
            </TabsTrigger>
          </TabsList>

          {/* Overview Tab */}
          <TabsContent value="overview" className="space-y-6">
            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <Card className="relative overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-br from-primary/10 to-transparent" />
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Em Alta no ML</CardTitle>
                  <TrendingUp className="h-4 w-4 text-primary" />
                </CardHeader>
                <CardContent>
                  {trendsLoading ? (
                    <Skeleton className="h-8 w-16" />
                  ) : (
                    <p className="text-2xl font-bold">{trends?.trends?.length || 0}</p>
                  )}
                  <p className="text-xs text-muted-foreground mt-1">
                    {trends?.snapshot_date ? `Atualizado: ${trends.snapshot_date}` : 'Aguardando dados'}
                  </p>
                </CardContent>
              </Card>

              <Card className="relative overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-br from-orange-500/10 to-transparent" />
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Alertas Abertos</CardTitle>
                  <Bell className="h-4 w-4 text-orange-500" />
                </CardHeader>
                <CardContent>
                  {overviewLoading ? (
                    <Skeleton className="h-8 w-16" />
                  ) : (
                    <p className="text-2xl font-bold">{overview?.alerts_count || 0}</p>
                  )}
                  <p className="text-xs text-muted-foreground mt-1">Não lidos</p>
                </CardContent>
              </Card>

              <Card className="relative overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-br from-blue-500/10 to-transparent" />
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Visitas 7d</CardTitle>
                  <Eye className="h-4 w-4 text-blue-500" />
                </CardHeader>
                <CardContent>
                  {overviewLoading ? (
                    <Skeleton className="h-8 w-16" />
                  ) : (
                    <p className="text-2xl font-bold">{overview?.seller_stats?.visits_7d?.toLocaleString('pt-BR') || 0}</p>
                  )}
                  <p className="text-xs text-muted-foreground mt-1">Total de visitas</p>
                </CardContent>
              </Card>

              <Card className="relative overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-br from-green-500/10 to-transparent" />
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Vendas 7d</CardTitle>
                  <ShoppingCart className="h-4 w-4 text-green-500" />
                </CardHeader>
                <CardContent>
                  {overviewLoading ? (
                    <Skeleton className="h-8 w-16" />
                  ) : (
                    <>
                      <p className="text-2xl font-bold">{overview?.seller_stats?.sales_7d || 0}</p>
                      {overview?.seller_stats?.growth_7d_vs_28d && (
                        <Badge variant={Number(overview.seller_stats.growth_7d_vs_28d) >= 0 ? 'default' : 'destructive'} className="mt-1">
                          {Number(overview.seller_stats.growth_7d_vs_28d) >= 0 ? '+' : ''}{overview.seller_stats.growth_7d_vs_28d}%
                        </Badge>
                      )}
                    </>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Alerts Section */}
            {alerts && alerts.alerts.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <AlertTriangle className="h-5 w-5 text-orange-500" />
                    Alertas Recentes
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {alerts.alerts.slice(0, 5).map((alert) => (
                      <div key={alert.id} className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                        <div>
                          <p className="font-medium">{alert.title}</p>
                          {alert.message && <p className="text-sm text-muted-foreground">{alert.message}</p>}
                        </div>
                        <Badge variant={alert.severity === 'critical' ? 'destructive' : alert.severity === 'warning' ? 'secondary' : 'outline'}>
                          {alert.severity}
                        </Badge>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Top Items Section */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <Eye className="h-5 w-5 text-blue-500" />
                    Mais Visitados (7d)
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {visitedLoading ? (
                    <div className="space-y-2">
                      {[1, 2, 3].map(i => <Skeleton key={i} className="h-12 w-full" />)}
                    </div>
                  ) : topVisited?.items?.length ? (
                    <div className="space-y-2">
                      {topVisited.items.slice(0, 5).map((item, idx) => (
                        <div key={item.item_id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50">
                          <span className="text-lg font-bold text-muted-foreground w-6">{idx + 1}</span>
                          {item.thumbnail && (
                            <img src={item.thumbnail} alt="" className="w-10 h-10 rounded object-cover" />
                          )}
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">{item.title}</p>
                          </div>
                          <Badge variant="outline">{item.visits?.toLocaleString('pt-BR')}</Badge>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-muted-foreground text-center py-4">Sem dados de visitas</p>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <Package className="h-5 w-5 text-green-500" />
                    Mais Vendidos (7d)
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {soldLoading ? (
                    <div className="space-y-2">
                      {[1, 2, 3].map(i => <Skeleton key={i} className="h-12 w-full" />)}
                    </div>
                  ) : topSold?.items?.length ? (
                    <div className="space-y-2">
                      {topSold.items.slice(0, 5).map((item, idx) => (
                        <div key={item.item_id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50">
                          <span className="text-lg font-bold text-muted-foreground w-6">{idx + 1}</span>
                          {item.thumbnail && (
                            <img src={item.thumbnail} alt="" className="w-10 h-10 rounded object-cover" />
                          )}
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">{item.title}</p>
                          </div>
                          <Badge variant="outline">{item.quantity} un</Badge>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-muted-foreground text-center py-4">Sem dados de vendas</p>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Market Tab */}
          <TabsContent value="market">
            <Card>
              <CardHeader>
                <CardTitle>Tendências do Mercado</CardTitle>
              </CardHeader>
              <CardContent>
                {trends?.message ? (
                  <div className="text-center py-8">
                    <TrendingUp className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                    <p className="text-muted-foreground">{trends.message}</p>
                  </div>
                ) : trends?.trends?.length ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    {trends.trends.map((trend, idx) => (
                      <div key={idx} className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg">
                        <span className="text-lg font-bold text-primary">{idx + 1}</span>
                        <span className="text-sm">{trend.keyword}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-muted-foreground text-center py-8">Carregando tendências...</p>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Seller Tab */}
          <TabsContent value="seller">
            <Card>
              <CardHeader>
                <CardTitle>Métricas do Seller</CardTitle>
              </CardHeader>
              <CardContent>
                {selectedSellerId ? (
                  <p className="text-muted-foreground">Dados do seller em carregamento. Sincronize seus dados para visualizar métricas detalhadas.</p>
                ) : (
                  <p className="text-muted-foreground">Selecione uma conta para visualizar métricas.</p>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* History Tab */}
          <TabsContent value="history">
            <Card>
              <CardHeader>
                <CardTitle>Histórico</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-center py-8">
                  <History className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <p className="text-muted-foreground">Dados disponíveis a partir de jan/2025</p>
                  <p className="text-sm text-muted-foreground mt-2">Fonte: snapshots do app</p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
