import { useTranslation } from "react-i18next";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Sprout, Package, TrendingUp, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";

interface SeedBalanceCardProps {
  availableSeeds: number;
  totalSeeds: number;
  usedSeeds: number;
  plantedCount: number;
  planTier: string;
  onBuySeeds?: () => void;
}

export function SeedBalanceCard({
  availableSeeds,
  totalSeeds,
  usedSeeds,
  plantedCount,
  planTier,
  onBuySeeds,
}: SeedBalanceCardProps) {
  const { t } = useTranslation('seed');
  const usagePercent = totalSeeds > 0 ? (usedSeeds / totalSeeds) * 100 : 0;
  const isLow = availableSeeds <= 2;
  const isEmpty = availableSeeds === 0;

  return (
    <Card className={cn(
      "transition-all",
      isEmpty && "border-destructive/50 bg-destructive/5",
      isLow && !isEmpty && "border-warning/50 bg-warning/5",
    )}>
      <CardContent className="p-6">
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className={cn(
              "w-12 h-12 rounded-xl flex items-center justify-center",
              isEmpty ? "bg-destructive/10" : "bg-success/10"
            )}>
              <Sprout className={cn(
                "h-6 w-6",
                isEmpty ? "text-destructive" : "text-success"
              )} />
            </div>
            <div>
              <h3 className="font-semibold text-foreground">{t('seeds.title')}</h3>
              <div className="text-sm text-muted-foreground flex items-center gap-1">
                <span>{t('seeds.plan')}:</span>
                <Badge variant="secondary">{planTier}</Badge>
              </div>
            </div>
          </div>
          
          {onBuySeeds && (
            <button
              onClick={onBuySeeds}
              className="text-sm text-primary hover:underline font-medium"
            >
              {t('seeds.buy_more')}
            </button>
          )}
        </div>

        {/* Seeds count */}
        <div className="grid grid-cols-3 gap-4 mb-4">
          <div className="text-center p-3 rounded-lg bg-muted/50">
            <p className={cn(
              "text-2xl font-bold",
              isEmpty ? "text-destructive" : isLow ? "text-warning" : "text-success"
            )}>
              {availableSeeds}
            </p>
            <p className="text-xs text-muted-foreground">{t('seeds.available')}</p>
          </div>
          <div className="text-center p-3 rounded-lg bg-muted/50">
            <p className="text-2xl font-bold text-foreground">{usedSeeds}</p>
            <p className="text-xs text-muted-foreground">{t('seeds.in_use')}</p>
          </div>
          <div className="text-center p-3 rounded-lg bg-muted/50">
            <p className="text-2xl font-bold text-foreground">{totalSeeds}</p>
            <p className="text-xs text-muted-foreground">{t('seeds.total')}</p>
          </div>
        </div>

        {/* Usage bar */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">{t('seeds.usage')}</span>
            <span className="font-medium">{usagePercent.toFixed(0)}%</span>
          </div>
          <div className="h-2 bg-muted rounded-full overflow-hidden">
            <div 
              className={cn(
                "h-full transition-all rounded-full",
                usagePercent < 70 ? "bg-success" : usagePercent < 90 ? "bg-warning" : "bg-destructive"
              )}
              style={{ width: `${Math.min(usagePercent, 100)}%` }}
            />
          </div>
        </div>

        {/* Warning messages */}
        {isEmpty && (
          <div className="mt-4 p-3 rounded-lg bg-destructive/10 border border-destructive/20 flex items-center gap-2">
            <AlertCircle className="h-4 w-4 text-destructive flex-shrink-0" />
            <p className="text-sm text-destructive">
              {t('seeds.empty_warning')}
            </p>
          </div>
        )}

        {isLow && !isEmpty && (
          <div className="mt-4 p-3 rounded-lg bg-warning/10 border border-warning/20 flex items-center gap-2">
            <AlertCircle className="h-4 w-4 text-warning flex-shrink-0" />
            <p className="text-sm text-warning">
              {t('seeds.low_warning')}
            </p>
          </div>
        )}

        {/* Stats */}
        <div className="mt-4 pt-4 border-t flex items-center justify-between text-sm">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Package className="h-4 w-4" />
            <span>{t('seeds.cultivating', { count: plantedCount })}</span>
          </div>
          <div className="flex items-center gap-2 text-muted-foreground">
            <TrendingUp className="h-4 w-4" />
            <span>{t('seeds.limit')}</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
