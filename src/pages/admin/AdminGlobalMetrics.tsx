import { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import {
  RefreshCw,
  Download,
  Users,
  ShoppingCart,
  DollarSign,
  Tag,
  Megaphone,
  BarChart3,
  Package,
  Calculator,
  FileText,
  TrendingUp,
  Globe,
  Eye,
  EyeOff,
} from 'lucide-react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  AreaChart,
  Area,
} from 'recharts';

// Animated counter component
function AnimatedCounter({ value, prefix = '', suffix = '', decimals = 0 }: { 
  value: number; prefix?: string; suffix?: string; decimals?: number 
}) {
  const [displayValue, setDisplayValue] = useState(0);
  const ref = useRef<number>(0);

  useEffect(() => {
    const duration = 1500;
    const startTime = Date.now();
    const startValue = ref.current;

    const animate = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3); // easeOutCubic
      const current = startValue + (value - startValue) * eased;
      setDisplayValue(current);
      ref.current = current;
      if (progress < 1) requestAnimationFrame(animate);
    };

    requestAnimationFrame(animate);
  }, [value]);

  const formatted = decimals > 0 
    ? displayValue.toFixed(decimals)
    : Math.round(displayValue).toLocaleString('pt-BR');

  return <span>{prefix}{formatted}{suffix}</span>;
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
}

