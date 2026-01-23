/**
 * Component: TrendingKeywordsTable
 * 
 * Props:
 * - categoryId
 * - periodo
 * 
 * Colunas:
 * - Palavra-chave
 * - Tendência
 * - Tipo de funil
 * 
 * Proteção:
 * - Debounce mínimo de busca
 * - Cache 24h por categoria
 * 
 * Regra:
 * - Nunca vincular isso a performance do seller, apenas a mercado.
 */

import { Tag, ExternalLink, TrendingUp, TrendingDown, Minus, Download } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import { TrendItem } from '@/hooks/useTrendsApi';
import { toast } from 'sonner';

interface TrendingKeywordsTableProps {
  categoryId: string | null;
  periodo: number;
  keywords: TrendItem[];
  isLoading: boolean;
  snapshotDate?: string | null;
  categoryLabel: string;
}

// Funnel type determination based on keyword characteristics
function getFunnelType(keyword: string): { type: 'top' | 'middle' | 'bottom'; label: string } {
  const lowerKeyword = keyword.toLowerCase();
  
  // Bottom of funnel - high purchase intent
  if (
    lowerKeyword.includes('comprar') ||
    lowerKeyword.includes('preço') ||
    lowerKeyword.includes('barato') ||
    lowerKeyword.includes('promoção') ||
    lowerKeyword.includes('frete grátis') ||
    lowerKeyword.includes('original') ||
    /\d+ml|\d+g|\d+w|\d+v/i.test(lowerKeyword) // Specific measurements
  ) {
    return { type: 'bottom', label: 'Fundo' };
  }
  
  // Middle of funnel - comparison/research
  if (
    lowerKeyword.includes('melhor') ||
    lowerKeyword.includes('vs') ||
    lowerKeyword.includes('qual') ||
    lowerKeyword.includes('diferença') ||
    lowerKeyword.includes('review') ||
    lowerKeyword.includes('avaliação')
  ) {
    return { type: 'middle', label: 'Meio' };
  }
  
  // Top of funnel - discovery
  return { type: 'top', label: 'Topo' };
}

function exportKeywordsCSV(keywords: TrendItem[], categoryLabel: string, date: string) {
  const header = 'Posição,Palavra-chave,Tipo de Funil,URL\n';
  const rows = keywords.map((k, idx) => {
    const funnel = getFunnelType(k.keyword);
    return `${idx + 1},"${k.keyword.replace(/"/g, '""')}",${funnel.label},${k.url || ''}`;
  }).join('\n');
  
  const blob = new Blob([header + rows], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `palavras-chave-${categoryLabel.replace(/\s+/g, '-').toLowerCase()}-${date}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// Placeholder component
function Placeholder({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-8 text-center">
      <Tag className="h-8 w-8 text-muted-foreground mb-3" />
      <p className="text-sm text-muted-foreground max-w-xs">{message}</p>
    </div>
  );
}

export function TrendingKeywordsTable({
  categoryId,
  periodo,
  keywords,
  isLoading,
  snapshotDate,
  categoryLabel,
}: TrendingKeywordsTableProps) {
  const handleExport = () => {
    if (keywords.length > 0) {
      const date = snapshotDate || new Date().toISOString().split('T')[0];
      exportKeywordsCSV(keywords, categoryLabel, date);
      toast.success('CSV de palavras-chave exportado!');
    }
  };

  // No category selected
  if (!categoryId) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Tag className="h-5 w-5 text-primary" />
            Palavras-chave em Tendência
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Placeholder message="Selecione uma categoria para ver tendências." />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-lg">
            <Tag className="h-5 w-5 text-primary" />
            Palavras-chave em Tendência
          </div>
          <div className="flex items-center gap-2">
            {snapshotDate && (
              <Badge variant="outline" className="text-xs font-normal">
                {new Date(snapshotDate + 'T00:00:00').toLocaleDateString('pt-BR')}
              </Badge>
            )}
            {keywords.length > 0 && (
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
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-2">
            {[1, 2, 3, 4, 5, 6, 7, 8].map(i => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : keywords.length === 0 ? (
          <Placeholder message="Nenhuma tendência pública retornada para os filtros atuais." />
        ) : (
          <ScrollArea className="h-[350px]">
            <div className="space-y-1 pr-4">
              {keywords.map((trend, idx) => {
                const funnel = getFunnelType(trend.keyword);
                const funnelColors = {
                  top: 'bg-blue-500/10 text-blue-600 border-blue-200',
                  middle: 'bg-amber-500/10 text-amber-600 border-amber-200',
                  bottom: 'bg-green-500/10 text-green-600 border-green-200',
                };
                
                return (
                  <div 
                    key={idx} 
                    className="flex items-center gap-3 p-2 bg-muted/50 rounded-lg hover:bg-muted transition-colors group"
                  >
                    <span className="text-sm font-bold text-primary w-6 text-center shrink-0">
                      {idx + 1}
                    </span>
                    <span className="flex-1 text-sm truncate">{trend.keyword}</span>
                    <div className="flex items-center gap-1 shrink-0">
                      <TrendingUp className="h-3 w-3 text-green-500" />
                    </div>
                    <Badge 
                      variant="outline" 
                      className={`text-[10px] px-1.5 py-0 shrink-0 ${funnelColors[funnel.type]}`}
                    >
                      {funnel.label}
                    </Badge>
                    {trend.url && (
                      <a
                        href={trend.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-primary hover:underline opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                      >
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    )}
                  </div>
                );
              })}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}
