import { useState } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
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
import { useSend } from "@/hooks/useSend";
import { 
  SendSeedBalanceCard, 
  SendPlantedItemCard, 
  SendEligibleItemCard 
} from "@/components/send";
import { EligibleItem, HEALTH_STATUS_CONFIG } from "@/types/send";
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

export default function Send() {
  const navigate = useNavigate();
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
  } = useSend();

  const [activeTab, setActiveTab] = useState("garden");
  const [searchTerm, setSearchTerm] = useState("");
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [itemToRemove, setItemToRemove] = useState<string | null>(null);

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

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await refreshData();
    setIsRefreshing(false);
    toast.success("Dados atualizados");
  };

  const handlePlant = async (item: EligibleItem) => {
    const success = await plantItem(item.item_id, item.item_title || undefined, item.item_thumbnail || undefined, item.abc_class);
    if (success) {
      toast.success(`${item.item_title || item.item_id} foi plantado!`);
    }
  };

  const handleRemove = async () => {
    if (!itemToRemove) return;
    const success = await removeItem(itemToRemove);
    if (success) {
      toast.success("Anúncio removido do Send");
    }
    setItemToRemove(null);
  };

  const handleViewItem = (itemId: string) => {
    navigate(`/send/${itemId}`);
  };

  if (loading) {
    return (
      <DashboardLayout title="Send" subtitle="Cultive seus melhores anúncios">
        <div className="container mx-auto py-6 px-4 max-w-7xl space-y-6">
          <Skeleton className="h-40 w-full" />
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-48" />
            ))}
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout 
      title="Send" 
      subtitle="Cultive seus melhores anúncios"
      headerContent={
        <Button 
          variant="outline" 
          size="sm" 
          onClick={handleRefresh}
          disabled={isRefreshing}
        >
          <RefreshCw className={`h-4 w-4 mr-2 ${isRefreshing ? 'animate-spin' : ''}`} />
          Atualizar
        </Button>
      }
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
                  <h2 className="text-xl font-bold text-foreground">Seu Jardim de Anúncios</h2>
                  <p className="text-sm text-muted-foreground">
                    O espaço onde você cultiva os anúncios que sustentam seu negócio
                  </p>
                </div>
              </div>
              
              {/* Quick stats */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4">
                <div className="p-3 rounded-lg bg-background/80 backdrop-blur">
                  <p className="text-2xl font-bold text-success">{healthyCount}</p>
                  <p className="text-xs text-muted-foreground">Saudáveis</p>
                </div>
                <div className="p-3 rounded-lg bg-background/80 backdrop-blur">
                  <p className="text-2xl font-bold text-warning">{needsAttentionCount}</p>
                  <p className="text-xs text-muted-foreground">Precisam atenção</p>
                </div>
                <div className="p-3 rounded-lg bg-background/80 backdrop-blur">
                  <p className="text-2xl font-bold text-foreground">{plantedCount}</p>
                  <p className="text-xs text-muted-foreground">Plantados</p>
                </div>
                <div className="p-3 rounded-lg bg-background/80 backdrop-blur">
                  <p className="text-2xl font-bold text-primary">{availableSeeds}</p>
                  <p className="text-xs text-muted-foreground">Sementes livres</p>
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
            <SendSeedBalanceCard
              availableSeeds={availableSeeds}
              totalSeeds={totalSeeds}
              usedSeeds={usedSeeds}
              plantedCount={plantedCount}
              planTier={seedBalance?.plan_tier || 'basic'}
              onBuySeeds={() => navigate('/send/sementes')}
            />

            {/* Info card */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Info className="h-4 w-4" />
                  Como funciona
                </CardTitle>
              </CardHeader>
              <CardContent className="text-xs text-muted-foreground space-y-2">
                <p>• Apenas anúncios <strong>Curva A</strong> ou <strong>A+</strong> podem ser plantados</p>
                <p>• Cada semente permite cultivar 1 anúncio</p>
                <p>• Métricas detalhadas só rodam para anúncios no Send</p>
                <p>• Cuide dos seus anúncios para vê-los crescer</p>
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
                    Meu Jardim
                    {plantedCount > 0 && (
                      <Badge variant="secondary" className="ml-1">{plantedCount}</Badge>
                    )}
                  </TabsTrigger>
                  <TabsTrigger value="eligible" className="gap-2">
                    <TrendingUp className="h-4 w-4" />
                    Elegíveis
                    {eligibleItems.filter(i => !i.is_planted).length > 0 && (
                      <Badge variant="secondary" className="ml-1">
                        {eligibleItems.filter(i => !i.is_planted).length}
                      </Badge>
                    )}
                  </TabsTrigger>
                  <TabsTrigger value="aplus" className="gap-2">
                    <Star className="h-4 w-4" />
                    Curva A+
                  </TabsTrigger>
                </TabsList>

                <div className="relative w-64 hidden sm:block">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Buscar anúncio..."
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
                    <h3 className="font-semibold text-lg mb-2">Seu jardim está vazio</h3>
                    <p className="text-muted-foreground mb-4">
                      Plante seus primeiros anúncios Curva A para começar a cultivar
                    </p>
                    <Button onClick={() => setActiveTab('eligible')}>
                      Ver anúncios elegíveis
                    </Button>
                  </Card>
                ) : (
                  <div className="grid gap-4 sm:grid-cols-2">
                    {filteredPlantedItems.map((item) => (
                      <SendPlantedItemCard
                        key={item.id}
                        item={item}
                        onView={handleViewItem}
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
                    <h3 className="font-semibold text-lg mb-2">Nenhum anúncio elegível</h3>
                    <p className="text-muted-foreground">
                      Apenas anúncios Curva A (80% do faturamento) podem ser plantados.
                      Execute a análise ABC primeiro.
                    </p>
                  </Card>
                ) : (
                  <div className="grid gap-4 sm:grid-cols-2">
                    {filteredEligibleItems.map((item) => (
                      <SendEligibleItemCard
                        key={item.item_id}
                        item={item}
                        onPlant={handlePlant}
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
                    <CardTitle className="text-sm">O que é Curva A+?</CardTitle>
                    <CardDescription>
                      Anúncios que vendem consistentemente em vários períodos consecutivos,
                      demonstrando estabilidade e não dependendo apenas de sazonalidade.
                    </CardDescription>
                  </CardHeader>
                </Card>

                {aplusCandidates.length === 0 ? (
                  <Card className="p-8 text-center">
                    <div className="text-4xl mb-4">⭐</div>
                    <h3 className="font-semibold text-lg mb-2">Nenhum candidato A+ ainda</h3>
                    <p className="text-muted-foreground">
                      Anúncios são promovidos a A+ automaticamente quando vendem
                      consistentemente por 3+ períodos consecutivos.
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
                                {candidate.consecutive_periods} períodos consecutivos
                              </p>
                            </div>
                            <Badge>A+</Badge>
                          </div>
                          <div className="grid grid-cols-2 gap-2 text-sm">
                            <div>
                              <p className="text-muted-foreground text-xs">Receita total</p>
                              <p className="font-medium text-success">
                                R$ {candidate.total_revenue.toLocaleString('pt-BR')}
                              </p>
                            </div>
                            <div>
                              <p className="text-muted-foreground text-xs">Estabilidade</p>
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
            <AlertDialogTitle>Remover do Send?</AlertDialogTitle>
            <AlertDialogDescription>
              O anúncio será removido do seu jardim e a semente será devolvida ao seu saldo.
              O histórico será mantido, mas o ciclo atual será encerrado.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleRemove}>
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardLayout>
  );
}
