import { CheckCircle, AlertTriangle, TrendingUp, Info } from 'lucide-react';
import { DataState } from '@/hooks/useCategoryEligibility';

interface StatusBannerProps {
  dataState: DataState;
  isLoading: boolean;
  hasCategory: boolean;
  hasSeller: boolean;
}

const STATUS_CONFIG = {
  DADOS_LIBERADOS_SELLER: {
    icon: CheckCircle,
    text: 'Dados do seu desempenho disponíveis para esta categoria.',
    bgClass: 'bg-green-500/10 border-green-500/30',
    iconClass: 'text-green-500',
    textClass: 'text-green-700 dark:text-green-400',
  },
  DADOS_BLOQUEADOS_POR_POLITICA: {
    icon: AlertTriangle,
    text: 'Ainda não há volume de vendas suficiente para liberar metas e desempenho. Mostrando dados de mercado.',
    bgClass: 'bg-amber-500/10 border-amber-500/30',
    iconClass: 'text-amber-500',
    textClass: 'text-amber-700 dark:text-amber-400',
  },
  DADOS_PUBLICOS_MERCADO: {
    icon: TrendingUp,
    text: 'Visão de mercado carregada para apoiar planejamento.',
    bgClass: 'bg-primary/10 border-primary/30',
    iconClass: 'text-primary',
    textClass: 'text-foreground',
  },
};

export function StatusBanner({ 
  dataState, 
  isLoading, 
  hasCategory, 
  hasSeller 
}: StatusBannerProps) {
  // Loading state
  if (isLoading) {
    return (
      <div className="flex items-center gap-3 px-4 py-3 bg-muted/50 rounded-lg border animate-pulse">
        <div className="h-4 w-4 bg-muted-foreground/20 rounded-full" />
        <span className="text-sm text-muted-foreground">Carregando contexto…</span>
      </div>
    );
  }

  // No seller selected
  if (!hasSeller) {
    return (
      <div className="flex items-center gap-3 px-4 py-3 bg-muted/50 rounded-lg border">
        <Info className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm text-muted-foreground">
          Selecione uma conta para ver dados.
        </span>
      </div>
    );
  }

  // No category selected
  if (!hasCategory) {
    return (
      <div className="flex items-center gap-3 px-4 py-3 bg-muted/50 rounded-lg border">
        <Info className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm text-muted-foreground">
          Selecione uma categoria para começar.
        </span>
      </div>
    );
  }

  // Normal state with data
  const config = STATUS_CONFIG[dataState];
  const Icon = config.icon;

  return (
    <div className={`flex items-center gap-3 px-4 py-3 rounded-lg border ${config.bgClass}`}>
      <Icon className={`h-4 w-4 shrink-0 ${config.iconClass}`} />
      <span className={`text-sm ${config.textClass}`}>
        {config.text}
      </span>
    </div>
  );
}
