import { CheckCircle, AlertTriangle, Info } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { 
  EligibilityState, 
  DataState,
  CategoryEligibility 
} from '@/hooks/useCategoryEligibility';

interface CategoryStatusCardProps {
  eligibility: CategoryEligibility | undefined;
  isLoading: boolean;
  categoryName: string;
}

const STATUS_CONFIG = {
  eligible: {
    icon: CheckCircle,
    title: 'Categoria Elegível',
    description: 'Esta categoria possui volume suficiente de vendas para análise completa de desempenho.',
    badgeVariant: 'default' as const,
    badgeClass: 'bg-green-500/10 text-green-600 border-green-500/30',
    iconClass: 'text-green-500',
    bgClass: 'bg-green-500/5 border-green-500/20',
  },
  low_base: {
    icon: AlertTriangle,
    title: 'Pouca Base de Vendas',
    description: 'Esta categoria tem vendas registradas, mas ainda abaixo do volume mínimo exigido pelo Mercado Livre para metas e comparativos.',
    badgeVariant: 'secondary' as const,
    badgeClass: 'bg-amber-500/10 text-amber-600 border-amber-500/30',
    iconClass: 'text-amber-500',
    bgClass: 'bg-amber-500/5 border-amber-500/20',
  },
  inactive: {
    icon: Info,
    title: 'Sem Vendas na Categoria',
    description: 'Não há vendas registradas nesta categoria no período analisado.',
    badgeVariant: 'outline' as const,
    badgeClass: 'bg-muted text-muted-foreground',
    iconClass: 'text-muted-foreground',
    bgClass: 'bg-muted/50 border-muted',
  },
  unknown: {
    icon: Info,
    title: 'Verificando Elegibilidade',
    description: 'Aguardando verificação de elegibilidade da categoria.',
    badgeVariant: 'outline' as const,
    badgeClass: 'bg-muted text-muted-foreground',
    iconClass: 'text-muted-foreground',
    bgClass: 'bg-muted/50 border-muted',
  },
  loading: {
    icon: Info,
    title: 'Carregando...',
    description: 'Verificando status da categoria.',
    badgeVariant: 'outline' as const,
    badgeClass: 'bg-muted text-muted-foreground',
    iconClass: 'text-muted-foreground',
    bgClass: 'bg-muted/50 border-muted',
  },
};

export function CategoryStatusCard({ 
  eligibility, 
  isLoading,
  categoryName 
}: CategoryStatusCardProps) {
  const state: EligibilityState = isLoading 
    ? 'loading' 
    : eligibility?.eligibilityState || 'unknown';
  
  const config = STATUS_CONFIG[state];
  const Icon = config.icon;

  return (
    <Card className={`${config.bgClass} border`}>
      <CardContent className="pt-4">
        <div className="flex items-start gap-4">
          <div className={`p-2 rounded-full ${config.bgClass}`}>
            <Icon className={`h-5 w-5 ${config.iconClass}`} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <h3 className="font-semibold text-sm">{config.title}</h3>
              <Badge variant={config.badgeVariant} className={config.badgeClass}>
                {categoryName}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground">
              {config.description}
            </p>
            {eligibility && state !== 'loading' && state !== 'unknown' && (
              <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                <span>
                  <strong className="text-foreground">{eligibility.ordersCount}</strong> pedidos
                </span>
                <span>
                  <strong className="text-foreground">
                    R$ {eligibility.revenue.toLocaleString('pt-BR', { minimumFractionDigits: 0 })}
                  </strong> faturamento
                </span>
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
