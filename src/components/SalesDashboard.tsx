import { useEffect, useState, useCallback } from "react";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useActiveSellerId } from "@/contexts/ActiveAccountContext";
import { SalesMetricsCard } from "./SalesMetricsCard";
import { SalesChart } from "./SalesChart";
import { AnnualSalesChart } from "./AnnualSalesChart";
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

interface MonthlySale {
  month: string;
  monthLabel: string;
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
  monthlySales: MonthlySale[];
  monthlyCancelled: MonthlySale[];
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

// Helper to get initial 30-day filter in São Paulo timezone
const getInitial30DayFilter = (): DateFilter => {
  const now = new Date();
  // Approximate São Paulo timezone offset (UTC-3)
  const spOffset = -3 * 60;
  const localOffset = now.getTimezoneOffset();
  const diff = spOffset - localOffset;
  const spNow = new Date(now.getTime() + diff * 60 * 1000);
  
  const today = new Date(spNow.getFullYear(), spNow.getMonth(), spNow.getDate());
  const thirtyDaysAgo = new Date(today);
  thirtyDaysAgo.setDate(today.getDate() - 30);
  
  return {
    dateFrom: format(thirtyDaysAgo, 'yyyy-MM-dd'),
    dateTo: format(today, 'yyyy-MM-dd'),
  };
};

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
  const [dateFilter, setDateFilter] = useState<DateFilter>(getInitial30DayFilter);
  const { toast } = useToast();

  // Use global active seller ID from context (source of truth)
  const activeSellerId = useActiveSellerId();

