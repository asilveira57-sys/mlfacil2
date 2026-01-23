import { CheckCircle, AlertTriangle, TrendingUp, Info, Loader2 } from 'lucide-react';
import { useTrends } from '@/contexts/TrendsContext';

// ============================================================
// STATUS BANNER
// Objetivo: deixar claro o estado global (sem parecer erro técnico)
// ============================================================

const STATUS_CONFIG = {
  OK: {
    icon: CheckCircle,
    text: 'Dados do seu desempenho disponíveis para esta categoria.',
    bgClass: 'bg-green-500/10 border-green-500/30',
    iconClass: 'text-green-500',
    textClass: 'text-green-700 dark:text-green-400',
  },
  INSUFFICIENT_CATEGORY_SALES: {
    icon: AlertTriangle,
    text: 'Ainda não há volume de vendas suficiente para liberar metas e desempenho. Mostrando dados de mercado.',
    bgClass: 'bg-amber-500/10 border-amber-500/30',
    iconClass: 'text-amber-500',
    textClass: 'text-amber-700 dark:text-amber-400',
  },
  NO_HISTORY: {
    icon: TrendingUp,
    text: 'Visão de mercado carregada para apoiar planejamento.',
    bgClass: 'bg-primary/10 border-primary/30',
    iconClass: 'text-primary',
    textClass: 'text-foreground',
  },
  NO_ACCOUNT: {
    icon: Info,
    text: 'Selecione uma conta para ver dados.',
    bgClass: 'bg-muted/50 border-border',
    iconClass: 'text-muted-foreground',
    textClass: 'text-muted-foreground',
  },
  NO_CATEGORY: {
    icon: Info,
    text: 'Selecione uma categoria para começar.',
    bgClass: 'bg-muted/50 border-border',
    iconClass: 'text-muted-foreground',
    textClass: 'text-muted-foreground',
  },
};

export function TrendsStatusBanner() {
  const { state, hasSeller, hasCategory } = useTrends();
  const { capabilities, ui } = state;
  
  // Loading state
  if (ui.loadingFlags.status) {
    return (
      <div className="flex items-center gap-3 px-4 py-3 bg-muted/50 rounded-lg border animate-pulse">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        <span className="text-sm text-muted-foreground">Carregando contexto…</span>
      </div>
    );
  }
  
  // Determine which config to use
  let configKey = capabilities.reason;
  if (!hasSeller) configKey = 'NO_ACCOUNT';
  if (!hasCategory && hasSeller) configKey = 'NO_CATEGORY';
  
  const config = STATUS_CONFIG[configKey as keyof typeof STATUS_CONFIG] || STATUS_CONFIG.NO_CATEGORY;
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
