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
  price: number | null;
  available_quantity: number | null;
  listing_status: string | null;
  listing_type: string | null;
  shipping_mode: string | null;
  catalog_listing: boolean | null;
  anomaly_flags: string[] | null;
  last_collected_at: string | null;
  updated_at: string;
  // Sales enrichment
  sales_count_7d: number | null;
  units_sold_7d: number | null;
  sales_count_30d: number | null;
  units_sold_30d: number | null;
  conversion_rate_7d: number | null;
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
  // joined from meli_listings_cache
  title?: string | null;
  thumbnail?: string | null;
  permalink?: string | null;
  logistic_type?: string | null;
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
}

export type AnomalyFilter = "all" | "with_anomaly" | "without_anomaly";
export type PeriodDays = 7 | 15 | 30 | 60 | 150;

// --- Health classification from real data ---

export function classifyHealth(item: {
  visits_last?: number | null;
  available_quantity?: number | null;
  listing_type?: string | null;
  shipping_mode?: string | null;
  catalog_listing?: boolean | null;
  anomaly_flags?: string[] | null;
  last_collected_at?: string | null;
  days_without_sale?: number | null;
  sales_count_30d?: number | null;
  conversion_rate_7d?: number | null;
}): RadiographyHealthStatus {
  const flags = item.anomaly_flags || [];
  const visits = item.visits_last ?? -1;
  const stock = item.available_quantity ?? -1;
  const daysNoSale = item.days_without_sale ?? null;
  const sales30d = item.sales_count_30d ?? null;
  
  // If we have no data yet, show stable (not penalizing)
  if (!item.last_collected_at) return "stable";

  // Critical: zero stock, consistent decline, or 30+ days without sale with low visits
  if (stock === 0 || flags.includes("consistent_decline")) return "critical";
  if (daysNoSale !== null && daysNoSale > 30 && visits < 20) return "critical";

  // Alert: visit drop, zero visits, or visits without conversion
  if (flags.includes("visit_drop") || flags.includes("zero_visits")) return "alert";
  if (flags.includes("visits_no_conversion") || flags.includes("no_sales_30d")) return "alert";

  // Observation: high stock low traction, low conversion, or 14+ days without sale
  if (flags.includes("high_stock_low_traction") || flags.includes("low_conversion")) return "observation";
  if (flags.includes("no_sales_14d")) return "observation";

  // Healthy: good visits, has stock, has sales, good logistics
  if (visits > 10 && stock > 0 && (sales30d === null || sales30d > 0)) {
    const hasFulfillment = item.shipping_mode === "me2" || item.listing_type === "gold_pro";
    if (hasFulfillment || item.catalog_listing) return "healthy";
    return "stable";
  }

  // Stable by default
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

// --- Main hook ---

export function useRadiographyData(sellerId: string | null) {
  // 1. Fetch current health + listing info (main table)
  const {
    data: items,
    isLoading: itemsLoading,
    refetch: refetchItems,
  } = useQuery({
    queryKey: ["radiography-items", sellerId],
    queryFn: async () => {
      if (!sellerId) return [];

      // Get health current
      const { data: healthRows, error: healthErr } = await supabase
        .from("listing_health_current")
        .select("*")
        .eq("seller_id", sellerId);

      if (healthErr) throw healthErr;
      if (!healthRows?.length) return [];

      // Get listing cache for titles/thumbnails (deduplicated by item_id)
      const itemIds = [...new Set(healthRows.map((r) => r.item_id))];
      
      // Fetch in batches of 100
      const listings: Record<string, any> = {};
      for (let i = 0; i < itemIds.length; i += 100) {
        const batch = itemIds.slice(i, i + 100);
        const { data: cacheRows } = await supabase
          .from("meli_listings_cache")
          .select("item_id, title, thumbnail, permalink, logistic_type")
          .in("item_id", batch)
          .eq("seller_id", sellerId);
        
        if (cacheRows) {
          for (const row of cacheRows) {
            if (!listings[row.item_id]) {
              listings[row.item_id] = row;
            }
          }
        }
      }

      // Merge
      return healthRows.map((h) => {
        const cache = listings[h.item_id];
        return {
          ...h,
          change_flags: (h.change_flags as any as ChangeFlag[]) || [],
          alerts_json: (h.alerts_json as any as StructuredAlert[]) || [],
          seo_analysis_json: (h.seo_analysis_json as any as SeoAnalysis) || null,
          title: cache?.title || null,
          thumbnail: cache?.thumbnail || null,
          permalink: cache?.permalink || null,
          logistic_type: cache?.logistic_type || null,
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
          totalActive: 0,
          updatedRecently: 0,
          awaitingCollection: 0,
          totalExams: 0,
          anomalyCount: 0,
          lastSyncAt: null,
          lastCollectionAt: null,
          lastCollectionStatus: null,
          lastCollectionError: null,
          lastCollectionProcessed: 0,
          lastCollectionFailed: 0,
          backfillStatus: null,
          backfillProgress: null,
          backfillError: null,
        };
      }

      const fourDaysAgo = new Date(Date.now() - 4 * 24 * 60 * 60 * 1000).toISOString();

      // Parallel queries
      const [distinctRes, historyRes, anomalyRes, lastSyncRes, lastCollectionSuccessRes, lastCollectionAnyRes, backfillRes] = await Promise.all([
        // Distinct active items (ignoring variations)
        supabase.rpc("count_distinct_active_items", { p_seller_id: sellerId }),
        // Total history records
        supabase.from("listing_health_history").select("id", { count: "exact", head: true }).eq("seller_id", sellerId),
        // Anomaly count
        supabase.from("listing_health_current").select("id", { count: "exact", head: true }).eq("seller_id", sellerId).not("anomaly_flags", "eq", "{}"),
        // Last sync
        supabase.from("radiography_collection_logs").select("finished_at").eq("seller_id", sellerId).eq("job_type", "sync").eq("status", "success").order("finished_at", { ascending: false }).limit(1),
        // Last collection
        supabase.from("radiography_collection_logs").select("finished_at").eq("seller_id", sellerId).eq("job_type", "collection").eq("status", "success").order("finished_at", { ascending: false }).limit(1),
        // Last collection attempt (success or fail)
        supabase.from("radiography_collection_logs").select("status, error_message, items_processed, items_failed, finished_at, created_at").eq("seller_id", sellerId).eq("job_type", "collection").order("created_at", { ascending: false }).limit(1),
        // Backfill
        supabase.from("radiography_backfill_control").select("status, progress_percent, error_message").eq("seller_id", sellerId).limit(1).maybeSingle(),
      ]);

      const distinctData = distinctRes.data?.[0];
      const totalActive = Number(distinctData?.total_distinct || 0);
      const recentCount = Number(distinctData?.updated_recently || 0);

      const lastCollectionAny = lastCollectionAnyRes.data?.[0];

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
      };
    },
    enabled: !!sellerId,
    staleTime: 5 * 60 * 1000,
  });

  // 3. Fetch history for a specific item (lazy)
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

  // 4. Trigger update (edge function) — also enrich sales
  const triggerUpdate = useCallback(async () => {
    if (!sellerId) return;
    // Run full collection
    await supabase.functions.invoke("radiography-collector", {
      body: { action: "full", seller_id: sellerId },
    });
    // Then enrich sales data (doesn't need ML API)
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
    triggerUpdate,
    refetchItems,
  };
}
