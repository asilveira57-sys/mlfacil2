import { RefreshCw, X, Copy, TrendingUp, TrendingDown, Minus, Package, Search } from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useMercado } from '@/contexts/MercadoContext';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

export function MercadoMetricsDrawer() {
  const { state, closeDrawer, openMetrics } = useMercado();
  const isOpen = state.drawerType === 'metrics';
  const metrics = state.currentMetrics;
  const isLoading = state.isLoadingMetrics;
  const categoryName = state.categories.find(c => c.id === state.selectedCategoryId)?.name || 'Categoria';

  const handleRefresh = () => {
    if (state.selectedCategoryId) {
      openMetrics(state.selectedCategoryId);
    }
  };

  return (
    <Sheet open={isOpen} onOpenChange={() => closeDrawer()}>
      <SheetContent className="w-full sm:max-w-lg overflow-hidden flex flex-col">
        <SheetHeader className="flex-shrink-0 border-b pb-4">
          <div className="flex items-center justify-between">
            <SheetTitle className="text-lg font-semibold truncate pr-2">
              Métricas: {categoryName}
            </SheetTitle>
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleRefresh}>
                <RefreshCw className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={closeDrawer}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </SheetHeader>

        <ScrollArea className="flex-1 pr-4">
          <div className="py-4 space-y-6">
            {isLoading ? (
              <MetricsSkeleton />
            ) : metrics ? (
              <MetricsContent metrics={metrics} />
            ) : (
              <p className="text-center text-muted-foreground py-8">
                Nenhum dado disponível
              </p>
            )}
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}

function MetricsSkeleton() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-5 w-32" />
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-8 rounded-md" />
          ))}
        </div>
      </div>
      <div className="space-y-2">
        <Skeleton className="h-5 w-32" />
        <div className="grid grid-cols-2 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-32 rounded-lg" />
          ))}
        </div>
      </div>
    </div>
  );
}

function MetricsContent({ metrics }: { metrics: NonNullable<ReturnType<typeof useMercado>['state']['currentMetrics']> }) {
  const handleCopyKeyword = (keyword: string) => {
    navigator.clipboard.writeText(keyword);
    toast.success(`"${keyword}" copiado!`);
  };

  return (
    <>
      {/* Keywords */}
      <div className="space-y-3">
        <h4 className="text-sm font-medium flex items-center gap-2">
          <Search className="h-4 w-4 text-muted-foreground" />
          Mais Buscados
        </h4>
        <div className="space-y-1.5">
          {metrics.top_keywords.map((kw) => (
            <div
              key={kw.keyword}
              className="flex items-center gap-2 py-1.5 px-2 rounded-md bg-muted/50 hover:bg-muted transition-colors group"
            >
              <span className="text-xs text-muted-foreground w-5">{kw.rank}.</span>
              <span className="flex-1 text-sm font-medium">{kw.keyword}</span>
              <Badge
                variant="outline"
                className={cn(
                  'text-xs gap-0.5',
                  kw.trend === 'up' && 'text-success border-success/30',
                  kw.trend === 'down' && 'text-destructive border-destructive/30'
                )}
              >
                {kw.trend === 'up' && <TrendingUp className="h-3 w-3" />}
                {kw.trend === 'down' && <TrendingDown className="h-3 w-3" />}
                {kw.trend === 'stable' && <Minus className="h-3 w-3" />}
                {kw.volume.toLocaleString('pt-BR')}
              </Badge>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                onClick={() => handleCopyKeyword(kw.keyword)}
              >
                <Copy className="h-3 w-3" />
              </Button>
            </div>
          ))}
        </div>
      </div>

      {/* Top Sellers */}
      <div className="space-y-3">
        <h4 className="text-sm font-medium flex items-center gap-2">
          <Package className="h-4 w-4 text-muted-foreground" />
          Mais Vendidos
        </h4>
        <div className="grid grid-cols-2 gap-3">
          {metrics.top_sellers.map((product) => (
            <div
              key={product.id}
              className="bg-muted/50 rounded-lg p-2 hover:bg-muted transition-colors"
            >
              <div className="relative aspect-square mb-2 rounded-md overflow-hidden bg-background">
                <img
                  src={product.thumbnail}
                  alt={product.title}
                  className="w-full h-full object-contain"
                  loading="lazy"
                  onError={(e) => {
                    e.currentTarget.src = '/placeholder.svg';
                  }}
                />
                <Badge className="absolute top-1 left-1 text-xs px-1.5 py-0">
                  #{product.rank}
                </Badge>
              </div>
              <p className="text-xs line-clamp-2 font-medium leading-tight">
                {product.title}
              </p>
              <p className="text-sm font-semibold text-primary mt-1">
                R$ {product.price.toLocaleString('pt-BR')}
              </p>
              <div className="flex items-center gap-1 mt-1">
                {product.is_catalog && (
                  <Badge variant="secondary" className="text-[10px] px-1 py-0">
                    Catálogo
                  </Badge>
                )}
                {product.is_full && (
                  <Badge variant="outline" className="text-[10px] px-1 py-0 border-success/30 text-success">
                    Full
                  </Badge>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
