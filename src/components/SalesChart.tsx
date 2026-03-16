import { Card } from "@/components/ui/card";
import { useTranslation } from "react-i18next";
import { TrendingUp } from "lucide-react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
} from "recharts";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useMemo } from "react";

interface DailySale {
  date: string;
  revenue: number;
  orders: number;
}

interface SalesChartProps {
  data: DailySale[];
  isLoading?: boolean;
}

export function SalesChart({ data, isLoading }: SalesChartProps) {
  const { t, i18n } = useTranslation('sales');

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

  const formatDate = useMemo(() => {
    const locale = i18n.language === 'en' ? 'en-US' : i18n.language === 'es' ? 'es-ES' : 'pt-BR';
    return (dateStr: string) => {
      const date = new Date(dateStr + 'T00:00:00');
      return date.toLocaleDateString(locale, { day: "2-digit", month: "short" });
    };
  }, [i18n.language]);

  if (isLoading) {
    return (
      <Card className="p-6">
        <div className="h-[350px] flex items-center justify-center">
          <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
        </div>
      </Card>
    );
  }

  if (!data.length) {
    return (
      <Card className="p-6">
        <h3 className="text-lg font-semibold mb-4">{t('charts.daily_title')}</h3>
        <div className="h-[300px] flex flex-col items-center justify-center text-muted-foreground">
          <TrendingUp className="w-12 h-12 mb-3 opacity-30" />
          <p className="text-sm">Nenhum dado encontrado ainda.</p>
          <p className="text-xs mt-1 text-muted-foreground/70">Será preenchido automaticamente com a atividade da conta.</p>
        </div>
      </Card>
    );
  }

  const chartData = data.map((item) => ({
    ...item,
    dateFormatted: formatDate(item.date),
  }));

  return (
    <Card className="p-6">
      <Tabs defaultValue="revenue" className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold">{t('charts.daily_title')}</h3>
          <TabsList>
            <TabsTrigger value="revenue">{t('charts.revenue')}</TabsTrigger>
            <TabsTrigger value="orders">{t('charts.orders')}</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="revenue" className="h-[300px]">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData}>
              <defs>
                <linearGradient id="revenueGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis 
                dataKey="dateFormatted" 
                className="text-xs fill-muted-foreground"
                tick={{ fontSize: 11 }}
              />
              <YAxis 
                tickFormatter={(v) => formatCurrency(v)}
                className="text-xs fill-muted-foreground"
                tick={{ fontSize: 11 }}
                width={80}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "hsl(var(--card))",
                  borderColor: "hsl(var(--border))",
                  borderRadius: "8px",
                }}
                formatter={(value: number) => [formatCurrency(value), t('charts.revenue')]}
                labelFormatter={(label) => `${label}`}
              />
              <Area
                type="monotone"
                dataKey="revenue"
                stroke="hsl(var(--primary))"
                strokeWidth={2}
                fill="url(#revenueGradient)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </TabsContent>

        <TabsContent value="orders" className="h-[300px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis 
                dataKey="dateFormatted" 
                className="text-xs fill-muted-foreground"
                tick={{ fontSize: 11 }}
              />
              <YAxis 
                className="text-xs fill-muted-foreground"
                tick={{ fontSize: 11 }}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "hsl(var(--card))",
                  borderColor: "hsl(var(--border))",
                  borderRadius: "8px",
                }}
                formatter={(value: number) => [value, t('charts.orders')]}
                labelFormatter={(label) => `${label}`}
              />
              <Bar
                dataKey="orders"
                fill="hsl(var(--primary))"
                radius={[4, 4, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        </TabsContent>
      </Tabs>
    </Card>
  );
}
