import { useState, useEffect } from 'react';
import { X, ArrowUp, ArrowDown, Minus } from 'lucide-react';
import { useTrendsExplorer } from '@/contexts/TrendsExplorerContext';
import { ComparisonData } from '@/types/trends-explorer';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { cn } from '@/lib/utils';

export function TrendsExpComparisonPanel() {
  const { state, adapter, clearComparison } = useTrendsExplorer();
  const { categories } = state;
  const { comparisonIds, isCompareMode } = state;

  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [data, setData] = useState<ComparisonData | null>(null);

  // Open comparison panel when we have 2+ categories selected
  useEffect(() => {
    if (comparisonIds.length >= 2 && isCompareMode) {
      setIsOpen(true);
      loadComparison();
    } else {
      setIsOpen(false);
    }
  }, [comparisonIds, isCompareMode]);

  const loadComparison = async () => {
    if (comparisonIds.length < 2) return;

    setIsLoading(true);
    try {
      const comparison = await adapter.getComparison(comparisonIds);
      setData(comparison);
    } catch {
      // Handle error silently
    } finally {
      setIsLoading(false);
    }
  };

  const handleClose = () => {
    setIsOpen(false);
    clearComparison();
  };

  const selectedNames = comparisonIds.map(id => 
    categories.find(c => c.id === id)?.name || id
  );

  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <SheetContent side="bottom" className="h-[70vh] sm:h-[60vh] p-0 flex flex-col">
        {/* Header */}
        <SheetHeader className="px-6 py-4 border-b shrink-0">
          <div className="flex items-center justify-between gap-4">
            <SheetTitle className="text-lg font-semibold">
              Comparação de Categorias
            </SheetTitle>
            <div className="flex items-center gap-2">
              <div className="flex gap-1">
                {selectedNames.map((name, i) => (
                  <Badge key={i} variant="secondary" className="max-w-[120px] truncate">
                    {name}
                  </Badge>
                ))}
              </div>
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleClose}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </SheetHeader>

        {/* Content */}
        <ScrollArea className="flex-1">
          <div className="p-6">
            {isLoading ? (
              <ComparisonLoading count={comparisonIds.length} />
            ) : data ? (
              <div className="space-y-8">
                {/* Overview */}
                <section>
                  <h4 className="text-sm font-medium text-muted-foreground mb-4">Visão Geral</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    {data.categories.map((cat) => (
                      <div key={cat.id} className="p-4 rounded-lg border bg-card">
                        <h5 className="font-medium mb-3 truncate">{cat.name}</h5>
                        <div className="space-y-3">
                          <div>
                            <p className="text-xs text-muted-foreground mb-1">Representatividade</p>
                            <div className="flex items-center gap-2">
                              <Progress value={cat.share_percent} className="h-2 flex-1" />
                              <span className="text-sm font-medium">{cat.share_percent.toFixed(1)}%</span>
                            </div>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground mb-1">Total de itens</p>
                            <p className="text-lg font-semibold">{cat.total_count.toLocaleString('pt-BR')}</p>
                          </div>
                          {cat.delta_24h !== undefined && (
                            <div className="flex items-center gap-1">
                              <DeltaBadge delta={cat.delta_24h} />
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </section>

                {/* Keywords Comparison */}
                <section>
                  <h4 className="text-sm font-medium text-muted-foreground mb-4">Top Keywords</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    {data.categories.map((cat) => (
                      <div key={cat.id} className="space-y-2">
                        <p className="text-sm font-medium truncate">{cat.name}</p>
                        {cat.top_keywords.map((kw, i) => (
                          <div key={i} className="flex items-center gap-2 text-sm">
                            <span className="text-muted-foreground w-4">#{kw.rank}</span>
                            <span className="flex-1 truncate">{kw.keyword}</span>
                            <TrendIcon trend={kw.trend} />
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                </section>

                {/* Price Ranges Comparison */}
                <section>
                  <h4 className="text-sm font-medium text-muted-foreground mb-4">Faixas de Preço</h4>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b">
                          <th className="text-left py-2 px-3">Faixa</th>
                          {data.categories.map((cat) => (
                            <th key={cat.id} className="text-right py-2 px-3 max-w-[120px] truncate">
                              {cat.name}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {data.categories[0]?.price_ranges.map((range, i) => (
                          <tr key={range.range} className="border-b">
                            <td className="py-2 px-3">{range.range}</td>
                            {data.categories.map((cat) => (
                              <td key={cat.id} className="text-right py-2 px-3">
                                {cat.price_ranges[i]?.percent || 0}%
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              </div>
            ) : null}
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}

function DeltaBadge({ delta }: { delta: number }) {
  if (delta === 0) {
    return (
      <Badge variant="outline" className="text-muted-foreground">
        <Minus className="h-3 w-3 mr-1" />
        Estável
      </Badge>
    );
  }

  const isPositive = delta > 0;
  return (
    <Badge variant="outline" className={cn(isPositive ? 'text-emerald-500' : 'text-destructive')}>
      {isPositive ? <ArrowUp className="h-3 w-3 mr-1" /> : <ArrowDown className="h-3 w-3 mr-1" />}
      {Math.abs(delta).toFixed(1)}% (24h)
    </Badge>
  );
}

function TrendIcon({ trend }: { trend: 'up' | 'down' | 'stable' }) {
  const config = {
    up: { icon: ArrowUp, className: 'text-emerald-500' },
    down: { icon: ArrowDown, className: 'text-destructive' },
    stable: { icon: Minus, className: 'text-muted-foreground' },
  };

  const { icon: Icon, className } = config[trend];
  return <Icon className={cn('h-3 w-3', className)} />;
}

function ComparisonLoading({ count }: { count: number }) {
  return (
    <div className="space-y-8">
      <section>
        <Skeleton className="h-4 w-24 mb-4" />
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {Array.from({ length: count }).map((_, i) => (
            <Skeleton key={i} className="h-40 rounded-lg" />
          ))}
        </div>
      </section>
      <section>
        <Skeleton className="h-4 w-24 mb-4" />
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {Array.from({ length: count }).map((_, i) => (
            <div key={i} className="space-y-2">
              {Array.from({ length: 5 }).map((_, j) => (
                <Skeleton key={j} className="h-6" />
              ))}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
