import { useTranslation } from "react-i18next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, TrendingDown, Minus, DollarSign, Percent, Target, Receipt } from "lucide-react";

interface PricingResults {
  profit: number;
  margin: number;
  totalCost: number;
  fees: number;
  breakeven: number;
}

interface PricingResultDisplayProps {
  results: PricingResults;
  salePrice: number;
}

export function PricingResultDisplay({ results, salePrice }: PricingResultDisplayProps) {
  const { t } = useTranslation('tools');

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(value);
  };

  const formatPercent = (value: number) => {
    return `${value.toFixed(1)}%`;
  };

  const getMarginStatus = () => {
    if (results.margin >= 20) return { variant: 'default' as const, label: t('pricing.positive_margin'), icon: TrendingUp };
    if (results.margin >= 10) return { variant: 'secondary' as const, label: t('pricing.warning_margin'), icon: Minus };
    return { variant: 'destructive' as const, label: t('pricing.negative_margin'), icon: TrendingDown };
  };

  const marginStatus = getMarginStatus();
  const MarginIcon = marginStatus.icon;

  const hasValidPrice = salePrice > 0;

  return (
    <Card>
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-lg">
            <DollarSign className="w-5 h-5" />
            Resultados
          </CardTitle>
          {hasValidPrice && (
            <Badge variant={marginStatus.variant} className="gap-1">
              <MarginIcon className="w-3 h-3" />
              {marginStatus.label}
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-4">
          <div className="p-4 bg-muted/50 rounded-lg">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <DollarSign className="w-4 h-4" />
              <span className="text-sm">{t('pricing.result_profit')}</span>
            </div>
            <p className={`text-2xl font-bold ${results.profit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              {hasValidPrice ? formatCurrency(results.profit) : '—'}
            </p>
          </div>

          <div className="p-4 bg-muted/50 rounded-lg">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <Percent className="w-4 h-4" />
              <span className="text-sm">{t('pricing.result_margin')}</span>
            </div>
            <p className={`text-2xl font-bold ${results.margin >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              {hasValidPrice ? formatPercent(results.margin) : '—'}
            </p>
          </div>

          <div className="p-4 bg-muted/50 rounded-lg">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <Receipt className="w-4 h-4" />
              <span className="text-sm">{t('pricing.result_total_cost')}</span>
            </div>
            <p className="text-xl font-semibold text-foreground">
              {hasValidPrice ? formatCurrency(results.totalCost) : '—'}
            </p>
          </div>

          <div className="p-4 bg-muted/50 rounded-lg">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <Target className="w-4 h-4" />
              <span className="text-sm">{t('pricing.result_fees')}</span>
            </div>
            <p className="text-xl font-semibold text-foreground">
              {hasValidPrice ? formatCurrency(results.fees) : '—'}
            </p>
          </div>
        </div>

        {hasValidPrice && results.margin < 0 && (
          <div className="mt-4 p-3 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 rounded-lg">
            <p className="text-sm text-red-700 dark:text-red-400">
              ⚠️ Para ter lucro zero, o preço mínimo de venda seria {formatCurrency(results.breakeven)}.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
