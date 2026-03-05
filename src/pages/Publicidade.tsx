import { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { format, subDays } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { useActiveAccount } from '@/contexts/ActiveAccountContext';
import { useUserAccess } from '@/contexts/UserAccessContext';
import { TrialModuleGate } from '@/components/access/TrialModuleGate';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { PageContainer } from '@/components/layout/PageContainer';
import {
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
import { useAdsPeriodMetrics } from '@/hooks/useAdsPeriodMetrics';
import { getAdsCache, setAdsCache, adsCacheKey, ADS_CACHE_TTL } from '@/hooks/useAdsDataCache';
import { AdsFilterState } from '@/types/ads';
import { useModuleFeedbackIntegration } from '@/hooks/useModuleFeedbackIntegration';
import { FeedbackPromptCard } from '@/components/feedback';
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
  Brain,
  Link2,
  CalendarIcon,
} from 'lucide-react';
import { AdsBudgetSimulator } from '@/components/ads/AdsBudgetSimulator';
import { AdsAiConsultant } from '@/components/ads/AdsAiConsultant';
import { AdsConnectionsPanel } from '@/components/ads/AdsConnectionsPanel';
import { AdsCampaignDetailModal } from '@/components/ads/AdsCampaignDetailModal';
import { cn } from '@/lib/utils';
import type { AdsCampaign } from '@/types/ads';

type DatePeriod = '7d' | '14d' | '30d' | '60d' | '90d' | 'custom';

const periodOptions: { value: DatePeriod; label: string }[] = [
  { value: '7d', label: '7d' },
  { value: '14d', label: '14d' },
  { value: '30d', label: '30d' },
  { value: '60d', label: '60d' },
  { value: '90d', label: '90d' },
  { value: 'custom', label: 'Personalizado' },
];

const periodDays: Record<string, number> = {
  '7d': 7, '14d': 14, '30d': 30, '60d': 60, '90d': 90,
};

export default function Publicidade() {
  const navigate = useNavigate();
  const { sellerId, activeAccount, loading: accountLoading, initialized } = useActiveAccount();
  const { flags, trialActive } = useUserAccess();
  const isTrial = trialActive && !flags?.has_active_subscription;
  const feedback = useModuleFeedbackIntegration('gestao-anuncios');
  const [workspaceId, setWorkspaceId] = useState<string>();
  const [filters, setFilters] = useState<AdsFilterState>({});
  const [activeTab, setActiveTab] = useState('dashboard');
  const [datePeriod, setDatePeriod] = useState<DatePeriod>('30d');
  const [customFrom, setCustomFrom] = useState<Date>();
  const [customTo, setCustomTo] = useState<Date>();
  const [modalCampaign, setModalCampaign] = useState<AdsCampaign | null>(null);

  const handleOpenCampaignModal = useCallback((campaign: AdsCampaign) => {
    setModalCampaign(campaign);
  }, []);

  const { dateFrom, dateTo } = useMemo(() => {
    const today = new Date();
    if (datePeriod === 'custom' && customFrom && customTo) {
      return {
        dateFrom: format(customFrom, 'yyyy-MM-dd'),
        dateTo: format(customTo, 'yyyy-MM-dd'),
      };
    }
    const days = periodDays[datePeriod] || 30;
    return {
      dateFrom: format(subDays(today, days), 'yyyy-MM-dd'),
      dateTo: format(today, 'yyyy-MM-dd'),
    };
  }, [datePeriod, customFrom, customTo]);

  // Load workspace for task integration
  useEffect(() => {
    const loadWorkspace = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { navigate('/auth'); return; }
      const prefsResult = await supabase
        .from('user_preferences')
        .select('active_workspace_id')
        .eq('user_id', user.id)
        .single();
      if (prefsResult.data?.active_workspace_id) {
        setWorkspaceId(prefsResult.data.active_workspace_id);
      }
    };
    loadWorkspace();
  }, [navigate]);

  // Hooks for data
  const { campaigns, loading: campaignsLoading } = useAdsCampaigns(sellerId || undefined);
  const { metrics, loading: metricsLoading } = useAdsDailyMetrics(sellerId || undefined, dateFrom, dateTo);
  const { alerts, dismissAlert, markAsRead, unreadCount } = useAdsAlerts(sellerId || undefined);
  const { items: enrichedItems, loading: itemsLoading } = useEnrichedAdsItems(sellerId || undefined, filters);
  const fallbackSummary = useAdsMetricsSummary(enrichedItems);
  const { syncState, triggerSync } = useAdsSyncState(sellerId || undefined);

  // Listing cache enrichment for Products tab (Catalog/Full/Stock)
  const [listingInfoMap, setListingInfoMap] = useState<Map<string, { isCatalog: boolean; isFull: boolean; outOfStock: boolean; listingStatus: string | null }>>(new Map());
  useEffect(() => {
    if (!sellerId || enrichedItems.length === 0) return;
    const itemIds = enrichedItems.map(i => i.item_id);
    supabase
      .from('meli_listings_cache')
      .select('item_id, catalog_product_id, logistic_type, available_quantity, status')
      .eq('seller_id', sellerId)
      .in('item_id', itemIds)
      .then(({ data }) => {
        if (!data) return;
        const map = new Map<string, { isCatalog: boolean; isFull: boolean; outOfStock: boolean; listingStatus: string | null }>();
        for (const l of data) {
          map.set(l.item_id, {
            isCatalog: !!l.catalog_product_id,
            isFull: l.logistic_type === 'fulfillment',
            outOfStock: l.available_quantity === 0,
            listingStatus: l.status,
          });
        }
        setListingInfoMap(map);
      });
  }, [sellerId, enrichedItems]);
  
  // Period-based metrics from ML API (real-time)
  const { summary: periodSummary, dailyMetrics: periodDaily, campaignsMetrics, loading: periodLoading, error: periodError } = useAdsPeriodMetrics(
    sellerId || undefined,
    dateFrom,
    dateTo,
  );
  
  // Background preload common periods (7d, 14d) for instant modal switching
  useEffect(() => {
    if (!sellerId || periodLoading) return;
    const today = new Date();
    const periodsToPreload = ['7d', '14d'].filter(p => p !== datePeriod);
    
    Promise.allSettled(
      periodsToPreload.map(async (period) => {
        const days = periodDays[period];
        const from = format(subDays(today, days), 'yyyy-MM-dd');
        const to = format(today, 'yyyy-MM-dd');
        const cacheKey = adsCacheKey(sellerId, 'period', from, to);
        
        if (getAdsCache(cacheKey)) return; // Already cached
        
        console.log(`[Publicidade] Preloading ${period} metrics in background`);
        const { data, error } = await supabase.functions.invoke('ads-period-metrics', {
          body: { seller_id: sellerId, date_from: from, date_to: to },
        });
        if (error || !data) return;
        
        const fullResponse = {
          summary: {
            total_spent: data.total_spent || 0, total_revenue: data.total_revenue || 0,
            total_clicks: data.total_clicks || 0, total_impressions: data.total_impressions || 0,
            total_conversions: data.total_conversions || 0, avg_acos: data.avg_acos || 0,
            avg_roas: data.avg_roas || 0, avg_cpc: data.avg_cpc || 0, avg_tacos: data.avg_tacos || 0,
            products_at_loss: data.products_at_loss || 0, products_scalable: data.products_scalable || 0,
            total_seller_revenue: data.total_seller_revenue || 0, total_seller_orders: data.total_seller_orders || 0,
            total_cancelled_revenue: data.total_cancelled_revenue || 0, total_cancelled_orders: data.total_cancelled_orders || 0,
            organic_revenue: data.organic_revenue || 0, organic_percent: data.organic_percent || 0,
            paid_percent: data.paid_percent || 0, tacos_total: data.tacos_total || 0,
            cost_per_sale_general: data.cost_per_sale_general || 0, cost_per_sale_ads: data.cost_per_sale_ads || 0,
          },
          dailyMetrics: Array.isArray(data.daily) ? data.daily : [],
          campaigns: Array.isArray(data.campaigns) ? data.campaigns.map((c: any) => ({
            ml_campaign_id: String(c.ml_campaign_id || c.campaign_id || ''),
            name: c.name || '', spent: c.spent || 0, revenue: c.revenue || 0,
            clicks: c.clicks || 0, impressions: c.impressions || 0, conversions: c.conversions || 0,
          })) : [],
          dateFrom: from, dateTo: to,
        };
        setAdsCache(cacheKey, fullResponse, ADS_CACHE_TTL.PERIOD_METRICS);
        console.log(`[Publicidade] Preloaded ${period} metrics`);
      })
    ).catch(() => {}); // Silently ignore errors
  }, [sellerId, periodLoading, datePeriod]);

  // Use period metrics from edge function; fallback only on error
  const summary = useMemo(() => {
    if (periodError && fallbackSummary.total_spent > 0) return fallbackSummary;
    if (periodLoading && fallbackSummary.total_spent > 0) return fallbackSummary;
    return periodSummary;
  }, [periodError, periodLoading, periodSummary, fallbackSummary]);

  const activeCampaigns = campaigns.filter(c => c.status === 'active').length;
  const pausedCampaigns = campaigns.filter(c => c.status === 'paused').length;

  // Compute ad count per campaign from enriched items
  const adCountMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const item of enrichedItems) {
      const cId = String((item.raw_data as Record<string, unknown>)?.campaign_id || '');
      if (cId) {
        map.set(cId, (map.get(cId) || 0) + 1);
      }
    }
    return map;
  }, [enrichedItems]);
  const loading = accountLoading || !initialized;

  // Header without sync button
  const headerContent = unreadCount > 0 ? (
    <Badge variant="destructive" className="gap-1">
      <AlertCircle className="h-3 w-3" />
      {unreadCount} alertas
    </Badge>
  ) : null;

  if (loading) {
    return (
      <PageContainer title="Mercado ADS" subtitle="Carregando...">
        <div className="p-6 space-y-6">
          <Skeleton className="h-16 w-full" />
          <div className="grid grid-cols-4 gap-3">
            {[...Array(8)].map((_, i) => <Skeleton key={i} className="h-20" />)}
          </div>
          <Skeleton className="h-[300px]" />
        </div>
      </PageContainer>
    );
  }

  if (!sellerId) {
    return (
      <PageContainer title="Mercado ADS" subtitle="Analytics de publicidade">
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
              <Button onClick={() => navigate('/settings')}>Conectar Mercado Livre</Button>
            </CardContent>
          </Card>
        </div>
      </PageContainer>
    );
  }

  return (
    <PageContainer 
      title="Mercado ADS" 
      subtitle="Analytics e inteligência de campanhas publicitárias"
      headerContent={headerContent}
    >
      <TrialModuleGate
        feature="Histórico de campanhas ADS"
        message="Durante o período de teste, o módulo ADS exibe dados dos últimos 30 dias. Ative seu plano para acessar o histórico completo e sincronização automática."
        soft
      >
      <div className="p-4 lg:p-6 space-y-6">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <div className="flex items-center justify-between flex-wrap gap-4">
            <TabsList className="flex w-full max-w-4xl overflow-x-auto">
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
              <TabsTrigger value="consultant" className="flex items-center gap-2">
                <Brain className="h-4 w-4" />
                <span className="hidden sm:inline">Consultor IA</span>
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
              <TabsTrigger value="connections" className="flex items-center gap-2">
                <Link2 className="h-4 w-4" />
                <span className="hidden sm:inline">Conexões</span>
              </TabsTrigger>
            </TabsList>

            {syncState?.last_sync_at && (
              <p className="text-xs text-muted-foreground">
                Última sync: {new Date(syncState.last_sync_at).toLocaleString('pt-BR')}
              </p>
            )}
          </div>

          {/* Dashboard Tab */}
          <TabsContent value="dashboard" className="space-y-4 mt-4">
            {/* Period Filter */}
            <div className="flex items-center gap-2 flex-wrap">
              {periodOptions.map(opt => (
                <Button
                  key={opt.value}
                  variant={datePeriod === opt.value ? 'default' : 'outline'}
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => setDatePeriod(opt.value)}
                >
                  {opt.label}
                </Button>
              ))}
              {datePeriod === 'custom' && (
                <div className="flex items-center gap-1.5">
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" size="sm" className={cn("h-7 text-xs gap-1", !customFrom && "text-muted-foreground")}>
                        <CalendarIcon className="h-3 w-3" />
                        {customFrom ? format(customFrom, 'dd/MM/yy') : 'De'}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar mode="single" selected={customFrom} onSelect={setCustomFrom} className="p-3 pointer-events-auto" />
                    </PopoverContent>
                  </Popover>
                  <span className="text-xs text-muted-foreground">→</span>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" size="sm" className={cn("h-7 text-xs gap-1", !customTo && "text-muted-foreground")}>
                        <CalendarIcon className="h-3 w-3" />
                        {customTo ? format(customTo, 'dd/MM/yy') : 'Até'}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar mode="single" selected={customTo} onSelect={setCustomTo} className="p-3 pointer-events-auto" />
                    </PopoverContent>
                  </Popover>
                </div>
              )}
            </div>

            {/* KPI Cards */}
            {periodLoading ? (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {[...Array(8)].map((_, i) => <Skeleton key={i} className="h-20" />)}
              </div>
            ) : (
              <AdsKpiCards summary={summary} />
            )}

            {/* Charts and Alerts Row */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <div className="lg:col-span-2">
                <AdsSpendRevenueChart metrics={metrics} campaigns={campaigns} periodDaily={periodDaily} />
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
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <Card>
                <CardContent className="py-4 px-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs text-muted-foreground">Campanhas Ativas</p>
                      <p className="text-xl font-bold">{activeCampaigns}</p>
                    </div>
                    <div className="h-10 w-10 rounded-full bg-success/10 flex items-center justify-center">
                      <TrendingUp className="h-5 w-5 text-success" />
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="py-4 px-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs text-muted-foreground">Campanhas Pausadas</p>
                      <p className="text-xl font-bold">{pausedCampaigns}</p>
                    </div>
                    <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center">
                      <List className="h-5 w-5 text-muted-foreground" />
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="py-4 px-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs text-muted-foreground">Produtos Anunciados</p>
                      <p className="text-xl font-bold">{enrichedItems.length}</p>
                    </div>
                    <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                      <Package className="h-5 w-5 text-primary" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Top Campaigns Preview */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between py-3">
                <div>
                  <CardTitle className="text-base">Campanhas Ativas</CardTitle>
                  <CardDescription className="text-xs">Top 5 campanhas por gasto</CardDescription>
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
                <div className="flex items-center justify-between flex-wrap gap-3">
                  <div>
                    <CardTitle className="text-lg">Todas as Campanhas</CardTitle>
                    <CardDescription>
                      {campaigns.length} campanhas encontradas • {activeCampaigns} ativas • {pausedCampaigns} pausadas
                    </CardDescription>
                  </div>
                </div>
                {/* Period Filter - same as dashboard */}
                <div className="flex items-center gap-2 flex-wrap pt-2">
                  {periodOptions.map(opt => (
                    <Button
                      key={opt.value}
                      variant={datePeriod === opt.value ? 'default' : 'outline'}
                      size="sm"
                      className="h-7 text-xs"
                      onClick={() => setDatePeriod(opt.value)}
                    >
                      {opt.label}
                    </Button>
                  ))}
                  {datePeriod === 'custom' && (
                    <div className="flex items-center gap-1.5">
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button variant="outline" size="sm" className={cn("h-7 text-xs gap-1", !customFrom && "text-muted-foreground")}>
                            <CalendarIcon className="h-3 w-3" />
                            {customFrom ? format(customFrom, 'dd/MM/yy') : 'De'}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                          <Calendar mode="single" selected={customFrom} onSelect={setCustomFrom} className="p-3 pointer-events-auto" />
                        </PopoverContent>
                      </Popover>
                      <span className="text-xs text-muted-foreground">→</span>
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button variant="outline" size="sm" className={cn("h-7 text-xs gap-1", !customTo && "text-muted-foreground")}>
                            <CalendarIcon className="h-3 w-3" />
                            {customTo ? format(customTo, 'dd/MM/yy') : 'Até'}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                          <Calendar mode="single" selected={customTo} onSelect={setCustomTo} className="p-3 pointer-events-auto" />
                        </PopoverContent>
                      </Popover>
                    </div>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                {campaignsLoading ? (
                  <Skeleton className="h-[400px]" />
                ) : (
                  <AdsCampaignsTable
                    campaigns={campaigns}
                    syncState={syncState}
                    onTriggerSync={triggerSync}
                    dateFrom={dateFrom}
                    dateTo={dateTo}
                    precomputedMetrics={campaignsMetrics}
                    sellerId={sellerId}
                    onOpenCampaignModal={handleOpenCampaignModal}
                    adCountMap={adCountMap}
                  />
                )}
              </CardContent>
            </Card>

            {/* Campaign Detail Modal */}
            <AdsCampaignDetailModal
              campaign={modalCampaign}
              open={!!modalCampaign}
              onOpenChange={(open) => { if (!open) setModalCampaign(null); }}
              sellerId={sellerId}
              precomputedMetrics={campaignsMetrics}
              parentDateFrom={dateFrom}
              parentDateTo={dateTo}
              parentPeriod={datePeriod}
              onStatusChange={() => {
                setModalCampaign(null);
              }}
            />
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
                      <Badge variant="secondary" className={color}>{count}</Badge>
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
                  <AdsProductsTable items={enrichedItems} listingInfoMap={listingInfoMap} />
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* AI Consultant Tab */}
          <TabsContent value="consultant" className="space-y-6 mt-6">
            <AdsAiConsultant sellerId={sellerId} />
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

          {/* Connections Tab */}
          <TabsContent value="connections" className="space-y-6 mt-6">
            <AdsConnectionsPanel sellerId={sellerId} />
          </TabsContent>
        </Tabs>

        {/* Feedback Prompt */}
        {feedback.ready && (
          <FeedbackPromptCard
            kind="module"
            moduleSlug="gestao-anuncios"
            moduleName="Gestão de Anúncios"
            userId={feedback.userId!}
            sellerId={feedback.sellerId!}
          />
        )}
      </div>
      </TrialModuleGate>
    </PageContainer>
  );
}
