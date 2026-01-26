import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  AdsHeader,
  AdsKpiCards,
  AdsCampaignsTable,
  AdsProductsTable,
  AdsAlertsPanel,
  AdsSpendRevenueChart,
  AdsFilters,
} from '@/components/ads';
import {
  useAdsCampaigns,
  useAdsDailyMetrics,
  useAdsAlerts,
  useAdsMetricsSummary,
  useEnrichedAdsItems,
} from '@/hooks/useAds';
import { AdsFilterState } from '@/types/ads';
import { LayoutDashboard, List, Package, Settings } from 'lucide-react';

export default function Publicidade() {
  const navigate = useNavigate();
  const [sellerId, setSellerId] = useState<string>();
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

      // Type the query to avoid deep instantiation issues
      const result = await supabase
        .from('ml_accounts')
        .select('ml_user_id')
        .eq('user_id', user.id)
        .limit(1);

      const accounts = result.data as { ml_user_id: string }[] | null;
      if (accounts && accounts.length > 0) {
        setSellerId(accounts[0].ml_user_id);
      }
      setLoading(false);
    };

    loadAccount();
  }, [navigate]);

  // Hooks for data
  const { campaigns, loading: campaignsLoading } = useAdsCampaigns(sellerId);
  const { metrics, loading: metricsLoading } = useAdsDailyMetrics(sellerId, dateFrom, dateTo);
  const { alerts, dismissAlert, markAsRead } = useAdsAlerts(sellerId);
  const { items: enrichedItems, loading: itemsLoading } = useEnrichedAdsItems(sellerId, filters);
  const summary = useAdsMetricsSummary(sellerId, dateFrom, dateTo);

  if (loading) {
    return (
      <div className="container mx-auto p-6 space-y-6">
        <Skeleton className="h-16 w-full" />
        <div className="grid grid-cols-6 gap-4">
          {[...Array(6)].map((_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
        <Skeleton className="h-[400px]" />
      </div>
    );
  }

  if (!sellerId) {
    return (
      <div className="container mx-auto p-6">
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground mb-4">
              Nenhuma conta do Mercado Livre conectada.
            </p>
            <button
              className="text-primary underline"
              onClick={() => navigate('/settings')}
            >
              Conectar conta
            </button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <AdsHeader sellerId={sellerId} />

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full max-w-md grid-cols-4">
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
          <TabsTrigger value="rules" className="flex items-center gap-2">
            <Settings className="h-4 w-4" />
            <span className="hidden sm:inline">Regras</span>
          </TabsTrigger>
        </TabsList>

        {/* Dashboard Tab */}
        <TabsContent value="dashboard" className="space-y-6 mt-6">
          <AdsKpiCards summary={summary} />

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

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Campanhas Ativas</CardTitle>
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
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Análise por Produto</h2>
            <AdsFilters filters={filters} onChange={setFilters} campaigns={campaigns} />
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

        {/* Rules Tab */}
        <TabsContent value="rules" className="space-y-6 mt-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Regras de Automação</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-center py-12 text-muted-foreground">
                <Settings className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>Regras de automação em desenvolvimento</p>
                <p className="text-sm mt-2">
                  Em breve: pausar automaticamente produtos com ACOS alto,
                  escalar produtos com bom ROAS, e mais.
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
