import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { format } from "date-fns";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { useActiveAccount } from "@/contexts/ActiveAccountContext";
import { SalesMetricsCard } from "./SalesMetricsCard";
import { SalesChart } from "./SalesChart";
import { AnnualSalesChart } from "./AnnualSalesChart";
import { TopProductsTable } from "./TopProductsTable";
import { DashboardFilters } from "./DashboardFilters";
// OnboardingSync removed — onboarding now handled entirely by /primeiro-acesso
import { SyncStatusIndicator } from "./sales/SyncStatusIndicator";
import { SystemEmpty, SystemError } from "@/components/ui/system-states";
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
import { useSalesDataCache } from "@/hooks/useSalesDataCache";

// Auto-refresh interval when dashboard is visible (5 minutes)
const AUTO_REFRESH_INTERVAL_MS = 5 * 60 * 1000;

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
  metadata: {
    total_records?: number;
    processed_records?: number;
    [key: string]: unknown;
  };
}

interface DateFilter {
  dateFrom: string | null;
  dateTo: string | null;
}

// Helper to get initial 30-day filter in São Paulo timezone
// IMPORTANT: Uses YESTERDAY as end date - today's data is incomplete
const getInitial30DayFilter = (): DateFilter => {
  const now = new Date();
  // Approximate São Paulo timezone offset (UTC-3)
  const spOffset = -3 * 60;
  const localOffset = now.getTimezoneOffset();
  const diff = spOffset - localOffset;
  const spNow = new Date(now.getTime() + diff * 60 * 1000);
  
  // Use YESTERDAY as end date (today's data is incomplete)
  const yesterday = new Date(spNow.getFullYear(), spNow.getMonth(), spNow.getDate() - 1);
  const thirtyDaysAgo = new Date(yesterday);
  thirtyDaysAgo.setDate(yesterday.getDate() - 29); // 30 days ending yesterday
  
  return {
    dateFrom: format(thirtyDaysAgo, 'yyyy-MM-dd'),
    dateTo: format(yesterday, 'yyyy-MM-dd'),
  };
};

// Calculate percentage change between current and previous period
const calcTrend = (current: number, previous: number): number | undefined => {
  if (previous === 0) {
    return current > 0 ? 100 : undefined;
  }
  return ((current - previous) / previous) * 100;
};

