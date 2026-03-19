import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';
import { DollarSign, Package, TrendingUp, RefreshCw, Settings, BarChart3, FileSearch, AlertCircle, FileText } from 'lucide-react';
import { toast } from 'sonner';
import { CostCatalog } from '@/components/custos/CostCatalog';
import { CostSettings } from '@/components/custos/CostSettings';
import { CostOrders } from '@/components/custos/CostOrders';
import { CostAbcProfit } from '@/components/custos/CostAbcProfit';
import { CostOrderDiagnostic } from '@/components/custos/CostOrderDiagnostic';
import { CostWriteLog } from '@/components/custos/CostWriteLog';
import { CostSummaryDashboard } from '@/components/custos/CostSummaryDashboard';
import { CostDateFilter, getDefaultDateRange, type DateRange } from '@/components/custos/CostDateFilter';

import { PageContainer } from "@/components/layout/PageContainer";
import { useActiveAccount } from '@/contexts/ActiveAccountContext';
import { useCostSyncWatchdog } from '@/hooks/useCostSyncWatchdog';
import { useCostWatchdogPreferences } from '@/hooks/useCostWatchdogPreferences';
import { useCostDataPolling } from '@/hooks/useCostDataPolling';
import { useCostCalcJob } from '@/hooks/useCostCalcJob';
import { invalidateCostCache } from '@/hooks/useCostModuleCache';
import { useModuleFeedbackIntegration } from '@/hooks/useModuleFeedbackIntegration';
import { FeedbackPromptCard } from '@/components/feedback';

export default function Custos() {
  const navigate = useNavigate();
  const { sellerId, loading: accountsLoading, initialized } = useActiveAccount();
  const [activeTab, setActiveTab] = useState('resumo');
  const feedback = useModuleFeedbackIntegration('precificacao-custos');
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

  // Job-based calculation
  const { job, isActive, starting, progress, startCalc } = useCostCalcJob({
    sellerId,
    onComplete: () => {
      toast.success('Recálculo concluído!');
      invalidateCostCache('orders');
      refreshSummary();
    },
  });

  // Redirect to auth if not logged in
  useEffect(() => {
    const checkAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) navigate('/auth');
    };
    checkAuth();
  }, [navigate]);

  // Refresh when switching tabs
  useEffect(() => {
    if (activeTab === 'resumo' && sellerId) refreshSummary();
  }, [activeTab, sellerId, refreshSummary]);

  const handleCalculate = async () => {
    if (!sellerId) return;
    const result = await startCalc(
      dateRange.periodDays,
      dateRange.from.toISOString(),
      dateRange.to.toISOString()
    );
    if (result?.total_orders === 0) {
      toast.info('Nenhum pedido encontrado no período selecionado.');
    } else if (result?.job_id) {
      toast.success(`Recálculo iniciado: ${result.total_orders} pedidos`);
    } else if (result?.message) {
      toast.info(result.message);
    }
  };

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
    <div className="flex items-center gap-3">
      {isActive && job && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Progress value={progress} className="w-32 h-2" />
          <span>{job.processed_orders}/{job.total_orders || '?'}</span>
          <span className="text-xs opacity-70">
            {dateRange.from.toLocaleDateString('pt-BR')} — {dateRange.to.toLocaleDateString('pt-BR')}
          </span>
        </div>
      )}
      {job?.status === 'error' && (
        <div className="flex items-center gap-1 text-sm text-destructive">
          <AlertCircle className="h-4 w-4" />
          <span title={job.last_error || ''}>Erro</span>
        </div>
      )}
      <Button onClick={handleCalculate} disabled={isActive || starting || !sellerId} size="sm">
        <RefreshCw className={`h-4 w-4 mr-2 ${isActive || starting ? 'animate-spin' : ''}`} />
        {isActive ? 'Calculando...' : starting ? 'Iniciando...' : 'Recalcular'}
      </Button>
    </div>
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
            <TabsTrigger value="logs"><FileText className="h-4 w-4 mr-2" />Logs</TabsTrigger>
          </TabsList>

          <TabsContent value="resumo">
            <div className="mb-5">
              <CostDateFilter value={dateRange} onChange={setDateRange} />
            </div>
            <CostSummaryDashboard
              summary={summary}
              loading={summaryLoading}
              onCalculate={handleCalculate}
              isCalculating={isActive || starting}
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

          <TabsContent value="logs">
            <CostWriteLog sellerId={sellerId || ''} />
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
