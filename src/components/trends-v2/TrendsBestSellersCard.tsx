import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Trophy, ExternalLink, Download, Info } from 'lucide-react';

// ============================================================
// TRENDS BEST SELLERS CARD
// Shows ranking with cache-first loading
// Missing data shows "—" instead of infinite loading
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
  // Filter items by selected keyword if any
  const filteredItems = selectedKeyword
    ? items.filter(item => 
        item.title?.toLowerCase().includes(selectedKeyword.toLowerCase())
      )
    : items;
  
  const displayItems = filteredItems.slice(0, 10);
  
  const formatPrice = (price: number | null) => {
    if (!price) return '—';
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(price);
  };
  
  const formatRevenue = (revenue: number | null | undefined) => {
    if (!revenue) return '—';
    if (revenue >= 1000000) return `R$ ${(revenue / 1000000).toFixed(1)}M`;
    if (revenue >= 1000) return `R$ ${(revenue / 1000).toFixed(0)}K`;
    return formatPrice(revenue);
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
    link.download = `ranking-${categoryName}-${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
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
  if (displayItems.length === 0) {
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
        <Button variant="outline" size="sm" onClick={handleExportCSV}>
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
