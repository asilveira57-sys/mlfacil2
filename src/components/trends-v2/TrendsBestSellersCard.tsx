import { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Trophy, ExternalLink, Download, Info, Package, Loader2 } from 'lucide-react';
import { useCatalogEnrichment, EnrichedItem } from '@/hooks/useCatalogEnrichment';

// ============================================================
// TRENDS BEST SELLERS CARD - V2
// Shows ranking with progressive catalog enrichment
// Never shows infinite loading - uses "—" for unavailable data
// ============================================================

interface HighlightItem {
  item_id: string;
  rank: number;
  title: string | null;
  thumbnail: string | null;
  price: number | null;
  sold_quantity: number | null;
  permalink: string | null;
  estimated_revenue?: number | null;
  entity_type?: string;
}

interface TrendsBestSellersCardProps {
  items: HighlightItem[];
  isLoading: boolean;
  snapshotDate: string | null;
  categoryName: string;
  selectedKeyword: string | null;
}

export function TrendsBestSellersCard({
  items,
  isLoading,
  snapshotDate,
  categoryName,
  selectedKeyword,
}: TrendsBestSellersCardProps) {
  const { enrichItems, enrichmentProgress } = useCatalogEnrichment();
  const [enrichedItems, setEnrichedItems] = useState<EnrichedItem[]>([]);
  const [isEnriching, setIsEnriching] = useState(false);

  // Enrich items when they change
  useEffect(() => {
    if (!items || items.length === 0) {
      setEnrichedItems([]);
      return;
    }

    let cancelled = false;
    
    const doEnrich = async () => {
      setIsEnriching(true);
      try {
        const enriched = await enrichItems(items);
        if (!cancelled) {
          setEnrichedItems(enriched);
        }
      } catch (err) {
        console.error('[TrendsBestSellersCard] Enrichment error:', err);
        // Fall back to raw items
        if (!cancelled) {
          setEnrichedItems(items.map(item => ({
            ...item,
            is_catalog: item.item_id.startsWith('MLBU'),
            enrichment_status: 'unavailable' as const,
            estimated_revenue: item.estimated_revenue ?? null,
          })));
        }
      } finally {
        if (!cancelled) {
          setIsEnriching(false);
        }
      }
    };

    doEnrich();

    return () => {
      cancelled = true;
    };
  }, [items, enrichItems]);

  // Filter items by selected keyword if any
  const filteredItems = useMemo(() => {
    if (!selectedKeyword) return enrichedItems;
    return enrichedItems.filter(item => 
      item.title?.toLowerCase().includes(selectedKeyword.toLowerCase())
    );
  }, [enrichedItems, selectedKeyword]);
  
  const displayItems = filteredItems.slice(0, 10);
  
  const formatPrice = (price: number | null) => {
    if (price === null || price === undefined) return '—';
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(price);
  };
  
  const formatRevenue = (revenue: number | null | undefined) => {
    if (revenue === null || revenue === undefined) return '—';
    if (revenue >= 1000000) return `R$ ${(revenue / 1000000).toFixed(1)}M`;
    if (revenue >= 1000) return `R$ ${(revenue / 1000).toFixed(0)}K`;
    return formatPrice(revenue);
  };

  const formatSoldQuantity = (qty: number | null) => {
    if (qty === null || qty === undefined) return '—';
    return qty.toLocaleString('pt-BR');
  };
  
  const handleExportCSV = () => {
    if (displayItems.length === 0) return;
    
    const csvContent = [
      'Posição,Título,Preço,Vendidos,Faturamento Est.,Link',
      ...displayItems.map((item, i) => 
        `${i + 1},"${item.title || 'Produto sem título'}",${item.price || ''},${item.sold_quantity || ''},${item.estimated_revenue || ''},"${item.permalink || ''}"`
      ),
    ].join('\n');
    
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `ranking-${categoryName.replace(/\s+/g, '-').toLowerCase()}-${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
  };

  // Get display title - never show raw MLBU ID
  const getDisplayTitle = (item: EnrichedItem, index: number) => {
    if (item.title && !item.title.startsWith('[Catálogo]') && !item.title.startsWith('MLBU')) {
      return item.title;
    }
    if (item.is_catalog) {
      return `Produto catálogo #${index + 1}`;
    }
    return `Produto #${item.item_id.slice(-6)}`;
  };

  // Loading state - local skeleton
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
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3">
                <Skeleton className="h-10 w-10 rounded" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-3 w-1/2" />
                </div>
                <Skeleton className="h-4 w-16" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  // Empty state
  if (displayItems.length === 0 && !isEnriching) {
    return (
      <Card className="opacity-60">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Trophy className="h-5 w-5 text-amber-500" />
            Mais Vendidos da Categoria
          </CardTitle>
          <CardDescription>
            {selectedKeyword 
              ? `Nenhum resultado para "${selectedKeyword}"`
              : 'Aguardando dados do ranking'
            }
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-muted-foreground">
            <Trophy className="h-12 w-12 mx-auto mb-3 opacity-30" />
            <p className="text-sm">
              {selectedKeyword
                ? 'Tente outro termo de busca'
                : 'Selecione uma categoria para ver o ranking'
              }
            </p>
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
            {selectedKeyword && (
              <Badge variant="secondary" className="ml-2 text-xs">
                Filtrado: {selectedKeyword}
              </Badge>
            )}
            {isEnriching && enrichmentProgress.total > 0 && (
              <Badge variant="outline" className="ml-2 text-xs gap-1">
                <Loader2 className="h-3 w-3 animate-spin" />
                {enrichmentProgress.completed}/{enrichmentProgress.total}
              </Badge>
            )}
          </CardTitle>
          <CardDescription>
            Top {displayItems.length} produtos por vendas
            {snapshotDate && (
              <span className="ml-2 text-xs">
                • {new Date(snapshotDate).toLocaleDateString('pt-BR')}
              </span>
            )}
          </CardDescription>
        </div>
        <Button variant="outline" size="sm" onClick={handleExportCSV} disabled={displayItems.length === 0}>
          <Download className="h-4 w-4 mr-2" />
          CSV
        </Button>
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
              <TableHead className="w-[50px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {displayItems.map((item, index) => (
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
                          (e.target as HTMLImageElement).style.display = 'none';
                          (e.target as HTMLImageElement).nextElementSibling?.classList.remove('hidden');
                        }}
                      />
                    ) : null}
                    {/* Fallback placeholder - shown when no thumbnail or on error */}
                    <div className={`h-10 w-10 rounded bg-muted flex items-center justify-center ${item.thumbnail ? 'hidden' : ''}`}>
                      {item.is_catalog ? (
                        <Package className="h-4 w-4 text-muted-foreground/50" />
                      ) : (
                        <Trophy className="h-4 w-4 text-muted-foreground/50" />
                      )}
                    </div>
                    <div className="flex flex-col">
                      <span className="font-medium line-clamp-2 text-sm">
                        {getDisplayTitle(item, index)}
                      </span>
                      {item.is_catalog && (
                        <Badge variant="outline" className="w-fit text-[10px] px-1.5 py-0 mt-0.5 bg-primary/10 text-primary border-primary/20">
                          Catálogo
                        </Badge>
                      )}
                    </div>
                  </div>
                </TableCell>
                <TableCell className="text-right font-medium">
                  {formatPrice(item.price)}
                </TableCell>
                <TableCell className="text-right">
                  {formatSoldQuantity(item.sold_quantity)}
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
          <p>
            Ranking baseado em dados públicos do Mercado Livre.
            {enrichedItems.some(i => i.is_catalog) && (
              <span className="ml-1">
                Itens de catálogo podem ter informações de preço e vendas limitadas.
              </span>
            )}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
