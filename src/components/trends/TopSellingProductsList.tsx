/**
 * Component: TopSellingProductsList
 * 
 * Props:
 * - categoryId
 * - subcategoryId
 * 
 * Conteúdo:
 * - Ranking público
 * - Faixa de preço
 * - Tipo de anúncio
 * 
 * Nota fixa no rodapé:
 * - Ranking baseado em dados públicos do mercado
 */

import { Package, ExternalLink, Download, RefreshCw, Info } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import { HighlightItem } from '@/hooks/useTrendsApi';
import { toast } from 'sonner';

interface TopSellingProductsListProps {
  categoryId: string | null;
  subcategoryId: string | null;
  items: HighlightItem[];
  isLoading: boolean;
  snapshotDate?: string | null;
  categoryLabel: string;
  onCollect?: () => void;
  isCollecting?: boolean;
}

function exportHighlightsCSV(items: HighlightItem[], categoryLabel: string, date: string) {
  const header = 'Posição,Título,Preço,Quantidade Vendida,Tipo,Link\n';
  const rows = items.map((item) => 
    `${item.rank},"${(item.title || item.item_id).replace(/"/g, '""')}",${item.price || ''},${item.sold_quantity || ''},${item.entity_type || 'ITEM'},${item.permalink || ''}`
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

// Placeholder component
function Placeholder({ message, showCollect, onCollect, isCollecting }: { 
  message: string; 
  showCollect?: boolean;
  onCollect?: () => void;
  isCollecting?: boolean;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <Package className="h-10 w-10 text-muted-foreground mb-3" />
      <p className="text-sm text-muted-foreground max-w-xs mb-4">{message}</p>
      {showCollect && onCollect && (
        <Button 
          size="sm" 
          variant="outline" 
          onClick={onCollect}
          disabled={isCollecting}
        >
          <RefreshCw className={`h-3 w-3 mr-1 ${isCollecting ? 'animate-spin' : ''}`} />
          Coletar Dados
        </Button>
      )}
    </div>
  );
}

export function TopSellingProductsList({
  categoryId,
  subcategoryId,
  items,
  isLoading,
  snapshotDate,
  categoryLabel,
  onCollect,
  isCollecting = false,
}: TopSellingProductsListProps) {
  const handleExport = () => {
    if (items.length > 0) {
      const date = snapshotDate || new Date().toISOString().split('T')[0];
      exportHighlightsCSV(items, categoryLabel, date);
      toast.success('CSV de mais vendidos exportado!');
    }
  };

  // Limit to 10 items as specified
  const displayItems = items.slice(0, 10);

  // No category selected
  if (!categoryId) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Package className="h-5 w-5 text-green-500" />
            Mais Vendidos da Categoria
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Placeholder message="Selecione uma categoria para ver o ranking de produtos." />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-lg">
            <Package className="h-5 w-5 text-green-500" />
            Mais Vendidos da Categoria
            <Badge variant="outline" className="text-xs font-normal">
              Ranking Público
            </Badge>
          </div>
          <div className="flex items-center gap-2">
            {snapshotDate && (
              <Badge variant="outline" className="text-xs font-normal">
                {new Date(snapshotDate + 'T00:00:00').toLocaleDateString('pt-BR')}
              </Badge>
            )}
            {displayItems.length > 0 && (
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
            {onCollect && (
              <Button 
                size="sm" 
                variant="outline" 
                onClick={onCollect}
                disabled={isCollecting}
                className="h-7 text-xs"
              >
                <RefreshCw className={`h-3 w-3 mr-1 ${isCollecting ? 'animate-spin' : ''}`} />
                Atualizar
              </Button>
            )}
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(i => (
              <Skeleton key={i} className="h-14 w-full" />
            ))}
          </div>
        ) : displayItems.length === 0 ? (
          <Placeholder 
            message="Ranking não retornou itens para esta categoria." 
            showCollect={true}
            onCollect={onCollect}
            isCollecting={isCollecting}
          />
        ) : (
          <ScrollArea className="h-[450px]">
            <div className="space-y-2 pr-4">
              {displayItems.map((item, idx) => (
                <div 
                  key={item.item_id} 
                  className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg hover:bg-muted transition-colors"
                >
                  <span className="text-lg font-bold text-green-500 w-8 text-center shrink-0">
                    {item.rank || idx + 1}
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
                    <p className="text-sm font-medium truncate">{item.title || item.item_id}</p>
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      {item.price && (
                        <Badge variant="outline" className="text-xs">
                          R$ {item.price.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </Badge>
                      )}
                      {item.sold_quantity && item.sold_quantity > 0 && (
                        <span className="text-xs text-muted-foreground">
                          {item.sold_quantity.toLocaleString('pt-BR')} vendidos
                        </span>
                      )}
                      {item.entity_type === 'PRODUCT' && (
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-blue-500/10 text-blue-600 border-blue-200">
                          Catálogo
                        </Badge>
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
        )}
      </CardContent>
      
      {/* Fixed footer note */}
      <CardFooter className="pt-0">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Info className="h-3 w-3" />
          <span>Ranking público da categoria, não relacionado à sua conta.</span>
        </div>
      </CardFooter>
    </Card>
  );
}
