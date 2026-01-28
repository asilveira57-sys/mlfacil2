import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { CheckCircle, AlertTriangle, TrendingUp, Info, Clock, Database } from 'lucide-react';

// ============================================================
// TRENDS STATUS BANNER
// Shows data context: seller available, blocked, or market-only
// ============================================================

interface TrendsStatusBannerProps {
  eligibilityStatus: 'eligible' | 'low_base' | 'inactive' | 'unknown';
  hasCategory: boolean;
  hasSeller: boolean;
  ordersCount: number;
  isLoading: boolean;
  lastUpdate: string | null;
}

export function TrendsStatusBanner({
  eligibilityStatus,
  hasCategory,
  hasSeller,
  ordersCount,
  isLoading,
  lastUpdate,
}: TrendsStatusBannerProps) {
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

  // Status configurations
  const statusConfig = {
    eligible: {
      icon: CheckCircle,
      text: 'Dados do seu desempenho disponíveis para esta categoria.',
      bgClass: 'bg-green-500/10 border-green-500/30',
      iconClass: 'text-green-500',
      textClass: 'text-green-700 dark:text-green-400',
    },
    low_base: {
      icon: AlertTriangle,
      text: `Ainda não há volume suficiente (${ordersCount} pedidos, mín: 10). Mostrando dados de mercado.`,
      bgClass: 'bg-amber-500/10 border-amber-500/30',
      iconClass: 'text-amber-500',
      textClass: 'text-amber-700 dark:text-amber-400',
    },
    inactive: {
      icon: TrendingUp,
      text: 'Visão de mercado carregada para apoiar planejamento.',
      bgClass: 'bg-primary/10 border-primary/30',
      iconClass: 'text-primary',
      textClass: 'text-foreground',
    },
    unknown: {
      icon: Info,
      text: 'Verificando elegibilidade...',
      bgClass: 'bg-muted/50',
      iconClass: 'text-muted-foreground',
      textClass: 'text-muted-foreground',
    },
  };

  const config = statusConfig[eligibilityStatus];
  const Icon = config.icon;

  return (
    <div className={`flex items-center justify-between gap-3 px-4 py-3 rounded-lg border ${config.bgClass}`}>
      <div className="flex items-center gap-3">
        <Icon className={`h-4 w-4 shrink-0 ${config.iconClass}`} />
        <span className={`text-sm ${config.textClass}`}>
          {config.text}
        </span>
      </div>
      
      {lastUpdate && (
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <Clock className="h-3 w-3" />
          <span>
            {new Date(lastUpdate).toLocaleDateString('pt-BR', {
              day: '2-digit',
              month: '2-digit',
              hour: '2-digit',
              minute: '2-digit',
            })}
          </span>
        </div>
      )}
    </div>
  );
}
