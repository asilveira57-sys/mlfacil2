import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AbcFilters, AbcConfig } from "@/pages/AbcAnalysis";
import { AbcTable, AbcItem } from "./AbcTable";
import { AbcSummaryCards } from "./AbcSummaryCards";
import { AbcIndicator } from "@/hooks/useAbcAnalysis";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Download, MapPin, ChevronRight, ArrowLeft, Loader2, DollarSign, Package, TrendingUp } from "lucide-react";
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
  children?: GeographicItem[];
}

type DrillLevel = "uf" | "city" | "neighborhood";

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
      secondaryValue: item.orders,
      tertiaryValue: item.units,
      percentage,
      cumulative,
      classification,
    };
  });
}

export function AbcCitiesTab({ sellerId, filters, config }: AbcCitiesTabProps) {
  const [indicator, setIndicator] = useState<AbcIndicator>("orders");
  const [drillLevel, setDrillLevel] = useState<DrillLevel>("uf");
  const [selectedUf, setSelectedUf] = useState<string | null>(null);
  const [selectedCity, setSelectedCity] = useState<string | null>(null);
  
  const [data, setData] = useState<GeographicItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [enrichmentStatus, setEnrichmentStatus] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Não autenticado");

      // Get orders with shipment data
      const { data: ordersData, error: ordersError } = await supabase
        .from("meli_orders_cache")
        .select("order_id, shipment_id, total_amount, items_count, created_at_meli, order_status")
        .eq("seller_id", sellerId)
        .gte("created_at_meli", filters.dateFrom || "1970-01-01")
        .lte("created_at_meli", filters.dateTo ? `${filters.dateTo}T23:59:59` : "2099-12-31");

      if (ordersError) throw ordersError;

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

      // Get shipments with geographic data
      const { data: shipmentsData, error: shipmentsError } = await supabase
        .from("meli_shipments_cache")
        .select("shipment_id, shipping_state_uf, shipping_city, shipping_neighborhood, receiver_address")
        .eq("seller_id", sellerId)
        .in("shipment_id", shipmentIds);

      if (shipmentsError) throw shipmentsError;

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

        // Update UF level
        const existingUf = ufMap.get(uf);
        if (existingUf) {
          existingUf.orders += 1;
          existingUf.units += order.items_count || 0;
          existingUf.revenue += order.total_amount || 0;

          // Update city within UF
          let cityItem = existingUf.children?.find(c => c.id === city);
          if (cityItem) {
            cityItem.orders += 1;
            cityItem.units += order.items_count || 0;
            cityItem.revenue += order.total_amount || 0;

            // Update neighborhood
            let neighborhoodItem = cityItem.children?.find(n => n.id === neighborhood);
            if (neighborhoodItem) {
              neighborhoodItem.orders += 1;
              neighborhoodItem.units += order.items_count || 0;
              neighborhoodItem.revenue += order.total_amount || 0;
            } else {
              cityItem.children = cityItem.children || [];
              cityItem.children.push({
                id: neighborhood,
                name: neighborhood,
                orders: 1,
                units: order.items_count || 0,
                revenue: order.total_amount || 0,
              });
            }
          } else {
            existingUf.children = existingUf.children || [];
            existingUf.children.push({
              id: city,
              name: city,
              orders: 1,
              units: order.items_count || 0,
              revenue: order.total_amount || 0,
              children: [{
                id: neighborhood,
                name: neighborhood,
                orders: 1,
                units: order.items_count || 0,
                revenue: order.total_amount || 0,
              }],
            });
          }
        } else {
          ufMap.set(uf, {
            id: uf,
            name: uf,
            orders: 1,
            units: order.items_count || 0,
            revenue: order.total_amount || 0,
            children: [{
              id: city,
              name: city,
              orders: 1,
              units: order.items_count || 0,
              revenue: order.total_amount || 0,
              children: [{
                id: neighborhood,
                name: neighborhood,
                orders: 1,
                units: order.items_count || 0,
                revenue: order.total_amount || 0,
              }],
            }],
          });
        }
      });

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

  const currentItems = getCurrentItems();
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
      item.secondaryValue || 0,
      item.tertiaryValue || 0,
      item.value,
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
      label: drillLevel === "uf" ? "Estados" : drillLevel === "city" ? "Cidades" : "Bairros",
      value: totals.totalItems,
      icon: <MapPin className="h-5 w-5 text-primary" />,
      description: `${totals.classACount} na classe A`,
    },
    {
      label: "Total de Pedidos",
      value: totals.totalOrders,
      icon: <Package className="h-5 w-5 text-primary" />,
    },
    {
      label: "Valor Total",
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

  const TABLE_COLUMNS = [
    { key: "secondaryValue", label: "Pedidos", format: "number" as const, align: "right" as const },
    { key: "tertiaryValue", label: "Unidades", format: "number" as const, align: "right" as const },
    { key: "value", label: "Valor", format: "currency" as const, align: "right" as const },
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
        </div>

        <Button variant="outline" onClick={handleExportCSV} disabled={classifiedItems.length === 0}>
          <Download className="h-4 w-4 mr-2" />
          Exportar CSV
        </Button>
      </div>

      {/* Breadcrumb navigation */}
      <div className="flex items-center gap-2">
        {drillLevel !== "uf" && (
          <Button variant="ghost" size="sm" onClick={handleDrillUp}>
            <ArrowLeft className="h-4 w-4 mr-1" />
            Voltar
          </Button>
        )}
        <div className="flex items-center gap-1 text-sm text-muted-foreground">
          {getBreadcrumb().map((part, idx) => (
            <span key={idx} className="flex items-center">
              {idx > 0 && <ChevronRight className="h-4 w-4 mx-1" />}
              <span className={idx === getBreadcrumb().length - 1 ? "font-medium text-foreground" : ""}>
                {part}
              </span>
            </span>
          ))}
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

      {/* ABC Table */}
      <AbcTable
        items={classifiedItems}
        columns={TABLE_COLUMNS}
        loading={loading}
        emptyMessage={`Nenhum${drillLevel === "uf" ? " estado" : drillLevel === "city" ? "a cidade" : " bairro"} encontrado no período selecionado`}
        onRowClick={drillLevel !== "neighborhood" ? handleDrillDown : undefined}
      />

      {/* Drill hint */}
      {!loading && classifiedItems.length > 0 && drillLevel !== "neighborhood" && (
        <p className="text-sm text-muted-foreground text-center">
          Clique em uma linha para ver {drillLevel === "uf" ? "as cidades" : "os bairros"}
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
    </div>
  );
}
