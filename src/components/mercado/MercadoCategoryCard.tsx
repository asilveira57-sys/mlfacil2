import { memo } from 'react';
import { ChevronRight, FileText, BarChart3, Star, Check } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { MercadoCategoryItem } from '@/types/mercado';
import { cn } from '@/lib/utils';

interface MercadoCategoryCardProps {
  category: MercadoCategoryItem;
  isCompareMode: boolean;
  isSelected: boolean;
  onNavigate: () => void;
  onDetails: () => void;
  onMetrics: () => void;
  onFavorite: () => void;
  onCompareToggle: () => void;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
}

export const MercadoCategoryCard = memo(function MercadoCategoryCard({
  category,
  isCompareMode,
  isSelected,
  onNavigate,
  onDetails,
  onMetrics,
  onFavorite,
  onCompareToggle,
  onMouseEnter,
  onMouseLeave,
}: MercadoCategoryCardProps) {
  const delta = category.delta_24h;
  const hasPositiveDelta = delta && delta > 0;
  const hasNegativeDelta = delta && delta < 0;

  return (
    <Card
      className={cn(
        'group relative transition-all duration-200 hover:shadow-lg hover:-translate-y-0.5',
        isSelected && 'ring-2 ring-primary'
      )}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <CardContent className="p-4">
        {/* Header */}
        <div className="flex items-start justify-between mb-3">
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-foreground truncate group-hover:text-primary transition-colors">
              {category.name}
            </h3>
            <p className="text-sm text-muted-foreground mt-0.5">
              {category.total_count.toLocaleString('pt-BR')} itens
            </p>
          </div>
          
          {/* Favorite / Compare checkbox */}
          {isCompareMode ? (
            <button
              onClick={onCompareToggle}
              className={cn(
                'h-5 w-5 rounded border-2 flex items-center justify-center transition-colors',
                isSelected
                  ? 'bg-primary border-primary text-primary-foreground'
                  : 'border-muted-foreground/30 hover:border-primary'
              )}
            >
              {isSelected && <Check className="h-3 w-3" />}
            </button>
          ) : (
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={onFavorite}
            >
              <Star
                className={cn(
                  'h-4 w-4 transition-colors',
                  category.is_favorite
                    ? 'fill-amber-400 text-amber-400'
                    : 'text-muted-foreground hover:text-amber-400'
                )}
              />
            </Button>
          )}
        </div>

        {/* Share bar */}
        <div className="mb-3">
          <div className="flex items-center justify-between text-xs mb-1">
            <span className="text-muted-foreground">Representatividade</span>
            <span className="font-medium">{category.share_percent.toFixed(1)}%</span>
          </div>
          <Progress value={category.share_percent} className="h-1.5" />
        </div>

        {/* Delta badge */}
        {delta !== undefined && (
          <div className="mb-3">
            <Badge
              variant="outline"
              className={cn(
                'text-xs',
                hasPositiveDelta && 'border-success/30 bg-success/10 text-success',
                hasNegativeDelta && 'border-destructive/30 bg-destructive/10 text-destructive'
              )}
            >
              {hasPositiveDelta ? '↑' : hasNegativeDelta ? '↓' : '→'}{' '}
              {Math.abs(delta).toFixed(1)}% 24h
            </Badge>
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center gap-1.5">
          {category.has_children && (
            <Button
              variant="outline"
              size="sm"
              className="flex-1 h-8 text-xs gap-1"
              onClick={onNavigate}
            >
              <ChevronRight className="h-3.5 w-3.5" />
              Navegar
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            className="flex-1 h-8 text-xs gap-1"
            onClick={onDetails}
          >
            <FileText className="h-3.5 w-3.5" />
            Detalhes
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="flex-1 h-8 text-xs gap-1"
            onClick={onMetrics}
          >
            <BarChart3 className="h-3.5 w-3.5" />
            Métricas
          </Button>
        </div>
      </CardContent>
    </Card>
  );
});
