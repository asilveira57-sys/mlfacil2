import { useMemo } from "react";
import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  ReferenceLine,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart3 } from "lucide-react";

interface AbcItem {
  id: string;
  name: string;
  value: number;
  percentage: number;
  cumulative: number;
  rank: number;
  classification: "A" | "B" | "C";
  orders?: number;
  units?: number;
  revenue?: number;
}

interface AbcParetoChartProps {
  items: AbcItem[];
  indicator: "revenue" | "units" | "orders";
  thresholdA: number;
  thresholdB: number;
  maxItems?: number;
}

const CLASS_COLORS = {
  A: "hsl(var(--chart-1))",
  B: "hsl(var(--chart-2))",
  C: "hsl(var(--chart-3))",
};

const INDICATOR_LABELS = {
  revenue: "Valor (R$)",
  units: "Unidades",
  orders: "Pedidos",
};

export function AbcParetoChart({
  items,
  indicator,
  thresholdA,
  thresholdB,
  maxItems = 20,
}: AbcParetoChartProps) {
  const chartData = useMemo(() => {
    return items.slice(0, maxItems).map((item, index) => ({
      name: item.name.length > 15 ? item.name.slice(0, 15) + "..." : item.name,
      fullName: item.name,
      value: item.value,
      accumulated: item.cumulative,
      classification: item.classification,
      rank: item.rank,
    }));
  }, [items, maxItems]);

  const formatValue = (value: number) => {
    if (indicator === "revenue") {
      if (value >= 1000) {
        return `R$ ${(value / 1000).toFixed(1)}k`;
      }
      return `R$ ${value.toFixed(0)}`;
    }
    return value.toLocaleString("pt-BR");
  };

  const formatTooltipValue = (value: number) => {
    if (indicator === "revenue") {
      return value.toLocaleString("pt-BR", {
        style: "currency",
        currency: "BRL",
      });
    }
    return value.toLocaleString("pt-BR");
  };

  if (items.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <BarChart3 className="h-4 w-4" />
            Curva de Pareto
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-[300px] flex items-center justify-center text-muted-foreground">
            Nenhum dado disponível
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <BarChart3 className="h-4 w-4" />
          Curva de Pareto - {INDICATOR_LABELS[indicator]}
          <span className="text-xs font-normal text-muted-foreground ml-auto">
            Top {Math.min(maxItems, items.length)} de {items.length}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-[300px]">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart
              data={chartData}
              margin={{ top: 20, right: 30, left: 20, bottom: 60 }}
            >
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis
                dataKey="name"
                tick={{ fontSize: 10 }}
                angle={-45}
                textAnchor="end"
                height={60}
                interval={0}
                className="fill-muted-foreground"
              />
              <YAxis
                yAxisId="left"
                orientation="left"
                tickFormatter={formatValue}
                tick={{ fontSize: 10 }}
                className="fill-muted-foreground"
              />
              <YAxis
                yAxisId="right"
                orientation="right"
                domain={[0, 100]}
                tickFormatter={(v) => `${v}%`}
                tick={{ fontSize: 10 }}
                className="fill-muted-foreground"
              />
              <Tooltip
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const data = payload[0].payload;
                  return (
                    <div className="bg-popover border border-border rounded-lg shadow-lg p-3 text-sm">
                      <p className="font-medium text-foreground mb-1">
                        #{data.rank} - {data.fullName}
                      </p>
                      <p className="text-muted-foreground">
                        {INDICATOR_LABELS[indicator]}:{" "}
                        <span className="font-medium text-foreground">
                          {formatTooltipValue(data.value)}
                        </span>
                      </p>
                      <p className="text-muted-foreground">
                        Acumulado:{" "}
                        <span className="font-medium text-foreground">
                          {data.accumulated.toFixed(1)}%
                        </span>
                      </p>
                      <p className="text-muted-foreground">
                        Classe:{" "}
                        <span
                          className="font-medium"
                          style={{ color: CLASS_COLORS[data.classification as keyof typeof CLASS_COLORS] }}
                        >
                          {data.classification}
                        </span>
                      </p>
                    </div>
                  );
                }}
              />
              
              {/* Reference lines for A/B thresholds */}
              <ReferenceLine
                yAxisId="right"
                y={thresholdA}
                stroke="hsl(var(--chart-1))"
                strokeDasharray="5 5"
                strokeWidth={1.5}
              />
              <ReferenceLine
                yAxisId="right"
                y={thresholdA + thresholdB}
                stroke="hsl(var(--chart-2))"
                strokeDasharray="5 5"
                strokeWidth={1.5}
              />

              <Bar
                yAxisId="left"
                dataKey="value"
                radius={[4, 4, 0, 0]}
                maxBarSize={40}
              >
                {chartData.map((entry, index) => (
                  <Cell
                    key={`cell-${index}`}
                    fill={CLASS_COLORS[entry.classification as keyof typeof CLASS_COLORS]}
                    fillOpacity={0.8}
                  />
                ))}
              </Bar>

              <Line
                yAxisId="right"
                type="monotone"
                dataKey="accumulated"
                stroke="hsl(var(--primary))"
                strokeWidth={2}
                dot={{ fill: "hsl(var(--primary))", r: 3 }}
                activeDot={{ r: 5 }}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>

        {/* Legend */}
        <div className="flex items-center justify-center gap-6 mt-4 text-xs">
          <div className="flex items-center gap-2">
            <div
              className="w-3 h-3 rounded"
              style={{ backgroundColor: CLASS_COLORS.A }}
            />
            <span className="text-muted-foreground">Classe A ({thresholdA}%)</span>
          </div>
          <div className="flex items-center gap-2">
            <div
              className="w-3 h-3 rounded"
              style={{ backgroundColor: CLASS_COLORS.B }}
            />
            <span className="text-muted-foreground">Classe B ({thresholdB}%)</span>
          </div>
          <div className="flex items-center gap-2">
            <div
              className="w-3 h-3 rounded"
              style={{ backgroundColor: CLASS_COLORS.C }}
            />
            <span className="text-muted-foreground">Classe C ({100 - thresholdA - thresholdB}%)</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-6 h-0.5 bg-primary rounded" />
            <span className="text-muted-foreground">% Acumulado</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
