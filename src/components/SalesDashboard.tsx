import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { SalesMetricsCard } from "./SalesMetricsCard";
import { SalesChart } from "./SalesChart";
import { TopProductsTable } from "./TopProductsTable";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  DollarSign,
  ShoppingCart,
  TrendingUp,
  Package,
  RefreshCw,
  AlertCircle,
  CloudDownload,
  CheckCircle,
  Database,
  AlertTriangle,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Progress } from "@/components/ui/progress";

interface DailySale {
  date: string;
  revenue: number;
  orders: number;
}

interface Product {
  id: string;
  title: string;
  quantity: number;
  revenue: number;
}

interface SalesMetrics {
  totalRevenue: number;
  totalOrders: number;
  revenueToday: number;
  ordersToday: number;
  revenue7d: number;
  orders7d: number;
  revenue30d: number;
  orders30d: number;
  averageTicket: number;
  averageTicket30d: number;
}

interface DebugInfo {
  cachedOrdersCount: number;
  cachedItemsCount: number;
  ordersWithItemsSynced: number;
  itemsSyncedPercent: number;
  source: string;
}

interface SalesData {
  metrics: SalesMetrics;
  dailySales: DailySale[];
  topProducts: Product[];
  seller: {
    nickname: string;
    email: string;
  };
  _debug?: DebugInfo;
}

interface SyncJob {
  id: string;
  status: string;
  total_records: number;
  processed_records: number;
}

const formatCurrency = (value: number) => {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
};

