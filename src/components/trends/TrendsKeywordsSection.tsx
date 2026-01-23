import { Tag, ExternalLink, TrendingUp, TrendingDown, Minus, AlertCircle, Download } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import { TrendItem } from '@/hooks/useTrendsApi';
import { DataState } from '@/hooks/useCategoryEligibility';
import { toast } from 'sonner';

interface TrendsKeywordsSectionProps {
  keywords: TrendItem[];
  isLoading: boolean;
  dataState: DataState;
  snapshotDate?: string | null;
  categoryLabel: string;
  hasCategory: boolean;
}

function exportKeywordsCSV(keywords: TrendItem[], categoryLabel: string, date: string) {
  const header = 'Posição,Palavra-chave,URL\n';
  const rows = keywords.map((k, idx) => 
    `${idx + 1},"${k.keyword.replace(/"/g, '""')}",${k.url || ''}`
  ).join('\n');
  
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
function Placeholder({ type, message }: { type: 'loading' | 'empty' | 'blocked'; message: string }) {
  if (type === 'loading') {
    return (
      <div className="space-y-2">
        {[1, 2, 3, 4, 5, 6].map(i => (
          <Skeleton key={i} className="h-10 w-full" />
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center py-8 text-center">
      {type === 'blocked' ? (
        <AlertCircle className="h-8 w-8 text-amber-500 mb-3" />
      ) : (
        <Tag className="h-8 w-8 text-muted-foreground mb-3" />
      )}
      <p className="text-sm text-muted-foreground max-w-xs">{message}</p>
    </div>
  );
}

export function TrendsKeywordsSection({
  keywords,
  isLoading,
  dataState,
  snapshotDate,
  categoryLabel,
  hasCategory,
}: TrendsKeywordsSectionProps) {
  const handleExport = () => {
    if (keywords.length > 0) {
      const date = snapshotDate || new Date().toISOString().split('T')[0];
      exportKeywordsCSV(keywords, categoryLabel, date);
      toast.success('CSV de palavras-chave exportado!');
    }
  };

  // Group keywords by "theme" (simplified - first 2 words or similar pattern)
  const extractThemes = (items: TrendItem[]): string[] => {
    const themes = new Map<string, number>();
    items.forEach(item => {
      const words = item.keyword.toLowerCase().split(' ');
      if (words.length >= 2) {
        const theme = words.slice(0, 2).join(' ');
        themes.set(theme, (themes.get(theme) || 0) + 1);
      }
    });
    return Array.from(themes.entries())
      .filter(([_, count]) => count >= 2)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([theme]) => theme);
  };

  const themes = extractThemes(keywords);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Left Column: Keywords List */}
      <Card className="lg:col-span-2">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-lg">
              <Tag className="h-5 w-5 text-primary" />
              Palavras-chave em Alta
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
            <Placeholder type="loading" message="" />
          ) : !hasCategory ? (
            <Placeholder 
              type="empty" 
              message="Selecione uma categoria para ver tendências." 
            />
          ) : keywords.length === 0 ? (
            <Placeholder 
              type="empty" 
              message="Nenhuma tendência pública retornada para os filtros atuais." 
            />
          ) : (
            <ScrollArea className="h-[320px]">
              <div className="space-y-1 pr-4">
                {keywords.map((trend, idx) => (
                  <div 
                    key={idx} 
                    className="flex items-center gap-3 p-2 bg-muted/50 rounded-lg hover:bg-muted transition-colors group"
                  >
                    <span className="text-sm font-bold text-primary w-6 text-center shrink-0">
                      {idx + 1}
                    </span>
                    <span className="flex-1 text-sm truncate">{trend.keyword}</span>
                    {trend.url && (
                      <a
                        href={trend.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-primary hover:underline opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        Ver resultados
                      </a>
                    )}
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>

      {/* Right Column: Themes/Topics */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-lg">
            <TrendingUp className="h-5 w-5 text-amber-500" />
            Tópicos/Intenção
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex flex-wrap gap-2">
              {[1, 2, 3, 4, 5, 6].map(i => (
                <Skeleton key={i} className="h-8 w-20" />
              ))}
            </div>
          ) : themes.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {themes.map((theme, idx) => (
                <Badge 
                  key={idx} 
                  variant="secondary"
                  className="text-sm py-1.5 px-3 capitalize cursor-pointer hover:bg-secondary/80"
                >
                  {theme}
                </Badge>
              ))}
            </div>
          ) : (
            <div className="text-center py-6">
              <p className="text-sm text-muted-foreground">
                {hasCategory 
                  ? 'Tópicos serão extraídos das tendências.'
                  : 'Selecione uma categoria.'
                }
              </p>
            </div>
          )}
          
          {themes.length > 0 && (
            <p className="text-xs text-muted-foreground mt-4">
              Temas mais frequentes nas buscas
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
