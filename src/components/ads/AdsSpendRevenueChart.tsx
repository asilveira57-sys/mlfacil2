import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';
import { AdsDailyMetric } from '@/types/ads';

interface AdsSpendRevenueChartProps {
  metrics: AdsDailyMetric[];
}

export function AdsSpendRevenueChart({ metrics }: AdsSpendRevenueChartProps) {
  const chartData = useMemo(() => {
    // Aggregate by date
    const byDate = new Map<string, { spent: number; revenue: number }>();

    for (const m of metrics) {
      const existing = byDate.get(m.metric_date) || { spent: 0, revenue: 0 };
      byDate.set(m.metric_date, {
        spent: existing.spent + (m.spent || 0),
        revenue: existing.revenue + (m.revenue || 0),
      });
    }

    return Array.from(byDate.entries())
      .map(([date, values]) => ({
        date: new Date(date).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }),
        gasto: values.spent,
        receita: values.revenue,
      }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [metrics]);

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
      notation: 'compact',
    }).format(value);

  if (chartData.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Gasto vs Receita</CardTitle>
        </CardHeader>
        <CardContent className="h-[300px] flex items-center justify-center text-muted-foreground">
          Dados insuficientes para exibir gráfico
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Gasto vs Receita (Diário)</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={300}>
          <AreaChart data={chartData}>
            <defs>
              <linearGradient id="gastoGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="hsl(var(--destructive))" stopOpacity={0.3} />
                <stop offset="95%" stopColor="hsl(var(--destructive))" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="receitaGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
            <XAxis dataKey="date" tick={{ fontSize: 12 }} className="text-muted-foreground" />
            <YAxis tickFormatter={formatCurrency} tick={{ fontSize: 12 }} className="text-muted-foreground" />
            <Tooltip
              formatter={(value: number) => formatCurrency(value)}
              labelFormatter={(label) => `Data: ${label}`}
              contentStyle={{
                backgroundColor: 'hsl(var(--background))',
                border: '1px solid hsl(var(--border))',
                borderRadius: '8px',
              }}
            />
            <Legend />
            <Area
              type="monotone"
              dataKey="gasto"
              name="Gasto"
              stroke="hsl(var(--destructive))"
              fill="url(#gastoGradient)"
              strokeWidth={2}
            />
            <Area
              type="monotone"
              dataKey="receita"
              name="Receita"
              stroke="hsl(var(--primary))"
              fill="url(#receitaGradient)"
              strokeWidth={2}
            />
          </AreaChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
