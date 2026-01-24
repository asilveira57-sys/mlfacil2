import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Trophy, ExternalLink, AlertCircle, Download, RefreshCw, Info } from 'lucide-react';
import { useTrends, BestSellerItem } from '@/contexts/TrendsContext';
import { useTrendsItemCache } from '@/hooks/useTrendsItemCache';

// ============================================================
// BEST SELLERS SECTION
// Objetivo: Ranking público - NUNCA depende do seller
// Com cache persistente para thumbs/títulos (7 dias)
// ============================================================

interface BestSellersSectionProps {
  onCollect: () => void;
  isCollecting: boolean;
  snapshotDate: string | null;
}

export function BestSellersSection({ onCollect, isCollecting, snapshotDate }: BestSellersSectionProps) {
  const { state, hasCategory } = useTrends();
  const { data, ui } = state;
  const itemCache = useTrendsItemCache();
  
  const [enrichedItems, setEnrichedItems] = useState<BestSellerItem[]>([]);
  const [isEnriching, setIsEnriching] = useState(false);
  
  const isLoading = ui.loadingFlags.bestSellers;
  const isEmpty = ui.emptyFlags.bestSellers;
  const error = ui.errors.bestSellers;

  // Pre-warm cache with existing data
  useEffect(() => {
    if (data.bestSellers.length > 0) {
      itemCache.prewarmCache(data.bestSellers);
    }
  }, [data.bestSellers, itemCache]);

  // Enrich items with cached data
  useEffect(() => {
    if (data.bestSellers.length === 0) {
      setEnrichedItems([]);
      return;
    }

    const enrichItems = async () => {
      // First pass: use cache immediately
      const immediateEnriched = data.bestSellers.map(item => {
        const cached = itemCache.getOrPlaceholder(item.item_id, item.title, item.thumbnail);
        return {
          ...item,
          title: cached.title || item.title,
          thumbnail: cached.thumbnail || item.thumbnail,
        };
      });
      setEnrichedItems(immediateEnriched);

      // Second pass: fetch missing items
      const itemsNeedingFetch = data.bestSellers.filter(
        item => !item.title && !item.thumbnail && !itemCache.getFromMemory(item.item_id)
      );

      if (itemsNeedingFetch.length > 0) {
        setIsEnriching(true);
        const fetched = await itemCache.fetchBatch(itemsNeedingFetch.map(i => i.item_id));
        
        // Update with fetched data
        const finalEnriched = data.bestSellers.map(item => {
          const cached = fetched.get(item.item_id) || itemCache.getOrPlaceholder(item.item_id, item.title, item.thumbnail);
          return {
            ...item,
            title: cached.title || item.title,
            thumbnail: cached.thumbnail || item.thumbnail,
          };
        });
        setEnrichedItems(finalEnriched);
        setIsEnriching(false);
      }
    };

    enrichItems();
  }, [data.bestSellers, itemCache]);
  
  const formatPrice = (price: number | null) => {
    if (!price) return '—';
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(price);
  };
  
  const formatRevenue = (revenue: number | null | undefined) => {
    if (!revenue) return '—';
    if (revenue >= 1000000) {
      return `R$ ${(revenue / 1000000).toFixed(1)}M`;
    }
    if (revenue >= 1000) {
      return `R$ ${(revenue / 1000).toFixed(0)}K`;
    }
    return formatPrice(revenue);
  };
  
  const handleExportCSV = () => {
    if (data.bestSellers.length === 0) return;
    
    const csvContent = [
      'Posição,Título,Preço,Vendidos,Faturamento Est.,Link',
      ...data.bestSellers.map((item, i) => 
        `${i + 1},"${item.title || ''}",${item.price || ''},${item.sold_quantity || ''},${item.estimated_revenue || ''},"${item.permalink || ''}"`
      ),
    ].join('\n');
    
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `best-sellers-${state.categoryName}-${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
  };
  
  // Loading state
  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Trophy className="h-5 w-5 text-amber-500" />
            Mais Vendidos da Categoria
          </CardTitle>
          <CardDescription>Ranking público do Mercado Livre</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="flex items-center gap-3">
                <Skeleton className="h-12 w-12 rounded" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-3 w-1/2" />
                </div>
                <Skeleton className="h-4 w-20" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }
  
  // No category
  if (!hasCategory) {
    return (
      <Card className="opacity-60">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Trophy className="h-5 w-5 text-amber-500" />
            Mais Vendidos da Categoria
          </CardTitle>
          <CardDescription>Selecione uma categoria</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-muted-foreground">
            <Trophy className="h-12 w-12 mx-auto mb-3 opacity-30" />
            <p>Aguardando seleção de categoria</p>
          </div>
        </CardContent>
      </Card>
    );
  }
  
  // Error state
  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Trophy className="h-5 w-5 text-amber-500" />
            Mais Vendidos da Categoria
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8">
            <AlertCircle className="h-12 w-12 mx-auto mb-3 text-amber-500" />
            <p className="text-muted-foreground">
              Ranking temporariamente indisponível. Tente novamente.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }
  
  // Empty state - auto-trigger collect if no data
  useEffect(() => {
    if (hasCategory && isEmpty && !isLoading && !isCollecting && enrichedItems.length === 0) {
      // Auto-trigger collection after 1 second delay
      const timer = setTimeout(() => {
        console.log('[BestSellersSection] Auto-triggering collection');
        onCollect();
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [hasCategory, isEmpty, isLoading, isCollecting, enrichedItems.length, onCollect]);

  // Empty state with loading indicator
  if ((isEmpty || enrichedItems.length === 0) && !isCollecting) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Trophy className="h-5 w-5 text-amber-500" />
            Mais Vendidos da Categoria
          </CardTitle>
          <CardDescription>Ranking público do Mercado Livre</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8">
            <Trophy className="h-12 w-12 mx-auto mb-3 text-amber-500 opacity-30" />
            <p className="text-muted-foreground mb-4">
              Carregando ranking da categoria...
            </p>
            <Button 
              variant="outline" 
              onClick={onCollect}
              disabled={isCollecting}
            >
              <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
              Buscando dados...
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }
  
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="flex items-center gap-2">
            <Trophy className="h-5 w-5 text-amber-500" />
            Mais Vendidos da Categoria
            {isEnriching && (
              <span className="text-xs text-muted-foreground font-normal">(carregando detalhes...)</span>
            )}
          </CardTitle>
          <CardDescription>
            Top {enrichedItems.length} produtos por vendas
            {snapshotDate && (
              <span className="ml-2 text-xs">
                • Atualizado em {new Date(snapshotDate).toLocaleDateString('pt-BR')}
              </span>
            )}
          </CardDescription>
        </div>
        <div className="flex gap-2">
          <Button 
            variant="outline" 
            size="sm" 
            onClick={onCollect}
            disabled={isCollecting}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${isCollecting ? 'animate-spin' : ''}`} />
            Atualizar
          </Button>
          <Button variant="outline" size="sm" onClick={handleExportCSV}>
            <Download className="h-4 w-4 mr-2" />
            CSV
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[50px]">#</TableHead>
              <TableHead>Produto</TableHead>
              <TableHead className="text-right">Preço</TableHead>
              <TableHead className="text-right">Vendidos</TableHead>
              <TableHead className="text-right">Fat. Est.</TableHead>
              <TableHead className="w-[60px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {enrichedItems.map((item, index) => (
              <TableRow key={item.item_id}>
                <TableCell>
                  <Badge variant={index < 3 ? 'default' : 'outline'}>
                    {index + 1}
                  </Badge>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-3">
                    {item.thumbnail ? (
                      <img 
                        src={item.thumbnail} 
                        alt="" 
                        className="h-10 w-10 rounded object-cover bg-muted"
                        onError={(e) => {
                          // Fallback if image fails to load
                          (e.target as HTMLImageElement).style.display = 'none';
                        }}
                      />
                    ) : (
                      <div className="h-10 w-10 rounded bg-muted flex items-center justify-center">
                        <Trophy className="h-4 w-4 text-muted-foreground/50" />
                      </div>
                    )}
                    <span className="font-medium line-clamp-2 text-sm">
                      {item.title || `Produto #${item.item_id.slice(-6)}`}
                    </span>
                  </div>
                </TableCell>
                <TableCell className="text-right font-medium">
                  {formatPrice(item.price)}
                </TableCell>
                <TableCell className="text-right">
                  {item.sold_quantity?.toLocaleString('pt-BR') || '—'}
                </TableCell>
                <TableCell className="text-right text-muted-foreground">
                  {formatRevenue(item.estimated_revenue)}
                </TableCell>
                <TableCell>
                  {item.permalink && (
                    <a 
                      href={item.permalink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary hover:text-primary/80"
                    >
                      <ExternalLink className="h-4 w-4" />
                    </a>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        
        {/* Footer note */}
        <div className="mt-4 flex items-start gap-2 text-xs text-muted-foreground p-3 bg-muted/50 rounded-lg">
          <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
          <p>Ranking baseado em dados públicos do Mercado Livre.</p>
        </div>
      </CardContent>
    </Card>
  );
}
