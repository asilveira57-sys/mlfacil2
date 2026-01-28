import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EligibleItem } from "@/types/send";
import { Plus, Check, Star, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";

interface SendEligibleItemCardProps {
  item: EligibleItem;
  onPlant: (item: EligibleItem) => void;
  disabled?: boolean;
}

export function SendEligibleItemCard({ item, onPlant, disabled }: SendEligibleItemCardProps) {
  const isAPlus = item.abc_class === 'A+';

  return (
    <Card className={cn(
      "transition-all",
      item.is_planted && "opacity-60",
      isAPlus && "border-primary/30 bg-primary/5",
    )}>
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          {/* Thumbnail placeholder */}
          <div className={cn(
            "w-14 h-14 rounded-lg flex items-center justify-center flex-shrink-0",
            isAPlus ? "bg-primary/10" : "bg-muted"
          )}>
            {isAPlus ? (
              <Star className="h-6 w-6 text-primary" />
            ) : (
              <TrendingUp className="h-6 w-6 text-muted-foreground" />
            )}
          </div>

          {/* Item info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2 mb-1">
              <h4 className="font-medium text-sm text-foreground truncate">
                {item.item_title || item.item_id}
              </h4>
              <Badge 
                variant={isAPlus ? "default" : "secondary"}
                className="text-[10px] flex-shrink-0"
              >
                {item.abc_class}
              </Badge>
            </div>

            <p className="text-xs text-muted-foreground mb-2">
              ID: {item.item_id.slice(0, 15)}...
            </p>

            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-success">
                R$ {item.total_revenue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </span>
              
              {item.is_planted ? (
                <Badge variant="outline" className="text-success border-success">
                  <Check className="h-3 w-3 mr-1" />
                  Plantado
                </Badge>
              ) : (
                <Button
                  size="sm"
                  variant={isAPlus ? "default" : "outline"}
                  className="h-7"
                  onClick={() => onPlant(item)}
                  disabled={disabled}
                >
                  <Plus className="h-3 w-3 mr-1" />
                  Plantar
                </Button>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
