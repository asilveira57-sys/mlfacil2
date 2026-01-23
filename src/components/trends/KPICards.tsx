import { TrendingUp, Store, BarChart3, Search, Info } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { DataState, CategoryEligibility } from '@/hooks/useCategoryEligibility';

interface KPICardsProps {
  eligibility: CategoryEligibility | undefined;
  isLoading: boolean;
  trendsCount: number;
  highlightsCount: number;
  categoryName: string;
  hasCategory: boolean;
}

interface KPICardProps {
  title: string;
  value: string | number;
  subtitle: string;
  icon: React.ReactNode;
  bgClass: string;
  isLoading: boolean;
}

function KPICard({ title, value, subtitle, icon, bgClass, isLoading }: KPICardProps) {
  if (isLoading) {
    return (
      <Card>
        <CardContent className="pt-4">
          <Skeleton className="h-4 w-24 mb-2" />
          <Skeleton className="h-8 w-16 mb-1" />
          <Skeleton className="h-3 w-32" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={`relative overflow-hidden ${bgClass}`}>
      <CardContent className="pt-4">
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs text-muted-foreground font-medium">{title}</p>
          {icon}
        </div>
        <p className="text-2xl font-bold">{value}</p>
        <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>
      </CardContent>
    </Card>
  );
}

export function KPICards({
  eligibility,
  isLoading,
  trendsCount,
  highlightsCount,
  categoryName,
  hasCategory,
}: KPICardsProps) {
  const dataState = eligibility?.dataState || 'DADOS_PUBLICOS_MERCADO';
  const isSellerAvailable = dataState === 'DADOS_LIBERADOS_SELLER';

  // Card 1: Category Status
  const statusValue = !hasCategory 
    ? 'Aguardando' 
    : isSellerAvailable 
      ? 'Ativa com histórico'
      : eligibility?.eligibilityState === 'low_base'
        ? 'Histórico limitado'
        : 'Sem histórico';

  const statusSubtitle = !hasCategory
    ? 'Selecione uma categoria'
    : isSellerAvailable
      ? `${eligibility?.ordersCount || 0} pedidos no período`
      : eligibility?.eligibilityState === 'low_base'
        ? `${eligibility?.ordersCount || 0} pedidos (mín: ${eligibility?.thresholdOrders || 10})`
        : 'Nenhuma venda registrada';

  // Card 2: Trends
  const trendsSubtitle = trendsCount > 0 
    ? 'Termos em alta no mercado' 
    : 'Aguardando dados de tendência';

  // Card 3: Subcategories
  const subcatValue = hasCategory ? 'Disponível' : '-';
  const subcatSubtitle = hasCategory 
    ? 'Explore subcategorias em alta' 
    : 'Selecione categoria principal';

  // Card 4: Search/Reach
  const reachValue = highlightsCount > 0 ? highlightsCount : '-';
  const reachSubtitle = highlightsCount > 0 
    ? 'Produtos em destaque' 
    : 'Sem dados de alcance';

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      <KPICard
        title="Status da Categoria"
        value={statusValue}
        subtitle={statusSubtitle}
        icon={<Store className="h-4 w-4 text-muted-foreground" />}
        bgClass={isSellerAvailable ? 'bg-green-500/5' : 'bg-muted/30'}
        isLoading={isLoading && hasCategory}
      />
      
      <KPICard
        title="Tendência (Mercado)"
        value={trendsCount}
        subtitle={trendsSubtitle}
        icon={<TrendingUp className="h-4 w-4 text-primary" />}
        bgClass="bg-primary/5"
        isLoading={isLoading}
      />
      
      <KPICard
        title="Subcategorias em Alta"
        value={subcatValue}
        subtitle={subcatSubtitle}
        icon={<BarChart3 className="h-4 w-4 text-blue-500" />}
        bgClass="bg-blue-500/5"
        isLoading={isLoading && hasCategory}
      />
      
      <KPICard
        title="Alcance/Busca"
        value={reachValue}
        subtitle={reachSubtitle}
        icon={<Search className="h-4 w-4 text-amber-500" />}
        bgClass="bg-amber-500/5"
        isLoading={isLoading}
      />
    </div>
  );
}
