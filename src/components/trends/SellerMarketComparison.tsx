import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { 
  BarChart3, 
  TrendingUp, 
  TrendingDown, 
  Minus,
  RefreshCw, 
  DollarSign, 
  Package,
  Target,
  AlertCircle,
  CheckCircle
} from 'lucide-react';
import { useSellerCategoryMetrics, useMarketComparison, useTriggerMetricsCalculation } from '@/hooks/useSellerCategoryMetrics';
import { toast } from 'sonner';

interface SellerMarketComparisonProps {
  sellerId: string | null;
}

export function SellerMarketComparison({ sellerId }: SellerMarketComparisonProps) {
  const [periodKey, setPeriodKey] = useState('last_30d');
  
  const { data: metrics, isLoading: metricsLoading, refetch: refetchMetrics } = useSellerCategoryMetrics(sellerId, periodKey);
  const { data: comparisons, isLoading: comparisonLoading } = useMarketComparison(sellerId, periodKey);
  const triggerCalculation = useTriggerMetricsCalculation();

  const handleCalculate = async () => {
    if (!sellerId) return;
    
    toast.loading('Calculando métricas...', { id: 'calc-metrics' });
    
    try {
      await triggerCalculation.mutateAsync({ sellerId, periodKey });
      toast.success('Métricas calculadas com sucesso!', { id: 'calc-metrics' });
      refetchMetrics();
    } catch (err) {
      toast.error(`Erro: ${err instanceof Error ? err.message : 'Erro desconhecido'}`, { id: 'calc-metrics' });
    }
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
  };

  const formatPercent = (value: number | null) => {
    if (value === null) return '-';
    return `${value >= 0 ? '+' : ''}${value.toFixed(1)}%`;
  };

  const getPricePositionBadge = (position: 'below' | 'average' | 'above' | 'unknown') => {
    switch (position) {
      case 'below':
        return <Badge variant="outline" className="text-green-600 border-green-600"><TrendingDown className="h-3 w-3 mr-1" />Abaixo</Badge>;
      case 'above':
        return <Badge variant="outline" className="text-red-600 border-red-600"><TrendingUp className="h-3 w-3 mr-1" />Acima</Badge>;
      case 'average':
        return <Badge variant="outline" className="text-amber-600 border-amber-600"><Minus className="h-3 w-3 mr-1" />Na média</Badge>;
      default:
        return <Badge variant="outline" className="text-muted-foreground">-</Badge>;
    }
  };

  if (!sellerId) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <p className="text-muted-foreground">Selecione uma conta para visualizar comparativos.</p>
        </CardContent>
      </Card>
    );
  }

  const isLoading = metricsLoading || comparisonLoading;

  // Calculate totals
  const totals = metrics?.reduce((acc, m) => ({
    revenue: acc.revenue + m.revenue,
    quantity: acc.quantity + m.quantity_sold,
    orders: acc.orders + m.orders_count,
  }), { revenue: 0, quantity: 0, orders: 0 }) || { revenue: 0, quantity: 0, orders: 0 };

  return (
    <div className="space-y-6">
      {/* Controls */}
      <div className="flex items-center justify-between">
        <Select value={periodKey} onValueChange={setPeriodKey}>
          <SelectTrigger className="w-[180px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="last_30d">Últimos 30 dias</SelectItem>
            <SelectItem value="last_90d">Últimos 90 dias</SelectItem>
          </SelectContent>
        </Select>

        <Button 
          onClick={handleCalculate}
          disabled={triggerCalculation.isPending}
          size="sm"
        >
          {triggerCalculation.isPending ? (
            <>
              <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
              Calculando...
            </>
          ) : (
            <>
              <BarChart3 className="h-4 w-4 mr-2" />
              Calcular Métricas
            </>
          )}
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Receita Total</p>
                <p className="text-2xl font-bold">{formatCurrency(totals.revenue)}</p>
              </div>
              <DollarSign className="h-8 w-8 text-green-500" />
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Unidades Vendidas</p>
                <p className="text-2xl font-bold">{totals.quantity.toLocaleString('pt-BR')}</p>
              </div>
              <Package className="h-8 w-8 text-blue-500" />
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Categorias Ativas</p>
                <p className="text-2xl font-bold">{metrics?.length || 0}</p>
              </div>
              <Target className="h-8 w-8 text-purple-500" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Comparisons */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <BarChart3 className="h-5 w-5 text-primary" />
            Comparativo por Categoria
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-4">
              {[1, 2, 3, 4, 5].map(i => <Skeleton key={i} className="h-24 w-full" />)}
            </div>
          ) : comparisons && comparisons.length > 0 ? (
            <ScrollArea className="h-[500px]">
              <div className="space-y-4 pr-4">
                {comparisons.map((comp) => (
                  <div 
                    key={comp.category_id} 
                    className="p-4 bg-muted/50 rounded-lg border"
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <h4 className="font-medium">{comp.category_name}</h4>
                        <p className="text-xs text-muted-foreground">{comp.category_id}</p>
                      </div>
                      {getPricePositionBadge(comp.positioning.price_vs_market)}
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      {/* Your Revenue */}
                      <div>
                        <p className="text-xs text-muted-foreground mb-1">Sua Receita</p>
                        <p className="font-semibold text-green-600">{formatCurrency(comp.seller.revenue)}</p>
                        <p className="text-xs text-muted-foreground">{comp.seller.quantity_sold} un.</p>
                      </div>

                      {/* Your Ticket */}
                      <div>
                        <p className="text-xs text-muted-foreground mb-1">Seu Ticket Médio</p>
                        <p className="font-semibold">{formatCurrency(comp.seller.avg_ticket)}</p>
                        {comp.seller.margin_percent !== null && (
                          <p className="text-xs text-muted-foreground">
                            Margem: {comp.seller.margin_percent.toFixed(1)}%
                          </p>
                        )}
                      </div>

                      {/* Market Average */}
                      <div>
                        <p className="text-xs text-muted-foreground mb-1">Preço Médio Mercado</p>
                        {comp.market.avg_price ? (
                          <>
                            <p className="font-semibold">{formatCurrency(comp.market.avg_price)}</p>
                            <p className="text-xs text-muted-foreground">
                              {formatCurrency(comp.market.min_price || 0)} - {formatCurrency(comp.market.max_price || 0)}
                            </p>
                          </>
                        ) : (
                          <p className="text-muted-foreground text-sm">Sem dados</p>
                        )}
                      </div>

                      {/* Position */}
                      <div>
                        <p className="text-xs text-muted-foreground mb-1">Diferença de Preço</p>
                        {comp.positioning.price_diff_percent !== null ? (
                          <p className={`font-semibold ${
                            comp.positioning.price_diff_percent < 0 ? 'text-green-600' : 
                            comp.positioning.price_diff_percent > 0 ? 'text-red-600' : ''
                          }`}>
                            {formatPercent(comp.positioning.price_diff_percent)}
                          </p>
                        ) : (
                          <p className="text-muted-foreground text-sm">-</p>
                        )}
                        {comp.market.top_seller_revenue_estimate && (
                          <p className="text-xs text-muted-foreground">
                            Top: ~{formatCurrency(comp.market.top_seller_revenue_estimate)}
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Revenue comparison bar */}
                    {comp.market.top_seller_revenue_estimate && comp.market.top_seller_revenue_estimate > 0 && (
                      <div className="mt-3">
                        <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
                          <span>Sua participação vs Top</span>
                          <span>{Math.min(100, (comp.seller.revenue / comp.market.top_seller_revenue_estimate * 100)).toFixed(1)}%</span>
                        </div>
                        <Progress 
                          value={Math.min(100, (comp.seller.revenue / comp.market.top_seller_revenue_estimate * 100))} 
                          className="h-2"
                        />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </ScrollArea>
          ) : metrics && metrics.length === 0 ? (
            <div className="text-center py-12">
              <AlertCircle className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-muted-foreground">Nenhuma métrica calculada ainda</p>
              <p className="text-sm text-muted-foreground mt-2">
                Clique em "Calcular Métricas" para gerar o comparativo
              </p>
            </div>
          ) : (
            <div className="text-center py-12">
              <CheckCircle className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-muted-foreground">Aguardando dados de mercado</p>
              <p className="text-sm text-muted-foreground mt-2">
                O comparativo será gerado após a coleta noturna
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
