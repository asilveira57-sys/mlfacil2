import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { fetchAllRows } from "@/lib/supabaseHelpers";
import { AbcFilters, AbcConfig } from "@/pages/AbcAnalysis";
import { AbcTable, AbcItem } from "./AbcTable";
import { AbcSummaryCards } from "./AbcSummaryCards";
import { AbcParetoChart } from "./AbcParetoChart";
import { AbcGeographicDetailDrawer } from "./AbcGeographicDetailDrawer";
import { AbcIndicator } from "@/hooks/useAbcAnalysis";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Download, MapPin, ChevronRight, ArrowLeft, Loader2, DollarSign, Package, TrendingUp, Map as MapIcon, RefreshCw, AlertTriangle } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { AbcMapDrawer, MapMarkerData } from "./AbcMapDrawer";
import { isFlexLocation } from "@/lib/flexAreas";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface AbcCitiesTabProps {
  sellerId: string;
  filters: AbcFilters;
  config: AbcConfig;
}

interface GeographicItem {
  id: string;
  name: string;
  orders: number;
  units: number;
  revenue: number;
  flexOrders: number;
  children?: GeographicItem[];
}

type DrillLevel = "uf" | "city" | "neighborhood";
type FlexFilter = "all" | "flex" | "nonflex";

const isFlexItem = (item: GeographicItem) => item.orders > 0 && item.flexOrders / item.orders >= 0.5;

const INDICATOR_OPTIONS: { value: AbcIndicator; label: string; icon: React.ReactNode }[] = [
  { value: "revenue", label: "Valor comprado", icon: <DollarSign className="h-4 w-4" /> },
  { value: "units", label: "Quantidade de itens", icon: <Package className="h-4 w-4" /> },
  { value: "orders", label: "Quantidade de pedidos", icon: <TrendingUp className="h-4 w-4" /> },
];

function classifyItems(
  items: GeographicItem[],
  config: AbcConfig,
  indicator: AbcIndicator
): AbcItem[] {
  const getValue = (item: GeographicItem) => {
    switch (indicator) {
      case "revenue": return item.revenue;
      case "units": return item.units;
      case "orders": return item.orders;
    }
  };

  const total = items.reduce((sum, item) => sum + getValue(item), 0);
  if (total === 0) return [];

  const sortedItems = [...items].sort((a, b) => getValue(b) - getValue(a));
  
  let cumulative = 0;
  const classAThreshold = config.percentA;
  const classBThreshold = config.percentA + config.percentB;

  return sortedItems.map((item, index) => {
    const value = getValue(item);
    const percentage = (value / total) * 100;
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
      name: `${item.name} (${item.orders})`,
      subtitle: undefined,
      value,
      orders: item.orders,
      units: item.units,
      revenue: item.revenue,
      percentage,
      cumulative,
      classification,
      isFlex: isFlexItem(item),
    };
  });
}

