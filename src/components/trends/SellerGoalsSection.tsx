import { useState } from 'react';
import { Target, TrendingUp, Lock, HelpCircle, BarChart3 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { CriteriaModal } from './CriteriaModal';
import { 
  CategoryEligibility, 
  hasPermission 
} from '@/hooks/useCategoryEligibility';

interface SellerGoalsSectionProps {
  eligibility: CategoryEligibility | undefined;
  isLoading: boolean;
  sellerId: string | null;
  periodDays: number;
  hasCategory: boolean;
}

export function SellerGoalsSection({
  eligibility,
  isLoading,
  sellerId,
  periodDays,
  hasCategory,
}: SellerGoalsSectionProps) {
  const [showCriteria, setShowCriteria] = useState(false);

  const canFetch = hasPermission(eligibility, 'canFetchSellerGoals');
  const dataState = eligibility?.dataState || 'DADOS_PUBLICOS_MERCADO';

  // Don't render if no category selected
  if (!hasCategory) {
    return null;
  }

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
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map(i => (
              <Skeleton key={i} className="h-24 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  // Blocked state - show informative placeholder
  if (!canFetch) {
    return (
      <>
        <Card className="border-dashed">
          <CardHeader>
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
          
          <CardContent>
            <div className="flex flex-col items-center justify-center py-8 text-center bg-muted/30 rounded-lg">
              <Lock className="h-10 w-10 text-muted-foreground mb-4" />
              <p className="text-sm text-muted-foreground max-w-md mb-2">
                Metas e desempenho são liberados após volume mínimo de vendas na categoria.
              </p>
              <p className="text-xs text-muted-foreground max-w-md">
                Enquanto isso, use a Visão de Mercado acima para planejar.
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
  const ticketMedio = eligibility?.ordersCount && eligibility.ordersCount > 0
    ? eligibility.revenue / eligibility.ordersCount
    : 0;

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
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
          <div className="p-4 bg-primary/5 rounded-lg">
            <p className="text-xs text-muted-foreground mb-1">Unidades Vendidas</p>
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
              R$ {ticketMedio.toFixed(0)}
            </p>
          </div>
        </div>
        
        {/* Progress/Goals placeholder */}
        <div className="p-4 bg-muted/30 rounded-lg">
          <div className="flex items-center gap-2 mb-2">
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">Evolução no Período</span>
          </div>
          <p className="text-xs text-muted-foreground">
            Dados baseados nos últimos {periodDays} dias. 
            Metas e comparativos detalhados serão adicionados em breve.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
