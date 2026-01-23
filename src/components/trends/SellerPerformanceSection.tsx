import { useState } from 'react';
import { BarChart3, Target, TrendingUp, HelpCircle, Lock } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { CriteriaModal } from './CriteriaModal';
import { 
  CategoryEligibility, 
  DataState,
  hasPermission 
} from '@/hooks/useCategoryEligibility';

interface SellerPerformanceSectionProps {
  eligibility: CategoryEligibility | undefined;
  isLoading: boolean;
  sellerId: string | null;
  periodDays: number;
}

export function SellerPerformanceSection({
  eligibility,
  isLoading,
  sellerId,
  periodDays,
}: SellerPerformanceSectionProps) {
  const [showCriteria, setShowCriteria] = useState(false);

  const canFetch = hasPermission(eligibility, 'canFetchSellerPerformance');
  const dataState = eligibility?.dataState || 'DADOS_PUBLICOS_MERCADO';

  // Loading state
  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Target className="h-5 w-5 text-primary" />
            Metas e Desempenho
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
          </div>
        </CardContent>
      </Card>
    );
  }

  // Blocked state - show locked card
  if (!canFetch) {
    return (
      <>
        <Card className="relative overflow-hidden opacity-80">
          <div className="absolute inset-0 bg-background/40 backdrop-blur-[1px] z-10" />
          
          <CardHeader className="relative z-20">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-lg text-muted-foreground">
                <Target className="h-5 w-5" />
                Metas e Desempenho
              </CardTitle>
              <Badge variant="secondary" className="gap-1">
                <Lock className="h-3 w-3" />
                Bloqueado
              </Badge>
            </div>
          </CardHeader>
          
          <CardContent className="relative z-20">
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <Lock className="h-10 w-10 text-muted-foreground mb-4" />
              <p className="text-sm text-muted-foreground max-w-md">
                {dataState === 'DADOS_BLOQUEADOS_POR_POLITICA' 
                  ? 'O Mercado Livre libera metas e comparativos apenas após um volume mínimo de vendas na categoria.'
                  : 'Sem vendas registradas, não há dados de desempenho disponíveis para esta categoria.'
                }
              </p>
              <Button 
                variant="link" 
                size="sm" 
                className="mt-3 text-primary"
                onClick={() => setShowCriteria(true)}
              >
                <HelpCircle className="h-3 w-3 mr-1" />
                Entender critérios
              </Button>
            </div>
          </CardContent>
        </Card>

        <CriteriaModal 
          open={showCriteria} 
          onOpenChange={setShowCriteria} 
        />
      </>
    );
  }

  // Eligible state - show actual performance data
  // TODO: Integrate with actual seller performance hooks
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Target className="h-5 w-5 text-primary" />
          Metas e Desempenho
          <Badge variant="default" className="ml-2 bg-green-500/10 text-green-600 border-green-500/30">
            Disponível
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="p-4 bg-primary/5 rounded-lg">
            <p className="text-xs text-muted-foreground mb-1">Vendas no Período</p>
            <p className="text-2xl font-bold">{eligibility?.unitsSold || 0}</p>
          </div>
          <div className="p-4 bg-green-500/5 rounded-lg">
            <p className="text-xs text-muted-foreground mb-1">Faturamento</p>
            <p className="text-2xl font-bold text-green-600">
              R$ {((eligibility?.revenue || 0) / 1000).toFixed(1)}k
            </p>
          </div>
          <div className="p-4 bg-blue-500/5 rounded-lg">
            <p className="text-xs text-muted-foreground mb-1">Pedidos</p>
            <p className="text-2xl font-bold text-blue-600">{eligibility?.ordersCount || 0}</p>
          </div>
          <div className="p-4 bg-amber-500/5 rounded-lg">
            <p className="text-xs text-muted-foreground mb-1">Ticket Médio</p>
            <p className="text-2xl font-bold text-amber-600">
              R$ {eligibility?.ordersCount 
                ? ((eligibility.revenue || 0) / eligibility.ordersCount).toFixed(0) 
                : 0
              }
            </p>
          </div>
        </div>
        
        <p className="text-xs text-muted-foreground mt-4">
          Dados baseados nos últimos {periodDays} dias
        </p>
      </CardContent>
    </Card>
  );
}
