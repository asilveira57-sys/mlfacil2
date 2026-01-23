import { TrendingUp, TrendingDown, Minus, Info } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';

interface MarketOverviewCardProps {
  categoryId: string | null;
  categoryName: string;
  trendsCount: number;
  highlightsCount: number;
  snapshotDate?: string | null;
  isLoading: boolean;
}

export function MarketOverviewCard({
  categoryId,
  categoryName,
  trendsCount,
  highlightsCount,
  snapshotDate,
  isLoading,
}: MarketOverviewCardProps) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-lg">
          <TrendingUp className="h-5 w-5 text-primary" />
          Visão Geral do Mercado
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-8 w-3/4" />
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div className="p-3 bg-primary/5 rounded-lg">
                <p className="text-2xl font-bold text-primary">{trendsCount}</p>
                <p className="text-xs text-muted-foreground">Termos em alta</p>
              </div>
              <div className="p-3 bg-green-500/5 rounded-lg">
                <p className="text-2xl font-bold text-green-600">{highlightsCount}</p>
                <p className="text-xs text-muted-foreground">Produtos destaque</p>
              </div>
            </div>
            
            {snapshotDate && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Badge variant="outline" className="text-xs">
                  {new Date(snapshotDate + 'T00:00:00').toLocaleDateString('pt-BR')}
                </Badge>
                <span>Última atualização</span>
              </div>
            )}
            
            <div className="mt-4 p-2 bg-muted/30 rounded text-xs text-muted-foreground flex items-start gap-2">
              <Info className="h-3 w-3 mt-0.5 shrink-0" />
              <span>Dados de mercado não dependem do histórico da sua conta.</span>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
