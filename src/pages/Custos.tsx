import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DollarSign, Package, TrendingUp, Calculator, RefreshCw, Settings, BarChart3, FileSearch } from 'lucide-react';
import { toast } from 'sonner';
import { CostCatalog } from '@/components/custos/CostCatalog';
import { CostSettings } from '@/components/custos/CostSettings';
import { CostOrders } from '@/components/custos/CostOrders';
import { CostAbcProfit } from '@/components/custos/CostAbcProfit';
import { CostOrderDiagnostic } from '@/components/custos/CostOrderDiagnostic';
import { PageContainer } from "@/components/layout/PageContainer";

interface MlAccount {
  id: string;
  ml_user_id: string;
  nickname: string | null;
}

export default function Custos() {
  const navigate = useNavigate();
  const [mlAccounts, setMlAccounts] = useState<MlAccount[]>([]);
  const [selectedSellerId, setSelectedSellerId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('resumo');
  const [isLoading, setIsLoading] = useState(true);
  const [isCalculating, setIsCalculating] = useState(false);
  const [summary, setSummary] = useState<any>(null);

  useEffect(() => {
    const checkAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        navigate('/auth');
        return;
      }

      const { data: accounts } = await supabase
        .from('ml_accounts')
        .select('id, ml_user_id, nickname')
        .eq('is_active', true);

      if (accounts && accounts.length > 0) {
        setMlAccounts(accounts);
        setSelectedSellerId(accounts[0].ml_user_id);
      }
      setIsLoading(false);
    };

    checkAuth();
  }, [navigate]);

  useEffect(() => {
    if (selectedSellerId) {
      loadSummary();
    }
  }, [selectedSellerId]);

  const loadSummary = async () => {
    if (!selectedSellerId) return;

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/cost-engine/summary?seller_id=${selectedSellerId}&period_days=30`,
        { headers: { Authorization: `Bearer ${session.access_token}` } }
      );

      if (response.ok) {
        const data = await response.json();
        setSummary(data);
      }
    } catch (error) {
      console.error('Error loading summary:', error);
    }
  };

  const handleCalculate = async () => {
    if (!selectedSellerId) return;

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
          body: JSON.stringify({ seller_id: selectedSellerId, period_days: 30 }),
        }
      );

      if (response.ok) {
        toast.success('Cálculo iniciado em background');
        setTimeout(() => {
          loadSummary();
          setIsCalculating(false);
        }, 5000);
      }
    } catch (error) {
      toast.error('Erro ao iniciar cálculo');
      setIsCalculating(false);
    }
  };

  if (isLoading) {
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
    <div className="flex items-center gap-4">
      <Select value={selectedSellerId || ''} onValueChange={setSelectedSellerId}>
        <SelectTrigger className="w-48">
          <SelectValue placeholder="Selecione a conta" />
        </SelectTrigger>
        <SelectContent>
          {mlAccounts.map(acc => (
            <SelectItem key={acc.id} value={acc.ml_user_id}>
              {acc.nickname || acc.ml_user_id}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button onClick={handleCalculate} disabled={isCalculating}>
        <RefreshCw className={`h-4 w-4 mr-2 ${isCalculating ? 'animate-spin' : ''}`} />
        {isCalculating ? 'Calculando...' : 'Recalcular'}
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
            <TabsTrigger value="catalogo"><Package className="h-4 w-4 mr-2" />Catálogo</TabsTrigger>
            <TabsTrigger value="pedidos"><DollarSign className="h-4 w-4 mr-2" />Pedidos</TabsTrigger>
            <TabsTrigger value="abc"><TrendingUp className="h-4 w-4 mr-2" />ABC por Lucro</TabsTrigger>
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
                    {summary?.summary?.total_revenue ? formatCurrency(summary.summary.total_revenue) : 'R$ 0,00'}
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm text-muted-foreground">Custo Total</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-bold text-destructive">
                    {summary?.summary?.total_cost ? formatCurrency(summary.summary.total_cost) : 'R$ 0,00'}
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm text-muted-foreground">Lucro Total</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className={`text-2xl font-bold ${(summary?.summary?.total_profit || 0) >= 0 ? 'text-green-600' : 'text-destructive'}`}>
                    {summary?.summary?.total_profit ? formatCurrency(summary.summary.total_profit) : 'R$ 0,00'}
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm text-muted-foreground">Margem Média</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-bold">
                    {summary?.summary?.avg_margin ? `${summary.summary.avg_margin.toFixed(1)}%` : '0%'}
                  </p>
                  {summary?.summary?.incomplete_percent > 0 && (
                    <p className="text-xs text-amber-600 mt-1">
                      {summary.summary.incomplete_percent.toFixed(0)}% pedidos sem custo
                    </p>
                  )}
                </CardContent>
              </Card>
              <Card className="border-amber-200 dark:border-amber-800 bg-amber-50/30 dark:bg-amber-900/10">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm text-amber-700 dark:text-amber-400">Cancelados (30d)</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-bold text-amber-600">
                    {summary?.summary?.cancelled_count || 0}
                  </p>
                  <p className="text-xs text-amber-600 mt-1">
                    VGV: {summary?.summary?.cancelled_vgv ? formatCurrency(summary.summary.cancelled_vgv) : 'R$ 0,00'}
                  </p>
                </CardContent>
              </Card>
            </div>

            {!summary?.summary?.order_count && (
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
            <CostCatalog sellerId={selectedSellerId || ''} />
          </TabsContent>

          <TabsContent value="pedidos">
            <CostOrders sellerId={selectedSellerId || ''} />
          </TabsContent>

          <TabsContent value="abc">
            <CostAbcProfit sellerId={selectedSellerId || ''} />
          </TabsContent>

          <TabsContent value="diagnostico">
            <CostOrderDiagnostic sellerId={selectedSellerId || ''} />
          </TabsContent>

          <TabsContent value="config">
            <CostSettings sellerId={selectedSellerId || ''} />
          </TabsContent>
        </Tabs>
      </main>
    </PageContainer>
  );
}
