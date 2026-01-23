import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Search, ExternalLink, AlertCircle, Download } from 'lucide-react';
import { useTrends } from '@/contexts/TrendsContext';

// ============================================================
// KEYWORD TRENDS LIST
// Objetivo: Palavras-chave com classificação de funil
// ============================================================

const FUNNEL_CONFIG = {
  topo: { label: 'Topo', className: 'bg-blue-500/10 text-blue-600 border-blue-500/30' },
  meio: { label: 'Meio', className: 'bg-purple-500/10 text-purple-600 border-purple-500/30' },
  fundo: { label: 'Fundo', className: 'bg-green-500/10 text-green-600 border-green-500/30' },
};

export function KeywordTrendsList() {
  const { state, hasCategory } = useTrends();
  const { data, ui } = state;
  
  const isLoading = ui.loadingFlags.keywords;
  const isEmpty = ui.emptyFlags.keywords;
  const error = ui.errors.keywords;
  
  const handleExportCSV = () => {
    if (data.keywords.length === 0) return;
    
    const csvContent = [
      'Palavra-chave,Funil,URL',
      ...data.keywords.map(k => 
        `"${k.keyword}","${FUNNEL_CONFIG[k.funnel || 'topo'].label}","${k.url || ''}"`
      ),
    ].join('\n');
    
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `keywords-${state.categoryName}-${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
  };
  
  // Loading state
  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Search className="h-5 w-5 text-primary" />
            Palavras-chave em Tendência
          </CardTitle>
          <CardDescription>Classificadas por intenção de busca</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className="flex items-center gap-3">
                <Skeleton className="h-4 flex-1" />
                <Skeleton className="h-6 w-16" />
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
            <Search className="h-5 w-5 text-primary" />
            Palavras-chave em Tendência
          </CardTitle>
          <CardDescription>Selecione uma categoria</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-muted-foreground">
            <Search className="h-12 w-12 mx-auto mb-3 opacity-30" />
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
            <Search className="h-5 w-5 text-primary" />
            Palavras-chave em Tendência
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8">
            <AlertCircle className="h-12 w-12 mx-auto mb-3 text-amber-500" />
            <p className="text-muted-foreground">
              Dados temporariamente indisponíveis. Aguarde e tente novamente.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }
  
  // Empty state
  if (isEmpty || data.keywords.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Search className="h-5 w-5 text-primary" />
            Palavras-chave em Tendência
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-muted-foreground">
            <Search className="h-12 w-12 mx-auto mb-3 opacity-30" />
            <p>Nenhuma palavra-chave encontrada para esta categoria.</p>
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
            <Search className="h-5 w-5 text-primary" />
            Palavras-chave em Tendência
          </CardTitle>
          <CardDescription>
            {data.keywords.length} termos classificados por intenção
          </CardDescription>
        </div>
        <Button variant="outline" size="sm" onClick={handleExportCSV}>
          <Download className="h-4 w-4 mr-2" />
          Exportar CSV
        </Button>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Palavra-chave</TableHead>
              <TableHead className="w-[100px]">Funil</TableHead>
              <TableHead className="w-[120px] text-right">Ação</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.keywords.slice(0, 15).map((keyword, index) => {
              const funnel = keyword.funnel || 'topo';
              const funnelConfig = FUNNEL_CONFIG[funnel];
              
              return (
                <TableRow key={index}>
                  <TableCell className="font-medium">{keyword.keyword}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className={funnelConfig.className}>
                      {funnelConfig.label}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    {keyword.url ? (
                      <a 
                        href={keyword.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary hover:underline inline-flex items-center gap-1 text-sm"
                      >
                        Ver
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    ) : (
                      <span className="text-muted-foreground text-sm">—</span>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