export function AbcCitiesTab({ sellerId, filters, config }: AbcCitiesTabProps) {
  const [indicator, setIndicator] = useState<AbcIndicator>("orders");
  const [drillLevel, setDrillLevel] = useState<DrillLevel>("uf");
  const [selectedUf, setSelectedUf] = useState<string | null>(null);
  const [selectedCity, setSelectedCity] = useState<string | null>(null);
  const [flexFilter, setFlexFilter] = useState<FlexFilter>("all");
  const [flexOrderIds, setFlexOrderIds] = useState<Set<string>>(new Set());
  const [exportingFlex, setExportingFlex] = useState(false);
  
  const [data, setData] = useState<GeographicItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [enrichmentStatus, setEnrichmentStatus] = useState<string | null>(null);

  // Map drawer state
  const [mapDrawerOpen, setMapDrawerOpen] = useState(false);
  const [fixingAddresses, setFixingAddresses] = useState(false);

  // Drawer state for geographic details
  const [selectedGeoItem, setSelectedGeoItem] = useState<AbcItem | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Não autenticado");

      // Get ALL orders with shipment data (paginated to avoid 1000-row limit)
      const ordersData = await fetchAllRows<{
        order_id: string;
        shipment_id: string | null;
        total_amount: number;
        items_count: number;
        created_at_meli: string;
        order_status: string;
      }>(
        supabase
          .from("meli_orders_cache")
          .select("order_id, shipment_id, total_amount, items_count, created_at_meli, order_status")
          .eq("seller_id", sellerId)
          .gte("created_at_meli", filters.dateFrom || "1970-01-01")
          .lte("created_at_meli", filters.dateTo ? `${filters.dateTo}T23:59:59` : "2099-12-31")
      );

      // Filter by cancellation status
      const filteredOrders = ordersData?.filter(o => {
        if (filters.cancellationFilter === "exclude") {
          return !["cancelled", "refunded", "partially_refunded"].includes(o.order_status || "");
        } else if (filters.cancellationFilter === "only") {
          return ["cancelled", "refunded", "partially_refunded"].includes(o.order_status || "");
        }
        return true;
      }) || [];

      const shipmentIds = filteredOrders
        .map(o => o.shipment_id)
        .filter((id): id is string => !!id);

      if (shipmentIds.length === 0) {
        setData([]);
        setLoading(false);
        return;
      }

      // Get ALL shipments with geographic data — batch .in() to avoid limits
      const shipmentsData: any[] = [];
      const BATCH_SIZE = 500;
      for (let i = 0; i < shipmentIds.length; i += BATCH_SIZE) {
        const batch = shipmentIds.slice(i, i + BATCH_SIZE);
        const { data: batchData, error: shipmentsError } = await supabase
          .from("meli_shipments_cache")
          .select("shipment_id, shipping_state_uf, shipping_city, shipping_neighborhood, receiver_address, shipping_zipcode")
          .eq("seller_id", sellerId)
          .in("shipment_id", batch);

        if (shipmentsError) throw shipmentsError;
        if (batchData) shipmentsData.push(...batchData);
      }

      // Create shipment lookup
      const shipmentMap = new Map(
        (shipmentsData || []).map(s => [s.shipment_id, s])
      );

      // Parse receiver_address for missing structured data
      const parseAddress = (address: string | null): { uf: string; city: string; neighborhood: string } => {
        if (!address) return { uf: "N/D", city: "N/D", neighborhood: "N/D" };
        
        const parts = address.split(",").map(p => p.trim());
        // Format: "Street, City, State, Zipcode"
        const uf = parts[2] || "N/D";
        const city = parts[1] || "N/D";
        
        // Map state names to UF codes
        const stateMap: Record<string, string> = {
          "São Paulo": "SP", "Rio de Janeiro": "RJ", "Minas Gerais": "MG",
          "Bahia": "BA", "Paraná": "PR", "Rio Grande do Sul": "RS",
          "Santa Catarina": "SC", "Pernambuco": "PE", "Ceará": "CE",
          "Goiás": "GO", "Pará": "PA", "Maranhão": "MA", "Amazonas": "AM",
          "Espírito Santo": "ES", "Paraíba": "PB", "Rio Grande do Norte": "RN",
          "Mato Grosso": "MT", "Alagoas": "AL", "Piauí": "PI", "Distrito Federal": "DF",
          "Mato Grosso do Sul": "MS", "Sergipe": "SE", "Rondônia": "RO",
          "Tocantins": "TO", "Acre": "AC", "Amapá": "AP", "Roraima": "RR",
        };

        const ufCode = stateMap[uf] || uf;
        
        return { 
          uf: ufCode.length <= 2 ? ufCode : "N/D", 
          city, 
          neighborhood: "N/D" 
        };
      };

      // Aggregate by geographic level
      const ufMap = new Map<string, GeographicItem>();
      const flexIds = new Set<string>();

      const bump = (list: GeographicItem[], key: string, units: number, revenue: number, flex: boolean): GeographicItem => {
        let node = list.find(n => n.id === key);
        if (!node) {
          node = { id: key, name: key, orders: 0, units: 0, revenue: 0, flexOrders: 0, children: [] };
          list.push(node);
        }
        node.orders += 1;
        node.units += units;
        node.revenue += revenue;
        if (flex) node.flexOrders += 1;
        return node;
      };

      filteredOrders.forEach(order => {
        const shipment = shipmentMap.get(order.shipment_id || "");
        let uf: string, city: string, neighborhood: string;

        if (shipment?.shipping_state_uf) {
          uf = shipment.shipping_state_uf;
          city = shipment.shipping_city || "N/D";
          neighborhood = shipment.shipping_neighborhood || "N/D";
        } else {
          const parsed = parseAddress(shipment?.receiver_address || null);
          uf = parsed.uf;
          city = parsed.city;
          neighborhood = parsed.neighborhood;
        }

        const flex = isFlexLocation({ uf, city, zipcode: shipment?.shipping_zipcode });
        if (flex) flexIds.add(order.order_id);
        const units = order.items_count || 0;
        const revenue = order.total_amount || 0;

        let ufItem = ufMap.get(uf);
        if (!ufItem) {
          ufItem = { id: uf, name: uf, orders: 0, units: 0, revenue: 0, flexOrders: 0, children: [] };
          ufMap.set(uf, ufItem);
        }
        ufItem.orders += 1;
        ufItem.units += units;
        ufItem.revenue += revenue;
        if (flex) ufItem.flexOrders += 1;
        const cityItem = bump(ufItem.children!, city, units, revenue, flex);
        bump(cityItem.children!, neighborhood, units, revenue, flex);
      });

      setFlexOrderIds(flexIds);
      setData(Array.from(ufMap.values()));
    } catch (err) {
      console.error("Cities ABC error:", err);
      setError(err instanceof Error ? err.message : "Erro ao carregar dados");
    } finally {
      setLoading(false);
    }
  }, [sellerId, filters]);

  useEffect(() => {
    if (sellerId) {
      fetchData();
    }
  }, [fetchData, sellerId]);

  const getCurrentItems = (): GeographicItem[] => {
    if (drillLevel === "uf") {
      return data;
    } else if (drillLevel === "city" && selectedUf) {
      const ufData = data.find(d => d.id === selectedUf);
      return ufData?.children || [];
    } else if (drillLevel === "neighborhood" && selectedUf && selectedCity) {
      const ufData = data.find(d => d.id === selectedUf);
      const cityData = ufData?.children?.find(c => c.id === selectedCity);
      return cityData?.children || [];
    }
    return [];
  };

  const levelItems = getCurrentItems();
  const hasFlexAtLevel = drillLevel !== "uf" && levelItems.some(isFlexItem);
  const currentItems = drillLevel === "uf" || flexFilter === "all"
    ? levelItems
    : levelItems.filter(i => (flexFilter === "flex" ? isFlexItem(i) : !isFlexItem(i)));
  const classifiedItems = classifyItems(currentItems, config, indicator);

  const handleDrillDown = (item: AbcItem) => {
    if (drillLevel === "uf") {
      setSelectedUf(item.id);
      setDrillLevel("city");
    } else if (drillLevel === "city") {
      setSelectedCity(item.id);
      setDrillLevel("neighborhood");
    }
  };

  const handleOpenDetail = (item: AbcItem) => {
    setSelectedGeoItem(item);
    setDrawerOpen(true);
  };

  const handleOpenMapForItem = (item: AbcItem) => {
    // Drill into the item first, then open map
    if (drillLevel === "uf") {
      setSelectedUf(item.id);
      setDrillLevel("city");
    } else if (drillLevel === "city") {
      setSelectedCity(item.id);
      setDrillLevel("neighborhood");
    }
    setTimeout(() => setMapDrawerOpen(true), 200);
  };

  // Handle navigating up from within the detail drawer
  const handleDrawerNavigateUp = () => {
    setDrawerOpen(false);
    handleDrillUp();
  };

  // Build breadcrumb for the drawer
  const getDrawerBreadcrumb = (): string[] => {
    const parts = ["Brasil"];
    if (selectedUf) parts.push(selectedUf);
    if (selectedCity) parts.push(selectedCity);
    if (selectedGeoItem) parts.push(selectedGeoItem.id);
    return parts;
  };

  // Build location object based on current drill level and selected item
  const getLocationForDrawer = () => {
    if (!selectedGeoItem) return null;
    
    // Extract the clean ID from name (remove the count suffix like "(123)")
    const cleanId = selectedGeoItem.id;
    
    if (drillLevel === "uf") {
      return { uf: cleanId };
    } else if (drillLevel === "city") {
      return { uf: selectedUf!, city: cleanId };
    } else {
      return { uf: selectedUf!, city: selectedCity!, neighborhood: cleanId };
    }
  };

  const handleDrillUp = () => {
    if (drillLevel === "neighborhood") {
      setSelectedCity(null);
      setDrillLevel("city");
    } else if (drillLevel === "city") {
      setSelectedUf(null);
      setDrillLevel("uf");
    }
  };

  const handleExportCSV = () => {
    if (classifiedItems.length === 0) return;

    const levelName = drillLevel === "uf" ? "UF" : drillLevel === "city" ? "Cidade" : "Bairro";
    const headers = ["Rank", levelName, "Pedidos", "Unidades", "Valor", "% Participação", "% Acumulado", "Classe"];
    const rows = classifiedItems.map(item => [
      item.rank,
      item.name,
      item.orders,
      item.units,
      item.revenue,
      item.percentage.toFixed(2),
      item.cumulative.toFixed(2),
      item.classification,
    ]);

    const csvContent = [
      headers.join(";"),
      ...rows.map(row => row.join(";")),
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `curva-abc-${drillLevel}-${new Date().toISOString().split("T")[0]}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleExportFlexProducts = async () => {
    if (flexOrderIds.size === 0) return;
    setExportingFlex(true);
    try {
      const ids = Array.from(flexOrderIds);
      const rowsData: Array<{ order_id: string; item_id: string; sku: string | null; title: string | null; quantity: number | null; unit_price: number | null }> = [];
      const BATCH = 500;
      for (let i = 0; i < ids.length; i += BATCH) {
        const batch = ids.slice(i, i + BATCH);
        const part = await fetchAllRows<typeof rowsData[number]>(
          supabase
            .from("meli_order_items_cache")
            .select("order_id, item_id, sku, title, quantity, unit_price")
            .eq("seller_id", sellerId)
            .in("order_id", batch)
        );
        rowsData.push(...part);
      }

      const agg = new Map<string, { item_id: string; sku: string; title: string; units: number; revenue: number; orders: Set<string> }>();
      rowsData.forEach(r => {
        const key = r.item_id || "N/D";
        let e = agg.get(key);
        if (!e) {
          e = { item_id: key, sku: r.sku || "", title: r.title || "", units: 0, revenue: 0, orders: new Set() };
          agg.set(key, e);
        }
        const q = Number(r.quantity) || 0;
        e.units += q;
        e.revenue += q * (Number(r.unit_price) || 0);
        e.orders.add(r.order_id);
        if (!e.sku && r.sku) e.sku = r.sku;
        if (!e.title && r.title) e.title = r.title;
      });

      const list = Array.from(agg.values()).sort((a, b) => b.revenue - a.revenue);
      const total = list.reduce((s, i) => s + i.revenue, 0);
      if (list.length === 0) {
        toast({ title: "Nenhum produto encontrado", description: "Não há itens vendidos na área Flex no período." });
        return;
      }
      let cum = 0;
      const clean = (v: string) => v.replace(/[;\n\r]/g, " ");
      const rows = list.map((i, idx) => {
        const pct = total > 0 ? (i.revenue / total) * 100 : 0;
        cum += pct;
        const cls = cum <= config.percentA ? "A" : cum <= config.percentA + config.percentB ? "B" : "C";
        return [idx + 1, clean(i.sku), i.item_id, clean(i.title), i.orders.size, i.units, i.revenue.toFixed(2), pct.toFixed(2), cum.toFixed(2), cls];
      });
      const headers = ["Rank", "SKU", "Item ID", "Título", "Pedidos", "Unidades", "Faturamento", "% Participação", "% Acumulado", "Classe"];
      const csv = [headers.join(";"), ...rows.map(r => r.join(";"))].join("\n");
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `produtos-area-flex-${new Date().toISOString().split("T")[0]}.csv`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Flex export error:", err);
      toast({
        title: "Erro ao exportar produtos Flex",
        description: err instanceof Error ? err.message : "Tente novamente.",
        variant: "destructive",
      });
    } finally {
      setExportingFlex(false);
    }
  };

  const flexSuffix = drillLevel !== "uf" && flexFilter !== "all" ? (flexFilter === "flex" ? " (só Flex)" : " (fora do Flex)") : "";

  const totals = {
    totalItems: classifiedItems.length,
    totalValue: currentItems.reduce((sum, i) => sum + i.revenue, 0),
    totalOrders: currentItems.reduce((sum, i) => sum + i.orders, 0),
    classACount: classifiedItems.filter(i => i.classification === "A").length,
    classBCount: classifiedItems.filter(i => i.classification === "B").length,
    classCCount: classifiedItems.filter(i => i.classification === "C").length,
  };

  const summaryCards = [
    {
      label: (drillLevel === "uf" ? "Estados" : drillLevel === "city" ? "Cidades" : "Bairros") + flexSuffix,
      value: totals.totalItems,
      icon: <MapPin className="h-5 w-5 text-primary" />,
      description: `${totals.classACount} na classe A`,
    },
    {
      label: "Total de Pedidos" + flexSuffix,
      value: totals.totalOrders,
      icon: <Package className="h-5 w-5 text-primary" />,
    },
    {
      label: "Valor Total" + flexSuffix,
      value: new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(totals.totalValue),
      icon: <DollarSign className="h-5 w-5 text-primary" />,
    },
  ];

  const getBreadcrumb = () => {
    const parts = ["Brasil"];
    if (selectedUf) parts.push(selectedUf);
    if (selectedCity) parts.push(selectedCity);
    return parts;
  };

  // Detect N/D items
  const ndCount = currentItems
    .filter(i => i.name === "N/D" || i.name === "" || !i.name)
    .reduce((sum, i) => sum + i.orders, 0);
  const hasNd = ndCount > 0;

  const handleFixAddresses = async () => {
    setFixingAddresses(true);
    setEnrichmentStatus("Correção de endereços em andamento...");
    try {
      const { data, error } = await supabase.functions.invoke('ml-backfill-shipments', {
        body: { seller_id: sellerId },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      toast({
        title: "Correção iniciada",
        description: "Os endereços estão sendo processados. A Curva ABC será atualizada automaticamente.",
      });

      window.setTimeout(() => {
        setEnrichmentStatus("Atualizando a Curva ABC com os endereços corrigidos...");
        fetchData();
      }, 8000);

      window.setTimeout(() => {
        fetchData();
        setEnrichmentStatus(null);
      }, 22000);
    } catch (err) {
      console.error("Fix addresses error:", err);
      setEnrichmentStatus(null);
      toast({
        title: "Erro ao iniciar correção",
        description: err instanceof Error ? err.message : "Tente novamente mais tarde.",
        variant: "destructive",
      });
    } finally {
      setTimeout(() => setFixingAddresses(false), 5000);
    }
  };

  const TABLE_COLUMNS = [
    { key: "orders" as const, label: "Pedidos", format: "number" as const, align: "right" as const, sortable: true },
    { key: "units" as const, label: "Unidades", format: "number" as const, align: "right" as const, sortable: true },
    { key: "revenue" as const, label: "Valor", format: "currency" as const, align: "right" as const, sortable: true },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <h2 className="text-lg font-semibold">Curva ABC de Cidades</h2>
          <Select value={indicator} onValueChange={(v: AbcIndicator) => setIndicator(v)}>
            <SelectTrigger className="w-[200px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {INDICATOR_OPTIONS.map(opt => (
                <SelectItem key={opt.value} value={opt.value}>
                  <div className="flex items-center gap-2">
                    {opt.icon}
                    {opt.label}
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {drillLevel !== "uf" && (
            <Select value={flexFilter} onValueChange={(v: FlexFilter) => setFlexFilter(v)}>
              <SelectTrigger className="w-[160px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas</SelectItem>
                <SelectItem value="flex">Só Flex</SelectItem>
                <SelectItem value="nonflex">Fora do Flex</SelectItem>
              </SelectContent>
            </Select>
          )}
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant={hasNd ? "default" : "outline"}
            onClick={handleFixAddresses}
            disabled={fixingAddresses}
          >
            {fixingAddresses ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
            Corrigir endereços
          </Button>
          <Button onClick={() => setMapDrawerOpen(true)} disabled={classifiedItems.length === 0}>
            <MapIcon className="h-4 w-4 mr-2" />
            Ver Mapa
          </Button>
          <Button variant="outline" onClick={handleExportCSV} disabled={classifiedItems.length === 0}>
            <Download className="h-4 w-4 mr-2" />
            Exportar CSV
          </Button>
          <Button variant="outline" onClick={handleExportFlexProducts} disabled={!hasFlexAtLevel || exportingFlex}>
            {exportingFlex ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Download className="h-4 w-4 mr-2" />}
            {exportingFlex ? "Exportando..." : "Exportar produtos Flex"}
          </Button>
        </div>
      </div>

      {/* Summary cards */}
      <AbcSummaryCards cards={summaryCards} />

      {/* Enrichment status */}
      {enrichmentStatus && (
        <Card className="bg-muted/50">
          <CardContent className="py-3 flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            {enrichmentStatus}
          </CardContent>
        </Card>
      )}

      {/* Error state */}
      {error && (
        <div className="rounded-lg bg-destructive/10 p-4 text-destructive">
          {error}
        </div>
      )}

      {/* Pareto Chart */}
      {!loading && classifiedItems.length > 0 && (
        <AbcParetoChart
          items={classifiedItems}
          indicator={indicator}
          thresholdA={config.percentA}
          thresholdB={config.percentB}
        />
      )}

      {/* N/D warning banner */}
      {!loading && hasNd && (
        <div className="flex items-center gap-3 rounded-lg border border-warning/50 bg-warning/10 p-4">
          <AlertTriangle className="h-5 w-5 text-warning shrink-0" />
          <div className="flex-1 text-sm">
            <strong>{ndCount} pedidos</strong> sem localização identificada (N/D).
            Clique em <strong>"Corrigir endereços"</strong> para resolver automaticamente.
          </div>
          <Button size="sm" onClick={handleFixAddresses} disabled={fixingAddresses}>
            {fixingAddresses ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-1" />}
            Corrigir
          </Button>
        </div>
      )}

      {/* Breadcrumb navigation - above table */}
      {drillLevel !== "uf" && (
        <div className="flex items-center gap-2 py-2">
          <Button variant="ghost" size="sm" className="h-7 px-2" onClick={handleDrillUp}>
            <ArrowLeft className="h-4 w-4 mr-1" />
            Voltar
          </Button>
          <div className="flex items-center gap-1 text-sm">
            {getBreadcrumb().map((part, idx) => {
              const isLast = idx === getBreadcrumb().length - 1;
              const isClickable = !isLast;
              return (
                <span key={idx} className="flex items-center">
                  {idx > 0 && <ChevronRight className="h-4 w-4 mx-1 text-muted-foreground" />}
                  <span
                    className={
                      isLast
                        ? "font-semibold text-foreground"
                        : isClickable
                        ? "text-primary cursor-pointer hover:underline"
                        : "text-muted-foreground"
                    }
                    onClick={() => {
                      if (isLast) return;
                      if (idx === 0) {
                        setSelectedUf(null);
                        setSelectedCity(null);
                        setDrillLevel("uf");
                      } else if (idx === 1 && drillLevel === "neighborhood") {
                        setSelectedCity(null);
                        setDrillLevel("city");
                      }
                    }}
                  >
                    {part}
                  </span>
                </span>
              );
            })}
          </div>
        </div>
      )}

      {/* ABC Table */}
      <AbcTable
        items={classifiedItems}
        columns={TABLE_COLUMNS}
        loading={loading}
        emptyMessage={`Nenhum${drillLevel === "uf" ? " estado" : drillLevel === "city" ? "a cidade" : " bairro"} encontrado no período selecionado`}
        onRowClick={drillLevel !== "neighborhood" ? handleDrillDown : undefined}
        onDetailClick={handleOpenDetail}
        onMapClick={drillLevel !== "neighborhood" ? handleOpenMapForItem : undefined}
      />

      {/* Drill hint */}
      {!loading && classifiedItems.length > 0 && (
        <p className="text-sm text-muted-foreground text-center">
          {drillLevel !== "neighborhood" 
            ? `Clique em uma linha para navegar, ou no ícone 👁 para ver detalhes`
            : "Clique no ícone 👁 para ver produtos, clientes e pedidos"
          }
        </p>
      )}

      {/* Class distribution */}
      {!loading && classifiedItems.length > 0 && (
        <div className="flex items-center gap-6 text-sm text-muted-foreground">
          <span>
            <strong className="text-success">{totals.classACount}</strong> classe A
          </span>
          <span>
            <strong className="text-warning">{totals.classBCount}</strong> classe B
          </span>
          <span>
            <strong className="text-destructive">{totals.classCCount}</strong> classe C
          </span>
        </div>
      )}

      {/* Geographic Detail Drawer */}
      <AbcGeographicDetailDrawer
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        location={getLocationForDrawer()}
        locationName={selectedGeoItem?.name || ""}
        classification={selectedGeoItem?.classification || "C"}
        sellerId={sellerId}
        dateFrom={filters.dateFrom}
        dateTo={filters.dateTo}
        onNavigateUp={drillLevel !== "uf" ? handleDrawerNavigateUp : undefined}
        breadcrumbParts={getDrawerBreadcrumb()}
      />

      {/* Map Drawer */}
      <AbcMapDrawer
        open={mapDrawerOpen}
        onOpenChange={setMapDrawerOpen}
        title={
          drillLevel === "uf"
            ? "Mapa de Vendas por Estado"
            : drillLevel === "city"
            ? `Cidades de ${selectedUf}`
            : `Bairros de ${selectedCity}`
        }
        subtitle={`${classifiedItems.length} ${drillLevel === "uf" ? "estados" : drillLevel === "city" ? "cidades" : "bairros"} • ${totals.totalOrders} pedidos`}
        markers={classifiedItems.map((item) => ({
          id: item.id,
          name: item.id,
          orders: item.orders,
          units: item.units,
          revenue: item.revenue,
          classification: item.classification,
        }))}
        level={drillLevel}
        selectedUf={selectedUf}
        selectedCity={selectedCity}
        onMarkerDrillDown={(marker) => {
          setMapDrawerOpen(false);
          if (drillLevel === "uf") {
            setSelectedUf(marker.id);
            setDrillLevel("city");
          } else if (drillLevel === "city") {
            setSelectedCity(marker.id);
            setDrillLevel("neighborhood");
          }
          // Re-open map after drill
          setTimeout(() => setMapDrawerOpen(true), 300);
        }}
      />
    </div>
  );
}
