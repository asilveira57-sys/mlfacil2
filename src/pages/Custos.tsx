import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { DollarSign, Package, TrendingUp, Calculator, RefreshCw, Settings, BarChart3, FileSearch, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { CostCatalog } from '@/components/custos/CostCatalog';
import { CostSettings } from '@/components/custos/CostSettings';
import { CostOrders } from '@/components/custos/CostOrders';
import { CostAbcProfit } from '@/components/custos/CostAbcProfit';
import { CostOrderDiagnostic } from '@/components/custos/CostOrderDiagnostic';
import { CostOrdersNoCost } from '@/components/custos/CostOrdersNoCost';
import { PageContainer } from "@/components/layout/PageContainer";
import { useActiveAccount } from '@/contexts/ActiveAccountContext';
import { useCostSyncWatchdog } from '@/hooks/useCostSyncWatchdog';
import { useCostWatchdogPreferences } from '@/hooks/useCostWatchdogPreferences';
import { useCostDataPolling } from '@/hooks/useCostDataPolling';
import { useModuleFeedbackIntegration } from '@/hooks/useModuleFeedbackIntegration';
import { FeedbackPromptCard } from '@/components/feedback';

export default function Custos() {
  const navigate = useNavigate();
  const { sellerId, loading: accountsLoading, initialized } = useActiveAccount();
  const [activeTab, setActiveTab] = useState('resumo');
  const feedback = useModuleFeedbackIntegration('precificacao-custos');
  const [isCalculating, setIsCalculating] = useState(false);
  
  // Watchdog integration
  const { enabled: watchdogEnabled } = useCostWatchdogPreferences();
  useCostSyncWatchdog(sellerId, watchdogEnabled);
  
  // Auto-polling for summary data
  const { summary, loading: summaryLoading, refresh: refreshSummary } = useCostDataPolling({
    sellerId,
    enabled: activeTab === 'resumo',
  });

  // Redirect to auth if not logged in
  useEffect(() => {
    const checkAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        navigate('/auth');
      }
    };
    checkAuth();
  }, [navigate]);

  // Refresh summary when tab becomes active
  useEffect(() => {
    if (activeTab === 'resumo' && sellerId) {
      refreshSummary();
    }
  }, [activeTab, sellerId, refreshSummary]);

  const handleCalculate = async () => {
    if (!sellerId) return;

    setIsCalculating(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/cost-engine/calculate`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ seller_id: sellerId, period_days: 30 }),
        }
      );

      if (response.ok) {
        toast.success('Cálculo iniciado em background');
        setTimeout(() => {
          refreshSummary();
          setIsCalculating(false);
        }, 5000);
      }
    } catch (error) {
      toast.error('Erro ao iniciar cálculo');
      setIsCalculating(false);
    }
  };

  // Loading state while accounts are being fetched
  if (!initialized || accountsLoading) {
    return (
      <PageContainer title="Módulo de Custos">
        <div className="p-6">
          <Skeleton className="h-8 w-48 mb-6" />
          <Skeleton className="h-64 w-full" />
        </div>
      </PageContainer>
    );
  }




  const formatCurrency = (value: number) => 
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);

  const headerContent = (
    <Button onClick={handleCalculate} disabled={isCalculating || !sellerId}>
      <RefreshCw className={`h-4 w-4 mr-2 ${isCalculating ? 'animate-spin' : ''}`} />
      {isCalculating ? 'Calculando...' : 'Recalcular'}
    </Button>
  );

  return (
    <PageContainer 
      title="Módulo de Custos" 
      subtitle="Análise de custos e lucratividade"
      headerContent={headerContent}
    >
      <main className="container mx-auto px-4 py-6">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="mb-6">
            <TabsTrigger value="resumo"><BarChart3 className="h-4 w-4 mr-2" />Resumo</TabsTrigger>
            <TabsTrigger value="catalogo"><Package className="h-4 w-4 mr-2" />Catálogo</TabsTrigger>
            <TabsTrigger value="pedidos"><DollarSign className="h-4 w-4 mr-2" />Pedidos</TabsTrigger>
            <TabsTrigger value="abc"><TrendingUp className="h-4 w-4 mr-2" />ABC por Lucro</TabsTrigger>
            <TabsTrigger value="sem-custo"><AlertCircle className="h-4 w-4 mr-2" />Sem Custo</TabsTrigger>
            <TabsTrigger value="diagnostico"><FileSearch className="h-4 w-4 mr-2" />Diagnóstico</TabsTrigger>
            <TabsTrigger value="config"><Settings className="h-4 w-4 mr-2" />Configurações</TabsTrigger>
          </TabsList>

          <TabsContent value="resumo">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm text-muted-foreground">Faturamento (30d)</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-bold">
                    {summary?.total_revenue ? formatCurrency(summary.total_revenue) : 'R$ 0,00'}
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm text-muted-foreground">Custo Total</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-bold text-destructive">
                    {summary?.total_cost ? formatCurrency(summary.total_cost) : 'R$ 0,00'}
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm text-muted-foreground">Lucro Total</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className={`text-2xl font-bold ${(summary?.total_profit || 0) >= 0 ? 'text-green-500' : 'text-destructive'}`}>
                    {summary?.total_profit ? formatCurrency(summary.total_profit) : 'R$ 0,00'}
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm text-muted-foreground">Margem Média</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-bold">
                    {summary?.avg_margin ? `${summary.avg_margin.toFixed(1)}%` : '0%'}
                  </p>
                  {(summary?.incomplete_percent || 0) > 0 && (
                    <p className="text-xs text-warning mt-1">
                      {summary?.incomplete_percent?.toFixed(0)}% pedidos sem custo
                    </p>
                  )}
                </CardContent>
              </Card>
              <Card className="border-warning/30 bg-warning/5">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm text-warning">Cancelados (30d)</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-bold text-warning">
                    {summary?.cancelled_count || 0}
                  </p>
                  <p className="text-xs text-warning mt-1">
                    VGV: {summary?.cancelled_vgv ? formatCurrency(summary.cancelled_vgv) : 'R$ 0,00'}
                  </p>
                </CardContent>
              </Card>
            </div>

            {!summary?.order_count && (
              <Card>
                <CardContent className="py-8 text-center">
                  <Calculator className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                  <p className="text-muted-foreground mb-4">
                    Nenhum cálculo realizado ainda. Clique em "Recalcular" para processar os pedidos.
                  </p>
                  <Button onClick={handleCalculate} disabled={isCalculating}>
                    <RefreshCw className={`h-4 w-4 mr-2 ${isCalculating ? 'animate-spin' : ''}`} />
                    Calcular Custos
                  </Button>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="catalogo">
            <CostCatalog sellerId={sellerId || ''} />
          </TabsContent>

          <TabsContent value="pedidos">
            <CostOrders sellerId={sellerId || ''} />
          </TabsContent>

          <TabsContent value="abc">
            <CostAbcProfit sellerId={sellerId || ''} />
          </TabsContent>

          <TabsContent value="sem-custo">
            <CostOrdersNoCost sellerId={sellerId || ''} />
          </TabsContent>

          <TabsContent value="diagnostico">
            <CostOrderDiagnostic sellerId={sellerId || ''} />
          </TabsContent>

          <TabsContent value="config">
            <CostSettings sellerId={sellerId || ''} />
          </TabsContent>
        </Tabs>

        {/* Feedback Prompt */}
        {feedback.ready && (
          <FeedbackPromptCard
            kind="module"
            moduleSlug="precificacao-custos"
            moduleName="Precificação & Custos"
            userId={feedback.userId!}
            sellerId={feedback.sellerId!}
          />
        )}
      </main>
    </PageContainer>
  );
}
