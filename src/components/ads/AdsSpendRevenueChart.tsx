import { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
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

type ChartView = 'spend_revenue' | 'organic_paid';

export function AdsSpendRevenueChart({ metrics, campaigns, periodDaily }: AdsSpendRevenueChartProps) {
  const [view, setView] = useState<ChartView>('spend_revenue');

  const hasSellerData = useMemo(() => {
    if (!periodDaily) return false;
    return periodDaily.some(d => (d.seller_revenue || 0) > 0);
  }, [periodDaily]);

  const timeSeriesData = useMemo(() => {
    if (periodDaily && periodDaily.length > 0) {
      return periodDaily.map(d => ({
        date: new Date(d.date + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }),
        gasto: d.spent,
        receita_ads: d.revenue,
        faturamento: d.seller_revenue || 0,
        organico: d.organic_revenue || 0,
      }));
    }
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
        receita_ads: values.revenue,
        faturamento: 0,
        organico: 0,
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
          <div className="flex items-center justify-between flex-wrap gap-2">
            <CardTitle className="text-lg">
              {view === 'spend_revenue' ? 'Gasto vs Receita (Diário)' : 'Orgânico vs Publicidade'}
            </CardTitle>
            {hasSellerData && (
              <div className="flex gap-1">
                <Button
                  variant={view === 'spend_revenue' ? 'default' : 'outline'}
                  size="sm"
                  className="h-6 text-[10px] px-2"
                  onClick={() => setView('spend_revenue')}
                >
                  Gasto vs Receita
                </Button>
                <Button
                  variant={view === 'organic_paid' ? 'default' : 'outline'}
                  size="sm"
                  className="h-6 text-[10px] px-2"
                  onClick={() => setView('organic_paid')}
                >
                  Orgânico vs Pago
                </Button>
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={280}>
            {view === 'spend_revenue' ? (
              <AreaChart data={timeSeriesData}>
                <defs>
                  <linearGradient id="gastoGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(var(--destructive))" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="hsl(var(--destructive))" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="receitaAdsGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(210 100% 50%)" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="hsl(210 100% 50%)" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="faturamentoGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.15} />
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
                {hasSellerData && (
                  <Area type="monotone" dataKey="faturamento" name="Fat. Total" stroke="hsl(var(--primary))" fill="url(#faturamentoGradient)" strokeWidth={1} strokeDasharray="5 3" />
                )}
                <Area type="monotone" dataKey="gasto" name="Gasto" stroke="hsl(var(--destructive))" fill="url(#gastoGradient)" strokeWidth={2} />
                <Area type="monotone" dataKey="receita_ads" name="Receita ADS" stroke="hsl(210 100% 50%)" fill="url(#receitaAdsGradient)" strokeWidth={2} />
              </AreaChart>
            ) : (
              <AreaChart data={timeSeriesData}>
                <defs>
                  <linearGradient id="organicoGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(var(--success))" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="hsl(var(--success))" stopOpacity={0.05} />
                  </linearGradient>
                  <linearGradient id="pagoGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(210 100% 50%)" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="hsl(210 100% 50%)" stopOpacity={0.05} />
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
                <Area type="monotone" dataKey="organico" name="Orgânico" stackId="revenue" stroke="hsl(var(--success))" fill="url(#organicoGradient)" strokeWidth={2} />
                <Area type="monotone" dataKey="receita_ads" name="Publicidade" stackId="revenue" stroke="hsl(210 100% 50%)" fill="url(#pagoGradient)" strokeWidth={2} />
                <Area type="monotone" dataKey="gasto" name="Gasto ADS" stroke="hsl(var(--destructive))" fill="none" strokeWidth={2} strokeDasharray="5 3" />
              </AreaChart>
            )}
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
