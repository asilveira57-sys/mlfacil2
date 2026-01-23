import { Package, ExternalLink, Download, Info, RefreshCw } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import { HighlightItem } from '@/hooks/useTrendsApi';
import { toast } from 'sonner';

interface TopSellersMarketCardProps {
  items: HighlightItem[];
  snapshotDate?: string | null;
  isLoading: boolean;
  categoryLabel: string;
  onCollect?: () => void;
  isCollecting?: boolean;
  showCollectButton?: boolean;
}

function exportHighlightsCSV(items: HighlightItem[], categoryLabel: string, date: string) {
  const header = 'Posição,Título,Preço,Quantidade Vendida,Link\n';
  const rows = items.map((item) => 
    `${item.rank},"${(item.title || item.item_id).replace(/"/g, '""')}",${item.price || ''},${item.sold_quantity || ''},${item.permalink || ''}`
  ).join('\n');
  
  const blob = new Blob([header + rows], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `mais-vendidos-${categoryLabel.replace(/\s+/g, '-').toLowerCase()}-${date}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function TopSellersMarketCard({
  items,
  snapshotDate,
  isLoading,
  categoryLabel,
  onCollect,
  isCollecting = false,
  showCollectButton = false,
}: TopSellersMarketCardProps) {
  const handleExport = () => {
    if (items.length > 0) {
      const date = snapshotDate || new Date().toISOString().split('T')[0];
      exportHighlightsCSV(items, categoryLabel, date);
      toast.success('CSV de mais vendidos exportado!');
    }
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-lg">
            <Package className="h-5 w-5 text-green-500" />
            Produtos Mais Vendidos
          </div>
          <div className="flex items-center gap-2">
            {snapshotDate && (
              <Badge variant="outline" className="text-xs font-normal">
                {new Date(snapshotDate + 'T00:00:00').toLocaleDateString('pt-BR')}
              </Badge>
            )}
            {items.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleExport}
                className="h-7 text-xs"
              >
                <Download className="h-3 w-3 mr-1" />
                CSV
              </Button>
            )}
            {showCollectButton && onCollect && (
              <Button 
                size="sm" 
                variant="outline" 
                onClick={onCollect}
                disabled={isCollecting}
                className="h-7 text-xs"
              >
                <RefreshCw className={`h-3 w-3 mr-1 ${isCollecting ? 'animate-spin' : ''}`} />
                Coletar
              </Button>
            )}
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3, 4, 5].map(i => <Skeleton key={i} className="h-16 w-full" />)}
          </div>
        ) : items.length > 0 ? (
          <>
            <ScrollArea className="h-[350px]">
              <div className="space-y-2 pr-4">
                {items.map((item) => (
                  <div 
                    key={item.item_id} 
                    className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg hover:bg-muted transition-colors"
                  >
                    <span className="text-lg font-bold text-green-500 w-6 text-center shrink-0">
                      {item.rank}
                    </span>
                    {item.thumbnail ? (
                      <img 
                        src={item.thumbnail} 
                        alt="" 
                        className="w-12 h-12 rounded object-cover border border-border shrink-0"
                      />
                    ) : (
                      <div className="w-12 h-12 rounded bg-muted flex items-center justify-center border border-border shrink-0">
                        <Package className="h-5 w-5 text-muted-foreground" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium truncate">{item.title || item.item_id}</p>
                        {item.entity_type === 'PRODUCT' && (
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-blue-500/10 text-blue-600 border-blue-200 shrink-0">
                            Catálogo
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        {item.price ? (
                          <Badge variant="outline" className="text-xs">
                            R$ {item.price.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                          </Badge>
                        ) : (
                          <span className="text-xs text-muted-foreground italic">sem preço</span>
                        )}
                        {item.sold_quantity && item.sold_quantity > 0 ? (
                          <span className="text-xs text-muted-foreground">
                            {item.sold_quantity.toLocaleString('pt-BR')} vendidos
                          </span>
                        ) : null}
                        {item.estimated_revenue && item.estimated_revenue > 0 && (
                          <span className="text-xs text-green-600">
                            ~R$ {(item.estimated_revenue / 1000).toFixed(0)}k estimado
                          </span>
                        )}
                      </div>
                    </div>
                    {item.permalink && (
                      <a
                        href={item.permalink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-muted-foreground hover:text-primary shrink-0"
                      >
                        <ExternalLink className="h-4 w-4" />
                      </a>
                    )}
                  </div>
                ))}
              </div>
            </ScrollArea>
            <div className="mt-3 p-2 bg-muted/30 rounded text-xs text-muted-foreground flex items-start gap-2">
              <Info className="h-3 w-3 mt-0.5 shrink-0" />
              <span>Ranking público da categoria, não relacionado à sua conta.</span>
            </div>
          </>
        ) : (
          <div className="text-center py-8">
            <Package className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">Nenhum produto encontrado</p>
            {showCollectButton && onCollect && (
              <Button 
                size="sm" 
                variant="outline" 
                onClick={onCollect}
                disabled={isCollecting}
                className="mt-3"
              >
                <RefreshCw className={`h-3 w-3 mr-1 ${isCollecting ? 'animate-spin' : ''}`} />
                Coletar Dados
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
