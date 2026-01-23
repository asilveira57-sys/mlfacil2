/**
 * Component: CategoriaStatusCard
 * 
 * Props:
 * - categoriaStatus
 * - periodo
 * - categoriaNome
 * 
 * Estados visuais:
 * - ELEGIVEL → verde
 * - POUCA_BASE → amarelo
 * - SEM_VENDAS → cinza
 * 
 * Sempre renderiza. Nunca depende de API externa.
 */

import { CheckCircle, AlertTriangle, Info } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { EligibilityState } from '@/hooks/useCategoryEligibility';

interface CategoriaStatusCardProps {
  categoriaStatus: EligibilityState;
  periodo: number;
  categoriaNome: string;
  hasCategory: boolean;
  ordersCount?: number;
  revenue?: number;
  isLoading: boolean;
}

const STATUS_CONFIG = {
  eligible: {
    icon: CheckCircle,
    title: 'Categoria Elegível',
    description: 'Volume suficiente para análise completa de desempenho.',
    badgeVariant: 'default' as const,
    badgeClass: 'bg-green-500/10 text-green-600 border-green-500/30',
    iconClass: 'text-green-500',
    bgClass: 'bg-green-500/5 border-green-500/20',
  },
  low_base: {
    icon: AlertTriangle,
    title: 'Pouca Base de Vendas',
    description: 'Vendas abaixo do mínimo exigido pelo Mercado Livre para metas e comparativos.',
    badgeVariant: 'secondary' as const,
    badgeClass: 'bg-amber-500/10 text-amber-600 border-amber-500/30',
    iconClass: 'text-amber-500',
    bgClass: 'bg-amber-500/5 border-amber-500/20',
  },
  inactive: {
    icon: Info,
    title: 'Sem Vendas na Categoria',
    description: 'Nenhum histórico de vendas no período analisado.',
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

export function CategoriaStatusCard({ 
  categoriaStatus, 
  periodo,
  categoriaNome,
  hasCategory,
  ordersCount,
  revenue,
  isLoading,
}: CategoriaStatusCardProps) {
  // No category selected - don't render
  if (!hasCategory) {
    return null;
  }

  // Loading state
  if (isLoading) {
    return (
      <Card className="border">
        <CardContent className="pt-4">
          <div className="flex items-start gap-4">
            <Skeleton className="h-10 w-10 rounded-full" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-5 w-48" />
              <Skeleton className="h-4 w-64" />
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  const state: EligibilityState = categoriaStatus;
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
                {categoriaNome}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground">
              {config.description}
            </p>
            
            {/* Métricas para estados não-unknown */}
            {state !== 'loading' && state !== 'unknown' && (ordersCount !== undefined || revenue !== undefined) && (
              <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                {ordersCount !== undefined && (
                  <span>
                    <strong className="text-foreground">{ordersCount}</strong> pedidos
                  </span>
                )}
                {revenue !== undefined && revenue > 0 && (
                  <span>
                    <strong className="text-foreground">
                      R$ {revenue.toLocaleString('pt-BR', { minimumFractionDigits: 0 })}
                    </strong> faturamento
                  </span>
                )}
                <span className="text-muted-foreground/70">
                  Período: {periodo} dias
                </span>
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
