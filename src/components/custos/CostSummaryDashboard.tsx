import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import {
  DollarSign, Package, Truck, Store, Box, Receipt,
  TrendingUp, TrendingDown, Calculator, RefreshCw,
  AlertTriangle, ShoppingCart, CreditCard, BarChart3,
} from 'lucide-react';
import type { CostSummaryData } from '@/hooks/useCostDataPolling';

interface CostSummaryDashboardProps {
  summary: CostSummaryData | null;
  loading: boolean;
  onCalculate: () => void;
  isCalculating: boolean;
  dateLabel: string;
}

const formatCurrency = (v: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);

const formatPercent = (v: number, total: number) =>
  total > 0 ? `${((v / total) * 100).toFixed(1)}%` : '0%';

export function CostSummaryDashboard({
  summary,
  loading,
  onCalculate,
  isCalculating,
  dateLabel,
}: CostSummaryDashboardProps) {
  if (loading && !summary) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-28 w-full rounded-xl" />)}
        </div>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-24 w-full rounded-xl" />)}
        </div>
      </div>
    );
  }

  if (!summary?.order_count) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <Calculator className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
          <p className="text-muted-foreground mb-4">
            Nenhum dado encontrado para o período selecionado. Clique em "Recalcular" para processar os pedidos.
          </p>
          <Button onClick={onCalculate} disabled={isCalculating}>
            <RefreshCw className={`h-4 w-4 mr-2 ${isCalculating ? 'animate-spin' : ''}`} />
            Calcular Custos
          </Button>
        </CardContent>
      </Card>
    );
  }

  const s = summary;
  const rev = s.total_revenue || 0;
  const profitPositive = (s.total_profit || 0) >= 0;

  return (
    <div className="space-y-6">
      {/* Section 1: Main KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          icon={<DollarSign className="h-5 w-5 text-primary" />}
          title={`Faturamento Bruto (${dateLabel})`}
          value={formatCurrency(rev)}
          subtitle={`${s.order_count} pedidos processados`}
        />
        <KpiCard
          icon={<TrendingDown className="h-5 w-5 text-destructive" />}
          title="Custo Total"
          value={formatCurrency(s.total_cost || 0)}
          subtitle={formatPercent(s.total_cost || 0, rev) + ' do faturamento'}
          valueClassName="text-destructive"
        />
        <KpiCard
          icon={profitPositive ? <TrendingUp className="h-5 w-5 text-green-500" /> : <TrendingDown className="h-5 w-5 text-destructive" />}
          title="Lucro da Operação"
          value={formatCurrency(s.total_profit || 0)}
          subtitle={`Margem média: ${(s.avg_margin || 0).toFixed(1)}%`}
          valueClassName={profitPositive ? 'text-green-500' : 'text-destructive'}
        />
        <KpiCard
          icon={<BarChart3 className="h-5 w-5 text-primary" />}
          title="Margem Média"
          value={`${(s.avg_margin || 0).toFixed(1)}%`}
          subtitle={
            (s.incomplete_percent || 0) > 0
              ? `${s.incomplete_percent?.toFixed(0)}% pedidos incompletos`
              : 'Todos os pedidos com custo'
          }
          valueClassName={(s.avg_margin || 0) >= 15 ? 'text-green-500' : (s.avg_margin || 0) >= 5 ? 'text-yellow-500' : 'text-destructive'}
        />
      </div>

      {/* Section 2: Cost Breakdown */}
      <div>
        <h3 className="text-sm font-semibold text-muted-foreground mb-3 uppercase tracking-wide">
          Decomposição de Custos
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <CostBreakdownCard
            icon={<Package className="h-4 w-4" />}
            label="Custo de Mercadoria"
            value={s.total_cost_product || 0}
            total={rev}
            color="text-blue-600 dark:text-blue-400"
            bgColor="bg-blue-50 dark:bg-blue-950/40 border-blue-200 dark:border-blue-800"
          />
          <CostBreakdownCard
            icon={<Store className="h-4 w-4" />}
            label="Taxa Marketplace"
            value={s.total_cost_marketplace || 0}
            total={rev}
            color="text-orange-600 dark:text-orange-400"
            bgColor="bg-orange-50 dark:bg-orange-950/40 border-orange-200 dark:border-orange-800"
          />
          <CostBreakdownCard
            icon={<Truck className="h-4 w-4" />}
            label="Custo de Frete"
            value={s.total_cost_shipping || 0}
            total={rev}
            color="text-purple-600 dark:text-purple-400"
            bgColor="bg-purple-50 dark:bg-purple-950/40 border-purple-200 dark:border-purple-800"
          />
          <CostBreakdownCard
            icon={<Box className="h-4 w-4" />}
            label="Embalagem"
            value={s.total_packaging || 0}
            total={rev}
            color="text-teal-600 dark:text-teal-400"
            bgColor="bg-teal-50 dark:bg-teal-950/40 border-teal-200 dark:border-teal-800"
          />
          <CostBreakdownCard
            icon={<Receipt className="h-4 w-4" />}
            label="Impostos"
            value={s.total_tax || 0}
            total={rev}
            color="text-red-600 dark:text-red-400"
            bgColor="bg-red-50 dark:bg-red-950/40 border-red-200 dark:border-red-800"
          />
          <CostBreakdownCard
            icon={<CreditCard className="h-4 w-4" />}
            label="Parcelamento"
            value={s.total_installments || 0}
            total={rev}
            color="text-indigo-600 dark:text-indigo-400"
            bgColor="bg-indigo-50 dark:bg-indigo-950/40 border-indigo-200 dark:border-indigo-800"
          />
        </div>
      </div>

      {/* Section 3: Coverage + Secondary Indicators */}
      <div>
        <h3 className="text-sm font-semibold text-muted-foreground mb-3 uppercase tracking-wide">
          Indicadores
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
          {/* Coverage Card */}
          {(s.orders_imported != null && s.orders_imported > 0) && (
            <SecondaryCard
              label="Cobertura do Cálculo"
              value={`${s.coverage_percent?.toFixed(0) || 0}%`}
              subtitle={`${s.orders_calculated || 0} de ${s.orders_imported} pedidos`}
              className={
                (s.coverage_percent || 0) >= 95
                  ? 'bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-800'
                  : 'border-warning/30 bg-warning/5'
              }
              valueColor={(s.coverage_percent || 0) >= 95 ? 'text-green-600' : 'text-warning'}
              icon={(s.coverage_percent || 0) < 95 ? <AlertTriangle className="h-4 w-4 text-warning" /> : undefined}
            />
          )}
          <SecondaryCard
            label="Classe A"
            value={`${(s.abc_a_percent || 0).toFixed(0)}%`}
            subtitle="80% do lucro"
            className="bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-800"
            valueColor="text-green-600"
          />
          <SecondaryCard
            label="Classe B"
            value={`${(s.abc_b_percent || 0).toFixed(0)}%`}
            subtitle="15% do lucro"
            className="bg-yellow-50 dark:bg-yellow-950/30 border-yellow-200 dark:border-yellow-800"
            valueColor="text-yellow-600"
          />
          <SecondaryCard
            label="Classe C"
            value={`${(s.abc_c_percent || 0).toFixed(0)}%`}
            subtitle="5% do lucro"
            className="bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800"
            valueColor="text-red-600"
          />
          <SecondaryCard
            label="Pedidos sem Custo"
            value={String(s.missing_cost_count || 0)}
            subtitle="necessitam custo definido"
            className={(s.missing_cost_count || 0) > 0 ? 'border-destructive/30 bg-destructive/5' : ''}
            valueColor={(s.missing_cost_count || 0) > 0 ? 'text-destructive' : 'text-green-600'}
            icon={(s.missing_cost_count || 0) > 0 ? <AlertTriangle className="h-4 w-4 text-destructive" /> : undefined}
          />
          <SecondaryCard
            label={`Cancelados (${dateLabel})`}
            value={String(s.cancelled_count || 0)}
            subtitle={`VGV: ${formatCurrency(s.cancelled_vgv || 0)}`}
            className="border-warning/30 bg-warning/5"
            valueColor="text-warning"
            icon={<ShoppingCart className="h-4 w-4 text-warning" />}
          />
        </div>
      </div>
    </div>
  );
}

