import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Activity, TrendingUp, Layers, Search, ShoppingCart, DollarSign, Package, Receipt } from 'lucide-react';
import { useTrends } from '@/contexts/TrendsContext';

// ============================================================
// QUICK KPIs
// Linha 1: KPIs de mercado (snapshot, não respondem a período)
// Linha 2: KPIs do seller (respondem ao período selecionado)
// ============================================================

export function TrendsQuickKpis() {
  const { state, hasCategory, hasSeller } = useTrends();
  const { capabilities, data, ui } = state;
  
  const isLoading = ui.loadingFlags.status || ui.loadingFlags.marketTrends;
  
  // === MARKET KPIs (snapshot-based, period-independent) ===
  
  const getStatusValue = () => {
    if (!hasCategory) return 'Aguardando';
    if (capabilities.canUseSellerInsights) return 'Ativa com histórico';
    if (capabilities.reason === 'INSUFFICIENT_CATEGORY_SALES') return 'Histórico limitado';
    return 'Sem histórico';
  };
  
  const getStatusSubtitle = () => {
    if (!hasCategory) return 'Selecione categoria';
    if (capabilities.canUseSellerInsights) return 'Dados completos disponíveis';
    if (capabilities.reason === 'INSUFFICIENT_CATEGORY_SALES') return 'Mínimo não atingido';
    return 'Usando dados de mercado';
  };
  
  const getTrendValue = () => {
    if (data.marketTrends.length === 0) return '—';
    return `${data.marketTrends.length} termos`;
  };
  
  const getSubcategoriesValue = () => {
    if (data.marketSubcategories.length === 0) return '—';
    return `Top ${Math.min(3, data.marketSubcategories.length)}`;
  };
  
  const getReachValue = () => {
    if (data.keywords.length === 0) return '—';
    const fundoKeywords = data.keywords.filter(k => k.funnel === 'fundo');
    if (fundoKeywords.length > 0) {
      return `${fundoKeywords.length} de compra`;
    }
    return `${data.keywords.length} termos`;
  };
  
  const marketCards = [
    {
      title: 'Status da categoria',
      value: getStatusValue(),
      subtitle: getStatusSubtitle(),
      icon: Activity,
      iconColor: capabilities.canUseSellerInsights 
        ? 'text-green-500' 
        : capabilities.reason === 'INSUFFICIENT_CATEGORY_SALES'
          ? 'text-amber-500'
          : 'text-muted-foreground',
    },
    {
      title: 'Tendência (mercado)',
      value: getTrendValue(),
      subtitle: 'Termos em destaque',
      icon: TrendingUp,
      iconColor: 'text-primary',
    },
    {
      title: 'Subcategorias em alta',
      value: getSubcategoriesValue(),
      subtitle: 'Por crescimento',
      icon: Layers,
      iconColor: 'text-blue-500',
    },
    {
      title: 'Interesse de busca',
      value: getReachValue(),
      subtitle: 'Intenção identificada',
      icon: Search,
      iconColor: 'text-purple-500',
    },
  ];
  
  // === SELLER KPIs (period-dependent) ===
  
  const sellerGoals = data.sellerGoals;
  const periodLabel = `${state.selectedPeriod}d`;
  
  const formatCurrency = (val: number) => {
    if (val >= 1000) return `R$ ${(val / 1000).toFixed(1)}K`;
    return `R$ ${val.toFixed(0)}`;
  };
  
  const sellerCards = capabilities.canUseSellerInsights && sellerGoals ? [
    {
      title: 'Pedidos',
      value: sellerGoals.ordersCount.toLocaleString('pt-BR'),
      subtitle: `Últimos ${periodLabel}`,
      icon: ShoppingCart,
      iconColor: 'text-green-500',
    },
    {
      title: 'Faturamento',
      value: formatCurrency(sellerGoals.revenue),
      subtitle: `Últimos ${periodLabel}`,
      icon: DollarSign,
      iconColor: 'text-emerald-500',
    },
    {
      title: 'Unidades vendidas',
      value: sellerGoals.unitsSold.toLocaleString('pt-BR'),
      subtitle: `Últimos ${periodLabel}`,
      icon: Package,
      iconColor: 'text-blue-500',
    },
    {
      title: 'Ticket médio',
      value: sellerGoals.averageTicket > 0 ? formatCurrency(sellerGoals.averageTicket) : '—',
      subtitle: `Últimos ${periodLabel}`,
      icon: Receipt,
      iconColor: 'text-amber-500',
    },
  ] : null;
  
  // Loading skeleton
  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <div className="space-y-2 flex-1">
                    <Skeleton className="h-4 w-24" />
                    <Skeleton className="h-6 w-20" />
                    <Skeleton className="h-3 w-32" />
                  </div>
                  <Skeleton className="h-8 w-8 rounded-full" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }
  
  // Empty state placeholder
  if (!hasSeller && !hasCategory) {
    return (
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {marketCards.map((card, i) => (
          <Card key={i} className="opacity-50">
            <CardContent className="p-4">
              <div className="flex items-start justify-between">
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">{card.title}</p>
                  <p className="text-lg font-semibold text-muted-foreground">—</p>
                  <p className="text-xs text-muted-foreground">Aguardando seleção</p>
                </div>
                <div className={`p-2 rounded-full bg-muted`}>
                  <card.icon className="h-4 w-4 text-muted-foreground" />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }
  
  return (
    <div className="space-y-4">
      {/* Row 1: Market KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {marketCards.map((card, i) => (
          <Card key={i}>
            <CardContent className="p-4">
              <div className="flex items-start justify-between">
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">{card.title}</p>
                  <p className="text-lg font-semibold">{card.value}</p>
                  <p className="text-xs text-muted-foreground">{card.subtitle}</p>
                </div>
                <div className={`p-2 rounded-full bg-muted`}>
                  <card.icon className={`h-4 w-4 ${card.iconColor}`} />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
      
      {/* Row 2: Seller KPIs (only if eligible) */}
      {sellerCards && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {sellerCards.map((card, i) => (
            <Card key={i} className="border-primary/20">
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">{card.title}</p>
                    <p className="text-lg font-semibold">{card.value}</p>
                    <p className="text-xs text-muted-foreground">{card.subtitle}</p>
                  </div>
                  <div className={`p-2 rounded-full bg-muted`}>
                    <card.icon className={`h-4 w-4 ${card.iconColor}`} />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
