import { DollarSign, TrendingUp, TrendingDown, Target, AlertTriangle, Rocket, MousePointerClick, Percent, ShoppingCart, Leaf, BarChart3, CreditCard } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { AdsMetricsSummary } from '@/types/ads';

interface AdsKpiCardsProps {
  summary: AdsMetricsSummary;
}

export function AdsKpiCards({ summary }: AdsKpiCardsProps) {
  const formatCurrency = (value: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);

  const formatPercent = (value: number) => `${value.toFixed(1)}%`;

  const hasSellerData = summary.total_seller_revenue > 0;

  // Block 1 - Business Overview
  const businessCards = [
    {
      title: 'Faturamento Total',
      value: formatCurrency(summary.total_seller_revenue),
      icon: ShoppingCart,
      color: 'text-primary',
      bg: 'bg-primary/10',
      subtitle: hasSellerData ? `${formatPercent(summary.organic_percent)} orgânico` : undefined,
      badge: hasSellerData ? `${summary.total_seller_orders} pedidos` : undefined,
    },
    {
      title: 'Receita Orgânica',
      value: formatCurrency(summary.organic_revenue),
      icon: Leaf,
      color: 'text-success',
      bg: 'bg-success/10',
      subtitle: hasSellerData ? formatPercent(summary.organic_percent) : 'Sem dados',
    },
    {
      title: 'Receita via ADS',
      value: formatCurrency(summary.total_revenue),
      icon: TrendingUp,
      color: 'text-blue-500',
      bg: 'bg-blue-500/10',
      subtitle: hasSellerData ? formatPercent(summary.paid_percent) : undefined,
    },
    {
      title: 'TACOS Geral',
      value: formatPercent(summary.tacos_total),
      icon: BarChart3,
      color: summary.tacos_total > 10 ? 'text-warning' : 'text-success',
      bg: summary.tacos_total > 10 ? 'bg-warning/10' : 'bg-success/10',
      subtitle: 'Gasto / Fat. Total',
    },
  ];

  // Block 2 - ADS Performance
  const adsCards = [
    {
      title: 'Gasto Total',
      value: formatCurrency(summary.total_spent),
      icon: DollarSign,
      color: 'text-destructive',
      bg: 'bg-destructive/10',
    },
    {
      title: 'ROAS Médio',
      value: `${summary.avg_roas.toFixed(2)}x`,
      icon: Target,
      color: summary.avg_roas >= 3 ? 'text-success' : 'text-warning',
      bg: summary.avg_roas >= 3 ? 'bg-success/10' : 'bg-warning/10',
      subtitle: summary.avg_roas >= 3 ? 'Excelente' : 'Pode melhorar',
    },
    {
      title: 'Custo/Venda Geral',
      value: formatCurrency(summary.cost_per_sale_general),
      icon: CreditCard,
      color: 'text-primary',
      bg: 'bg-primary/10',
      subtitle: 'ADS ÷ Pedidos totais',
    },
    {
      title: 'Custo/Venda ADS',
      value: formatCurrency(summary.cost_per_sale_ads),
      icon: MousePointerClick,
      color: 'text-blue-500',
      bg: 'bg-blue-500/10',
      subtitle: 'ADS ÷ Conversões',
    },
  ];

  // Block 3 - Details
  const detailCards = [
    {
      title: 'CPC Médio',
      value: formatCurrency(summary.avg_cpc),
      icon: MousePointerClick,
      color: 'text-primary',
      bg: 'bg-primary/10',
    },
    {
      title: 'ACOS Médio',
      value: formatPercent(summary.avg_acos),
      icon: summary.avg_acos > 30 ? TrendingDown : Target,
      color: summary.avg_acos > 30 ? 'text-destructive' : 'text-primary',
      bg: summary.avg_acos > 30 ? 'bg-destructive/10' : 'bg-primary/10',
      subtitle: summary.avg_acos > 30 ? 'Alto' : 'Saudável',
    },
    {
      title: 'No Prejuízo',
      value: summary.products_at_loss.toString(),
      icon: AlertTriangle,
      color: 'text-destructive',
      bg: 'bg-destructive/10',
      subtitle: 'ACOS > 30%',
    },
    {
      title: 'Escaláveis',
      value: summary.products_scalable.toString(),
      icon: Rocket,
      color: 'text-success',
      bg: 'bg-success/10',
      subtitle: 'ROAS > 3x',
    },
  ];

  interface KpiCard {
    title: string;
    value: string;
    icon: any;
    color: string;
    bg: string;
    subtitle?: string;
    badge?: string;
  }

  const renderCardBlock = (title: string, cards: KpiCard[]) => (
    <div className="space-y-2">
      <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{title}</h3>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {cards.map((card) => (
          <Card key={card.title} className="border-border/50">
            <CardContent className="p-2.5">
              <div className="flex items-start justify-between">
                <div className="min-w-0">
                  <p className="text-[11px] text-muted-foreground mb-0.5 truncate">{card.title}</p>
                  <p className="text-lg font-bold leading-tight">{card.value}</p>
                  {card.subtitle && (
                    <p className={`text-[10px] mt-0.5 ${card.color}`}>{card.subtitle}</p>
                  )}
                  {card.badge && (
                    <Badge variant="secondary" className="text-[9px] mt-1 h-4 px-1.5">{card.badge}</Badge>
                  )}
                </div>
                <div className={`p-1.5 rounded-lg ${card.bg} shrink-0`}>
                  <card.icon className={`h-3.5 w-3.5 ${card.color}`} />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );

  return (
    <div className="space-y-4">
      {renderCardBlock('Visão do Negócio', businessCards)}
      {renderCardBlock('Performance ADS', adsCards)}
      {renderCardBlock('Detalhes', detailCards)}
    </div>
  );
}
