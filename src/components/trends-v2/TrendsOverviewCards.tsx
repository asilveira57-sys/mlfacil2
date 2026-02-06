import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Activity, TrendingUp, Layers, Search, DollarSign, ShoppingCart, BarChart3 } from 'lucide-react';

// ============================================================
// TRENDS OVERVIEW CARDS
// Shows: category status, trends count, subcategories, reach
// And seller KPIs when eligible: units, orders, revenue, ticket
// Loading: local skeletons inside cards, never fullscreen
// ============================================================

interface SellerKpis {
  ordersCount: number;
  unitsSold: number;
  revenue: number;
  averageTicket: number;
}

interface TrendsOverviewCardsProps {
  hasCategory: boolean;
  hasSeller: boolean;
  eligibilityStatus: 'eligible' | 'low_base' | 'inactive' | 'unknown';
  ordersCount: number;
  trendsCount: number;
  highlightsCount: number;
  sellerKpis: SellerKpis | null;
  selectedPeriod: number;
  isLoadingEligibility: boolean;
  isLoadingTrends: boolean;
  isLoadingHighlights: boolean;
}

interface KpiCardProps {
  title: string;
  value: string | number;
  subtitle: string;
  icon: React.ElementType;
  iconColor: string;
  isLoading: boolean;
}

function KpiCard({ title, value, subtitle, icon: Icon, iconColor, isLoading }: KpiCardProps) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <div className="space-y-1 flex-1">
            {isLoading ? (
              <>
                <Skeleton className="h-3 w-20 mb-2" />
                <Skeleton className="h-6 w-16 mb-1" />
                <Skeleton className="h-3 w-28" />
              </>
            ) : (
              <>
                <p className="text-xs text-muted-foreground">{title}</p>
                <p className="text-xl font-semibold">{value}</p>
                <p className="text-xs text-muted-foreground">{subtitle}</p>
              </>
            )}
          </div>
          <div className="p-2 rounded-full bg-muted">
            <Icon className={`h-4 w-4 ${iconColor}`} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export function TrendsOverviewCards({
  hasCategory,
  hasSeller,
  eligibilityStatus,
  ordersCount,
  trendsCount,
  highlightsCount,
  sellerKpis,
  selectedPeriod,
  isLoadingEligibility,
  isLoadingTrends,
  isLoadingHighlights,
}: TrendsOverviewCardsProps) {
  // Period label for seller KPIs
  const periodLabel = selectedPeriod === 7 
    ? 'Últimos 7 dias' 
    : selectedPeriod === 90 
      ? 'Últimos 90 dias' 
      : 'Últimos 30 dias';

  // Status card values
  const getStatusValue = () => {
    if (!hasCategory) return 'Aguardando';
    switch (eligibilityStatus) {
      case 'eligible': return 'Ativa';
      case 'low_base': return 'Base baixa';
      case 'inactive': return 'Sem vendas';
      default: return 'Verificando';
    }
  };
  
  const getStatusSubtitle = () => {
    if (!hasCategory) return 'Selecione uma categoria';
    switch (eligibilityStatus) {
      case 'eligible': return `${ordersCount} pedidos • ${periodLabel}`;
      case 'low_base': return `${ordersCount} pedidos (mín: 10)`;
      case 'inactive': return 'Sem vendas registradas';
      default: return 'Carregando...';
    }
  };
  
  const getStatusIconColor = () => {
    switch (eligibilityStatus) {
      case 'eligible': return 'text-green-500';
      case 'low_base': return 'text-amber-500';
      default: return 'text-muted-foreground';
    }
  };

  const formatCurrency = (value: number) => {
    if (value >= 1000000) return `R$ ${(value / 1000000).toFixed(1)}M`;
    if (value >= 1000) return `R$ ${(value / 1000).toFixed(0)}K`;
    return `R$ ${value.toFixed(0)}`;
  };

  // Row 1: Market overview (always visible)
  const marketCards = [
    {
      title: 'Status da Categoria',
      value: getStatusValue(),
      subtitle: getStatusSubtitle(),
      icon: Activity,
      iconColor: getStatusIconColor(),
      isLoading: isLoadingEligibility && hasCategory,
    },
    {
      title: 'Tendências',
      value: trendsCount > 0 ? trendsCount : '—',
      subtitle: trendsCount > 0 ? 'Termos em alta' : 'Aguardando dados',
      icon: TrendingUp,
      iconColor: 'text-primary',
      isLoading: isLoadingTrends,
    },
    {
      title: 'Destaques',
      value: highlightsCount > 0 ? highlightsCount : '—',
      subtitle: highlightsCount > 0 ? 'Produtos no ranking' : 'Aguardando dados',
      icon: Layers,
      iconColor: 'text-blue-500',
      isLoading: isLoadingHighlights,
    },
    {
      title: 'Interesse de Busca',
      value: trendsCount > 0 ? 'Ativo' : '—',
      subtitle: trendsCount > 0 ? 'Demanda detectada' : 'Sem dados',
      icon: Search,
      iconColor: 'text-purple-500',
      isLoading: isLoadingTrends,
    },
  ];

  // Row 2: Seller KPIs (only when eligible)
  const sellerCards = sellerKpis ? [
    {
      title: 'Pedidos',
      value: sellerKpis.ordersCount.toLocaleString('pt-BR'),
      subtitle: periodLabel,
      icon: ShoppingCart,
      iconColor: 'text-green-500',
      isLoading: false,
    },
    {
      title: 'Unidades Vendidas',
      value: sellerKpis.unitsSold.toLocaleString('pt-BR'),
      subtitle: `≈ ${periodLabel}`,
      icon: BarChart3,
      iconColor: 'text-blue-500',
      isLoading: false,
    },
    {
      title: 'Faturamento',
      value: formatCurrency(sellerKpis.revenue),
      subtitle: `Receita bruta • ${periodLabel}`,
      icon: DollarSign,
      iconColor: 'text-emerald-500',
      isLoading: false,
    },
    {
      title: 'Ticket Médio',
      value: formatCurrency(sellerKpis.averageTicket),
      subtitle: `Média • ${periodLabel}`,
      icon: Activity,
      iconColor: 'text-amber-500',
      isLoading: false,
    },
  ] : null;

  return (
    <div className="space-y-4">
      {/* Market Overview Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {marketCards.map((card, i) => (
          <KpiCard key={i} {...card} />
        ))}
      </div>
      
      {/* Seller KPIs Row (conditional) */}
      {sellerCards ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {sellerCards.map((card, i) => (
            <KpiCard key={i} {...card} />
          ))}
        </div>
      ) : hasSeller && isLoadingEligibility && hasCategory ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map(i => (
            <KpiCard 
              key={i} 
              title="" 
              value="" 
              subtitle="" 
              icon={Activity} 
              iconColor="text-muted-foreground" 
              isLoading={true} 
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}
