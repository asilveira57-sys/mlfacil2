import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { SalesMetricsCard } from "./SalesMetricsCard";
import { SalesChart } from "./SalesChart";
import { TopProductsTable } from "./TopProductsTable";
import { DashboardFilters } from "./DashboardFilters";
import { OnboardingSync } from "./OnboardingSync";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  DollarSign,
  ShoppingCart,
  TrendingUp,
  Package,
  RefreshCw,
  AlertCircle,
  XCircle,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

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

interface AvailableMonth {
  key: string;
  label: string;
}

interface SalesMetrics {
  totalRevenue: number;
  totalOrders: number;
  revenueToday: number;
  ordersToday: number;
  revenueYesterday: number;
  ordersYesterday: number;
  revenue7d: number;
  orders7d: number;
  revenuePrev7d: number;
  ordersPrev7d: number;
  revenue30d: number;
  orders30d: number;
  revenuePrev30d: number;
  ordersPrev30d: number;
  revenuePeriod: number;
  ordersPeriod: number;
  revenuePrevPeriod: number;
  ordersPrevPeriod: number;
  averageTicket: number;
  averageTicket30d: number;
  averageTicketPeriod: number;
  averageTicketPrevPeriod: number;
  cancelledOrders: number;
  cancelledRevenue: number;
  cancelledOrdersPeriod: number;
  cancelledRevenuePeriod: number;
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
  availableMonths: AvailableMonth[];
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

interface DateFilter {
  dateFrom: string | null;
  dateTo: string | null;
}

const formatCurrency = (value: number) => {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
};

// Calculate percentage change between current and previous period
const calcTrend = (current: number, previous: number): number | undefined => {
  if (previous === 0) {
    return current > 0 ? 100 : undefined;
  }
  return ((current - previous) / previous) * 100;
};

export function SalesDashboard() {
  const [salesData, setSalesData] = useState<SalesData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sellerId, setSellerId] = useState<string | null>(null);
  const [dateFilter, setDateFilter] = useState<DateFilter>({ dateFrom: null, dateTo: null });
  const { toast } = useToast();

