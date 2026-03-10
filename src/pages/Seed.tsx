import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { 
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useSeed } from "@/hooks/useSeed";
import { useActiveAccount } from "@/contexts/ActiveAccountContext";
import { PageContainer } from "@/components/layout/PageContainer";
import { 
  SeedBalanceCard, 
  SeedPlantedItemCard, 
  SeedEligibleItemCard,
  SeedItemDetailDrawer
} from "@/components/seed";
import { EligibleItem } from "@/types/seed";
import { 
  Sprout, 
  Search, 
  RefreshCw, 
  Leaf, 
  AlertTriangle,
  TrendingUp,
  Star,
  Info
} from "lucide-react";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";

export default function Seed() {
  const { t } = useTranslation('seed');
  const navigate = useNavigate();
  const { sellerId } = useActiveAccount();
  const {
    seedBalance,
    availableSeeds,
    totalSeeds,
    usedSeeds,
    plantedItems,
    plantedCount,
    eligibleItems,
    aplusCandidates,
    loading,
    error,
    plantItem,
    removeItem,
    refreshData,
  } = useSeed();

  const [activeTab, setActiveTab] = useState("garden");
  const [searchTerm, setSearchTerm] = useState("");
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [itemToRemove, setItemToRemove] = useState<string | null>(null);
  
  // Drawer state
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);

  // Filter planted items
  const filteredPlantedItems = plantedItems.filter(item =>
    !searchTerm || 
    item.item_title?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    item.item_id.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Filter eligible items
  const filteredEligibleItems = eligibleItems.filter(item =>
    !searchTerm || 
    item.item_title?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    item.item_id.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Stats
  const healthyCount = plantedItems.filter(i => i.health_status === 'healthy').length;
  const needsAttentionCount = plantedItems.filter(i => 
    i.health_status === 'stagnant' || i.health_status === 'weakening'
  ).length;

  // Cooldown: prevent calling edge function more than once every 5 minutes
  const lastMetricsCallRef = useRef<number>(0);
  const METRICS_COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      const now = Date.now();
      const timeSinceLastCall = now - lastMetricsCallRef.current;

      // Only call edge function if cooldown has passed
      if (sellerId && timeSinceLastCall >= METRICS_COOLDOWN_MS) {
        toast.info('Coletando métricas dos anúncios...');
        lastMetricsCallRef.current = now;
        const { error: fnError } = await supabase.functions.invoke('seed-metrics-collector', {
          body: { seller_id: sellerId },
        });
        if (fnError) {
          console.error('[Seed] Metrics collector error:', fnError);
        }
      } else if (sellerId && timeSinceLastCall < METRICS_COOLDOWN_MS) {
        const remainingMin = Math.ceil((METRICS_COOLDOWN_MS - timeSinceLastCall) / 60000);
        toast.info(`Usando dados recentes. Próxima coleta disponível em ${remainingMin} min.`);
      }
      // Then refresh local data
      await refreshData();
      toast.success(t('data_updated'));
    } catch (err) {
      console.error('[Seed] Refresh error:', err);
      toast.error('Erro ao atualizar métricas');
    } finally {
      setIsRefreshing(false);
    }
  };

  const handlePlant = async (item: EligibleItem) => {
    const success = await plantItem(item.item_id, item.item_title || undefined, item.item_thumbnail || undefined, item.abc_class);
    if (success) {
      toast.success(t('planted_success', { title: item.item_title || item.item_id }));
    }
  };

  const handleRemove = async () => {
    if (!itemToRemove) return;
    const success = await removeItem(itemToRemove);
    if (success) {
      toast.success(t('removed_success'));
    }
    setItemToRemove(null);
  };

  const handleViewDetails = (itemId: string) => {
    setSelectedItemId(itemId);
    setDrawerOpen(true);
  };

  const headerContent = (
    <Button 
      variant="outline" 
      size="sm" 
      onClick={handleRefresh}
      disabled={isRefreshing}
    >
      <RefreshCw className={`h-4 w-4 mr-2 ${isRefreshing ? 'animate-spin' : ''}`} />
      {t('refresh')}
    </Button>
  );

  if (loading) {
    return (
      <PageContainer title={t('title')} subtitle={t('subtitle')}>
        <div className="container mx-auto py-6 px-4 max-w-7xl space-y-6">
          <Skeleton className="h-40 w-full" />
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-48" />
            ))}
          </div>
        </div>
      </PageContainer>
    );
  }

  return (
    <PageContainer 
      title={t('title')} 
      subtitle={t('subtitle')}
      headerContent={headerContent}
    >
      <div className="container mx-auto py-6 px-4 max-w-7xl space-y-6">
        {/* Hero section */}
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-success/10 via-primary/5 to-background p-6 border">
          <div className="flex flex-col md:flex-row md:items-center gap-6">
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-12 h-12 rounded-xl bg-success/20 flex items-center justify-center">
                  <Sprout className="h-6 w-6 text-success" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-foreground">{t('garden.title')}</h2>
                  <p className="text-sm text-muted-foreground">
                    {t('garden.subtitle')}
                  </p>
                </div>
              </div>
              
              {/* Quick stats */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4">
                <div className="p-3 rounded-lg bg-background/80 backdrop-blur">
                  <p className="text-2xl font-bold text-success">{healthyCount}</p>
                  <p className="text-xs text-muted-foreground">{t('garden.healthy')}</p>
                </div>
                <div className="p-3 rounded-lg bg-background/80 backdrop-blur">
                  <p className="text-2xl font-bold text-warning">{needsAttentionCount}</p>
                  <p className="text-xs text-muted-foreground">{t('garden.needs_attention')}</p>
                </div>
                <div className="p-3 rounded-lg bg-background/80 backdrop-blur">
                  <p className="text-2xl font-bold text-foreground">{plantedCount}</p>
                  <p className="text-xs text-muted-foreground">{t('garden.planted')}</p>
                </div>
                <div className="p-3 rounded-lg bg-background/80 backdrop-blur">
                  <p className="text-2xl font-bold text-primary">{availableSeeds}</p>
                  <p className="text-xs text-muted-foreground">{t('garden.free_seeds')}</p>
                </div>
              </div>
            </div>

            {/* Decorative plants */}
            <div className="hidden md:flex items-end gap-2 text-5xl">
              <span className="opacity-30">🌱</span>
              <span className="opacity-50">🌿</span>
              <span className="opacity-70">🪴</span>
              <span>🌳</span>
            </div>
          </div>
        </div>

        {/* Error message */}
        {error && (
          <div className="p-4 rounded-lg bg-destructive/10 border border-destructive/20 flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            <p className="text-sm text-destructive">{error}</p>
          </div>
        )}

        {/* Main content */}
        <div className="grid gap-6 lg:grid-cols-3">
          {/* Sidebar - Seed balance */}
          <div className="lg:col-span-1 space-y-4">
            <SeedBalanceCard
              availableSeeds={availableSeeds}
              totalSeeds={totalSeeds}
              usedSeeds={usedSeeds}
              plantedCount={plantedCount}
              planTier={seedBalance?.plan_tier || 'basic'}
              onBuySeeds={() => navigate('/seed/sementes')}
            />

            {/* Info card */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Info className="h-4 w-4" />
                  {t('how_it_works.title')}
                </CardTitle>
              </CardHeader>
              <CardContent className="text-xs text-muted-foreground space-y-2">
                <p dangerouslySetInnerHTML={{ __html: `• ${t('how_it_works.rule_1')}` }} />
                <p>• {t('how_it_works.rule_2')}</p>
                <p>• {t('how_it_works.rule_3')}</p>
                <p>• {t('how_it_works.rule_4')}</p>
              </CardContent>
            </Card>
          </div>

          {/* Main area */}
          <div className="lg:col-span-2">
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <div className="flex items-center justify-between gap-4 mb-4">
                <TabsList>
                  <TabsTrigger value="garden" className="gap-2">
                    <Leaf className="h-4 w-4" />
                    {t('tabs.my_garden')}
                    {plantedCount > 0 && (
                      <Badge variant="secondary" className="ml-1">{plantedCount}</Badge>
                    )}
                  </TabsTrigger>
                  <TabsTrigger value="eligible" className="gap-2">
                    <TrendingUp className="h-4 w-4" />
                    {t('tabs.eligible')}
                    {eligibleItems.filter(i => !i.is_planted).length > 0 && (
                      <Badge variant="secondary" className="ml-1">
                        {eligibleItems.filter(i => !i.is_planted).length}
                      </Badge>
                    )}
                  </TabsTrigger>
                  <TabsTrigger value="aplus" className="gap-2">
                    <Star className="h-4 w-4" />
                    {t('tabs.curve_aplus')}
                  </TabsTrigger>
                </TabsList>

                <div className="relative w-64 hidden sm:block">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder={t('search')}
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-9"
                  />
                </div>
              </div>

              {/* Garden tab */}
              <TabsContent value="garden" className="mt-0">
                {filteredPlantedItems.length === 0 ? (
                  <Card className="p-8 text-center">
                    <div className="text-4xl mb-4">🌱</div>
                    <h3 className="font-semibold text-lg mb-2">{t('garden.empty_title')}</h3>
                    <p className="text-muted-foreground mb-4">
                      {t('garden.empty_desc')}
                    </p>
                    <Button onClick={() => setActiveTab('eligible')}>
                      {t('garden.view_eligible')}
                    </Button>
                  </Card>
                ) : (
                  <div className="grid gap-4 sm:grid-cols-2">
                    {filteredPlantedItems.map((item) => (
                      <SeedPlantedItemCard
                        key={item.id}
                        item={item}
                        onView={handleViewDetails}
                        onRemove={(itemId) => setItemToRemove(itemId)}
                      />
                    ))}
                  </div>
                )}
              </TabsContent>

              {/* Eligible tab */}
              <TabsContent value="eligible" className="mt-0">
                {filteredEligibleItems.length === 0 ? (
                  <Card className="p-8 text-center">
                    <div className="text-4xl mb-4">📊</div>
                    <h3 className="font-semibold text-lg mb-2">{t('eligible.empty_title')}</h3>
                    <p className="text-muted-foreground">
                      {t('eligible.empty_desc')}
                    </p>
                  </Card>
                ) : (
                  <div className="grid gap-4 sm:grid-cols-2">
                    {filteredEligibleItems.map((item) => (
                      <SeedEligibleItemCard
                        key={item.item_id}
                        item={item}
                        onPlant={handlePlant}
                        onViewDetails={handleViewDetails}
                        disabled={availableSeeds === 0 || item.is_planted}
                      />
                    ))}
                  </div>
                )}
              </TabsContent>

              {/* A+ tab */}
              <TabsContent value="aplus" className="mt-0">
                <Card className="mb-4">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm">{t('aplus.what_is')}</CardTitle>
                    <CardDescription>
                      {t('aplus.description')}
                    </CardDescription>
                  </CardHeader>
                </Card>

                {aplusCandidates.length === 0 ? (
                  <Card className="p-8 text-center">
                    <div className="text-4xl mb-4">⭐</div>
                    <h3 className="font-semibold text-lg mb-2">{t('aplus.empty_title')}</h3>
                    <p className="text-muted-foreground">
                      {t('aplus.empty_desc')}
                    </p>
                  </Card>
                ) : (
                  <div className="grid gap-4 sm:grid-cols-2">
                    {aplusCandidates.map((candidate) => (
                      <Card key={candidate.id} className="border-primary/30 bg-primary/5">
                        <CardContent className="p-4">
                          <div className="flex items-start justify-between mb-2">
                            <div>
                              <h4 className="font-medium text-sm truncate">
                                {candidate.item_title || candidate.item_id}
                              </h4>
                              <p className="text-xs text-muted-foreground">
                                {t('aplus.consecutive_periods', { count: candidate.consecutive_periods })}
                              </p>
                            </div>
                            <Badge>A+</Badge>
                          </div>
                          <div className="grid grid-cols-2 gap-2 text-sm">
                            <div>
                              <p className="text-muted-foreground text-xs">{t('aplus.total_revenue')}</p>
                              <p className="font-medium text-success">
                                R$ {candidate.total_revenue.toLocaleString('pt-BR')}
                              </p>
                            </div>
                            <div>
                              <p className="text-muted-foreground text-xs">{t('aplus.stability')}</p>
                              <p className="font-medium">
                                {candidate.stability_score.toFixed(0)}/100
                              </p>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </TabsContent>
            </Tabs>
          </div>
        </div>
      </div>

      {/* Remove confirmation dialog */}
      <AlertDialog open={!!itemToRemove} onOpenChange={() => setItemToRemove(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('remove_dialog.title')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('remove_dialog.description')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('remove_dialog.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={handleRemove}>
              {t('remove_dialog.confirm')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Item detail drawer */}
      <SeedItemDetailDrawer
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        itemId={selectedItemId}
        sellerId={sellerId || ''}
        onRemove={(itemId) => {
          setDrawerOpen(false);
          setItemToRemove(itemId);
        }}
      />
    </PageContainer>
  );
}