export function AdminGlobalMetrics() {
  const queryClient = useQueryClient();

  // Fetch aggregated metrics
  const { data: metrics, isLoading } = useQuery({
    queryKey: ['admin', 'global-metrics'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('global_metrics_aggregated')
        .select('*')
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  // Fetch monthly snapshots
  const { data: snapshots } = useQuery({
    queryKey: ['admin', 'global-metrics-monthly'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('global_metrics_monthly_snapshot')
        .select('*')
        .order('ano', { ascending: true })
        .order('mes', { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  // Refresh mutation
  const refreshMutation = useMutation({
    mutationFn: async (mode: string) => {
      const { data, error } = await supabase.functions.invoke('global-metrics-refresh', {
        body: { mode, requested_by: 'admin_ui' },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (_, mode) => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'global-metrics'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'global-metrics-monthly'] });
      toast.success(`Métricas atualizadas (${mode})`);
    },
    onError: (err: any) => {
      toast.error(`Erro ao atualizar: ${err.message}`);
    },
  });

  // Toggle public ready
  const togglePublic = useMutation({
    mutationFn: async () => {
      if (!metrics?.id) return;
      const { error } = await supabase
        .from('global_metrics_aggregated')
        .update({ is_public_ready: !metrics.is_public_ready })
        .eq('id', metrics.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'global-metrics'] });
      toast.success('Visibilidade pública atualizada');
    },
  });

  // Export CSV
  const exportCsv = () => {
    if (!snapshots?.length) return;
    const headers = ['Ano', 'Mês', 'Pedidos', 'Valor Vendido', 'ADS Spend', 'ADS Faturamento', 'Etiquetas', 'Anúncios', 'Sellers'];
    const rows = snapshots.map(s => [s.ano, s.mes, s.total_pedidos, s.total_valor_vendido, s.total_ads_spend, s.total_ads_faturamento, s.total_etiquetas, s.total_anuncios, s.total_sellers].join(','));
    const csv = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `global_metrics_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Chart data
  const chartData = (snapshots ?? []).map(s => ({
    label: `${String(s.mes).padStart(2, '0')}/${s.ano}`,
    pedidos: s.total_pedidos,
    faturamento: Number(s.total_valor_vendido),
    ads_spend: Number(s.total_ads_spend),
    etiquetas: s.total_etiquetas,
    sellers: s.total_sellers,
  }));

  const statCards = metrics ? [
    { label: 'Sellers Ativos', value: metrics.total_sellers, icon: Users, color: 'text-blue-500' },
    { label: 'Pedidos Processados', value: Number(metrics.total_pedidos), icon: ShoppingCart, color: 'text-green-500' },
    { label: 'Valor Transacionado', value: Number(metrics.total_valor_vendido), icon: DollarSign, color: 'text-emerald-500', currency: true },
    { label: 'Etiquetas Impressas', value: Number(metrics.total_etiquetas_impressas), icon: Tag, color: 'text-purple-500' },
    { label: 'Investido em ADS', value: Number(metrics.total_ads_spend), icon: Megaphone, color: 'text-orange-500', currency: true },
    { label: 'Faturado via ADS', value: Number(metrics.total_ads_faturamento), icon: BarChart3, color: 'text-cyan-500', currency: true },
    { label: 'ROAS Médio', value: Number(metrics.roas_medio_global), icon: TrendingUp, color: 'text-indigo-500', decimals: 2, suffix: 'x' },
    { label: 'ACOS Médio', value: Number(metrics.acos_medio_global), icon: TrendingUp, color: 'text-red-500', decimals: 2, suffix: '%' },
    { label: 'Anúncios Ativos', value: Number(metrics.total_anuncios_ativos), icon: Globe, color: 'text-teal-500' },
    { label: 'Produtos Cadastrados', value: Number(metrics.total_produtos_cadastrados), icon: Package, color: 'text-yellow-500' },
    { label: 'Precificações Realizadas', value: Number(metrics.total_precificacoes_realizadas), icon: Calculator, color: 'text-pink-500' },
    { label: 'Logs do Sistema', value: Number(metrics.total_logs_sistema), icon: FileText, color: 'text-gray-500' },
  ] : [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Contador Global da Plataforma</h1>
          <p className="text-sm text-muted-foreground">
            {metrics?.updated_at
              ? `Atualizado: ${new Date(metrics.updated_at).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}`
              : 'Sem dados ainda'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => togglePublic.mutate()}
            disabled={!metrics || togglePublic.isPending}
          >
            {metrics?.is_public_ready ? <EyeOff className="h-4 w-4 mr-1" /> : <Eye className="h-4 w-4 mr-1" />}
            {metrics?.is_public_ready ? 'Ocultar Público' : 'Liberar Público'}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => refreshMutation.mutate('incremental')}
            disabled={refreshMutation.isPending}
          >
            <RefreshCw className={`h-4 w-4 mr-1 ${refreshMutation.isPending ? 'animate-spin' : ''}`} />
            Incremental
          </Button>
          <Button
            size="sm"
            onClick={() => refreshMutation.mutate('full')}
            disabled={refreshMutation.isPending}
          >
            <RefreshCw className={`h-4 w-4 mr-1 ${refreshMutation.isPending ? 'animate-spin' : ''}`} />
            Completo
          </Button>
        </div>
      </div>

      {metrics?.is_public_ready && (
        <Badge variant="secondary" className="bg-green-100 text-green-800">
          ✓ Métricas públicas ativadas
        </Badge>
      )}

      {/* Bloco 1: Números Gigantes */}
      <div className="grid gap-4 grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
        {isLoading
          ? Array.from({ length: 12 }).map((_, i) => (
              <Card key={i}>
                <CardContent className="p-6">
                  <Skeleton className="h-6 w-24 mb-2" />
                  <Skeleton className="h-10 w-32" />
                </CardContent>
              </Card>
            ))
          : statCards.map((stat) => (
              <Card key={stat.label} className="relative overflow-hidden">
                <CardContent className="p-6">
                  <div className="flex items-center gap-2 mb-2">
                    <stat.icon className={`h-5 w-5 ${stat.color}`} />
                    <span className="text-sm font-medium text-muted-foreground">{stat.label}</span>
                  </div>
                  <div className="text-3xl font-bold tracking-tight">
                    {stat.currency ? (
                      <AnimatedCounter value={stat.value} prefix="R$ " decimals={0} />
                    ) : (
                      <AnimatedCounter value={stat.value} decimals={stat.decimals} suffix={stat.suffix} />
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
      </div>

      {/* Bloco 2: Evolução Mensal */}
      {chartData.length > 0 && (
        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Pedidos & Faturamento</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={280}>
                <AreaChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="label" fontSize={12} />
                  <YAxis fontSize={12} />
                  <Tooltip formatter={(v: number, name: string) => 
                    name === 'faturamento' ? formatCurrency(v) : v.toLocaleString('pt-BR')
                  } />
                  <Area type="monotone" dataKey="pedidos" stroke="hsl(var(--primary))" fill="hsl(var(--primary) / 0.2)" name="Pedidos" />
                  <Area type="monotone" dataKey="faturamento" stroke="hsl(var(--chart-2))" fill="hsl(var(--chart-2) / 0.2)" name="Faturamento" />
                </AreaChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">ADS & Etiquetas</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={280}>
                <AreaChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="label" fontSize={12} />
                  <YAxis fontSize={12} />
                  <Tooltip formatter={(v: number, name: string) => 
                    name.includes('ADS') ? formatCurrency(v) : v.toLocaleString('pt-BR')
                  } />
                  <Area type="monotone" dataKey="ads_spend" stroke="hsl(var(--chart-3))" fill="hsl(var(--chart-3) / 0.2)" name="ADS Spend" />
                  <Area type="monotone" dataKey="etiquetas" stroke="hsl(var(--chart-4))" fill="hsl(var(--chart-4) / 0.2)" name="Etiquetas" />
                </AreaChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Bloco 3: Crescimento Sellers */}
      {chartData.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Users className="h-5 w-5" />
              Crescimento de Sellers Ativos
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="label" fontSize={12} />
                <YAxis fontSize={12} />
                <Tooltip />
                <Line type="monotone" dataKey="sellers" stroke="hsl(var(--primary))" strokeWidth={2} dot={{ r: 4 }} name="Sellers" />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Bloco 4: Export */}
      <Card>
        <CardContent className="p-4 flex items-center justify-between">
          <div>
            <p className="font-medium">Exportar Histórico</p>
            <p className="text-sm text-muted-foreground">
              {snapshots?.length ?? 0} meses de dados disponíveis
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={exportCsv} disabled={!snapshots?.length}>
              <Download className="h-4 w-4 mr-1" />
              Exportar CSV
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => refreshMutation.mutate('snapshot')}
              disabled={refreshMutation.isPending}
            >
              Gerar Snapshot Mensal
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
