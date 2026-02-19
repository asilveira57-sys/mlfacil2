import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';
import { AdsDailyMetric, AdsCampaign } from '@/types/ads';
import { PeriodDailyPoint } from '@/hooks/useAdsPeriodMetrics';

interface AdsSpendRevenueChartProps {
  metrics: AdsDailyMetric[];
  campaigns?: AdsCampaign[];
  periodDaily?: PeriodDailyPoint[];
}

export function AdsSpendRevenueChart({ metrics, campaigns, periodDaily }: AdsSpendRevenueChartProps) {
  const timeSeriesData = useMemo(() => {
    // Prefer periodDaily from cache if available
    if (periodDaily && periodDaily.length > 0) {
      return periodDaily.map(d => ({
        date: new Date(d.date + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }),
        gasto: d.spent,
        receita: d.revenue,
      }));
    }
    // Fallback to ads_daily_metrics
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
  }, [metrics, periodDaily]);

  const campaignBarData = useMemo(() => {
    if (!campaigns || campaigns.length === 0) return [];
    return campaigns
      .map(c => {
        const m = c.raw_data?.metrics as Record<string, number> | undefined;
        return {
          name: c.name.length > 20 ? c.name.slice(0, 18) + '…' : c.name,
          gasto: m?.cost || c.spent_total || 0,
          receita: m?.total_amount || 0,
        };
      })
      .filter(d => d.gasto > 0 || d.receita > 0)
      .sort((a, b) => b.gasto - a.gasto)
      .slice(0, 10);
  }, [campaigns]);

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
      notation: 'compact',
    }).format(value);

  const hasTimeSeries = timeSeriesData.length > 0;
  const hasCampaignData = campaignBarData.length > 0;

  if (!hasTimeSeries && !hasCampaignData) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-lg">Gasto vs Receita</CardTitle>
        </CardHeader>
        <CardContent className="h-[300px] flex items-center justify-center text-muted-foreground">
          Dados insuficientes para exibir gráfico
        </CardContent>
      </Card>
    );
  }

  if (hasTimeSeries) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-lg">Gasto vs Receita (Diário)</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={280}>
            <AreaChart data={timeSeriesData}>
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
              <XAxis dataKey="date" tick={{ fontSize: 11 }} className="text-muted-foreground" />
              <YAxis tickFormatter={formatCurrency} tick={{ fontSize: 11 }} className="text-muted-foreground" />
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
              <Area type="monotone" dataKey="gasto" name="Gasto" stroke="hsl(var(--destructive))" fill="url(#gastoGradient)" strokeWidth={2} />
              <Area type="monotone" dataKey="receita" name="Receita" stroke="hsl(var(--primary))" fill="url(#receitaGradient)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    );
  }

  // Fallback: bar chart by campaign
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-lg">Gasto vs Receita (Top Campanhas)</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={campaignBarData} layout="vertical" margin={{ left: 10 }}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
            <XAxis type="number" tickFormatter={formatCurrency} tick={{ fontSize: 11 }} />
            <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={120} />
            <Tooltip
              formatter={(value: number) => formatCurrency(value)}
              contentStyle={{
                backgroundColor: 'hsl(var(--background))',
                border: '1px solid hsl(var(--border))',
                borderRadius: '8px',
              }}
            />
            <Legend />
            <Bar dataKey="gasto" name="Gasto" fill="hsl(var(--destructive))" radius={[0, 4, 4, 0]} />
            <Bar dataKey="receita" name="Receita" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
