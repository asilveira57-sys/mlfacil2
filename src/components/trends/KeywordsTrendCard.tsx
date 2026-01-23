import { TrendingUp, Tag, ExternalLink, Download, Info } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { TrendItem } from '@/hooks/useTrendsApi';
import { toast } from 'sonner';

interface KeywordsTrendCardProps {
  keywords: TrendItem[];
  snapshotDate?: string | null;
  isLoading: boolean;
  categoryLabel: string;
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

export function KeywordsTrendCard({
  keywords,
  snapshotDate,
  isLoading,
  categoryLabel,
}: KeywordsTrendCardProps) {
  const handleExport = () => {
    if (keywords.length > 0) {
      const date = snapshotDate || new Date().toISOString().split('T')[0];
      exportKeywordsCSV(keywords, categoryLabel, date);
      toast.success('CSV de palavras-chave exportado!');
    }
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-lg">
            <Tag className="h-5 w-5 text-primary" />
            Termos Mais Buscados
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
            {[1, 2, 3, 4, 5].map(i => <Skeleton key={i} className="h-10 w-full" />)}
          </div>
        ) : keywords.length > 0 ? (
          <>
            <ScrollArea className="h-[300px]">
              <div className="space-y-1 pr-4">
                {keywords.map((trend, idx) => (
                  <div 
                    key={idx} 
                    className="flex items-center gap-3 p-2 bg-muted/50 rounded-lg hover:bg-muted transition-colors"
                  >
                    <span className="text-sm font-bold text-primary w-6 text-center">
                      {idx + 1}
                    </span>
                    <span className="flex-1 text-sm">{trend.keyword}</span>
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger>
                          <Badge 
                            variant="outline" 
                            className="text-[10px] px-1.5"
                          >
                            {idx < 5 ? 'Topo' : idx < 15 ? 'Meio' : 'Fundo'}
                          </Badge>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p className="text-xs">
                            {idx < 5 
                              ? 'Alto interesse - Topo de funil' 
                              : idx < 15 
                                ? 'Interesse moderado - Meio de funil'
                                : 'Interesse específico - Fundo de funil'
                            }
                          </p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                    {trend.url && (
                      <a
                        href={trend.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-muted-foreground hover:text-primary"
                      >
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    )}
                  </div>
                ))}
              </div>
            </ScrollArea>
            <div className="mt-3 p-2 bg-muted/30 rounded text-xs text-muted-foreground flex items-start gap-2">
              <Info className="h-3 w-3 mt-0.5 shrink-0" />
              <span>Dados de mercado público, não vinculados à sua performance.</span>
            </div>
          </>
        ) : (
          <div className="text-center py-8">
            <Tag className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">Nenhum termo encontrado</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