function KpiCard({ icon, title, value, subtitle, valueClassName }: {
  icon: React.ReactNode;
  title: string;
  value: string;
  subtitle: string;
  valueClassName?: string;
}) {
  return (
    <Card className="relative overflow-hidden">
      <CardContent className="pt-5 pb-4">
        <div className="flex items-center gap-2 mb-2">
          {icon}
          <p className="text-xs font-medium text-muted-foreground truncate">{title}</p>
        </div>
        <p className={`text-2xl font-bold ${valueClassName || ''}`}>{value}</p>
        <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>
      </CardContent>
    </Card>
  );
}

function CostBreakdownCard({ icon, label, value, total, color, bgColor }: {
  icon: React.ReactNode;
  label: string;
  value: number;
  total: number;
  color: string;
  bgColor: string;
}) {
  const pct = total > 0 ? ((value / total) * 100).toFixed(1) : '0.0';
  return (
    <Card className={bgColor}>
      <CardContent className="pt-4 pb-3">
        <div className={`flex items-center gap-1.5 mb-2 ${color}`}>
          {icon}
          <span className="text-xs font-medium truncate">{label}</span>
        </div>
        <p className={`text-lg font-bold ${color}`}>
          {formatCurrency(value)}
        </p>
        <p className="text-xs text-muted-foreground mt-0.5">
          {pct}% do faturamento
        </p>
      </CardContent>
    </Card>
  );
}

function SecondaryCard({ label, value, subtitle, className, valueColor, icon }: {
  label: string;
  value: string;
  subtitle: string;
  className?: string;
  valueColor: string;
  icon?: React.ReactNode;
}) {
  return (
    <Card className={className}>
      <CardContent className="pt-4 pb-3">
        <div className="flex items-center justify-between mb-1">
          <p className="text-xs text-muted-foreground">{label}</p>
          {icon}
        </div>
        <p className={`text-xl font-bold ${valueColor}`}>{value}</p>
        <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>
      </CardContent>
    </Card>
  );
}