export function SalesDashboard() {
  const [salesData, setSalesData] = useState<SalesData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sellerId, setSellerId] = useState<string | null>(null);
  const { toast } = useToast();

  // Sync state
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncJob, setSyncJob] = useState<SyncJob | null>(null);

  const fetchSalesData = async (attempt = 0): Promise<void> => {
    setIsLoading(true);
    if (attempt === 0) setError(null);

    try {
      let { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        if (attempt < 2) {
          await new Promise(resolve => setTimeout(resolve, 500 * (attempt + 1)));
          return fetchSalesData(attempt + 1);
        }
        setError("Sessão expirada. Faça login novamente.");
        setIsLoading(false);
        return;
      }

      // Also fetch seller_id from ml_accounts
      const { data: accounts } = await supabase
        .from('ml_accounts')
        .select('ml_user_id')
        .eq('user_id', session.user.id)
        .eq('is_active', true)
        .limit(1);
      
      if (accounts?.[0]) {
        setSellerId(accounts[0].ml_user_id);
      }

      let response = await supabase.functions.invoke("ml-sales-data", {
        headers: { Authorization: `Bearer ${session.access_token}` }
      });

      if (response.error?.message?.includes('401') || response.error?.status === 401) {
        const { data: refreshData, error: refreshError } = await supabase.auth.refreshSession();
        
        if (refreshError || !refreshData.session) {
          if (attempt < 2) {
            await new Promise(resolve => setTimeout(resolve, 500 * (attempt + 1)));
            return fetchSalesData(attempt + 1);
          }
          setError("Sessão expirada. Faça login novamente.");
          setIsLoading(false);
          return;
        }
        
        session = refreshData.session;
        response = await supabase.functions.invoke("ml-sales-data", {
          headers: { Authorization: `Bearer ${session.access_token}` }
        });
      }

      if (response.error) {
        throw response.error;
      }

      if (response.data?.error === "No ML account connected") {
        setError("connect");
        setIsLoading(false);
        return;
      }

      if (response.data?.error) {
        throw new Error(response.data.error);
      }

      setSalesData(response.data);
    } catch (err: any) {
      console.error("Error fetching sales data:", err);
      if (attempt < 2) {
        await new Promise(resolve => setTimeout(resolve, 500 * (attempt + 1)));
        return fetchSalesData(attempt + 1);
      }
      const errorMsg = err?.message || "Erro ao carregar dados de vendas";
      setError(errorMsg);
      toast({
        title: "Erro",
        description: "Não foi possível carregar os dados de vendas",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Sync orders function
  const syncOrders = useCallback(async () => {
    if (!sellerId) {
      toast({
        title: "Erro",
        description: "Conta ML não encontrada",
        variant: "destructive",
      });
      return;
    }

    setIsSyncing(true);
    setSyncJob(null);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error("Sessão expirada");
      }

      const response = await supabase.functions.invoke("ml-sync-orders", {
        headers: { Authorization: `Bearer ${session.access_token}` },
        body: { seller_id: sellerId }
      });

      if (response.error) {
        throw response.error;
      }

      if (response.data?.job_id) {
        toast({
          title: "Sincronização iniciada",
          description: "Os pedidos estão sendo sincronizados em background",
        });
        
        // Start polling for job status
        pollJobStatus(response.data.job_id);
      }
    } catch (err: any) {
      console.error("Error syncing orders:", err);
      setIsSyncing(false);
      toast({
        title: "Erro ao sincronizar",
        description: err?.message || "Não foi possível iniciar a sincronização",
        variant: "destructive",
      });
    }
  }, [sellerId, toast]);

  // Poll job status
  const pollJobStatus = useCallback(async (jobId: string) => {
    const poll = async () => {
      const { data, error } = await supabase
        .from('sync_jobs')
        .select('id, status, total_records, processed_records')
        .eq('id', jobId)
        .maybeSingle();

      if (error || !data) {
        setIsSyncing(false);
        return;
      }

      setSyncJob(data);

      if (data.status === 'done') {
        setIsSyncing(false);
        toast({
          title: "Sincronização concluída",
          description: `${data.processed_records} pedidos sincronizados`,
        });
        // Refresh sales data
        fetchSalesData();
      } else if (data.status === 'error') {
        setIsSyncing(false);
        toast({
          title: "Erro na sincronização",
          description: "Ocorreu um erro durante a sincronização",
          variant: "destructive",
        });
      } else {
        // Continue polling
        setTimeout(poll, 2000);
      }
    };

    poll();
  }, [toast]);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (session && (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'INITIAL_SESSION')) {
        setTimeout(() => fetchSalesData(), 100);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  if (error === "connect") {
    return (
      <Card className="p-8 text-center">
        <AlertCircle className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
        <h3 className="text-xl font-semibold mb-2">Conta não conectada</h3>
        <p className="text-muted-foreground mb-4">
          Conecte sua conta do Mercado Livre para ver o Dashboard de Vendas
        </p>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="p-8 text-center">
        <AlertCircle className="w-12 h-12 mx-auto mb-4 text-destructive" />
        <h3 className="text-xl font-semibold mb-2">Erro ao carregar</h3>
        <p className="text-muted-foreground mb-4">{error}</p>
        <Button onClick={() => fetchSalesData()} variant="outline">
          <RefreshCw className="w-4 h-4 mr-2" />
          Tentar novamente
        </Button>
      </Card>
    );
  }

  const metrics = salesData?.metrics;
  const debug = salesData?._debug;
  const syncProgress = syncJob && syncJob.total_records > 0 
    ? (syncJob.processed_records / syncJob.total_records) * 100 
    : 0;

  // Check if sync is needed
  const needsSync = debug && (debug.cachedOrdersCount === 0 || debug.itemsSyncedPercent < 50);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h3 className="text-2xl font-bold text-foreground">Dashboard de Vendas</h3>
          {salesData?.seller && (
            <p className="text-muted-foreground">
              Conta: {salesData.seller.nickname || salesData.seller.email}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="default"
            size="sm"
            onClick={syncOrders}
            disabled={isSyncing || !sellerId}
          >
            {isSyncing ? (
              <>
                <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                Sincronizando...
              </>
            ) : (
              <>
                <CloudDownload className="w-4 h-4 mr-2" />
                Sincronizar Pedidos
              </>
            )}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => fetchSalesData()}
            disabled={isLoading}
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${isLoading ? "animate-spin" : ""}`} />
            Atualizar
          </Button>
        </div>
      </div>

      {/* Sync Progress */}
      {isSyncing && syncJob && (
        <Card className="p-4">
          <div className="flex items-center gap-4">
            <RefreshCw className="w-5 h-5 animate-spin text-primary" />
            <div className="flex-1">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium">Sincronizando pedidos...</span>
                <span className="text-sm text-muted-foreground">
                  {syncJob.processed_records} / {syncJob.total_records}
                </span>
              </div>
              <Progress value={syncProgress} className="h-2" />
            </div>
          </div>
        </Card>
      )}

      {/* Sync Complete Notice */}
      {!isSyncing && syncJob?.status === 'done' && (
        <Card className="p-4 border-green-500/30 bg-green-500/5">
          <div className="flex items-center gap-3">
            <CheckCircle className="w-5 h-5 text-green-500" />
            <span className="text-sm font-medium text-green-700 dark:text-green-400">
              Sincronização concluída: {syncJob.processed_records} pedidos e items atualizados
            </span>
          </div>
        </Card>
      )}

      {/* Sync Needed Warning */}
      {!isSyncing && !isLoading && needsSync && (
        <Card className="p-4 border-amber-500/30 bg-amber-500/5">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <AlertTriangle className="w-5 h-5 text-amber-500" />
              <span className="text-sm font-medium text-amber-700 dark:text-amber-400">
                {debug?.cachedOrdersCount === 0 
                  ? "Nenhum pedido sincronizado. Clique em 'Sincronizar Pedidos' para carregar os dados."
                  : `Apenas ${debug?.itemsSyncedPercent}% dos pedidos têm itens sincronizados. Sincronize para ver dados completos.`
                }
              </span>
            </div>
            <Button size="sm" variant="outline" onClick={syncOrders} disabled={!sellerId}>
              <CloudDownload className="w-4 h-4 mr-2" />
              Sincronizar
            </Button>
          </div>
        </Card>
      )}

      {/* Debug/Validation Indicators */}
      {debug && !isLoading && (
        <Card className="p-4">
          <div className="flex items-center gap-2 mb-3">
            <Database className="w-4 h-4 text-muted-foreground" />
            <span className="text-sm font-medium text-muted-foreground">Indicadores de Cache</span>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="text-center p-3 bg-muted/50 rounded-lg">
              <div className="text-2xl font-bold text-foreground">{debug.cachedOrdersCount}</div>
              <div className="text-xs text-muted-foreground">Pedidos no Cache</div>
            </div>
            <div className="text-center p-3 bg-muted/50 rounded-lg">
              <div className="text-2xl font-bold text-foreground">{debug.cachedItemsCount}</div>
              <div className="text-xs text-muted-foreground">Itens no Cache</div>
            </div>
            <div className="text-center p-3 bg-muted/50 rounded-lg">
              <div className="text-2xl font-bold text-foreground">{debug.ordersWithItemsSynced || 0}</div>
              <div className="text-xs text-muted-foreground">Pedidos c/ Itens</div>
            </div>
            <div className="text-center p-3 bg-muted/50 rounded-lg">
              <div className={`text-2xl font-bold ${debug.itemsSyncedPercent >= 80 ? 'text-green-500' : debug.itemsSyncedPercent >= 50 ? 'text-amber-500' : 'text-red-500'}`}>
                {debug.itemsSyncedPercent || 0}%
              </div>
              <div className="text-xs text-muted-foreground">% Itens Sync</div>
            </div>
          </div>
        </Card>
      )}

      {/* Metrics Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <SalesMetricsCard
          title="Receita Hoje"
          value={isLoading ? "..." : formatCurrency(metrics?.revenueToday || 0)}
          subtitle={`${metrics?.ordersToday || 0} pedidos`}
          icon={<DollarSign className="w-6 h-6 text-primary" />}
        />
        <SalesMetricsCard
          title="Receita 7 Dias"
          value={isLoading ? "..." : formatCurrency(metrics?.revenue7d || 0)}
          subtitle={`${metrics?.orders7d || 0} pedidos`}
          icon={<TrendingUp className="w-6 h-6 text-primary" />}
        />
        <SalesMetricsCard
          title="Receita 30 Dias"
          value={isLoading ? "..." : formatCurrency(metrics?.revenue30d || 0)}
          subtitle={`${metrics?.orders30d || 0} pedidos`}
          icon={<ShoppingCart className="w-6 h-6 text-primary" />}
        />
        <SalesMetricsCard
          title="Ticket Médio"
          value={isLoading ? "..." : formatCurrency(metrics?.averageTicket30d || 0)}
          subtitle="últimos 30 dias"
          icon={<Package className="w-6 h-6 text-primary" />}
        />
      </div>

      {/* Charts */}
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <SalesChart 
            data={salesData?.dailySales || []} 
            isLoading={isLoading} 
          />
        </div>
        <div className="lg:col-span-1">
          <TopProductsTable 
            products={salesData?.topProducts || []} 
            isLoading={isLoading} 
          />
        </div>
      </div>
    </div>
  );
}
