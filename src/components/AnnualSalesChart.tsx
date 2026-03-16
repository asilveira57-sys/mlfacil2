import { Card } from "@/components/ui/card";
import { BarChart3 } from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  ReferenceLine,
} from "recharts";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface MonthlySale {
  month: string;
  monthLabel: string;
  revenue: number;
  orders: number;
}

interface AnnualSalesChartProps {
  data: MonthlySale[];
  isLoading?: boolean;
  title: string;
  colorScheme?: "primary" | "destructive";
}

const formatCurrency = (value: number) => {
  if (value >= 1000) {
    return `R$ ${(value / 1000).toFixed(0)}k`;
  }
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
};

const formatCurrencyFull = (value: number) => {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
};

// Calculate percentage change between current and previous month
const calcMonthlyChange = (data: MonthlySale[], index: number, field: "revenue" | "orders"): number | null => {
  if (index === 0) return null;
  const current = data[index][field];
  const previous = data[index - 1][field];
  if (previous === 0) return current > 0 ? 100 : null;
  return ((current - previous) / previous) * 100;
};

// Add percentage data to chart
const enrichDataWithPercentage = (data: MonthlySale[], field: "revenue" | "orders") => {
  return data.map((item, index) => ({
    ...item,
    percentChange: calcMonthlyChange(data, index, field),
  }));
};

const CustomTooltip = ({ active, payload, label, field }: any) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    const value = field === "revenue" ? formatCurrencyFull(data[field]) : data[field];
    const percentChange = data.percentChange;
    
    return (
      <div className="bg-card border border-border rounded-lg p-3 shadow-lg">
        <p className="font-medium text-foreground capitalize">{data.monthLabel}</p>
        <p className="text-sm text-muted-foreground">
          {field === "revenue" ? "Receita" : "Pedidos"}: <span className="font-semibold text-foreground">{value}</span>
        </p>
        {percentChange !== null && (
          <p className={`text-sm font-medium ${percentChange >= 0 ? "text-green-600" : "text-red-600"}`}>
            {percentChange >= 0 ? "+" : ""}{percentChange.toFixed(1)}% vs mês anterior
          </p>
        )}
      </div>
    );
  }
  return null;
};

export function AnnualSalesChart({ data, isLoading, title, colorScheme = "primary" }: AnnualSalesChartProps) {
  if (isLoading) {
    return (
      <Card className="p-6">
        <div className="h-[300px] flex items-center justify-center">
          <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
        </div>
      </Card>
    );
  }

  const barColor = colorScheme === "destructive" ? "hsl(var(--destructive))" : "hsl(var(--primary))";

  return (
    <Card className="p-6">
      <Tabs defaultValue="revenue" className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold">{title}</h3>
          <TabsList>
            <TabsTrigger value="revenue">Receita</TabsTrigger>
            <TabsTrigger value="orders">Pedidos</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="revenue" className="h-[280px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={enrichDataWithPercentage(data, "revenue")} margin={{ top: 20, right: 10, left: 10, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" vertical={false} />
              <XAxis 
                dataKey="monthLabel" 
                className="text-xs fill-muted-foreground"
                tick={{ fontSize: 10 }}
                tickFormatter={(value) => value.slice(0, 3)}
              />
              <YAxis 
                tickFormatter={(v) => formatCurrency(v)}
                className="text-xs fill-muted-foreground"
                tick={{ fontSize: 10 }}
                width={60}
              />
              <Tooltip content={<CustomTooltip field="revenue" />} />
              <Bar
                dataKey="revenue"
                fill={barColor}
                radius={[4, 4, 0, 0]}
                label={({ x, y, width, payload }) => {
                  const percentChange = payload?.percentChange;
                  if (percentChange == null || x == null || y == null || width == null) return <text />;
                  const color = percentChange >= 0 ? "#16a34a" : "#dc2626";
                  return (
                    <text
                      x={x + width / 2}
                      y={y - 6}
                      fill={color}
                      textAnchor="middle"
                      fontSize={9}
                      fontWeight={500}
                    >
                      {percentChange >= 0 ? "+" : ""}{percentChange.toFixed(0)}%
                    </text>
                  );
                }}
              />
            </BarChart>
          </ResponsiveContainer>
        </TabsContent>

        <TabsContent value="orders" className="h-[280px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={enrichDataWithPercentage(data, "orders")} margin={{ top: 20, right: 10, left: 10, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" vertical={false} />
              <XAxis 
                dataKey="monthLabel" 
                className="text-xs fill-muted-foreground"
                tick={{ fontSize: 10 }}
                tickFormatter={(value) => value.slice(0, 3)}
              />
              <YAxis 
                className="text-xs fill-muted-foreground"
                tick={{ fontSize: 10 }}
                width={40}
              />
              <Tooltip content={<CustomTooltip field="orders" />} />
              <Bar
                dataKey="orders"
                fill={barColor}
                radius={[4, 4, 0, 0]}
                label={({ x, y, width, payload }) => {
                  const percentChange = payload?.percentChange;
                  if (percentChange == null || x == null || y == null || width == null) return <text />;
                  const color = percentChange >= 0 ? "#16a34a" : "#dc2626";
                  return (
                    <text
                      x={x + width / 2}
                      y={y - 6}
                      fill={color}
                      textAnchor="middle"
                      fontSize={9}
                      fontWeight={500}
                    >
                      {percentChange >= 0 ? "+" : ""}{percentChange.toFixed(0)}%
                    </text>
                  );
                }}
              />
            </BarChart>
          </ResponsiveContainer>
        </TabsContent>
      </Tabs>
    </Card>
  );
}
