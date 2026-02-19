import { DollarSign, TrendingUp, TrendingDown, Target, AlertTriangle, Rocket, MousePointerClick, Percent } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { AdsMetricsSummary } from '@/types/ads';

interface AdsKpiCardsProps {
  summary: AdsMetricsSummary;
}

export function AdsKpiCards({ summary }: AdsKpiCardsProps) {
  const formatCurrency = (value: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);

  const formatPercent = (value: number) => `${value.toFixed(1)}%`;

  const cards = [
    {
      title: 'Gasto Total',
      value: formatCurrency(summary.total_spent),
      icon: DollarSign,
      color: 'text-destructive',
      bg: 'bg-destructive/10',
    },
    {
      title: 'Receita via ADS',
      value: formatCurrency(summary.total_revenue),
      icon: TrendingUp,
      color: 'text-success',
      bg: 'bg-success/10',
    },
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
      title: 'ROAS Médio',
      value: `${summary.avg_roas.toFixed(2)}x`,
      icon: Target,
      color: summary.avg_roas >= 3 ? 'text-success' : 'text-warning',
      bg: summary.avg_roas >= 3 ? 'bg-success/10' : 'bg-warning/10',
      subtitle: summary.avg_roas >= 3 ? 'Excelente' : 'Pode melhorar',
    },
    {
      title: 'TACOS Campanha',
      value: formatPercent(summary.avg_tacos),
      icon: Percent,
      color: summary.avg_tacos > 15 ? 'text-warning' : 'text-success',
      bg: summary.avg_tacos > 15 ? 'bg-warning/10' : 'bg-success/10',
      subtitle: 'Gasto / Receita ADS',
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

  return (
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
              </div>
              <div className={`p-1.5 rounded-lg ${card.bg} shrink-0`}>
                <card.icon className={`h-3.5 w-3.5 ${card.color}`} />
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
