import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { SendPlantVisualization } from "./SendPlantVisualization";
import { HEALTH_STATUS_CONFIG, PlantedItemWithMetrics } from "@/types/send";
import { Eye, Trash2, TrendingUp, TrendingDown, Minus, ImageOff } from "lucide-react";
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

  // Extract MLB ID for display
  const extractMlbId = (id: string): string => {
    const match = id.match(/^(MLB\d+)/);
    return match ? match[1] : id;
  };

  const displayId = extractMlbId(item.item_id);
  const sku = item.item_id !== displayId ? item.item_id.replace(displayId, '').replace(/^[_:]/, '') : null;

  const getTrendIcon = (trend: number | null) => {
    if (trend === null) return <Minus className="h-3 w-3 text-muted-foreground" />;
    if (trend > 5) return <TrendingUp className="h-3 w-3 text-success" />;
    if (trend < -5) return <TrendingDown className="h-3 w-3 text-destructive" />;
    return <Minus className="h-3 w-3 text-muted-foreground" />;
  };

  return (
    <Card className={cn(
      "transition-all hover:shadow-md",
      item.health_status === 'weakening' && "border-warning",
      item.health_status === 'stagnant' && "border-warning/50",
    )}>
      <CardContent className="p-4">
        <div className="flex gap-4">
          {/* Thumbnail + Plant visualization */}
          <div className="flex flex-col items-center gap-2">
            {/* Real thumbnail */}
            <div className="w-14 h-14 rounded-lg bg-muted overflow-hidden flex-shrink-0">
              {item.item_thumbnail ? (
                <img 
                  src={item.item_thumbnail} 
                  alt={item.item_title || 'Produto'} 
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <ImageOff className="h-5 w-5 text-muted-foreground" />
                </div>
              )}
            </div>
            {/* Mini plant */}
            <SendPlantVisualization
              growthStage={item.growth_stage}
              healthStatus={item.health_status}
              daysPlanted={item.days_planted}
              size="xs"
              showLabel={false}
            />
          </div>

          {/* Item info */}
          <div className="flex-1 min-w-0">
            {/* Line 1: Title */}
            <h4 className="font-medium text-sm text-foreground line-clamp-2 mb-1">
              {item.item_title || 'Carregando título...'}
            </h4>

            {/* Line 2: ID + SKU */}
            <p className="text-xs text-muted-foreground mb-1">
              {displayId}
              {sku && <span className="ml-1">• SKU: {sku}</span>}
            </p>

            {/* Line 3: Badges */}
            <div className="flex items-center gap-1 mb-2">
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
              <span className="text-[10px] text-muted-foreground">
                • {formatDistanceToNow(new Date(item.planted_at), { 
                    addSuffix: false, 
                    locale: ptBR 
                  })}
              </span>
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
                onClick={(e) => {
                  e.stopPropagation();
                  onView(item.item_id);
                }}
              >
                <Eye className="h-3 w-3 mr-1" />
                Ver detalhes
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                onClick={(e) => {
                  e.stopPropagation();
                  onRemove(item.item_id);
                }}
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
