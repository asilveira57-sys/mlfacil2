import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AbcFilters, AbcConfig } from "@/pages/AbcAnalysis";
import { AbcItem } from "@/components/abc/AbcTable";

export type AbcIndicator = "revenue" | "units" | "orders";

interface UseAbcAnalysisOptions {
  sellerId: string;
  filters: AbcFilters;
  config: AbcConfig;
  type: "products" | "customers" | "cities";
  indicator: AbcIndicator;
}

interface AbcAnalysisResult {
  items: AbcItem[];
  loading: boolean;
  error: string | null;
  totals: {
    totalItems: number;
    totalValue: number;
    classACount: number;
    classBCount: number;
    classCCount: number;
  };
  refetch: () => void;
}

function classifyItems(
  items: Array<{ id: string; name: string; subtitle?: string; value: number; orders?: number; units?: number; revenue?: number }>,
  config: AbcConfig
): AbcItem[] {
  const total = items.reduce((sum, item) => sum + item.value, 0);
  if (total === 0) return [];

  const sortedItems = [...items].sort((a, b) => b.value - a.value);
  
  let cumulative = 0;
  const classAThreshold = config.percentA;
  const classBThreshold = config.percentA + config.percentB;

  return sortedItems.map((item, index) => {
    const percentage = (item.value / total) * 100;
    cumulative += percentage;

    let classification: "A" | "B" | "C";
    if (cumulative <= classAThreshold) {
      classification = "A";
    } else if (cumulative <= classBThreshold) {
      classification = "B";
    } else {
      classification = "C";
    }

    return {
      id: item.id,
      rank: index + 1,
      name: item.name,
      subtitle: item.subtitle,
      value: item.value,
      secondaryValue: item.orders,
      tertiaryValue: item.units,
      percentage,
      cumulative,
      classification,
    };
  });
}

