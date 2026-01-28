import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EligibleItem } from "@/types/send";
import { Plus, Check, Eye, ImageOff } from "lucide-react";
import { cn } from "@/lib/utils";

interface SendEligibleItemCardProps {
  item: EligibleItem;
  onPlant: (item: EligibleItem) => void;
  onViewDetails: (itemId: string) => void;
  disabled?: boolean;
}

export function SendEligibleItemCard({ item, onPlant, onViewDetails, disabled }: SendEligibleItemCardProps) {
  const isAPlus = item.abc_class === 'A+';

  // Extract MLB ID for display
  const extractMlbId = (id: string): string => {
    const match = id.match(/^(MLB\d+)/);
    return match ? match[1] : id;
  };

  const displayId = extractMlbId(item.item_id);
  const sku = item.item_id !== displayId ? item.item_id.replace(displayId, '').replace(/^[_:]/, '') : null;

  return (
    <Card className={cn(
      "transition-all hover:shadow-md",
      item.is_planted && "opacity-60",
      isAPlus && "border-primary/30 bg-primary/5",
    )}>
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          {/* Thumbnail */}
          <div className={cn(
            "w-16 h-16 rounded-lg flex items-center justify-center flex-shrink-0 overflow-hidden",
            isAPlus ? "bg-primary/10 ring-2 ring-primary/30" : "bg-muted"
          )}>
            {item.item_thumbnail ? (
              <img 
                src={item.item_thumbnail} 
                alt={item.item_title || 'Produto'} 
                className="w-full h-full object-cover"
              />
            ) : (
              <ImageOff className="h-6 w-6 text-muted-foreground" />
            )}
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

            {/* Line 3: Value + Badge */}
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-success">
                R$ {item.total_revenue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </span>
              <Badge 
                variant={isAPlus ? "default" : "secondary"}
                className="text-[10px] flex-shrink-0"
              >
                {item.abc_class}
              </Badge>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2 mt-3">
              {item.is_planted ? (
                <Badge variant="outline" className="text-success border-success flex-1 justify-center py-1">
                  <Check className="h-3 w-3 mr-1" />
                  Plantado
                </Badge>
              ) : (
                <Button
                  size="sm"
                  variant={isAPlus ? "default" : "outline"}
                  className="flex-1 h-8"
                  onClick={(e) => {
                    e.stopPropagation();
                    onPlant(item);
                  }}
                  disabled={disabled}
                >
                  <Plus className="h-3 w-3 mr-1" />
                  Plantar
                </Button>
              )}
              <Button
                size="sm"
                variant="ghost"
                className="h-8 w-8 p-0"
                onClick={(e) => {
                  e.stopPropagation();
                  onViewDetails(item.item_id);
                }}
              >
                <Eye className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
