import { useState, useEffect, useMemo, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Trophy, ExternalLink, Download, Info, Package, Loader2, AlertCircle, RefreshCw, ChevronDown, Bug } from 'lucide-react';
import { useCatalogEnrichment, EnrichedItem } from '@/hooks/useCatalogEnrichment';

// ============================================================
// TRENDS BEST SELLERS CARD - V2.1
// - 12s timeout with error state + retry button
// - Debug panel (collapsed)
// - Empty/error/loading differentiation
// - Period fallback suggestion
// ============================================================

const LOADING_TIMEOUT_MS = 12000;

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
  categoryId: string | null;
  selectedPeriod: number;
  selectedKeyword: string | null;
  onRetry?: () => void;
  onPeriodFallback?: (period: number) => void;
  debugInfo?: {
    endpoint?: string;
    statusCode?: number;
    responseSize?: number;
    emptyReason?: string;
  };
}

export function TrendsBestSellersCard({
  items,
  isLoading,
  snapshotDate,
  categoryName,
  categoryId,
  selectedPeriod,
  selectedKeyword,
  onRetry,
  onPeriodFallback,
  debugInfo,
}: TrendsBestSellersCardProps) {
  const { enrichItems, enrichmentProgress } = useCatalogEnrichment();
  const [enrichedItems, setEnrichedItems] = useState<EnrichedItem[]>([]);
  const [isEnriching, setIsEnriching] = useState(false);
  const [loadingTimedOut, setLoadingTimedOut] = useState(false);
  const [showDebug, setShowDebug] = useState(false);
  const [loadStartTime] = useState(() => Date.now());
  
  // Local debug state
  const [localDebug, setLocalDebug] = useState({
    itemsReceived: 0,
    enrichedCount: 0,
    categoryId: categoryId || 'none',
    period: selectedPeriod,
    loadDuration: 0,
  });

  // Timeout handling
  useEffect(() => {
    if (!isLoading) {
      setLoadingTimedOut(false);
      return;
    }
    
    const timer = setTimeout(() => {
      if (isLoading) {
        setLoadingTimedOut(true);
        console.warn('[TrendsBestSellersCard] Loading timeout after 12s', {
          categoryId,
          period: selectedPeriod,
        });
      }
    }, LOADING_TIMEOUT_MS);
    
    return () => clearTimeout(timer);
  }, [isLoading, categoryId, selectedPeriod]);

  // Enrich items when they change
  useEffect(() => {
    setLocalDebug(prev => ({
      ...prev,
      itemsReceived: items?.length || 0,
      categoryId: categoryId || 'none',
      period: selectedPeriod,
      loadDuration: Date.now() - loadStartTime,
    }));
    
    if (!items || items.length === 0) {
      setEnrichedItems([]);
      return;
    }

    let cancelled = false;
    
    const doEnrich = async () => {
      setIsEnriching(true);
      try {
        // Race enrichment against 5s timeout to prevent infinite "0/5" badge
        const enrichmentPromise = enrichItems(items);
        const timeoutPromise = new Promise<never>((_, reject) => 
          setTimeout(() => reject(new Error('Enrichment timeout (5s)')), 5000)
        );
        
        const enriched = await Promise.race([enrichmentPromise, timeoutPromise]);
        if (!cancelled) {
          setEnrichedItems(enriched);
          setLocalDebug(prev => ({
            ...prev,
            enrichedCount: enriched.length,
          }));
        }
      } catch (err) {
        console.warn('[TrendsBestSellersCard] Enrichment error/timeout:', err);
        if (!cancelled) {
          // Fallback: use raw items without enrichment
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
  }, [items, enrichItems, categoryId, selectedPeriod, loadStartTime]);

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

  const handleRetry = useCallback(() => {
    setLoadingTimedOut(false);
    onRetry?.();
  }, [onRetry]);

  const handlePeriodFallback = useCallback(() => {
    // Suggest shorter period: 90->30, 30->7
    const fallbackPeriod = selectedPeriod >= 90 ? 30 : 7;
    onPeriodFallback?.(fallbackPeriod);
  }, [selectedPeriod, onPeriodFallback]);

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

  // Debug panel component
  const DebugPanel = () => (
    <Collapsible open={showDebug} onOpenChange={setShowDebug} className="mt-2">
      <CollapsibleTrigger asChild>
        <Button variant="ghost" size="sm" className="w-full text-xs text-muted-foreground gap-1">
          <Bug className="h-3 w-3" />
          Debug Info
          <ChevronDown className={`h-3 w-3 transition-transform ${showDebug ? 'rotate-180' : ''}`} />
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent className="mt-2">
        <div className="text-xs font-mono bg-muted/50 p-3 rounded-lg space-y-1">
          <div><span className="text-muted-foreground">category_id:</span> {localDebug.categoryId}</div>
          <div><span className="text-muted-foreground">period:</span> {localDebug.period} days</div>
          <div><span className="text-muted-foreground">items_received:</span> {localDebug.itemsReceived}</div>
          <div><span className="text-muted-foreground">items_enriched:</span> {localDebug.enrichedCount}</div>
          <div><span className="text-muted-foreground">load_duration:</span> {localDebug.loadDuration}ms</div>
          {debugInfo?.endpoint && (
            <div><span className="text-muted-foreground">endpoint:</span> {debugInfo.endpoint}</div>
          )}
          {debugInfo?.statusCode && (
            <div><span className="text-muted-foreground">status:</span> {debugInfo.statusCode}</div>
          )}
          {debugInfo?.responseSize !== undefined && (
            <div><span className="text-muted-foreground">response_size:</span> {debugInfo.responseSize}</div>
          )}
          {debugInfo?.emptyReason && (
            <div><span className="text-muted-foreground">empty_reason:</span> {debugInfo.emptyReason}</div>
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );

  // Invalid category state
  if (!categoryId) {
    return (
      <Card className="opacity-60">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Trophy className="h-5 w-5 text-amber-500" />
            Mais Vendidos da Categoria
          </CardTitle>
          <CardDescription>Selecione uma categoria para ver o ranking</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-muted-foreground">
            <AlertCircle className="h-12 w-12 mx-auto mb-3 opacity-30" />
            <p className="text-sm">Categoria inválida ou não selecionada</p>
          </div>
          <DebugPanel />
        </CardContent>
      </Card>
    );
  }

  // Timeout error state
  if (loadingTimedOut) {
    return (
      <Card className="border-destructive/50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Trophy className="h-5 w-5 text-amber-500" />
            Mais Vendidos da Categoria
          </CardTitle>
          <CardDescription className="text-destructive">
            Tempo limite excedido ao carregar dados
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-center py-6 space-y-4">
            <AlertCircle className="h-12 w-12 mx-auto text-destructive/60" />
            <div>
              <p className="text-sm text-muted-foreground mb-4">
                O carregamento demorou mais que o esperado. Isso pode ocorrer por lentidão na conexão ou indisponibilidade temporária dos dados.
              </p>
              <div className="flex gap-2 justify-center">
                <Button variant="outline" size="sm" onClick={handleRetry}>
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Tentar novamente
                </Button>
                {selectedPeriod > 7 && (
                  <Button variant="ghost" size="sm" onClick={handlePeriodFallback}>
                    Ver últimos {selectedPeriod >= 90 ? 30 : 7} dias
                  </Button>
                )}
              </div>
            </div>
          </div>
          <DebugPanel />
        </CardContent>
      </Card>
    );
  }

  // Loading state - local skeleton
  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Trophy className="h-5 w-5 text-amber-500" />
            Mais Vendidos da Categoria
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground ml-2" />
          </CardTitle>
          <CardDescription>Carregando ranking público do Mercado Livre...</CardDescription>
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
          <DebugPanel />
        </CardContent>
      </Card>
    );
  }

  // Empty state (no data for this category/period)
  if (displayItems.length === 0 && !isEnriching) {
    return (
      <Card className="opacity-80">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Trophy className="h-5 w-5 text-amber-500" />
            Mais Vendidos da Categoria
          </CardTitle>
          <CardDescription>
            {selectedKeyword 
              ? `Nenhum resultado para "${selectedKeyword}"`
              : 'Sem ranking disponível para esta categoria no período selecionado'
            }
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-muted-foreground space-y-4">
            <Trophy className="h-12 w-12 mx-auto opacity-30" />
            <div>
              <p className="text-sm mb-4">
                {selectedKeyword
                  ? 'Tente outro termo de busca'
                  : 'Os dados de ranking podem não estar disponíveis para esta categoria. Tente outro período ou categoria.'
                }
              </p>
              <div className="flex gap-2 justify-center">
                {onRetry && (
                  <Button variant="outline" size="sm" onClick={handleRetry}>
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Atualizar
                  </Button>
                )}
                {!selectedKeyword && selectedPeriod > 7 && (
                  <Button variant="ghost" size="sm" onClick={handlePeriodFallback}>
                    Ver últimos {selectedPeriod >= 90 ? 30 : 7} dias
                  </Button>
                )}
              </div>
            </div>
          </div>
          <DebugPanel />
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
        
        <DebugPanel />
      </CardContent>
    </Card>
  );
}
