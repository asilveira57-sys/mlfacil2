import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { SendPlantVisualization } from "./SendPlantVisualization";
import { HEALTH_STATUS_CONFIG, PlantedItemWithMetrics } from "@/types/send";
import { Eye, Trash2, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";

interface SendPlantedItemCardProps {
  item: PlantedItemWithMetrics;
  onView: (itemId: string) => void;
  onRemove: (itemId: string) => void;
}

export function SendPlantedItemCard({ item, onView, onRemove }: SendPlantedItemCardProps) {
  const healthConfig = HEALTH_STATUS_CONFIG[item.health_status];
  const metrics = item.latestMetrics;

  const getTrendIcon = (trend: number | null) => {
    if (trend === null) return <Minus className="h-3 w-3 text-muted-foreground" />;
    if (trend > 5) return <TrendingUp className="h-3 w-3 text-success" />;
    if (trend < -5) return <TrendingDown className="h-3 w-3 text-destructive" />;
    return <Minus className="h-3 w-3 text-muted-foreground" />;
  };

  return (
    <Card className={cn(
      "transition-all hover:shadow-md",
      item.health_status === 'weakening' && "border-orange-500/50",
      item.health_status === 'stagnant' && "border-amber-500/50",
    )}>
      <CardContent className="p-4">
        <div className="flex gap-4">
          {/* Plant visualization */}
          <SendPlantVisualization
            growthStage={item.growth_stage}
            healthStatus={item.health_status}
            daysPlanted={item.days_planted}
            size="sm"
            showLabel={false}
          />

          {/* Item info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2 mb-2">
              <div className="min-w-0">
                <h4 className="font-medium text-sm text-foreground truncate">
                  {item.item_title || item.item_id}
                </h4>
                <p className="text-xs text-muted-foreground">
                  Plantado {formatDistanceToNow(new Date(item.planted_at), { 
                    addSuffix: true, 
                    locale: ptBR 
                  })}
                </p>
              </div>
              <div className="flex items-center gap-1">
                <Badge 
                  variant="outline" 
                  className={cn("text-[10px]", item.is_a_plus && "border-primary text-primary")}
                >
                  {item.is_a_plus ? 'A+' : item.abc_class}
                </Badge>
                <Badge 
                  variant="outline" 
                  className={cn("text-[10px]", healthConfig.color)}
                >
                  {healthConfig.label}
                </Badge>
              </div>
            </div>

            {/* Metrics summary */}
            {metrics && (
              <div className="grid grid-cols-3 gap-2 mb-3">
                <div className="text-center p-2 rounded bg-muted/50">
                  <div className="flex items-center justify-center gap-1">
                    <span className="text-sm font-medium">{metrics.sales_count_7d}</span>
                    {getTrendIcon(metrics.visit_trend)}
                  </div>
                  <p className="text-[10px] text-muted-foreground">Vendas 7d</p>
                </div>
                <div className="text-center p-2 rounded bg-muted/50">
                  <span className="text-sm font-medium">
                    {metrics.conversion_rate ? `${metrics.conversion_rate.toFixed(1)}%` : '-'}
                  </span>
                  <p className="text-[10px] text-muted-foreground">Conversão</p>
                </div>
                <div className="text-center p-2 rounded bg-muted/50">
                  <span className="text-sm font-medium">
                    {metrics.maturity_score ? `${metrics.maturity_score.toFixed(0)}` : '-'}
                  </span>
                  <p className="text-[10px] text-muted-foreground">Maturidade</p>
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="flex items-center gap-2">
              <Button 
                variant="outline" 
                size="sm" 
                className="flex-1 h-8"
                onClick={() => onView(item.item_id)}
              >
                <Eye className="h-3 w-3 mr-1" />
                Ver detalhes
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                onClick={() => onRemove(item.item_id)}
              >
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
