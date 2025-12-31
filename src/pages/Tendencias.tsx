import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { TrendingUp, BarChart3, Store, History, Bell, Eye, ShoppingCart, ArrowLeft } from 'lucide-react';
import { useOverview, useAlerts, useMarketTrends, useSellerTopVisited, useSellerTopSold } from '@/hooks/useTrendsApi';
import { TrendsSellerTab } from '@/components/trends/TrendsSellerTab';
import { TrendsHistoryTab } from '@/components/trends/TrendsHistoryTab';
import { TrendsMarketTab } from '@/components/trends/TrendsMarketTab';

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
              <Button variant="ghost" size="icon" onClick={() => navigate('/dashboard')}>
                <ArrowLeft className="h-5 w-5" />
              </Button>
              <TrendingUp className="h-6 w-6 text-orange-500" />
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
              <Card className="relative overflow-hidden group hover:shadow-lg transition-all duration-300">
                <div className="absolute inset-0 bg-gradient-to-br from-orange-500/10 to-transparent" />
                <div className="absolute -right-4 -top-4 w-24 h-24 bg-orange-500/5 rounded-full blur-2xl group-hover:scale-150 transition-transform" />
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Em Alta no ML</CardTitle>
                  <TrendingUp className="h-4 w-4 text-orange-500" />
                </CardHeader>
                <CardContent>
                  {trendsLoading ? (
                    <Skeleton className="h-8 w-16" />
                  ) : (
                    <p className="text-2xl font-bold">{trends?.trends?.length || 0}</p>
                  )}
                  <p className="text-xs text-muted-foreground mt-1">
                    {trends?.snapshot_date ? `Atualizado: ${new Date(trends.snapshot_date + 'T00:00:00').toLocaleDateString('pt-BR')}` : 'Aguardando dados'}
                  </p>
                </CardContent>
              </Card>

              <Card className="relative overflow-hidden group hover:shadow-lg transition-all duration-300">
                <div className="absolute inset-0 bg-gradient-to-br from-red-500/10 to-transparent" />
                <div className="absolute -right-4 -top-4 w-24 h-24 bg-red-500/5 rounded-full blur-2xl group-hover:scale-150 transition-transform" />
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Alertas Abertos</CardTitle>
                  <Bell className="h-4 w-4 text-red-500" />
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

              <Card className="relative overflow-hidden group hover:shadow-lg transition-all duration-300">
                <div className="absolute inset-0 bg-gradient-to-br from-blue-500/10 to-transparent" />
                <div className="absolute -right-4 -top-4 w-24 h-24 bg-blue-500/5 rounded-full blur-2xl group-hover:scale-150 transition-transform" />
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

              <Card className="relative overflow-hidden group hover:shadow-lg transition-all duration-300">
                <div className="absolute inset-0 bg-gradient-to-br from-green-500/10 to-transparent" />
                <div className="absolute -right-4 -top-4 w-24 h-24 bg-green-500/5 rounded-full blur-2xl group-hover:scale-150 transition-transform" />
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
                        <Badge 
                          variant={Number(overview.seller_stats.growth_7d_vs_28d) >= 0 ? 'default' : 'destructive'} 
                          className="mt-1"
                        >
                          {Number(overview.seller_stats.growth_7d_vs_28d) >= 0 ? '+' : ''}{overview.seller_stats.growth_7d_vs_28d}% vs 28d
                        </Badge>
                      )}
                    </>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Quick Lists */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Top Trends */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <TrendingUp className="h-5 w-5 text-orange-500" />
                    Top em Alta
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {trendsLoading ? (
                    <div className="space-y-2">
                      {[1, 2, 3, 4, 5].map(i => <Skeleton key={i} className="h-10 w-full" />)}
                    </div>
                  ) : trends?.trends?.length ? (
                    <div className="space-y-2">
                      {trends.trends.slice(0, 5).map((trend, idx) => (
                        <div key={idx} className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50 transition-colors">
                          <span className="text-lg font-bold text-orange-500 w-6">{idx + 1}</span>
                          <span className="text-sm">{trend.keyword}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-muted-foreground text-center py-4">Sem dados disponíveis</p>
                  )}
                </CardContent>
              </Card>

              {/* Alerts */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <Bell className="h-5 w-5 text-red-500" />
                    Alertas do Seller
                    {alerts && alerts.unread_count > 0 && (
                      <Badge variant="destructive">{alerts.unread_count}</Badge>
                    )}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {alerts?.alerts?.length ? (
                    <div className="space-y-2">
                      {alerts.alerts.slice(0, 5).map((alert) => (
                        <div key={alert.id} className="flex items-center justify-between p-2 bg-muted/50 rounded-lg">
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-sm truncate">{alert.title}</p>
                            <p className="text-xs text-muted-foreground">
                              {new Date(alert.triggered_at).toLocaleDateString('pt-BR')}
                            </p>
                          </div>
                          <Badge variant={alert.severity === 'critical' ? 'destructive' : 'secondary'}>
                            {alert.severity}
                          </Badge>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-muted-foreground text-center py-4">Nenhum alerta</p>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Top Items */}
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
                    <ShoppingCart className="h-5 w-5 text-green-500" />
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
            <TrendsMarketTab />
          </TabsContent>

          {/* Seller Tab */}
          <TabsContent value="seller">
            <TrendsSellerTab sellerId={selectedSellerId} />
          </TabsContent>

          {/* History Tab */}
          <TabsContent value="history">
            <TrendsHistoryTab sellerId={selectedSellerId} />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
