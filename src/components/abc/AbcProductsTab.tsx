import { useState } from "react";
import { AbcFilters, AbcConfig } from "@/pages/AbcAnalysis";
import { AbcTable, AbcItem } from "./AbcTable";
import { AbcSummaryCards, createProductsSummary } from "./AbcSummaryCards";
import { useAbcAnalysis, AbcIndicator } from "@/hooks/useAbcAnalysis";
import { Button } from "@/components/ui/button";
import { Download, Package, TrendingUp, DollarSign } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface AbcProductsTabProps {
  sellerId: string;
  filters: AbcFilters;
  config: AbcConfig;
}

const INDICATOR_OPTIONS: { value: AbcIndicator; label: string; icon: React.ReactNode }[] = [
  { value: "revenue", label: "Faturamento", icon: <DollarSign className="h-4 w-4" /> },
  { value: "units", label: "Unidades vendidas", icon: <Package className="h-4 w-4" /> },
  { value: "orders", label: "Pedidos", icon: <TrendingUp className="h-4 w-4" /> },
];

const TABLE_COLUMNS = [
  { key: "tertiaryValue", label: "Unidades", format: "number" as const, align: "right" as const },
  { key: "secondaryValue", label: "Pedidos", format: "number" as const, align: "right" as const },
  { key: "value", label: "Faturamento", format: "currency" as const, align: "right" as const },
];

export function AbcProductsTab({ sellerId, filters, config }: AbcProductsTabProps) {
  const [indicator, setIndicator] = useState<AbcIndicator>("revenue");

  const { items, loading, error, totals, refetch } = useAbcAnalysis({
    sellerId,
    filters,
    config,
    type: "products",
    indicator,
  });

  const handleExportCSV = () => {
    if (items.length === 0) return;

    const headers = ["Rank", "Produto", "SKU", "Unidades", "Pedidos", "Faturamento", "% Participação", "% Acumulado", "Classe"];
    const rows = items.map(item => [
      item.rank,
      item.name,
      item.subtitle || "",
      item.tertiaryValue || 0,
      item.secondaryValue || 0,
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
    link.download = `curva-abc-produtos-${new Date().toISOString().split("T")[0]}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const summaryCards = createProductsSummary({
    totalProducts: totals.totalItems,
    totalUnits: items.reduce((sum, i) => sum + (i.tertiaryValue || 0), 0),
    totalRevenue: totals.totalValue,
    classACount: totals.classACount,
  });

  // Update columns based on indicator
  const dynamicColumns = TABLE_COLUMNS.map(col => {
    if (col.key === "value") {
      return {
        ...col,
        label: indicator === "revenue" ? "Faturamento" : indicator === "units" ? "Unidades" : "Pedidos",
        format: indicator === "revenue" ? "currency" as const : "number" as const,
      };
    }
    return col;
  });

  return (
    <div className="space-y-6">
      {/* Header with indicator selector and export */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <h2 className="text-lg font-semibold">Curva ABC de Produtos</h2>
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

        <Button variant="outline" onClick={handleExportCSV} disabled={items.length === 0}>
          <Download className="h-4 w-4 mr-2" />
          Exportar CSV
        </Button>
      </div>

      {/* Summary cards */}
      <AbcSummaryCards cards={summaryCards} />

      {/* Error state */}
      {error && (
        <div className="rounded-lg bg-destructive/10 p-4 text-destructive">
          {error}
        </div>
      )}

      {/* ABC Table */}
      <AbcTable
        items={items}
        columns={dynamicColumns}
        loading={loading}
        emptyMessage="Nenhum produto encontrado no período selecionado"
      />

      {/* Class distribution summary */}
      {!loading && items.length > 0 && (
        <div className="flex items-center gap-6 text-sm text-muted-foreground">
          <span>
            <strong className="text-success">{totals.classACount}</strong> produtos classe A
          </span>
          <span>
            <strong className="text-warning">{totals.classBCount}</strong> produtos classe B
          </span>
          <span>
            <strong className="text-destructive">{totals.classCCount}</strong> produtos classe C
          </span>
        </div>
      )}
    </div>
  );
}
