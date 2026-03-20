import { useTranslation } from "react-i18next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, TrendingDown, Minus, BarChart3 } from "lucide-react";
import type { SimulationResult } from "@/lib/pricing-engine";

interface Props {
  result: SimulationResult;
  salePrice: number;
}

export function PricingResultsBlock({ result, salePrice }: Props) {
  const { t } = useTranslation('tools');
  const fmt = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);
  const hasData = salePrice > 0;

  const getMarginBadge = () => {
    if (result.marginPercent >= 20) return { variant: 'default' as const, label: t('pricing.positive_margin'), icon: TrendingUp, color: 'text-emerald-600' };
    if (result.marginPercent >= 10) return { variant: 'secondary' as const, label: t('pricing.warning_margin'), icon: Minus, color: 'text-amber-600' };
    return { variant: 'destructive' as const, label: t('pricing.negative_margin'), icon: TrendingDown, color: 'text-red-600' };
  };

  const badge = getMarginBadge();
  const BadgeIcon = badge.icon;

  const items = [
    { label: t('pricing.result_commission', 'Comissão ML'), value: fmt(result.commissionValue), sub: `${result.commissionPercent}%` },
    { label: t('pricing.result_fixed_cost', 'Custo fixo / venda'), value: fmt(result.fixedCostValue) },
    { label: t('pricing.result_freight', 'Frete estimado'), value: fmt(result.freightValue), sub: result.weightBand },
    { label: t('pricing.result_total_cost'), value: fmt(result.totalCost) },
  ];

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <BarChart3 className="w-4 h-4 text-primary" />
            {t('pricing.block_results', 'Resultado')}
          </CardTitle>
          {hasData && (
            <Badge variant={badge.variant} className="gap-1">
              <BadgeIcon className="w-3 h-3" />
              {badge.label}
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Main KPIs */}
        <div className="grid grid-cols-3 gap-3">
          <div className="p-3 bg-muted/50 rounded-lg text-center">
            <p className="text-xs text-muted-foreground mb-1">{t('pricing.result_profit')}</p>
            <p className={`text-xl font-bold ${result.netProfit >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
              {hasData ? fmt(result.netProfit) : '—'}
            </p>
          </div>
          <div className="p-3 bg-muted/50 rounded-lg text-center">
            <p className="text-xs text-muted-foreground mb-1">{t('pricing.result_margin')}</p>
            <p className={`text-xl font-bold ${badge.color}`}>
              {hasData ? `${result.marginPercent.toFixed(1)}%` : '—'}
            </p>
          </div>
          <div className="p-3 bg-muted/50 rounded-lg text-center">
            <p className="text-xs text-muted-foreground mb-1">{t('pricing.result_net_received', 'Valor líquido')}</p>
            <p className="text-xl font-bold text-foreground">
              {hasData ? fmt(result.netReceived) : '—'}
            </p>
          </div>
        </div>

        {/* Cost breakdown */}
        {hasData && (
          <div className="space-y-2 pt-2 border-t">
            {items.map((item, i) => (
              <div key={i} className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">{item.label}</span>
                <div className="text-right">
                  <span className="font-medium">{item.value}</span>
                  {item.sub && <span className="text-xs text-muted-foreground ml-1">({item.sub})</span>}
                </div>
              </div>
            ))}
            <div className="flex items-center justify-between text-sm pt-2 border-t">
              <span className="text-muted-foreground">{t('pricing.result_breakeven')}</span>
              <span className="font-medium">{fmt(result.breakevenPrice)}</span>
            </div>
          </div>
        )}

        {hasData && result.netProfit < 0 && (
          <div className="p-2.5 bg-destructive/10 border border-destructive/20 rounded-lg">
            <p className="text-xs text-destructive">
              ⚠️ {t('pricing.negative_warning', 'Para lucro zero, o preço mínimo seria')} {fmt(result.breakevenPrice)}.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