  // Sync state for onboarding
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncJob, setSyncJob] = useState<SyncJob | null>(null);
  const [isFirstLoad, setIsFirstLoad] = useState(true);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [syncPhase, setSyncPhase] = useState<1 | 2 | 3>(1);
  
  // Background sync indicator
  const [isBackgroundSyncing, setIsBackgroundSyncing] = useState(false);

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

      // Use the global active seller ID from context
      let response = await supabase.functions.invoke("ml-sales-data", {
        headers: { Authorization: `Bearer ${session.access_token}` },
        body: {
          seller_id: activeSellerId,
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
            seller_id: activeSellerId,
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
      if (isFirstLoad && debug?.cachedOrdersCount === 0 && activeSellerId) {
        setShowOnboarding(true);
        startProgressiveSync(activeSellerId, session.access_token);
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
  }, [dateFilter, isFirstLoad, toast, activeSellerId]);

  // Fetch data on mount and when activeSellerId changes
  useEffect(() => {
    fetchSalesData();
  }, [activeSellerId]); // Re-fetch when seller changes

  // Helper to wait for a job to complete
  const waitForJobCompletion = useCallback(async (jobId: string): Promise<boolean> => {
    return new Promise((resolve) => {
      const poll = async () => {
        const { data, error } = await supabase
          .from('sync_jobs')
          .select('id, status, total_records, processed_records')
          .eq('id', jobId)
          .maybeSingle();

        if (error || !data) {
          resolve(false);
          return;
        }

        setSyncJob(data);

        if (data.status === 'done') {
          resolve(true);
        } else if (data.status === 'error') {
          resolve(false);
        } else {
          setTimeout(poll, 1500);
        }
      };
      poll();
    });
  }, []);

  // Progressive sync for new accounts: 7d -> 30d -> 1 year
  const startProgressiveSync = async (sellerIdParam: string, accessToken: string) => {
    setIsSyncing(true);
    setSyncJob(null);
    setSyncPhase(1);

    const today = new Date();
    const formatDate = (d: Date, time: string) => 
      `${d.toISOString().split('T')[0]}T${time}-03:00`;

    const dateTo = formatDate(today, '23:59:59.999');

    // Phase dates
    const sevenDaysAgo = new Date(today);
    sevenDaysAgo.setDate(today.getDate() - 7);

    const thirtyDaysAgo = new Date(today);
    thirtyDaysAgo.setDate(today.getDate() - 30);

    const oneYearAgo = new Date(today);
    oneYearAgo.setFullYear(today.getFullYear() - 1);

    try {
      // PHASE 1: Sync last 7 days (fast - user sees data quickly)
      console.log("[Progressive Sync] Phase 1: Last 7 days");
      setSyncPhase(1);
      
      const phase1Response = await supabase.functions.invoke("ml-sync-orders", {
        headers: { Authorization: `Bearer ${accessToken}` },
        body: { 
          seller_id: sellerIdParam,
          date_from: formatDate(sevenDaysAgo, '00:00:00.000'),
          date_to: dateTo
        }
      });

      if (phase1Response.data?.job_id) {
        await waitForJobCompletion(phase1Response.data.job_id);
      }

      // Show dashboard with 7 days of data
      console.log("[Progressive Sync] Phase 1 complete - showing dashboard");
      setShowOnboarding(false);
      setIsSyncing(false);
      fetchSalesData();

      // PHASE 2: Sync 30 days (background, updates UI)
      console.log("[Progressive Sync] Phase 2: Last 30 days");
      setSyncPhase(2);
      
      const phase2Response = await supabase.functions.invoke("ml-sync-orders", {
        headers: { Authorization: `Bearer ${accessToken}` },
        body: { 
          seller_id: sellerIdParam,
          date_from: formatDate(thirtyDaysAgo, '00:00:00.000'),
          date_to: dateTo
        }
      });

      if (phase2Response.data?.job_id) {
        await waitForJobCompletion(phase2Response.data.job_id);
        console.log("[Progressive Sync] Phase 2 complete - refreshing data");
        fetchSalesData(); // Update with more data
      }

      // PHASE 3: Sync 1 full year (silent background)
      console.log("[Progressive Sync] Phase 3: Last 1 year");
      setSyncPhase(3);
      
      const phase3Response = await supabase.functions.invoke("ml-sync-orders", {
        headers: { Authorization: `Bearer ${accessToken}` },
        body: { 
          seller_id: sellerIdParam,
          date_from: formatDate(oneYearAgo, '00:00:00.000'),
          date_to: dateTo
        }
      });

      if (phase3Response.data?.job_id) {
        await waitForJobCompletion(phase3Response.data.job_id);
        console.log("[Progressive Sync] Phase 3 complete - full year synced");
        fetchSalesData(); // Full data available
      }

      // PHASE 4: Sync billing data (real costs from ML)
      console.log("[Progressive Sync] Phase 4: Billing data");
      
      const phase4Response = await supabase.functions.invoke("ml-sync-billing", {
        headers: { Authorization: `Bearer ${accessToken}` },
        body: { 
          seller_id: sellerIdParam,
          months: 6
        }
      });

      if (phase4Response.data?.job_id) {
        await waitForJobCompletion(phase4Response.data.job_id);
        console.log("[Progressive Sync] Phase 4 complete - billing synced");
      }

    } catch (err: any) {
      console.error("Error in progressive sync:", err);
      setShowOnboarding(false);
    } finally {
      setIsSyncing(false);
    }
  };

  // Handle filter change
  const handleFilterChange = (filter: DateFilter) => {
    setDateFilter(filter);
    fetchSalesData(filter);
  };

  // REMOVED: Auth state listener that was causing refetch on TOKEN_REFRESHED
  // Data fetching is now handled by the initial useEffect and explicit refresh actions
  // This prevents the "flicker" on tab switch when token is silently refreshed

  // Listen for background sync events
  useEffect(() => {
    const handleSyncStart = () => {
      setIsBackgroundSyncing(true);
    };

    const handleSyncComplete = (event: CustomEvent) => {
      // Refresh data when background sync completes
      if (event.detail?.sellerId === activeSellerId || !activeSellerId) {
        fetchSalesData();
        toast({
          title: "Dados atualizados",
          description: "Sincronização em background concluída",
        });
      }
      setIsBackgroundSyncing(false);
    };

    window.addEventListener("orders_sync_start", handleSyncStart as EventListener);
    window.addEventListener("orders_sync_complete", handleSyncComplete as EventListener);

    return () => {
      window.removeEventListener("orders_sync_start", handleSyncStart as EventListener);
      window.removeEventListener("orders_sync_complete", handleSyncComplete as EventListener);
    };
  }, [activeSellerId, toast, fetchSalesData]);

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
        phase={syncPhase}
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
        <div className="flex items-center gap-3">
          <div>
            <h3 className="text-2xl font-bold text-foreground">Dashboard de Vendas</h3>
            {salesData?.seller && (
              <p className="text-muted-foreground">
                Conta: {salesData.seller.nickname || salesData.seller.email}
              </p>
            )}
          </div>
          {isBackgroundSyncing && (
            <div className="flex items-center gap-1.5 px-2 py-1 bg-muted rounded-md text-xs text-muted-foreground">
              <RefreshCw className="w-3 h-3 animate-spin" />
              <span>Sincronizando...</span>
            </div>
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

      {/* Charts Layout: Stacked charts on left, Top Products on right */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Left column: Stacked charts */}
        <div className="lg:col-span-2 space-y-6">
          <SalesChart 
            data={salesData?.dailySales || []} 
            isLoading={isLoading} 
          />
          <AnnualSalesChart
            data={salesData?.monthlySales || []}
            isLoading={isLoading}
            title="Vendas Anuais (12 meses)"
            colorScheme="primary"
          />
          <AnnualSalesChart
            data={salesData?.monthlyCancelled || []}
            isLoading={isLoading}
            title="Cancelamentos/Devoluções Anuais"
            colorScheme="destructive"
          />
        </div>
        
        {/* Right column: Top Products */}
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
