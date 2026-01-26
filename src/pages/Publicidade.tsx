import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import {
  AdsHeader,
  AdsKpiCards,
  AdsCampaignsTable,
  AdsProductsTable,
  AdsAlertsPanel,
  AdsSpendRevenueChart,
  AdsFilters,
} from '@/components/ads';
import { AdsRulesPanel } from '@/components/ads/AdsRulesPanel';
import { AdsTasksPanel } from '@/components/ads/AdsTasksPanel';
import { AdsExecutiveReport } from '@/components/ads/AdsExecutiveReport';
import {
  useAdsCampaigns,
  useAdsDailyMetrics,
  useAdsAlerts,
  useAdsMetricsSummary,
  useEnrichedAdsItems,
  useAdsSyncState,
} from '@/hooks/useAds';
import { AdsFilterState } from '@/types/ads';
import { 
  LayoutDashboard, 
  List, 
  Package, 
  Settings, 
  RefreshCw,
  TrendingUp,
  AlertCircle,
  FileText,
  Calculator,
} from 'lucide-react';
import { AdsBudgetSimulator } from '@/components/ads/AdsBudgetSimulator';

export default function Publicidade() {
  const navigate = useNavigate();
  const [sellerId, setSellerId] = useState<string>();
  const [workspaceId, setWorkspaceId] = useState<string>();
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<AdsFilterState>({});
  const [activeTab, setActiveTab] = useState('dashboard');

  // Date range (last 30 days by default)
  const today = new Date();
  const thirtyDaysAgo = new Date(today);
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const dateFrom = thirtyDaysAgo.toISOString().split('T')[0];
  const dateTo = today.toISOString().split('T')[0];

  // Load seller account
  useEffect(() => {
    const loadAccount = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        navigate('/auth');
        return;
      }

      // Load ML account
      const accountResult = await supabase
        .from('ml_accounts')
        .select('ml_user_id')
        .eq('user_id', user.id)
        .limit(1);

      const accounts = accountResult.data as { ml_user_id: string }[] | null;
      if (accounts && accounts.length > 0) {
        setSellerId(accounts[0].ml_user_id);
      }

      // Load workspace for task integration
      const prefsResult = await supabase
        .from('user_preferences')
        .select('active_workspace_id')
        .eq('user_id', user.id)
        .single();

      if (prefsResult.data?.active_workspace_id) {
        setWorkspaceId(prefsResult.data.active_workspace_id);
      }

      setLoading(false);
    };

    loadAccount();
  }, [navigate]);

  // Hooks for data
  const { campaigns, loading: campaignsLoading } = useAdsCampaigns(sellerId);
  const { metrics, loading: metricsLoading } = useAdsDailyMetrics(sellerId, dateFrom, dateTo);
  const { alerts, dismissAlert, markAsRead, unreadCount } = useAdsAlerts(sellerId);
  const { items: enrichedItems, loading: itemsLoading } = useEnrichedAdsItems(sellerId, filters);
  const summary = useAdsMetricsSummary(sellerId, dateFrom, dateTo);
  const { syncState, triggerSync } = useAdsSyncState(sellerId);

  // Summary cards data
  const activeCampaigns = campaigns.filter(c => c.status === 'active').length;
  const pausedCampaigns = campaigns.filter(c => c.status === 'paused').length;

  const headerContent = (
    <div className="flex items-center gap-2">
      {unreadCount > 0 && (
        <Badge variant="destructive" className="gap-1">
          <AlertCircle className="h-3 w-3" />
          {unreadCount} alertas
        </Badge>
      )}
      <Button 
        variant="outline" 
        size="sm" 
        onClick={triggerSync}
        disabled={syncState?.status === 'syncing'}
      >
        <RefreshCw className={`h-4 w-4 mr-2 ${syncState?.status === 'syncing' ? 'animate-spin' : ''}`} />
        Sincronizar
      </Button>
    </div>
  );

  if (loading) {
    return (
      <DashboardLayout title="Mercado ADS" subtitle="Carregando...">
        <div className="p-6 space-y-6">
          <Skeleton className="h-16 w-full" />
          <div className="grid grid-cols-6 gap-4">
            {[...Array(6)].map((_, i) => (
              <Skeleton key={i} className="h-24" />
            ))}
          </div>
          <Skeleton className="h-[400px]" />
        </div>
      </DashboardLayout>
    );
  }

  if (!sellerId) {
    return (
      <DashboardLayout title="Mercado ADS" subtitle="Analytics de publicidade">
        <div className="p-6">
          <Card className="max-w-md mx-auto">
            <CardHeader className="text-center">
              <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-muted flex items-center justify-center">
                <TrendingUp className="h-8 w-8 text-muted-foreground" />
              </div>
              <CardTitle>Conecte sua conta</CardTitle>
              <CardDescription>
                Conecte sua conta do Mercado Livre para analisar suas campanhas publicitárias.
              </CardDescription>
            </CardHeader>
            <CardContent className="text-center">
              <Button onClick={() => navigate('/settings')}>
                Conectar Mercado Livre
              </Button>
            </CardContent>
          </Card>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout 
      title="Mercado ADS" 
      subtitle="Analytics e inteligência de campanhas publicitárias"
      headerContent={headerContent}
    >
      <div className="p-4 lg:p-6 space-y-6">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <div className="flex items-center justify-between flex-wrap gap-4">
            <TabsList className="grid w-full max-w-2xl grid-cols-6">
              <TabsTrigger value="dashboard" className="flex items-center gap-2">
                <LayoutDashboard className="h-4 w-4" />
                <span className="hidden sm:inline">Dashboard</span>
              </TabsTrigger>
              <TabsTrigger value="campaigns" className="flex items-center gap-2">
                <List className="h-4 w-4" />
                <span className="hidden sm:inline">Campanhas</span>
              </TabsTrigger>
              <TabsTrigger value="products" className="flex items-center gap-2">
                <Package className="h-4 w-4" />
                <span className="hidden sm:inline">Produtos</span>
              </TabsTrigger>
              <TabsTrigger value="simulator" className="flex items-center gap-2">
                <Calculator className="h-4 w-4" />
                <span className="hidden sm:inline">Simulador</span>
              </TabsTrigger>
              <TabsTrigger value="rules" className="flex items-center gap-2">
                <Settings className="h-4 w-4" />
                <span className="hidden sm:inline">Regras</span>
              </TabsTrigger>
              <TabsTrigger value="report" className="flex items-center gap-2">
                <FileText className="h-4 w-4" />
                <span className="hidden sm:inline">Relatório</span>
              </TabsTrigger>
            </TabsList>

            {/* Sync status info */}
            {syncState?.last_sync_at && (
              <p className="text-xs text-muted-foreground">
                Última sync: {new Date(syncState.last_sync_at).toLocaleString('pt-BR')}
              </p>
            )}
          </div>

          {/* Dashboard Tab */}
          <TabsContent value="dashboard" className="space-y-6 mt-6">
            {/* KPI Cards */}
            <AdsKpiCards summary={summary} />

            {/* Charts and Alerts Row */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2">
                <AdsSpendRevenueChart metrics={metrics} />
              </div>
              <div>
                <AdsAlertsPanel
                  alerts={alerts}
                  onDismiss={dismissAlert}
                  onMarkRead={markAsRead}
                />
              </div>
            </div>

            {/* Quick Stats */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">Campanhas Ativas</p>
                      <p className="text-2xl font-bold">{activeCampaigns}</p>
                    </div>
                    <div className="h-12 w-12 rounded-full bg-success/10 flex items-center justify-center">
                      <TrendingUp className="h-6 w-6 text-success" />
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">Campanhas Pausadas</p>
                      <p className="text-2xl font-bold">{pausedCampaigns}</p>
                    </div>
                    <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center">
                      <List className="h-6 w-6 text-muted-foreground" />
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">Produtos Anunciados</p>
                      <p className="text-2xl font-bold">{enrichedItems.length}</p>
                    </div>
                    <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
                      <Package className="h-6 w-6 text-primary" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Top Campaigns Preview */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-lg">Campanhas Ativas</CardTitle>
                  <CardDescription>Top 5 campanhas por gasto</CardDescription>
                </div>
                <Button variant="ghost" size="sm" onClick={() => setActiveTab('campaigns')}>
                  Ver todas
                </Button>
              </CardHeader>
              <CardContent>
                {campaignsLoading ? (
                  <Skeleton className="h-[200px]" />
                ) : (
                  <AdsCampaignsTable
                    campaigns={campaigns.filter((c) => c.status === 'active').slice(0, 5)}
                  />
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Campaigns Tab */}
          <TabsContent value="campaigns" className="space-y-6 mt-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Todas as Campanhas</CardTitle>
                <CardDescription>
                  {campaigns.length} campanhas encontradas • {activeCampaigns} ativas
                </CardDescription>
              </CardHeader>
              <CardContent>
                {campaignsLoading ? (
                  <Skeleton className="h-[400px]" />
                ) : (
                  <AdsCampaignsTable campaigns={campaigns} />
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Products Tab */}
          <TabsContent value="products" className="space-y-6 mt-6">
            <div className="flex items-center justify-between flex-wrap gap-4">
              <div>
                <h2 className="text-lg font-semibold">Análise por Produto</h2>
                <p className="text-sm text-muted-foreground">
                  {enrichedItems.length} produtos anunciados
                </p>
              </div>
              <AdsFilters filters={filters} onChange={setFilters} campaigns={campaigns} />
            </div>

            {/* Situation Summary */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                { label: 'Escalar', count: enrichedItems.filter(i => i.situation === 'scale').length, color: 'bg-success/10 text-success' },
                { label: 'Manter', count: enrichedItems.filter(i => i.situation === 'maintain').length, color: 'bg-blue-500/10 text-blue-500' },
                { label: 'Ajustar', count: enrichedItems.filter(i => i.situation === 'adjust').length, color: 'bg-warning/10 text-warning' },
                { label: 'Pausar', count: enrichedItems.filter(i => i.situation === 'pause').length, color: 'bg-destructive/10 text-destructive' },
              ].map(({ label, count, color }) => (
                <Card key={label} className="border-border/50">
                  <CardContent className="py-4">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">{label}</span>
                      <Badge variant="secondary" className={color}>
                        {count}
                      </Badge>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            <Card>
              <CardContent className="p-0">
                {itemsLoading ? (
                  <Skeleton className="h-[400px] m-4" />
                ) : (
                  <AdsProductsTable items={enrichedItems} />
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Simulator Tab */}
          <TabsContent value="simulator" className="space-y-6 mt-6">
            <AdsBudgetSimulator sellerId={sellerId} />
          </TabsContent>

          {/* Rules Tab */}
          <TabsContent value="rules" className="space-y-6 mt-6">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2">
                <AdsRulesPanel sellerId={sellerId} />
              </div>
              <div>
                <AdsTasksPanel sellerId={sellerId} workspaceId={workspaceId} />
              </div>
            </div>
          </TabsContent>

          {/* Executive Report Tab */}
          <TabsContent value="report" className="space-y-6 mt-6">
            <AdsExecutiveReport sellerId={sellerId} />
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