export function useAbcAnalysis({
  sellerId,
  filters,
  config,
  type,
  indicator,
}: UseAbcAnalysisOptions): AbcAnalysisResult {
  const [items, setItems] = useState<AbcItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [totals, setTotals] = useState({
    totalItems: 0,
    totalValue: 0,
    classACount: 0,
    classBCount: 0,
    classCCount: 0,
  });

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Não autenticado");

      // Build date filter conditions
      let dateFilter = "";
      if (filters.dateFrom && filters.dateTo) {
        dateFilter = `and created_at_meli >= '${filters.dateFrom}' and created_at_meli < '${filters.dateTo}'::date + interval '1 day'`;
      }

      // Build status filter
      let statusFilter = "";
      if (filters.cancellationFilter === "exclude") {
        statusFilter = "and order_status NOT IN ('cancelled', 'refunded', 'partially_refunded')";
      } else if (filters.cancellationFilter === "only") {
        statusFilter = "and order_status IN ('cancelled', 'refunded', 'partially_refunded')";
      }

      if (type === "products") {
        // Fetch products ABC data
        const { data: ordersData, error: ordersError } = await supabase
          .from("meli_orders_cache")
          .select("order_id, total_amount, created_at_meli, order_status")
          .eq("seller_id", sellerId)
          .gte("created_at_meli", filters.dateFrom || "1970-01-01")
          .lte("created_at_meli", filters.dateTo ? `${filters.dateTo}T23:59:59` : "2099-12-31");

        if (ordersError) throw ordersError;

        // Filter by status
        const filteredOrders = ordersData?.filter(o => {
          if (filters.cancellationFilter === "exclude") {
            return !["cancelled", "refunded", "partially_refunded"].includes(o.order_status || "");
          } else if (filters.cancellationFilter === "only") {
            return ["cancelled", "refunded", "partially_refunded"].includes(o.order_status || "");
          }
          return true;
        }) || [];

        const orderIds = filteredOrders.map(o => o.order_id);

        if (orderIds.length === 0) {
          setItems([]);
          setTotals({ totalItems: 0, totalValue: 0, classACount: 0, classBCount: 0, classCCount: 0 });
          setLoading(false);
          return;
        }

        const { data: itemsData, error: itemsError } = await supabase
          .from("meli_order_items_cache")
          .select("product_key, title, title_short, sku, quantity, unit_price, order_id")
          .eq("seller_id", sellerId)
          .in("order_id", orderIds);

        if (itemsError) throw itemsError;

        // Aggregate by product_key
        const productMap = new Map<string, {
          name: string;
          subtitle: string;
          orders: Set<string>;
          units: number;
          revenue: number;
        }>();

        (itemsData || []).forEach(item => {
          const key = item.product_key || item.title || "unknown";
          const existing = productMap.get(key);
          
          if (existing) {
            existing.orders.add(item.order_id);
            existing.units += item.quantity;
            existing.revenue += item.quantity * item.unit_price;
          } else {
            const displayName = item.title_short || item.title || key;
            productMap.set(key, {
              name: displayName.length > 60 ? displayName.substring(0, 57) + "..." : displayName,
              subtitle: item.sku || "",
              orders: new Set([item.order_id]),
              units: item.quantity,
              revenue: item.quantity * item.unit_price,
            });
          }
        });

        // Convert to array and classify
        const productsArray = Array.from(productMap.entries()).map(([id, data]) => ({
          id,
          name: data.name,
          subtitle: data.subtitle,
          value: indicator === "revenue" ? data.revenue : indicator === "units" ? data.units : data.orders.size,
          orders: data.orders.size,
          units: data.units,
          revenue: data.revenue,
        }));

        const classified = classifyItems(productsArray, config);
        setItems(classified);
        setTotals({
          totalItems: classified.length,
          totalValue: productsArray.reduce((sum, p) => sum + p.revenue, 0),
          classACount: classified.filter(i => i.classification === "A").length,
          classBCount: classified.filter(i => i.classification === "B").length,
          classCCount: classified.filter(i => i.classification === "C").length,
        });

      } else if (type === "customers") {
        // Fetch customers ABC data
        const { data: ordersData, error: ordersError } = await supabase
          .from("meli_orders_cache")
          .select("order_id, buyer_nickname, buyer_name, total_amount, items_count, created_at_meli, order_status")
          .eq("seller_id", sellerId)
          .gte("created_at_meli", filters.dateFrom || "1970-01-01")
          .lte("created_at_meli", filters.dateTo ? `${filters.dateTo}T23:59:59` : "2099-12-31");

        if (ordersError) throw ordersError;

        // Filter by status
        const filteredOrders = ordersData?.filter(o => {
          if (filters.cancellationFilter === "exclude") {
            return !["cancelled", "refunded", "partially_refunded"].includes(o.order_status || "");
          } else if (filters.cancellationFilter === "only") {
            return ["cancelled", "refunded", "partially_refunded"].includes(o.order_status || "");
          }
          return true;
        }) || [];

        // Aggregate by buyer
        const customerMap = new Map<string, {
          name: string;
          orders: number;
          units: number;
          revenue: number;
        }>();

        filteredOrders.forEach(order => {
          const key = order.buyer_nickname || order.buyer_name || "unknown";
          const existing = customerMap.get(key);
          
          if (existing) {
            existing.orders += 1;
            existing.units += order.items_count || 0;
            existing.revenue += order.total_amount || 0;
          } else {
            customerMap.set(key, {
              name: order.buyer_name || order.buyer_nickname || key,
              orders: 1,
              units: order.items_count || 0,
              revenue: order.total_amount || 0,
            });
          }
        });

        const customersArray = Array.from(customerMap.entries()).map(([id, data]) => ({
          id,
          name: data.name,
          value: indicator === "revenue" ? data.revenue : indicator === "units" ? data.units : data.orders,
          orders: data.orders,
          units: data.units,
          revenue: data.revenue,
        }));

        const classified = classifyItems(customersArray, config);
        setItems(classified);
        setTotals({
          totalItems: classified.length,
          totalValue: customersArray.reduce((sum, c) => sum + c.revenue, 0),
          classACount: classified.filter(i => i.classification === "A").length,
          classBCount: classified.filter(i => i.classification === "B").length,
          classCCount: classified.filter(i => i.classification === "C").length,
        });
      }
    } catch (err) {
      console.error("ABC Analysis error:", err);
      setError(err instanceof Error ? err.message : "Erro ao carregar dados");
    } finally {
      setLoading(false);
    }
  }, [sellerId, filters, config, type, indicator]);

  useEffect(() => {
    if (sellerId) {
      fetchData();
    }
  }, [fetchData, sellerId]);

  return {
    items,
    loading,
    error,
    totals,
    refetch: fetchData,
  };
}
