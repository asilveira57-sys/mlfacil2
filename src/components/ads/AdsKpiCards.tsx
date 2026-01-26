import { DollarSign, TrendingUp, TrendingDown, Target, AlertTriangle, Rocket } from 'lucide-react';
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
      color: 'text-orange-500',
      bg: 'bg-orange-500/10',
    },
    {
      title: 'Receita via ADS',
      value: formatCurrency(summary.total_revenue),
      icon: TrendingUp,
      color: 'text-green-500',
      bg: 'bg-green-500/10',
    },
    {
      title: 'ACOS Médio',
      value: formatPercent(summary.avg_acos),
      icon: summary.avg_acos > 30 ? TrendingDown : Target,
      color: summary.avg_acos > 30 ? 'text-red-500' : 'text-blue-500',
      bg: summary.avg_acos > 30 ? 'bg-red-500/10' : 'bg-blue-500/10',
      subtitle: summary.avg_acos > 30 ? 'Alto' : 'Saudável',
    },
    {
      title: 'ROAS Médio',
      value: `${summary.avg_roas.toFixed(2)}x`,
      icon: Target,
      color: summary.avg_roas >= 3 ? 'text-green-500' : 'text-yellow-500',
      bg: summary.avg_roas >= 3 ? 'bg-green-500/10' : 'bg-yellow-500/10',
      subtitle: summary.avg_roas >= 3 ? 'Excelente' : 'Pode melhorar',
    },
    {
      title: 'No Prejuízo',
      value: summary.products_at_loss.toString(),
      icon: AlertTriangle,
      color: 'text-red-500',
      bg: 'bg-red-500/10',
      subtitle: 'ACOS > 30%',
    },
    {
      title: 'Escaláveis',
      value: summary.products_scalable.toString(),
      icon: Rocket,
      color: 'text-emerald-500',
      bg: 'bg-emerald-500/10',
      subtitle: 'ROAS > 3x',
    },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
      {cards.map((card) => (
        <Card key={card.title} className="border-border/50">
          <CardContent className="p-4">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs text-muted-foreground mb-1">{card.title}</p>
                <p className="text-xl font-bold">{card.value}</p>
                {card.subtitle && (
                  <p className={`text-xs mt-1 ${card.color}`}>{card.subtitle}</p>
                )}
              </div>
              <div className={`p-2 rounded-lg ${card.bg}`}>
                <card.icon className={`h-4 w-4 ${card.color}`} />
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