  // Sync state for onboarding
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncJob, setSyncJob] = useState<SyncJob | null>(null);
  const [isFirstLoad, setIsFirstLoad] = useState(true);
  const [showOnboarding, setShowOnboarding] = useState(false);

  const fetchSalesData = useCallback(async (filters?: DateFilter, attempt = 0): Promise<void> => {
    setIsLoading(true);
    if (attempt === 0) setError(null);

    const currentFilters = filters || dateFilter;

    try {
      let { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        if (attempt < 2) {
          await new Promise(resolve => setTimeout(resolve, 500 * (attempt + 1)));
          return fetchSalesData(currentFilters, attempt + 1);
        }
        setError("Sessão expirada. Faça login novamente.");
        setIsLoading(false);
        return;
      }

      // Fetch seller_id from ml_accounts
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
        headers: { Authorization: `Bearer ${session.access_token}` },
        body: {
          date_from: currentFilters.dateFrom,
          date_to: currentFilters.dateTo,
        },
      });

      if (response.error?.message?.includes('401') || response.error?.status === 401) {
        const { data: refreshData, error: refreshError } = await supabase.auth.refreshSession();
        
        if (refreshError || !refreshData.session) {
          if (attempt < 2) {
            await new Promise(resolve => setTimeout(resolve, 500 * (attempt + 1)));
            return fetchSalesData(currentFilters, attempt + 1);
          }
          setError("Sessão expirada. Faça login novamente.");
          setIsLoading(false);
          return;
        }
        
        session = refreshData.session;
        response = await supabase.functions.invoke("ml-sales-data", {
          headers: { Authorization: `Bearer ${session.access_token}` },
          body: {
            date_from: currentFilters.dateFrom,
            date_to: currentFilters.dateTo,
          },
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

      // Check if this is a new account that needs onboarding sync
      const debug = response.data?._debug;
      if (isFirstLoad && debug?.cachedOrdersCount === 0 && accounts?.[0]) {
        setShowOnboarding(true);
        startAutoSync(accounts[0].ml_user_id, session.access_token);
      }
      setIsFirstLoad(false);

    } catch (err: any) {
      console.error("Error fetching sales data:", err);
      if (attempt < 2) {
        await new Promise(resolve => setTimeout(resolve, 500 * (attempt + 1)));
        return fetchSalesData(currentFilters, attempt + 1);
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
  }, [dateFilter, isFirstLoad, toast]);

  // Auto-sync for new accounts
  const startAutoSync = async (sellerIdParam: string, accessToken: string) => {
    setIsSyncing(true);
    setSyncJob(null);

    try {
      const response = await supabase.functions.invoke("ml-sync-orders", {
        headers: { Authorization: `Bearer ${accessToken}` },
        body: { seller_id: sellerIdParam }
      });

      if (response.error) {
        throw response.error;
      }

      if (response.data?.job_id) {
        pollJobStatus(response.data.job_id);
      }
    } catch (err: any) {
      console.error("Error auto-syncing orders:", err);
      setIsSyncing(false);
      setShowOnboarding(false);
    }
  };

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
        // Wait a moment then hide onboarding and refresh data
        setTimeout(() => {
          setShowOnboarding(false);
          fetchSalesData();
        }, 1500);
      } else if (data.status === 'error') {
        setIsSyncing(false);
        setShowOnboarding(false);
        toast({
          title: "Erro na sincronização",
          description: "Ocorreu um erro durante a sincronização",
          variant: "destructive",
        });
      } else {
        setTimeout(poll, 2000);
      }
    };

    poll();
  }, [fetchSalesData, toast]);

  // Handle filter change
  const handleFilterChange = (filter: DateFilter) => {
    setDateFilter(filter);
    fetchSalesData(filter);
  };

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (session && (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'INITIAL_SESSION')) {
        setTimeout(() => fetchSalesData(), 100);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  // Show onboarding sync screen
  if (showOnboarding) {
    const progress = syncJob && syncJob.total_records > 0 
      ? (syncJob.processed_records / syncJob.total_records) * 100 
      : 0;

    return (
      <OnboardingSync
        sellerNickname={salesData?.seller?.nickname}
        progress={progress}
        processedRecords={syncJob?.processed_records || 0}
        totalRecords={syncJob?.total_records || 0}
        status={syncJob?.status || "processing"}
      />
    );
  }

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
  const hasDateFilter = dateFilter.dateFrom !== null;

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
          <DashboardFilters
            availableMonths={salesData?.availableMonths || []}
            onFilterChange={handleFilterChange}
            isLoading={isLoading}
          />
          <Button
            variant="outline"
            size="icon"
            onClick={() => fetchSalesData()}
            disabled={isLoading}
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>

      {/* Metrics Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
        {/* Show period metrics when filter is active, otherwise show default */}
        {hasDateFilter ? (
          <>
            <SalesMetricsCard
              title="Receita Período"
              value={isLoading ? "..." : formatCurrency(metrics?.revenuePeriod || 0)}
              subtitle={`${metrics?.ordersPeriod || 0} pedidos`}
              icon={<DollarSign className="w-6 h-6 text-primary" />}
              trend={calcTrend(metrics?.revenuePeriod || 0, metrics?.revenuePrevPeriod || 0)}
              trendLabel="vs período ant."
            />
            <SalesMetricsCard
              title="Pedidos Período"
              value={isLoading ? "..." : (metrics?.ordersPeriod || 0).toString()}
              subtitle={formatCurrency(metrics?.revenuePeriod || 0)}
              icon={<ShoppingCart className="w-6 h-6 text-primary" />}
              trend={calcTrend(metrics?.ordersPeriod || 0, metrics?.ordersPrevPeriod || 0)}
              trendLabel="vs período ant."
            />
            <SalesMetricsCard
              title="Ticket Médio"
              value={isLoading ? "..." : formatCurrency(metrics?.averageTicketPeriod || 0)}
              subtitle="período selecionado"
              icon={<Package className="w-6 h-6 text-primary" />}
              trend={calcTrend(metrics?.averageTicketPeriod || 0, metrics?.averageTicketPrevPeriod || 0)}
              trendLabel="vs período ant."
            />
          </>
        ) : (
          <>
            <SalesMetricsCard
              title="Receita Hoje"
              value={isLoading ? "..." : formatCurrency(metrics?.revenueToday || 0)}
              subtitle={`${metrics?.ordersToday || 0} pedidos`}
              icon={<DollarSign className="w-6 h-6 text-primary" />}
              trend={calcTrend(metrics?.revenueToday || 0, metrics?.revenueYesterday || 0)}
              trendLabel="vs ontem"
            />
            <SalesMetricsCard
              title="Receita 7 Dias"
              value={isLoading ? "..." : formatCurrency(metrics?.revenue7d || 0)}
              subtitle={`${metrics?.orders7d || 0} pedidos`}
              icon={<TrendingUp className="w-6 h-6 text-primary" />}
              trend={calcTrend(metrics?.revenue7d || 0, metrics?.revenuePrev7d || 0)}
              trendLabel="vs 7d ant."
            />
            <SalesMetricsCard
              title="Receita 30 Dias"
              value={isLoading ? "..." : formatCurrency(metrics?.revenue30d || 0)}
              subtitle={`${metrics?.orders30d || 0} pedidos`}
              icon={<ShoppingCart className="w-6 h-6 text-primary" />}
              trend={calcTrend(metrics?.revenue30d || 0, metrics?.revenuePrev30d || 0)}
              trendLabel="vs 30d ant."
            />
            <SalesMetricsCard
              title="Ticket Médio"
              value={isLoading ? "..." : formatCurrency(metrics?.averageTicket30d || 0)}
              subtitle="últimos 30 dias"
              icon={<Package className="w-6 h-6 text-primary" />}
            />
          </>
        )}

        {/* Cancelled/Refunded Card - Always visible */}
        <SalesMetricsCard
          title="Cancelados"
          value={isLoading ? "..." : formatCurrency(
            hasDateFilter ? (metrics?.cancelledRevenuePeriod || 0) : (metrics?.cancelledRevenue || 0)
          )}
          subtitle={`${hasDateFilter ? (metrics?.cancelledOrdersPeriod || 0) : (metrics?.cancelledOrders || 0)} pedidos`}
          icon={<XCircle className="w-6 h-6 text-destructive" />}
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
