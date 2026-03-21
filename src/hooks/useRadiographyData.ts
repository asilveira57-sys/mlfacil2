import { useState, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { RadiographyHealthStatus } from "@/types/radiography";

// --- Types ---

export interface StructuredAlert {
  type: string;
  severity: string;
  title: string;
  description: string;
  context: Record<string, any>;
}

export interface ChangeFlag {
  type: string;
  label: string;
  detail: string;
  severity: string;
  prev_value: any;
  new_value: any;
  pct_change?: number;
}

export interface SeoAnalysis {
  category_name: string;
  l1_category_name: string;
  total_trending_keywords: number;
  analyzed_keywords: number;
  relevant_keywords: number;
  found_count: number;
  score: number;
  details: Array<{
    keyword: string;
    found_in_title: boolean;
    relevance: "high" | "medium" | "low";
  }>;
  analyzed_at: string;
}

export interface HealthCurrentItem {
  id: string;
  item_id: string;
  seller_id: string;
  visits_last: number | null;
  visits_7d: number | null;
  visits_30d: number | null;
  visits_60d: number | null;
  price: number | null;
  available_quantity: number | null;
  listing_status: string | null;
  listing_type: string | null;
  shipping_mode: string | null;
  catalog_listing: boolean | null;
  catalog_product_id: string | null;
  logistic_type: string | null;
  anomaly_flags: string[] | null;
  last_collected_at: string | null;
  updated_at: string;
  // Sales
  sales_count_7d: number | null;
  units_sold_7d: number | null;
  sales_count_30d: number | null;
  units_sold_30d: number | null;
  sales_count_60d: number | null;
  units_sold_60d: number | null;
  revenue_30d: number | null;
  revenue_60d: number | null;
  conversion_rate_7d: number | null;
  conversion_rate_30d: number | null;
  days_without_sale: number | null;
  last_sale_at: string | null;
  // Change detection
  change_flags: ChangeFlag[] | null;
  alerts_json: StructuredAlert[] | null;
  prev_price: number | null;
  prev_visits: number | null;
  prev_available_quantity: number | null;
  // SEO
  seo_score: number | null;
  seo_keywords_found: string[] | null;
  seo_keywords_missing: string[] | null;
  seo_analysis_json: SeoAnalysis | null;
  // Direct from table (Phase 1)
  title: string | null;
  thumbnail: string | null;
  permalink: string | null;
  health_score: number | null;
  health_status: string | null;
  main_problem: string | null;
  photos_count: number | null;
  has_video: boolean | null;
  free_shipping: boolean | null;
  data_coverage_days: number | null;
  data_coverage_status: string | null;
  // Period-based metrics (from RPC)
  visits_period?: number | null;
  sales_period?: number | null;
  units_period?: number | null;
  conversion_period?: number | null;
}

export interface HealthHistoryEntry {
  id: string;
  item_id: string;
  collected_at: string;
  visits: number | null;
  price: number | null;
  available_quantity: number | null;
  listing_status: string | null;
  listing_type: string | null;
  shipping_mode: string | null;
  catalog_listing: boolean | null;
  source: string | null;
  window_days: number;
}

export interface VisitSeriesEntry {
  visit_date: string;
  visits: number;
}

export interface CoverageInfo {
  days_requested: number;
  days_with_data: number;
  coverage_percent: number;
  status: 'good' | 'partial' | 'insufficient';
}

export function computeCoverage(series: VisitSeriesEntry[], daysRequested: number): CoverageInfo {
  const daysWithData = series.filter(s => s.visits > 0).length;
  const coverage_percent = daysRequested > 0 ? Math.round((daysWithData / daysRequested) * 100) : 0;
  return {
    days_requested: daysRequested,
    days_with_data: daysWithData,
    coverage_percent: Math.min(coverage_percent, 100),
    status: coverage_percent >= 70 ? 'good' : coverage_percent >= 30 ? 'partial' : 'insufficient',
  };
}

export interface DiagnosticSummary {
  totalActive: number;
  updatedRecently: number;
  awaitingCollection: number;
  totalExams: number;
  anomalyCount: number;
  lastSyncAt: string | null;
  lastCollectionAt: string | null;
  lastCollectionStatus: string | null;
  lastCollectionError: string | null;
  lastCollectionProcessed: number;
  lastCollectionFailed: number;
  backfillStatus: string | null;
  backfillProgress: number | null;
  backfillError: string | null;
  dataStartDate: string | null;
  dataDaysAvailable: number;
}

export type AnomalyFilter = "all" | "with_anomaly" | "without_anomaly";
export type PeriodDays = 7 | 15 | 30 | 60 | 150;

// Filter types for Phase 3
export type LogisticsFilter = "all" | "full" | "not_full" | "unconfirmed";
export type CatalogFilter = "all" | "with_catalog" | "without_catalog";
export type MainProblemFilter = "all" | "discovery" | "conversion" | "competitiveness" | "content" | "stock" | "data_coverage" | "healthy";
export type MediaFilter = "all" | "with_video" | "without_video" | "few_photos";

// --- Health classification from real data ---

export function classifyHealth(item: {
  health_status?: string | null;
  visits_last?: number | null;
  visits_period?: number | null;
  available_quantity?: number | null;
  listing_type?: string | null;
  shipping_mode?: string | null;
  catalog_listing?: boolean | null;
  anomaly_flags?: string[] | null;
  last_collected_at?: string | null;
  days_without_sale?: number | null;
  sales_count_30d?: number | null;
  sales_period?: number | null;
  conversion_rate_7d?: number | null;
  conversion_period?: number | null;
  health_score?: number | null;
}): RadiographyHealthStatus {
  // Use backend-computed status if available
  if (item.health_status && ["healthy", "stable", "observation", "alert", "critical"].includes(item.health_status)) {
    return item.health_status as RadiographyHealthStatus;
  }

  const flags = item.anomaly_flags || [];
  const visits = item.visits_period ?? item.visits_last ?? -1;
  const stock = item.available_quantity ?? -1;
  const daysNoSale = item.days_without_sale ?? null;
  const sales = item.sales_period ?? item.sales_count_30d ?? null;
  
  if (!item.last_collected_at && visits < 0) return "stable";
  if (stock === 0 || flags.includes("consistent_decline")) return "critical";
  if (daysNoSale !== null && daysNoSale > 30 && visits < 20) return "critical";
  if (flags.includes("visit_drop") || flags.includes("zero_visits")) return "alert";
  if (flags.includes("visits_no_conversion") || flags.includes("no_sales_30d")) return "alert";
  if (flags.includes("high_stock_low_traction") || flags.includes("low_conversion")) return "observation";
  if (flags.includes("no_sales_14d")) return "observation";
  if (visits > 10 && stock > 0 && (sales === null || sales > 0)) {
    const hasFulfillment = item.shipping_mode === "me2" || item.listing_type === "gold_pro";
    if (hasFulfillment || item.catalog_listing) return "healthy";
    return "stable";
  }
  if (visits >= 0 && stock > 0) return "stable";
  return "stable";
}


const ANOMALY_LABELS: Record<string, string> = {
  zero_visits: "Sem visitas no período",
  visit_drop: "Queda acentuada de visitas (>40%)",
  high_stock_low_traction: "Estoque alto sem tração",
  consistent_decline: "Declínio consistente de tráfego",
  no_sales_30d: "Sem vendas há mais de 30 dias",
  no_sales_14d: "Sem vendas há mais de 14 dias",
  visits_no_conversion: "Recebe visitas mas não converte",
  low_conversion: "Taxa de conversão muito baixa",
};

const CHANGE_ICONS: Record<string, string> = {
  price_increased: "↑ Preço",
  price_decreased: "↓ Preço",
  stock_zeroed: "⚠ Estoque zerou",
  stock_decreased: "↓ Estoque",
  stock_increased: "↑ Estoque",
  status_changed: "🔄 Status",
  logistics_changed: "🚚 Logística",
  catalog_joined: "📦 Catálogo",
  catalog_left: "📦 Catálogo",
  visits_dropped: "📉 Visitas",
};

export function getAnomalyLabel(flag: string): string {
  return ANOMALY_LABELS[flag] || flag;
}

export function getChangeLabel(type: string): string {
  return CHANGE_ICONS[type] || type;
}

// Problem labels
export const MAIN_PROBLEM_LABELS: Record<string, { label: string; color: string }> = {
  discovery: { label: "Descoberta", color: "text-blue-400" },
  conversion: { label: "Conversão", color: "text-amber-400" },
  competitiveness: { label: "Competitividade", color: "text-orange-400" },
  content: { label: "Conteúdo", color: "text-violet-400" },
  stock: { label: "Estoque", color: "text-red-400" },
  data_coverage: { label: "Dados insuficientes", color: "text-slate-400" },
  healthy: { label: "Saudável", color: "text-emerald-400" },
};

// --- Logistics helpers ---
export function getLogisticsLabel(item: HealthCurrentItem): { label: string; isFull: boolean; confirmed: boolean } {
  const lt = item.logistic_type?.toLowerCase() || "";
  const sm = item.shipping_mode?.toLowerCase() || "";
  
  // Only mark as Full if logistic_type explicitly says fulfillment
  if (lt === "fulfillment" || lt === "full" || lt.includes("fulfillment")) {
    return { label: "Full", isFull: true, confirmed: true };
  }
  // Cross-docking / drop-off
  if (lt.includes("cross") || lt === "xd_drop_off") {
    return { label: "Coleta/Crossdocking", isFull: false, confirmed: true };
  }
  // me2 = Mercado Envios standard, NOT Full
  if (sm === "me2") {
    return { label: "Mercado Envios", isFull: false, confirmed: true };
  }
  if (sm === "me1") {
    return { label: "Envio pelo vendedor", isFull: false, confirmed: true };
  }
  if (sm || lt) {
    return { label: sm || lt, isFull: false, confirmed: true };
  }
  return { label: "Não confirmado", isFull: false, confirmed: false };
}

// --- Main hook ---

export function useRadiographyData(sellerId: string | null, selectedPeriod: PeriodDays = 30) {
  // 1. Fetch current health (now includes title, thumbnail, permalink, health_score, etc.)
  const {
    data: items,
    isLoading: itemsLoading,
    refetch: refetchItems,
  } = useQuery({
    queryKey: ["radiography-items", sellerId, selectedPeriod],
    queryFn: async () => {
      if (!sellerId) return [];

      // Get health current + period metrics in parallel
      const [healthRes, metricsRes] = await Promise.all([
        supabase
          .from("listing_health_current")
          .select("*")
          .eq("seller_id", sellerId),
        supabase.rpc("get_item_metrics_by_period", {
          p_seller_id: sellerId,
          p_days: selectedPeriod,
        }),
      ]);

      if (healthRes.error) throw healthRes.error;
      if (!healthRes.data?.length) return [];

      // Build metrics lookup
      const metricsMap: Record<string, { visits_period: number; sales_period: number; units_period: number; conversion_period: number | null }> = {};
      if (metricsRes.data) {
        for (const m of metricsRes.data) {
          metricsMap[m.item_id] = {
            visits_period: Number(m.visits_period) || 0,
            sales_period: Number(m.sales_period) || 0,
            units_period: Number(m.units_period) || 0,
            conversion_period: m.conversion_period != null ? Number(m.conversion_period) : null,
          };
        }
      }

      // For items without title/thumbnail on listing_health_current, fallback to meli_listings_cache
      const missingTitleIds = healthRes.data.filter(h => !h.title).map(h => h.item_id);
      const listings: Record<string, any> = {};
      if (missingTitleIds.length > 0) {
        for (let i = 0; i < missingTitleIds.length; i += 100) {
          const batch = missingTitleIds.slice(i, i + 100);
          const { data: cacheRows } = await supabase
            .from("meli_listings_cache")
            .select("item_id, title, thumbnail, permalink, logistic_type")
            .in("item_id", batch)
            .eq("seller_id", sellerId);
          if (cacheRows) {
            for (const row of cacheRows) {
              if (!listings[row.item_id]) listings[row.item_id] = row;
            }
          }
        }
      }

      return healthRes.data.map((h) => {
        const cache = listings[h.item_id];
        const metrics = metricsMap[h.item_id];
        return {
          ...h,
          change_flags: (h.change_flags as any as ChangeFlag[]) || [],
          alerts_json: (h.alerts_json as any as StructuredAlert[]) || [],
          seo_analysis_json: (h.seo_analysis_json as any as SeoAnalysis) || null,
          title: h.title || cache?.title || null,
          thumbnail: h.thumbnail || cache?.thumbnail || null,
          permalink: h.permalink || cache?.permalink || null,
          logistic_type: h.logistic_type || cache?.logistic_type || null,
          visits_period: metrics?.visits_period ?? null,
          sales_period: metrics?.sales_period ?? null,
          units_period: metrics?.units_period ?? null,
          conversion_period: metrics?.conversion_period ?? null,
        } as HealthCurrentItem;
      });
    },
    enabled: !!sellerId,
    staleTime: 5 * 60 * 1000,
  });

  // 2. Diagnostic summary
  const {
    data: diagnostics,
    isLoading: diagnosticsLoading,
  } = useQuery({
    queryKey: ["radiography-diagnostics", sellerId],
    queryFn: async (): Promise<DiagnosticSummary> => {
      if (!sellerId) {
        return {
          totalActive: 0, updatedRecently: 0, awaitingCollection: 0,
          totalExams: 0, anomalyCount: 0, lastSyncAt: null,
          lastCollectionAt: null, lastCollectionStatus: null, lastCollectionError: null,
          lastCollectionProcessed: 0, lastCollectionFailed: 0,
          backfillStatus: null, backfillProgress: null, backfillError: null,
          dataStartDate: null, dataDaysAvailable: 0,
        };
      }

      const [distinctRes, historyRes, anomalyRes, lastSyncRes, lastCollectionSuccessRes, lastCollectionAnyRes, backfillRes, visitCoverageRes] = await Promise.all([
        supabase.rpc("count_distinct_active_items", { p_seller_id: sellerId }),
        supabase.from("listing_health_history").select("id", { count: "exact", head: true }).eq("seller_id", sellerId),
        supabase.from("listing_health_current").select("id", { count: "exact", head: true }).eq("seller_id", sellerId).not("anomaly_flags", "eq", "{}"),
        supabase.from("radiography_collection_logs").select("finished_at").eq("seller_id", sellerId).eq("job_type", "sync").eq("status", "success").order("finished_at", { ascending: false }).limit(1),
        supabase.from("radiography_collection_logs").select("finished_at").eq("seller_id", sellerId).eq("job_type", "collection").eq("status", "success").order("finished_at", { ascending: false }).limit(1),
        supabase.from("radiography_collection_logs").select("status, error_message, items_processed, items_failed, finished_at, created_at").eq("seller_id", sellerId).eq("job_type", "collection").order("created_at", { ascending: false }).limit(1),
        supabase.from("radiography_backfill_control").select("status, progress_percent, error_message").eq("seller_id", sellerId).limit(1).maybeSingle(),
        supabase.from("seller_item_visits").select("visit_date").eq("seller_id", sellerId).order("visit_date", { ascending: true }).limit(1),
      ]);

      const distinctData = distinctRes.data?.[0];
      const totalActive = Number(distinctData?.total_distinct || 0);
      const recentCount = Number(distinctData?.updated_recently || 0);
      const lastCollectionAny = lastCollectionAnyRes.data?.[0];

      const earliestDate = visitCoverageRes.data?.[0]?.visit_date || null;
      let dataDaysAvailable = 0;
      if (earliestDate) {
        const diffMs = Date.now() - new Date(earliestDate).getTime();
        dataDaysAvailable = Math.max(1, Math.floor(diffMs / (24 * 60 * 60 * 1000)));
      }

      return {
        totalActive,
        updatedRecently: recentCount,
        awaitingCollection: totalActive - recentCount,
        totalExams: historyRes.count || 0,
        anomalyCount: anomalyRes.count || 0,
        lastSyncAt: lastSyncRes.data?.[0]?.finished_at || null,
        lastCollectionAt: lastCollectionSuccessRes.data?.[0]?.finished_at || null,
        lastCollectionStatus: lastCollectionAny?.status || null,
        lastCollectionError: lastCollectionAny?.error_message || null,
        lastCollectionProcessed: lastCollectionAny?.items_processed || 0,
        lastCollectionFailed: lastCollectionAny?.items_failed || 0,
        backfillStatus: backfillRes.data?.status || null,
        backfillProgress: backfillRes.data?.progress_percent || null,
        backfillError: backfillRes.data?.error_message || null,
        dataStartDate: earliestDate,
        dataDaysAvailable,
      };
    },
    enabled: !!sellerId,
    staleTime: 5 * 60 * 1000,
  });

  // 3. Visit series
  const fetchItemVisitSeries = useCallback(
    async (itemId: string, days: PeriodDays = 30): Promise<VisitSeriesEntry[]> => {
      if (!sellerId) return [];
      const { data, error } = await supabase.rpc("get_item_visit_series", {
        p_seller_id: sellerId,
        p_item_id: itemId,
        p_days: days,
      });
      if (error) throw error;
      return (data || []).map((r: any) => ({
        visit_date: r.visit_date,
        visits: Number(r.visits) || 0,
      }));
    },
    [sellerId]
  );

  // 3b. History snapshots
  const fetchItemHistory = useCallback(
    async (itemId: string, days: PeriodDays = 30): Promise<HealthHistoryEntry[]> => {
      if (!sellerId) return [];
      const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
      const { data, error } = await supabase
        .from("listing_health_history")
        .select("*")
        .eq("seller_id", sellerId)
        .eq("item_id", itemId)
        .gte("collected_at", since)
        .order("collected_at", { ascending: true });
      if (error) throw error;
      return (data || []) as HealthHistoryEntry[];
    },
    [sellerId]
  );

  // 4. Trigger update
  const triggerUpdate = useCallback(async () => {
    if (!sellerId) return;
    await supabase.functions.invoke("radiography-collector", {
      body: { action: "full", seller_id: sellerId },
    });
    await supabase.functions.invoke("radiography-collector", {
      body: { action: "enrich_sales", seller_id: sellerId },
    });
  }, [sellerId]);

  return {
    items: items || [],
    itemsLoading,
    diagnostics: diagnostics || null,
    diagnosticsLoading,
    fetchItemHistory,
    fetchItemVisitSeries,
    triggerUpdate,
    refetchItems,
  };
}
