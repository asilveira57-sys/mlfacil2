import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import {
  useAdsExecutiveReport,
  PeriodMetrics,
  ProductPerformance,
  CampaignPerformance,
  ReportInsight,
} from '@/hooks/useAdsExecutiveReport';
import {
  TrendingUp,
  TrendingDown,
  Minus,
  ArrowUpRight,
  ArrowDownRight,
  AlertCircle,
  CheckCircle2,
  Info,
  AlertTriangle,
  Calendar,
  DollarSign,
  Target,
  BarChart3,
  FileText,
} from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface AdsExecutiveReportProps {
  sellerId: string;
}

export function AdsExecutiveReport({ sellerId }: AdsExecutiveReportProps) {
  const [periodType, setPeriodType] = useState<'weekly' | 'monthly'>('weekly');
  const { data, loading, error, dateRanges } = useAdsExecutiveReport(sellerId, periodType);

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-12 w-64" />
        <div className="grid grid-cols-2 gap-6">
          <Skeleton className="h-48" />
          <Skeleton className="h-48" />
        </div>
        <Skeleton className="h-64" />
      </div>
    );
  }

  if (error) {
    return (
      <Card className="border-destructive/50">
        <CardContent className="pt-6 text-center">
          <AlertCircle className="h-12 w-12 mx-auto text-destructive mb-4" />
          <p className="text-destructive">{error}</p>
        </CardContent>
      </Card>
    );
  }

  const { currentPeriod, previousPeriod, topProfitable, topLoss, improvedProducts, declinedProducts, campaignPerformance, insights } = data;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <FileText className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h2 className="text-xl font-semibold text-foreground">Relatório Executivo</h2>
            <p className="text-sm text-muted-foreground">
              Visão estratégica de performance publicitária
            </p>
          </div>
        </div>

        <Tabs value={periodType} onValueChange={(v) => setPeriodType(v as 'weekly' | 'monthly')}>
          <TabsList>
            <TabsTrigger value="weekly" className="gap-2">
              <Calendar className="h-4 w-4" />
              Semanal
            </TabsTrigger>
            <TabsTrigger value="monthly" className="gap-2">
              <Calendar className="h-4 w-4" />
              Mensal
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {/* Period Info */}
      {currentPeriod && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Calendar className="h-4 w-4" />
          <span>
            Período: {format(parseISO(dateRanges.current.start), "dd/MM", { locale: ptBR })} a{' '}
            {format(parseISO(dateRanges.current.end), "dd/MM/yyyy", { locale: ptBR })}
          </span>
        </div>
      )}

      {/* Main Metrics Comparison */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {currentPeriod && <PeriodCard period={currentPeriod} isCurrent />}
        {previousPeriod && <PeriodCard period={previousPeriod} />}
      </div>

      {/* Insights Section */}
      {insights.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <Info className="h-5 w-5 text-primary" />
              Insights do Período
            </CardTitle>
            <CardDescription>Análise automática dos seus resultados</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {insights.map((insight, idx) => (
              <InsightCard key={idx} insight={insight} />
            ))}
          </CardContent>
        </Card>
      )}

      {/* Products Performance */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top Profitable */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-success" />
                  Produtos Lucrativos
                </CardTitle>
                <CardDescription>Geraram mais retorno sobre investimento</CardDescription>
              </div>
              <Badge variant="secondary" className="bg-success/10 text-success">
                {topProfitable.length}
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            {topProfitable.length > 0 ? (
              <ScrollArea className="h-64">
                <div className="space-y-3">
                  {topProfitable.map((product) => (
                    <ProductRow key={product.itemId} product={product} />
                  ))}
                </div>
              </ScrollArea>
            ) : (
              <EmptyState message="Nenhum produto lucrativo no período" />
            )}
          </CardContent>
        </Card>

        {/* Top Loss */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base flex items-center gap-2">
                  <TrendingDown className="h-4 w-4 text-destructive" />
                  Produtos com Prejuízo
                </CardTitle>
                <CardDescription>Requerem atenção imediata</CardDescription>
              </div>
              <Badge variant="secondary" className="bg-destructive/10 text-destructive">
                {topLoss.length}
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            {topLoss.length > 0 ? (
              <ScrollArea className="h-64">
                <div className="space-y-3">
                  {topLoss.map((product) => (
                    <ProductRow key={product.itemId} product={product} />
                  ))}
                </div>
              </ScrollArea>
            ) : (
              <EmptyState message="Nenhum produto com prejuízo" />
            )}
          </CardContent>
        </Card>
      </div>

      {/* Trend Analysis */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Improved */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base flex items-center gap-2">
                  <ArrowUpRight className="h-4 w-4 text-success" />
                  Melhoraram Performance
                </CardTitle>
                <CardDescription>Crescimento vs período anterior</CardDescription>
              </div>
              <Badge variant="secondary">{improvedProducts.length}</Badge>
            </div>
          </CardHeader>
          <CardContent>
            {improvedProducts.length > 0 ? (
              <ScrollArea className="h-48">
                <div className="space-y-2">
                  {improvedProducts.map((product) => (
                    <TrendRow key={product.itemId} product={product} />
                  ))}
                </div>
              </ScrollArea>
            ) : (
              <EmptyState message="Sem variação significativa" />
            )}
          </CardContent>
        </Card>

        {/* Declined */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base flex items-center gap-2">
                  <ArrowDownRight className="h-4 w-4 text-destructive" />
                  Pioraram Performance
                </CardTitle>
                <CardDescription>Queda vs período anterior</CardDescription>
              </div>
              <Badge variant="secondary">{declinedProducts.length}</Badge>
            </div>
          </CardHeader>
          <CardContent>
            {declinedProducts.length > 0 ? (
              <ScrollArea className="h-48">
                <div className="space-y-2">
                  {declinedProducts.map((product) => (
                    <TrendRow key={product.itemId} product={product} />
                  ))}
                </div>
              </ScrollArea>
            ) : (
              <EmptyState message="Sem variação significativa" />
            )}
          </CardContent>
        </Card>
      </div>

      {/* Campaign Summary */}
      {campaignPerformance.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-primary" />
              Resumo por Campanha
            </CardTitle>
            <CardDescription>Performance consolidada das campanhas ativas</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-3 font-medium text-muted-foreground">Campanha</th>
                    <th className="text-right py-3 font-medium text-muted-foreground">Gasto</th>
                    <th className="text-right py-3 font-medium text-muted-foreground">Receita</th>
                    <th className="text-right py-3 font-medium text-muted-foreground">Lucro</th>
                    <th className="text-right py-3 font-medium text-muted-foreground">ROAS</th>
                    <th className="text-center py-3 font-medium text-muted-foreground">Tendência</th>
                  </tr>
                </thead>
                <tbody>
                  {campaignPerformance.slice(0, 10).map((campaign) => (
                    <tr key={campaign.campaignId} className="border-b last:border-0">
                      <td className="py-3">
                        <div className="flex items-center gap-2">
                          <span className="font-medium truncate max-w-[200px]">{campaign.name}</span>
                          <Badge
                            variant="outline"
                            className={
                              campaign.status === 'active'
                                ? 'border-success/50 text-success text-[10px]'
                                : 'text-muted-foreground text-[10px]'
                            }
                          >
                            {campaign.status === 'active' ? 'Ativa' : 'Pausada'}
                          </Badge>
                        </div>
                      </td>
                      <td className="text-right py-3">R$ {campaign.spent.toFixed(2)}</td>
                      <td className="text-right py-3">R$ {campaign.revenue.toFixed(2)}</td>
                      <td
                        className={`text-right py-3 font-medium ${
                          campaign.profit > 0 ? 'text-success' : campaign.profit < 0 ? 'text-destructive' : ''
                        }`}
                      >
                        R$ {campaign.profit.toFixed(2)}
                      </td>
                      <td className="text-right py-3">{campaign.roas.toFixed(2)}x</td>
                      <td className="text-center py-3">
                        <TrendBadge trend={campaign.trend} percentChange={campaign.percentChange} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// Sub-components

function PeriodCard({ period, isCurrent = false }: { period: PeriodMetrics; isCurrent?: boolean }) {
  return (
    <Card className={isCurrent ? 'border-primary/50 bg-primary/5' : ''}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">{period.period}</CardTitle>
          {isCurrent && (
            <Badge className="bg-primary text-primary-foreground">Atual</Badge>
          )}
        </div>
        <CardDescription>
          {format(parseISO(period.startDate), "dd/MM", { locale: ptBR })} -{' '}
          {format(parseISO(period.endDate), "dd/MM", { locale: ptBR })}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <MetricItem
            icon={<DollarSign className="h-4 w-4 text-destructive" />}
            label="Gasto Total"
            value={`R$ ${period.totalSpent.toFixed(2)}`}
          />
          <MetricItem
            icon={<DollarSign className="h-4 w-4 text-success" />}
            label="Receita"
            value={`R$ ${period.totalRevenue.toFixed(2)}`}
          />
          <MetricItem
            icon={<Target className="h-4 w-4 text-warning" />}
            label="ACOS Médio"
            value={`${period.avgAcos.toFixed(1)}%`}
          />
          <MetricItem
            icon={<BarChart3 className="h-4 w-4 text-primary" />}
            label="ROAS Médio"
            value={`${period.avgRoas.toFixed(2)}x`}
          />
        </div>

        <Separator />

        <div
          className={`p-3 rounded-lg text-center ${
            period.profit > 0 ? 'bg-success/10' : period.profit < 0 ? 'bg-destructive/10' : 'bg-muted'
          }`}
        >
          <p className="text-xs text-muted-foreground mb-1">Resultado do Período</p>
          <p
            className={`text-xl font-bold ${
              period.profit > 0 ? 'text-success' : period.profit < 0 ? 'text-destructive' : ''
            }`}
          >
            {period.profit >= 0 ? '+' : ''} R$ {period.profit.toFixed(2)}
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            Margem: {period.profitMargin.toFixed(1)}%
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

function MetricItem({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-2">
      {icon}
      <div>
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="font-semibold">{value}</p>
      </div>
    </div>
  );
}

function InsightCard({ insight }: { insight: ReportInsight }) {
  const iconMap = {
    success: <CheckCircle2 className="h-5 w-5 text-success" />,
    warning: <AlertTriangle className="h-5 w-5 text-warning" />,
    info: <Info className="h-5 w-5 text-primary" />,
    critical: <AlertCircle className="h-5 w-5 text-destructive" />,
  };

  const bgMap = {
    success: 'bg-success/5 border-success/20',
    warning: 'bg-warning/5 border-warning/20',
    info: 'bg-primary/5 border-primary/20',
    critical: 'bg-destructive/5 border-destructive/20',
  };

  return (
    <div className={`p-3 rounded-lg border ${bgMap[insight.type]}`}>
      <div className="flex items-start gap-3">
        <div className="shrink-0 mt-0.5">{iconMap[insight.type]}</div>
        <div className="flex-1 min-w-0">
          <p className="font-medium text-sm">{insight.title}</p>
          <p className="text-sm text-muted-foreground mt-0.5">{insight.description}</p>
        </div>
        {insight.value && (
          <Badge variant="outline" className="shrink-0">
            {insight.value}
          </Badge>
        )}
      </div>
    </div>
  );
}

function ProductRow({ product }: { product: ProductPerformance }) {
  return (
    <div className="flex items-center justify-between p-2 rounded-lg bg-muted/50">
      <div className="flex-1 min-w-0 mr-3">
        <p className="font-medium text-sm truncate">{product.title}</p>
        <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
          <span>Gasto: R$ {product.spent.toFixed(2)}</span>
          <span>ROAS: {product.roas.toFixed(2)}x</span>
        </div>
      </div>
      <div className="text-right shrink-0">
        <p
          className={`font-semibold ${
            product.profit > 0 ? 'text-success' : 'text-destructive'
          }`}
        >
          {product.profit >= 0 ? '+' : ''}R$ {product.profit.toFixed(2)}
        </p>
        <TrendBadge trend={product.trend} percentChange={product.percentChange} />
      </div>
    </div>
  );
}

function TrendRow({ product }: { product: ProductPerformance }) {
  return (
    <div className="flex items-center justify-between p-2 rounded-lg hover:bg-muted/50">
      <p className="font-medium text-sm truncate flex-1 mr-3">{product.title}</p>
      <TrendBadge trend={product.trend} percentChange={product.percentChange} showValue />
    </div>
  );
}

function TrendBadge({
  trend,
  percentChange,
  showValue = false,
}: {
  trend: 'improved' | 'declined' | 'stable';
  percentChange: number;
  showValue?: boolean;
}) {
  if (trend === 'improved') {
    return (
      <Badge variant="secondary" className="bg-success/10 text-success text-[10px]">
        <ArrowUpRight className="h-3 w-3 mr-0.5" />
        {showValue ? `+${percentChange.toFixed(0)}%` : 'Subiu'}
      </Badge>
    );
  }
  if (trend === 'declined') {
    return (
      <Badge variant="secondary" className="bg-destructive/10 text-destructive text-[10px]">
        <ArrowDownRight className="h-3 w-3 mr-0.5" />
        {showValue ? `${percentChange.toFixed(0)}%` : 'Caiu'}
      </Badge>
    );
  }
  return (
    <Badge variant="secondary" className="text-muted-foreground text-[10px]">
      <Minus className="h-3 w-3 mr-0.5" />
      Estável
    </Badge>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="h-48 flex items-center justify-center text-muted-foreground text-sm">
      {message}
    </div>
  );
}
