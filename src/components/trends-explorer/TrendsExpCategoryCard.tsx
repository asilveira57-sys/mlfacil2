import { useMemo, useRef } from 'react';
import { ArrowUp, ArrowDown, Minus, ChevronRight, Info, BarChart3, Star, Check } from 'lucide-react';
import { CategoryListItem } from '@/types/trends-explorer';
import { useTrendsExplorer } from '@/contexts/TrendsExplorerContext';
import { useTrendsPrefetch } from '@/hooks/useTrendsPrefetch';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface CategoryCardProps {
  category: CategoryListItem;
  index: number;
}

export function TrendsExpCategoryCard({ category, index }: CategoryCardProps) {
  const { 
    state, 
    navigateTo, 
    openDetails, 
    openMetrics, 
    toggleFavorite,
    toggleComparison,
    prefetchDetails,
    prefetchMetrics,
  } = useTrendsExplorer();
  
  const { isCompareMode, comparisonIds } = state;
  const isSelected = comparisonIds.includes(category.id);
  const isTop1 = index === 0;

  const prefetch = useTrendsPrefetch(prefetchDetails, prefetchMetrics);
  const cardRef = useRef<HTMLDivElement>(null);

  const deltaIcon = useMemo(() => {
    if (!category.delta_24h) return <Minus className="h-3 w-3 text-muted-foreground" />;
    if (category.delta_24h > 0) return <ArrowUp className="h-3 w-3 text-emerald-500" />;
    return <ArrowDown className="h-3 w-3 text-red-500" />;
  }, [category.delta_24h]);

  const deltaColor = useMemo(() => {
    if (!category.delta_24h) return 'text-muted-foreground';
    return category.delta_24h > 0 ? 'text-emerald-500' : 'text-red-500';
  }, [category.delta_24h]);

  const handleMouseEnter = () => {
    prefetch.onMouseEnter(category.id, isTop1);
  };

  const handleMouseLeave = () => {
    prefetch.onMouseLeave(category.id);
  };

  const handleCardClick = () => {
    if (isCompareMode) {
      toggleComparison(category.id);
    }
  };

  return (
    <div
      ref={cardRef}
      className={cn(
        'group relative rounded-xl border bg-card p-4 transition-all duration-200',
        'hover:shadow-md hover:border-primary/20 hover:-translate-y-0.5',
        isCompareMode && 'cursor-pointer',
        isSelected && 'ring-2 ring-primary border-primary'
      )}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onClick={handleCardClick}
    >
      {/* Selection indicator */}
      {isCompareMode && (
        <div className={cn(
          'absolute top-3 right-3 h-5 w-5 rounded-full border-2 flex items-center justify-center',
          isSelected ? 'bg-primary border-primary' : 'border-muted-foreground/30'
        )}>
          {isSelected && <Check className="h-3 w-3 text-primary-foreground" />}
        </div>
      )}

      {/* Header */}
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-foreground truncate" title={category.name}>
            {category.name}
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            {category.total_count.toLocaleString('pt-BR')} itens
          </p>
        </div>
        
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 shrink-0"
          onClick={(e) => {
            e.stopPropagation();
            toggleFavorite(category.id);
          }}
        >
          <Star className={cn(
            'h-4 w-4',
            category.is_favorite ? 'fill-yellow-400 text-yellow-400' : 'text-muted-foreground'
          )} />
        </Button>
      </div>

      {/* Share Progress */}
      <div className="mb-4">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-xs text-muted-foreground">Representatividade</span>
          <span className="text-sm font-semibold">{category.share_percent.toFixed(1)}%</span>
        </div>
        <Progress value={category.share_percent} className="h-2" />
      </div>

      {/* Delta Badge */}
      {category.delta_24h !== undefined && (
        <div className="mb-4">
          <Badge variant="outline" className={cn('gap-1', deltaColor)}>
            {deltaIcon}
            <span>{Math.abs(category.delta_24h).toFixed(1)}% 24h</span>
          </Badge>
        </div>
      )}

      {/* Actions */}
      <div className="flex flex-wrap gap-2 pt-2 border-t border-border/50">
        {category.has_children && (
          <Button
            variant="secondary"
            size="sm"
            className="h-7 text-xs gap-1 flex-1"
            onClick={(e) => {
              e.stopPropagation();
              navigateTo(category.id, category.name);
            }}
          >
            Navegar
            <ChevronRight className="h-3 w-3" />
          </Button>
        )}
        
        <Button
          variant="outline"
          size="sm"
          className="h-7 text-xs gap-1"
          onClick={(e) => {
            e.stopPropagation();
            openDetails(category.id);
          }}
        >
          <Info className="h-3 w-3" />
          Detalhes
        </Button>
        
        <Button
          variant="outline"
          size="sm"
          className="h-7 text-xs gap-1"
          onClick={(e) => {
            e.stopPropagation();
            openMetrics(category.id);
          }}
        >
          <BarChart3 className="h-3 w-3" />
          Métricas
        </Button>
      </div>
    </div>
  );
}
