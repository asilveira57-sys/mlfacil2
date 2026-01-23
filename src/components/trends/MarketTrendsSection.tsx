import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { TrendingUp, ExternalLink, AlertCircle } from 'lucide-react';
import { useTrends } from '@/contexts/TrendsContext';

// ============================================================
// MARKET TRENDS SECTION
// Objetivo: base do módulo, sempre disponível
// ============================================================

export function MarketTrendsSection() {
  const { state, hasCategory } = useTrends();
  const { data, ui } = state;
  
  const isLoading = ui.loadingFlags.marketTrends;
  const isEmpty = ui.emptyFlags.marketTrends;
  const error = ui.errors.marketTrends;
  
  // Loading state
  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-primary" />
            Tendências de Mercado
          </CardTitle>
          <CardDescription>Termos em destaque na categoria</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="flex items-center gap-3">
                <Skeleton className="h-6 w-6 rounded-full" />
                <Skeleton className="h-4 flex-1" />
                <Skeleton className="h-4 w-16" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }
  
  // No category selected
  if (!hasCategory) {
    return (
      <Card className="opacity-60">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-primary" />
            Tendências de Mercado
          </CardTitle>
          <CardDescription>Selecione uma categoria para ver tendências</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-muted-foreground">
            <TrendingUp className="h-12 w-12 mx-auto mb-3 opacity-30" />
            <p>Aguardando seleção de categoria</p>
          </div>
        </CardContent>
      </Card>
    );
  }
  
  // Error state - NO AUTOMATIC RETRY
  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-primary" />
            Tendências de Mercado
          </CardTitle>
          <CardDescription>Termos em destaque na categoria</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8">
            <AlertCircle className="h-12 w-12 mx-auto mb-3 text-amber-500" />
            <p className="text-muted-foreground mb-2">
              {error === 'RATE_LIMIT' 
                ? 'Muitas requisições. Aguarde alguns minutos.'
                : error === 'FORBIDDEN'
                  ? 'Dados temporariamente indisponíveis.'
                  : 'Dados temporariamente indisponíveis.'}
            </p>
            <p className="text-xs text-muted-foreground">
              Use o botão "Atualizar" para tentar novamente
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }
  
  // Empty state
  if (isEmpty || data.marketTrends.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-primary" />
            Tendências de Mercado
          </CardTitle>
          <CardDescription>Termos em destaque na categoria</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-muted-foreground">
            <TrendingUp className="h-12 w-12 mx-auto mb-3 opacity-30" />
            <p>Nenhuma tendência pública retornada para os filtros atuais.</p>
            <p className="text-xs mt-2">Tente outro período ou categoria.</p>
          </div>
        </CardContent>
      </Card>
    );
  }
  
  // Normal render
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <TrendingUp className="h-5 w-5 text-primary" />
          Tendências de Mercado
        </CardTitle>
        <CardDescription>
          {data.marketTrends.length} termos em destaque na categoria
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {data.marketTrends.slice(0, 10).map((trend, index) => (
            <div 
              key={index} 
              className="flex items-center justify-between p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors"
            >
              <div className="flex items-center gap-3">
                <Badge variant="outline" className="w-8 h-8 rounded-full flex items-center justify-center">
                  {index + 1}
                </Badge>
                <span className="font-medium">{trend.keyword}</span>
              </div>
              
              {trend.url && (
                <a 
                  href={trend.url} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-primary hover:underline flex items-center gap-1 text-sm"
                >
                  Ver resultados
                  <ExternalLink className="h-3 w-3" />
                </a>
              )}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
