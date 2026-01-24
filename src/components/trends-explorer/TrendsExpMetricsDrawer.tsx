import { RefreshCw, X, Copy, ArrowUp, ArrowDown, Minus, Package, Award } from 'lucide-react';
import { useTrendsExplorer } from '@/contexts/TrendsExplorerContext';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

export function TrendsExpMetricsDrawer() {
  const { state, closeDrawer, openMetrics } = useTrendsExplorer();
  const { drawerType, selectedCategoryId, currentMetrics, isLoadingMetrics, categories } = state;

  const isOpen = drawerType === 'metrics';
  const category = categories.find(c => c.id === selectedCategoryId);

  const handleRefresh = () => {
    if (selectedCategoryId) {
      openMetrics(selectedCategoryId);
    }
  };

  const handleCopyKeyword = (keyword: string) => {
    navigator.clipboard.writeText(keyword);
    toast.success(`"${keyword}" copiado!`);
  };

  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && closeDrawer()}>
      <SheetContent className="w-full sm:max-w-lg p-0 flex flex-col">
        {/* Fixed Header */}
        <SheetHeader className="px-6 py-4 border-b shrink-0">
          <div className="flex items-center justify-between gap-4">
            <SheetTitle className="text-lg font-semibold truncate">
              {category?.name || 'Métricas'}
            </SheetTitle>
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleRefresh}>
                <RefreshCw className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={closeDrawer}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </SheetHeader>

        {/* Scrollable Content */}
        <ScrollArea className="flex-1">
          <div className="px-6 py-4 space-y-6">
            {isLoadingMetrics ? (
              <MetricsLoading />
            ) : currentMetrics ? (
              <>
                {/* Top Keywords */}
                <section>
                  <h4 className="text-sm font-medium text-muted-foreground mb-3 flex items-center gap-2">
                    🔍 Mais buscados
                  </h4>
                  <div className="space-y-2">
                    {currentMetrics.top_keywords.map((kw) => (
                      <div
                        key={kw.keyword}
                        className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50 group"
                      >
                        <span className="text-xs font-medium text-muted-foreground w-6">
                          #{kw.rank}
                        </span>
                        <span className="flex-1 text-sm font-medium">{kw.keyword}</span>
                        <TrendBadge trend={kw.trend} />
                        <span className="text-xs text-muted-foreground">
                          {(kw.volume / 1000).toFixed(0)}k
                        </span>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity"
                          onClick={() => handleCopyKeyword(kw.keyword)}
                        >
                          <Copy className="h-3 w-3" />
                        </Button>
                      </div>
                    ))}
                  </div>
                </section>

                {/* Top Sellers */}
                <section>
                  <h4 className="text-sm font-medium text-muted-foreground mb-3 flex items-center gap-2">
                    🏆 Mais vendidos
                  </h4>
                  <div className="grid grid-cols-2 gap-3">
                    {currentMetrics.top_sellers.map((item) => (
                      <div
                        key={item.id}
                        className="rounded-lg border bg-card overflow-hidden hover:shadow-md transition-shadow"
                      >
                        {/* Thumbnail */}
                        <div className="aspect-square bg-muted relative">
                          <img
                            src={item.thumbnail}
                            alt={item.title}
                            className="w-full h-full object-cover"
                            loading="lazy"
                            onError={(e) => {
                              e.currentTarget.style.display = 'none';
                            }}
                          />
                          <div className="absolute top-2 left-2">
                            <Badge variant="secondary" className="text-xs">
                              #{item.rank}
                            </Badge>
                          </div>
                          <div className="absolute top-2 right-2 flex gap-1">
                            {item.is_catalog && (
                              <Badge variant="outline" className="text-xs bg-background/80">
                                <Package className="h-3 w-3 mr-1" />
                                Catálogo
                              </Badge>
                            )}
                            {item.is_full && (
                              <Badge className="text-xs bg-emerald-500">
                                <Award className="h-3 w-3 mr-1" />
                                Full
                              </Badge>
                            )}
                          </div>
                        </div>

                        {/* Content */}
                        <div className="p-3">
                          <p className="text-sm font-medium line-clamp-2 mb-2" title={item.title}>
                            {item.title}
                          </p>
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-semibold text-primary">
                              R$ {item.price.toLocaleString('pt-BR')}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              {item.sold_quantity.toLocaleString('pt-BR')} vendidos
                            </span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              </>
            ) : (
              <div className="flex items-center justify-center py-12 text-muted-foreground">
                Selecione uma categoria para ver as métricas
              </div>
            )}
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}

function TrendBadge({ trend }: { trend: 'up' | 'down' | 'stable' }) {
  const config = {
    up: { icon: ArrowUp, className: 'text-emerald-500' },
    down: { icon: ArrowDown, className: 'text-destructive' },
    stable: { icon: Minus, className: 'text-muted-foreground' },
  };

  const { icon: Icon, className } = config[trend];

  return <Icon className={cn('h-3 w-3', className)} />;
}

function MetricsLoading() {
  return (
    <div className="space-y-6">
      <section>
        <Skeleton className="h-4 w-24 mb-3" />
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-10 rounded-lg" />
          ))}
        </div>
      </section>
      <section>
        <Skeleton className="h-4 w-24 mb-3" />
        <div className="grid grid-cols-2 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="aspect-[3/4] rounded-lg" />
          ))}
        </div>
      </section>
    </div>
  );
}