export function SalesDashboard() {
  const { t, i18n } = useTranslation('sales');
  const [salesData, setSalesData] = useState<SalesData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dateFilter, setDateFilter] = useState<DateFilter>(getInitial30DayFilter);
  const { toast } = useToast();

  // Use global active account from context (source of truth)
  const { activeAccount, sellerId: activeSellerId } = useActiveAccount();
  const activeAccountId = activeAccount?.id ?? null;

  // Smart cache for sales data
  const { getCached, setCached, shouldRefreshRecent, getRecentDaysToRefresh } = useSalesDataCache();

  // Sync state for onboarding
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncJob, setSyncJob] = useState<SyncJob | null>(null);
  const [isFirstLoad, setIsFirstLoad] = useState(true);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [syncPhase, setSyncPhase] = useState<1 | 2 | 3>(1);
  
  // Background sync indicator
  const [isBackgroundSyncing, setIsBackgroundSyncing] = useState(false);
  
  // Ref to track if sync was already attempted for current seller (prevents infinite loop)
  const hasSyncedForSellerRef = useRef<string | null>(null);
  // Memoized currency formatter based on language
  const formatCurrency = useMemo(() => {
    const locale = i18n.language === 'en' ? 'en-US' : i18n.language === 'es' ? 'es-AR' : 'pt-BR';
    return (value: number) => {
      return new Intl.NumberFormat(locale, {
        style: "currency",
        currency: "BRL",
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
      }).format(value);
    };
  }, [i18n.language]);

  const fetchSalesData = useCallback(async (filters?: DateFilter, forceRefresh = false, attempt = 0): Promise<void> => {
    setIsLoading(true);
    if (attempt === 0) setError(null);

    const currentFilters = filters || dateFilter;
    const cacheKey = `${activeSellerId}_${currentFilters.dateFrom}_${currentFilters.dateTo}`;

    // Check cache first (unless force refresh)
    if (!forceRefresh) {
      const cached = getCached<SalesData>(cacheKey);
      if (cached) {
        setSalesData(cached);
        setIsLoading(false);
        
        // If historical data (older than 7 days), don't refetch
        if (!shouldRefreshRecent(currentFilters.dateTo)) {
          return;
        }
        // Otherwise, continue to background refresh recent days
      }
    }

    try {
      let { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        if (attempt < 2) {
          await new Promise(resolve => setTimeout(resolve, 500 * (attempt + 1)));
          return fetchSalesData(currentFilters, forceRefresh, attempt + 1);
        }
        setError(t('session_expired'));
        setIsLoading(false);
        return;
      }

      // Use the global active account from context
      let response = await supabase.functions.invoke("ml-sales-data", {
        headers: { Authorization: `Bearer ${session.access_token}` },
        body: {
          account_id: activeAccountId,
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
            return fetchSalesData(currentFilters, forceRefresh, attempt + 1);
          }
          setError(t('session_expired'));
          setIsLoading(false);
          return;
        }
        
        session = refreshData.session;
        response = await supabase.functions.invoke("ml-sales-data", {
          headers: { Authorization: `Bearer ${session.access_token}` },
          body: {
            account_id: activeAccountId,
            seller_id: activeSellerId,
            date_from: currentFilters.dateFrom,
            date_to: currentFilters.dateTo,
          },
        });
      }

      // Handle new contract: edge function returns 200 with meta.state for business rules
      const metaState = response.data?.meta?.state;
      const metaReason = response.data?.meta?.reason;

      if (metaState === 'EMPTY' || metaState === 'BLOCKED') {
        console.info(`[SalesDashboard] Business rule response — state: ${metaState}, reason: ${metaReason}, HTTP: 200`);
        setSalesData(response.data);
        setIsLoading(false);
        return;
      }

      // Legacy fallback: catch any remaining 402/403 from older deploys
      const isLegacyGateError = response.error && (
        response.error.status === 402 || 
        response.error.status === 403 ||
        response.error?.message?.includes('402') ||
        response.error?.message?.includes('403')
      );
      if (isLegacyGateError) {
        console.info('[SalesDashboard] Legacy gate error treated as empty data:', response.error?.status);
        setSalesData(null);
        setIsLoading(false);
        return;
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

      // Cache the response
      setCached(cacheKey, response.data, currentFilters.dateTo);
      setSalesData(response.data);

      // Onboarding sync is now handled by /primeiro-acesso flow
      // Just trigger background sync if account has no cached orders
      const debug = response.data?._debug;
      if (
        isFirstLoad && 
        debug?.cachedOrdersCount === 0 && 
        activeSellerId &&
        hasSyncedForSellerRef.current !== activeSellerId
      ) {
        hasSyncedForSellerRef.current = activeSellerId;
        startProgressiveSync(activeSellerId, session.access_token);
      }
      setIsFirstLoad(false);

    } catch (err: any) {
      console.error("Error fetching sales data:", err);
      if (attempt < 2) {
        await new Promise(resolve => setTimeout(resolve, 500 * (attempt + 1)));
        return fetchSalesData(currentFilters, forceRefresh, attempt + 1);
      }
      const errorMsg = err?.message || t('error_default');
      setError(errorMsg);
      // Only show destructive toast for real technical errors, not empty data
      // Log the error classification
      console.warn('[SalesDashboard] Technical error after retries:', errorMsg);
    } finally {
      setIsLoading(false);
    }
  }, [dateFilter, isFirstLoad, toast, activeSellerId, t, getCached, setCached, shouldRefreshRecent]);

  // Auto-refresh reference
  const autoRefreshRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Reset states when account changes
  useEffect(() => {
    setIsFirstLoad(true);
    setShowOnboarding(false);
    setIsSyncing(false);
    setSalesData(null);
    setError(null);
    setSyncJob(null);
    hasSyncedForSellerRef.current = null;
    // Fetch fresh data for the new account
    fetchSalesData();
  }, [activeSellerId]); // Re-fetch when seller changes

  // Auto-refresh every 5 minutes when dashboard is visible
  useEffect(() => {
    const setupAutoRefresh = () => {
      // Clear existing interval
      if (autoRefreshRef.current) {
        clearInterval(autoRefreshRef.current);
      }

      // Only auto-refresh if we have a seller ID and document is visible
      if (activeSellerId && document.visibilityState === 'visible') {
        autoRefreshRef.current = setInterval(() => {
          console.log('[SalesDashboard] Auto-refreshing data...');
          fetchSalesData(undefined, true);
        }, AUTO_REFRESH_INTERVAL_MS);
      }
    };

    setupAutoRefresh();

    // Handle visibility changes
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        // Refresh immediately when becoming visible
        fetchSalesData(undefined, false);
        setupAutoRefresh();
      } else {
        // Clear interval when hidden
        if (autoRefreshRef.current) {
          clearInterval(autoRefreshRef.current);
          autoRefreshRef.current = null;
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (autoRefreshRef.current) {
        clearInterval(autoRefreshRef.current);
      }
    };
  }, [activeSellerId, fetchSalesData]);

  // Helper to wait for a job to complete
  const waitForJobCompletion = useCallback(async (jobId: string): Promise<boolean> => {
    return new Promise((resolve) => {
      const poll = async () => {
        const { data, error } = await supabase
          .from('sync_jobs')
          .select('id, status, metadata')
          .eq('id', jobId)
          .maybeSingle();

        if (error || !data) {
          resolve(false);
          return;
        }

        setSyncJob(data as unknown as SyncJob);

        if (data.status === 'success') {
          resolve(true);
        } else if (data.status === 'failed') {
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
      fetchSalesData(undefined, true);

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
        fetchSalesData(undefined, true); // Update with more data
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
        fetchSalesData(undefined, true); // Full data available
      }

      // PHASE 4: Billing auto-sync DISABLED — manual-only mode
      console.log("[Progressive Sync] Phase 4 SKIPPED: Billing/cost sync is now manual-only");

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

  // Listen for background sync events
  useEffect(() => {
    const handleSyncStart = () => {
      setIsBackgroundSyncing(true);
    };

    const handleSyncComplete = (event: CustomEvent) => {
      // Refresh data when background sync completes
      if (event.detail?.sellerId === activeSellerId || !activeSellerId) {
        fetchSalesData(undefined, true);
        toast({
          title: t('data_updated'),
          description: t('sync_complete'),
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
  }, [activeSellerId, toast, fetchSalesData, t]);

  // OnboardingSync removed — dashboard is now pure, no onboarding overlay

  if (error === "connect") {
    return (
      <SystemEmpty
        title="Conta não conectada"
        message="Conecte sua conta do Mercado Livre para visualizar suas vendas e métricas."
        icon={<AlertCircle className="w-12 h-12 text-muted-foreground/40" />}
      />
    );
  }

  if (error) {
    console.warn('[SalesDashboard] Rendering SystemError — origin: technical_error, message:', error);
    return (
      <SystemError
        message={error}
        onRetry={() => fetchSalesData(undefined, true)}
      />
    );
  }

  // Use real data or zeroed fallback — never block the dashboard for empty sellers
  const metrics = salesData?.metrics;
  const hasDateFilter = dateFilter.dateFrom !== null;
  const metaState = (salesData as any)?.meta?.state as string | undefined;
  const metaReason = (salesData as any)?.meta?.reason as string | undefined;

  return (
    <div className="space-y-6">
      {/* Subtle info banner for empty/blocked accounts */}
      {metaState === 'EMPTY' && (
        <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/50 px-4 py-3 text-sm text-muted-foreground">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>Ainda não há vendas registradas para exibir neste painel.</span>
        </div>
      )}
      {metaState === 'BLOCKED' && (
        <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50/50 dark:border-amber-800/50 dark:bg-amber-950/20 px-4 py-3 text-sm text-amber-700 dark:text-amber-300">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>
            {metaReason === 'TRIAL_EXPIRED'
              ? 'Seu período de teste expirou. Ative um plano para continuar acessando os dados.'
              : 'Sua conta está conectada, mas ainda não possui acesso completo ao painel.'}
          </span>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-3">
          <div>
            <h3 className="text-2xl font-bold text-foreground">{t('title')}</h3>
            {salesData?.seller && (
              <p className="text-muted-foreground">
                {t('account', { nickname: salesData.seller.nickname || salesData.seller.email })}
              </p>
            )}
          </div>
          <SyncStatusIndicator isBackgroundSyncing={isBackgroundSyncing} />
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
            onClick={() => fetchSalesData(undefined, true)}
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
              title={t('metrics.revenue_period')}
              value={isLoading ? "..." : formatCurrency(metrics?.revenuePeriod || 0)}
              subtitle={t('metrics.orders_count', { count: metrics?.ordersPeriod || 0 })}
              icon={<DollarSign className="w-6 h-6 text-primary" />}
              trend={calcTrend(metrics?.revenuePeriod || 0, metrics?.revenuePrevPeriod || 0)}
              trendLabel={t('metrics.vs_prev_period')}
            />
            <SalesMetricsCard
              title={t('metrics.orders_period')}
              value={isLoading ? "..." : (metrics?.ordersPeriod || 0).toString()}
              subtitle={formatCurrency(metrics?.revenuePeriod || 0)}
              icon={<ShoppingCart className="w-6 h-6 text-primary" />}
              trend={calcTrend(metrics?.ordersPeriod || 0, metrics?.ordersPrevPeriod || 0)}
              trendLabel={t('metrics.vs_prev_period')}
            />
            <SalesMetricsCard
              title={t('metrics.ticket_period')}
              value={isLoading ? "..." : formatCurrency(metrics?.averageTicketPeriod || 0)}
              subtitle={t('metrics.period_selected')}
              icon={<Package className="w-6 h-6 text-primary" />}
              trend={calcTrend(metrics?.averageTicketPeriod || 0, metrics?.averageTicketPrevPeriod || 0)}
              trendLabel={t('metrics.vs_prev_period')}
            />
          </>
        ) : (
          <>
            <SalesMetricsCard
              title={t('metrics.revenue_today')}
              value={isLoading ? "..." : formatCurrency(metrics?.revenueToday || 0)}
              subtitle={t('metrics.orders_count', { count: metrics?.ordersToday || 0 })}
              icon={<DollarSign className="w-6 h-6 text-primary" />}
              trend={calcTrend(metrics?.revenueToday || 0, metrics?.revenueYesterday || 0)}
              trendLabel={t('metrics.vs_yesterday')}
            />
            <SalesMetricsCard
              title={t('metrics.revenue_7d')}
              value={isLoading ? "..." : formatCurrency(metrics?.revenue7d || 0)}
              subtitle={t('metrics.orders_count', { count: metrics?.orders7d || 0 })}
              icon={<TrendingUp className="w-6 h-6 text-primary" />}
              trend={calcTrend(metrics?.revenue7d || 0, metrics?.revenuePrev7d || 0)}
              trendLabel={t('metrics.vs_7d')}
            />
            <SalesMetricsCard
              title={t('metrics.revenue_30d')}
              value={isLoading ? "..." : formatCurrency(metrics?.revenue30d || 0)}
              subtitle={t('metrics.orders_count', { count: metrics?.orders30d || 0 })}
              icon={<ShoppingCart className="w-6 h-6 text-primary" />}
              trend={calcTrend(metrics?.revenue30d || 0, metrics?.revenuePrev30d || 0)}
              trendLabel={t('metrics.vs_30d')}
            />
            <SalesMetricsCard
              title={t('metrics.ticket_30d')}
              value={isLoading ? "..." : formatCurrency(metrics?.averageTicket30d || 0)}
              subtitle={t('metrics.last_30d')}
              icon={<Package className="w-6 h-6 text-primary" />}
            />
          </>
        )}

        {/* Cancelled/Refunded Card - Always visible */}
        <SalesMetricsCard
          title={t('metrics.cancelled')}
          value={isLoading ? "..." : formatCurrency(
            hasDateFilter ? (metrics?.cancelledRevenuePeriod || 0) : (metrics?.cancelledRevenue || 0)
          )}
          subtitle={t('metrics.orders_count', { count: hasDateFilter ? (metrics?.cancelledOrdersPeriod || 0) : (metrics?.cancelledOrders || 0) })}
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
            title={t('charts.annual_title')}
            colorScheme="primary"
          />
          <AnnualSalesChart
            data={salesData?.monthlyCancelled || []}
            isLoading={isLoading}
            title={t('charts.cancelled_title')}
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
