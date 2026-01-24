import { memo, useCallback } from 'react';
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

// Custom comparison to prevent re-renders when only reference changes
function arePropsEqual(prev: MercadoCategoryCardProps, next: MercadoCategoryCardProps): boolean {
  // Compare category data by value
  const sameCategoryData = 
    prev.category.id === next.category.id &&
    prev.category.name === next.category.name &&
    prev.category.share_percent === next.category.share_percent &&
    prev.category.total_count === next.category.total_count &&
    prev.category.delta_24h === next.category.delta_24h &&
    prev.category.is_favorite === next.category.is_favorite &&
    prev.category.has_children === next.category.has_children;

  // Compare UI state
  const sameUIState = 
    prev.isCompareMode === next.isCompareMode &&
    prev.isSelected === next.isSelected;

  return sameCategoryData && sameUIState;
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
  const hasPositiveDelta = delta !== undefined && delta > 0;
  const hasNegativeDelta = delta !== undefined && delta < 0;

  // Memoized event handlers to prevent unnecessary re-renders
  const handleNavigate = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    onNavigate();
  }, [onNavigate]);

  const handleDetails = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    onDetails();
  }, [onDetails]);

  const handleMetrics = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    onMetrics();
  }, [onMetrics]);

  const handleFavorite = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    onFavorite();
  }, [onFavorite]);

  const handleCompare = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    onCompareToggle();
  }, [onCompareToggle]);

  return (
    <Card
      className={cn(
        // Fixed minimum height to prevent layout shift
        'group relative transition-all duration-200 hover:shadow-lg hover:-translate-y-0.5',
        'min-h-[176px]', // Fixed height for consistent layout
        isSelected && 'ring-2 ring-primary'
      )}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <CardContent className="p-4 flex flex-col h-full">
        {/* Header - fixed height */}
        <div className="flex items-start justify-between mb-3 min-h-[44px]">
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
              onClick={handleCompare}
              className={cn(
                'h-5 w-5 rounded border-2 flex items-center justify-center transition-colors flex-shrink-0',
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
              className="h-7 w-7 flex-shrink-0"
              onClick={handleFavorite}
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

        {/* Share bar - fixed height */}
        <div className="mb-3 min-h-[32px]">
          <div className="flex items-center justify-between text-xs mb-1">
            <span className="text-muted-foreground">Representatividade</span>
            <span className="font-medium">{category.share_percent.toFixed(1)}%</span>
          </div>
          <Progress value={category.share_percent} className="h-1.5" />
        </div>

        {/* Delta badge - reserved space even when empty */}
        <div className="mb-3 min-h-[24px]">
          {delta !== undefined && (
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
          )}
        </div>

        {/* Actions - fixed height at bottom */}
        <div className="flex items-center gap-1.5 mt-auto min-h-[32px]">
          {category.has_children ? (
            <Button
              variant="outline"
              size="sm"
              className="flex-1 h-8 text-xs gap-1"
              onClick={handleNavigate}
            >
              <ChevronRight className="h-3.5 w-3.5" />
              Navegar
            </Button>
          ) : (
            <Button
              variant="outline"
              size="sm"
              className="flex-1 h-8 text-xs gap-1 opacity-50 cursor-not-allowed"
              disabled
              title="Esta categoria não possui subcategorias"
            >
              <ChevronRight className="h-3.5 w-3.5" />
              Sem subs
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            className="flex-1 h-8 text-xs gap-1"
            onClick={handleDetails}
          >
            <FileText className="h-3.5 w-3.5" />
            Detalhes
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="flex-1 h-8 text-xs gap-1"
            onClick={handleMetrics}
          >
            <BarChart3 className="h-3.5 w-3.5" />
            Métricas
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}, arePropsEqual);
