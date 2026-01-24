import { useState, useEffect } from 'react';
import { X, GitCompare, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { useMercado } from '@/contexts/MercadoContext';
import { MercadoComparisonData } from '@/types/mercado';
import { cn } from '@/lib/utils';

export function MercadoComparisonPanel() {
  const { state, adapter, clearComparison } = useMercado();
  const [comparisonData, setComparisonData] = useState<MercadoComparisonData | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (state.comparisonIds.length >= 2) {
      setIsLoading(true);
      adapter.getComparison(state.comparisonIds)
        .then(setComparisonData)
        .finally(() => setIsLoading(false));
    } else {
      setComparisonData(null);
    }
  }, [state.comparisonIds, adapter]);

  if (!state.isCompareMode || state.comparisonIds.length < 2) {
    return null;
  }

  return (
    <Card className="mt-6">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <GitCompare className="h-4 w-4" />
            Comparação ({state.comparisonIds.length} categorias)
          </CardTitle>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={clearComparison}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {state.comparisonIds.map((id) => (
              <Skeleton key={id} className="h-48 rounded-lg" />
            ))}
          </div>
        ) : comparisonData ? (
          <div className="space-y-6">
            {/* Overview */}
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              {comparisonData.categories.map((cat) => (
                <div key={cat.id} className="bg-muted/50 rounded-lg p-4 space-y-3">
                  <h4 className="font-medium text-sm truncate">{cat.name}</h4>
                  <div className="space-y-2">
                    <div>
                      <p className="text-xs text-muted-foreground">Representatividade</p>
                      <p className="font-semibold">{cat.share_percent.toFixed(1)}%</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Total de Itens</p>
                      <p className="font-semibold">{cat.total_count.toLocaleString('pt-BR')}</p>
                    </div>
                    {cat.delta_24h !== undefined && (
                      <div className="flex items-center gap-1">
                        {cat.delta_24h > 0 ? (
                          <TrendingUp className="h-3 w-3 text-success" />
                        ) : cat.delta_24h < 0 ? (
                          <TrendingDown className="h-3 w-3 text-destructive" />
                        ) : (
                          <Minus className="h-3 w-3 text-muted-foreground" />
                        )}
                        <span className={cn(
                          'text-xs',
                          cat.delta_24h > 0 && 'text-success',
                          cat.delta_24h < 0 && 'text-destructive'
                        )}>
                          {Math.abs(cat.delta_24h).toFixed(1)}% 24h
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Keywords comparison */}
            <div>
              <h4 className="text-sm font-medium mb-3">Top Keywords</h4>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                {comparisonData.categories.map((cat) => (
                  <div key={cat.id} className="space-y-1">
                    <p className="text-xs text-muted-foreground truncate">{cat.name}</p>
                    {cat.top_keywords.slice(0, 5).map((kw) => (
                      <Badge
                        key={kw.keyword}
                        variant="outline"
                        className="text-xs mr-1 mb-1"
                      >
                        {kw.keyword}
                      </Badge>
                    ))}
                  </div>
                ))}
              </div>
            </div>

            {/* Price ranges comparison */}
            <div>
              <h4 className="text-sm font-medium mb-3">Faixas de Preço</h4>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                {comparisonData.categories.map((cat) => (
                  <div key={cat.id} className="space-y-1.5">
                    <p className="text-xs text-muted-foreground truncate">{cat.name}</p>
                    {cat.price_ranges.map((range) => (
                      <div key={range.range} className="flex items-center gap-2 text-xs">
                        <span className="w-16 text-muted-foreground truncate">{range.range}</span>
                        <Progress value={range.percent} className="flex-1 h-1.5" />
                        <span className="w-8 text-right">{range.percent}%</span>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
