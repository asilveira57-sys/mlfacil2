import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Sprout, Package, TrendingUp, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";

interface SendSeedBalanceCardProps {
  availableSeeds: number;
  totalSeeds: number;
  usedSeeds: number;
  plantedCount: number;
  planTier: string;
  onBuySeeds?: () => void;
}

export function SendSeedBalanceCard({
  availableSeeds,
  totalSeeds,
  usedSeeds,
  plantedCount,
  planTier,
  onBuySeeds,
}: SendSeedBalanceCardProps) {
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
              <h3 className="font-semibold text-foreground">Suas Sementes</h3>
              <p className="text-sm text-muted-foreground">
                Plano: <Badge variant="secondary" className="ml-1">{planTier}</Badge>
              </p>
            </div>
          </div>
          
          {onBuySeeds && (
            <button
              onClick={onBuySeeds}
              className="text-sm text-primary hover:underline font-medium"
            >
              Comprar mais
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
            <p className="text-xs text-muted-foreground">Disponíveis</p>
          </div>
          <div className="text-center p-3 rounded-lg bg-muted/50">
            <p className="text-2xl font-bold text-foreground">{usedSeeds}</p>
            <p className="text-xs text-muted-foreground">Em uso</p>
          </div>
          <div className="text-center p-3 rounded-lg bg-muted/50">
            <p className="text-2xl font-bold text-foreground">{totalSeeds}</p>
            <p className="text-xs text-muted-foreground">Total</p>
          </div>
        </div>

        {/* Usage bar */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Uso de sementes</span>
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
              Sem sementes disponíveis. Compre mais ou remova um anúncio.
            </p>
          </div>
        )}

        {isLow && !isEmpty && (
          <div className="mt-4 p-3 rounded-lg bg-warning/10 border border-warning/20 flex items-center gap-2">
            <AlertCircle className="h-4 w-4 text-warning flex-shrink-0" />
            <p className="text-sm text-warning">
              Poucas sementes restantes. Considere comprar mais.
            </p>
          </div>
        )}

        {/* Stats */}
        <div className="mt-4 pt-4 border-t flex items-center justify-between text-sm">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Package className="h-4 w-4" />
            <span>{plantedCount} anúncios cultivando</span>
          </div>
          <div className="flex items-center gap-2 text-muted-foreground">
            <TrendingUp className="h-4 w-4" />
            <span>Limite: 100</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
