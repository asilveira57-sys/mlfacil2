import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { DollarSign, Package, TrendingUp, RefreshCw, Settings, BarChart3, FileSearch } from 'lucide-react';
import { toast } from 'sonner';
import { CostCatalog } from '@/components/custos/CostCatalog';
import { CostSettings } from '@/components/custos/CostSettings';
import { CostOrders } from '@/components/custos/CostOrders';
import { CostAbcProfit } from '@/components/custos/CostAbcProfit';
import { CostOrderDiagnostic } from '@/components/custos/CostOrderDiagnostic';
import { CostSummaryDashboard } from '@/components/custos/CostSummaryDashboard';
import { CostDateFilter, getDefaultDateRange, type DateRange } from '@/components/custos/CostDateFilter';

import { PageContainer } from "@/components/layout/PageContainer";
import { useActiveAccount } from '@/contexts/ActiveAccountContext';
import { useCostSyncWatchdog } from '@/hooks/useCostSyncWatchdog';
import { useCostWatchdogPreferences } from '@/hooks/useCostWatchdogPreferences';
import { useCostDataPolling } from '@/hooks/useCostDataPolling';
import { invalidateCostCache } from '@/hooks/useCostModuleCache';
import { useModuleFeedbackIntegration } from '@/hooks/useModuleFeedbackIntegration';
import { FeedbackPromptCard } from '@/components/feedback';

export default function Custos() {
  const navigate = useNavigate();
  const { sellerId, loading: accountsLoading, initialized } = useActiveAccount();
  const [activeTab, setActiveTab] = useState('resumo');
  const feedback = useModuleFeedbackIntegration('precificacao-custos');
  const [isCalculating, setIsCalculating] = useState(false);
  const [dateRange, setDateRange] = useState<DateRange>(getDefaultDateRange);
  
  // Watchdog integration
  const { enabled: watchdogEnabled } = useCostWatchdogPreferences();
  useCostSyncWatchdog(sellerId, watchdogEnabled);
  
  // Auto-polling for summary data with date range
  const { summary, loading: summaryLoading, refresh: refreshSummary } = useCostDataPolling({
    sellerId,
    enabled: activeTab === 'resumo',
    dateFrom: dateRange.from.toISOString(),
    dateTo: dateRange.to.toISOString(),
    periodDays: dateRange.periodDays,
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

  // Invalidate cache and refresh when switching tabs
  useEffect(() => {
    if (activeTab === 'resumo' && sellerId) {
      refreshSummary();
    }
    if (activeTab === 'pedidos') {
      invalidateCostCache('orders');
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
          body: JSON.stringify({ seller_id: sellerId, period_days: dateRange.periodDays }),
        }
      );

      if (response.ok) {
        toast.success('Cálculo iniciado em background. Atualizando automaticamente...');
        // Intelligent polling: check every 3s until order_count changes or 60s elapsed
        const initialCount = summary?.order_count ?? -1;
        let elapsed = 0;
        const pollInterval = setInterval(() => {
          elapsed += 3000;
          refreshSummary();
          if (elapsed >= 60000) {
            clearInterval(pollInterval);
            setIsCalculating(false);
            toast.info('Recálculo pode ainda estar processando. O dashboard será atualizado automaticamente.');
          }
        }, 3000);
        // Also watch for summary changes to stop early
        const checkDone = setInterval(() => {
          if (summary && summary.order_count !== initialCount && initialCount !== -1) {
            clearInterval(pollInterval);
            clearInterval(checkDone);
            setIsCalculating(false);
            toast.success('Recálculo concluído!');
          }
          if (!isCalculating) clearInterval(checkDone);
        }, 3500);
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
            <TabsTrigger value="catalogo"><Package className="h-4 w-4 mr-2" />Anúncios</TabsTrigger>
            <TabsTrigger value="pedidos"><DollarSign className="h-4 w-4 mr-2" />Pedidos</TabsTrigger>
            <TabsTrigger value="abc"><TrendingUp className="h-4 w-4 mr-2" />ABC por Lucro</TabsTrigger>
            <TabsTrigger value="diagnostico"><FileSearch className="h-4 w-4 mr-2" />Diagnóstico</TabsTrigger>
            <TabsTrigger value="config"><Settings className="h-4 w-4 mr-2" />Configurações</TabsTrigger>
          </TabsList>

          <TabsContent value="resumo">
            <div className="mb-5">
              <CostDateFilter value={dateRange} onChange={setDateRange} />
            </div>
            <CostSummaryDashboard
              summary={summary}
              loading={summaryLoading}
              onCalculate={handleCalculate}
              isCalculating={isCalculating}
              dateLabel={dateRange.label}
            />
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
