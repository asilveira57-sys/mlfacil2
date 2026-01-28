// Types for Radiography Module - Clinical Ad Analysis

/**
 * Health status classification for listings
 * Based on internal metrics only (no external/position data)
 */
export type RadiographyHealthStatus = 
  | 'healthy'      // Saudável - all metrics positive
  | 'stable'       // Estável - no significant changes
  | 'observation'  // Em observação - minor issues detected
  | 'alert'        // Com alerta - requires attention
  | 'critical';    // Crítico - urgent intervention needed

/**
 * ABC Curve classification
 */
export type AbcCurve = 'A' | 'B' | 'C' | 'A+' | null;

/**
 * Health status configuration with visual properties
 */
export interface HealthStatusConfig {
  label: string;
  description: string;
  icon: string; // lucide icon name
  colorClass: string;
  bgClass: string;
  borderClass: string;
  pulseClass?: string;
}

export const HEALTH_STATUS_CONFIG: Record<RadiographyHealthStatus, HealthStatusConfig> = {
  healthy: {
    label: 'Saudável',
    description: 'Todos os indicadores positivos',
    icon: 'HeartPulse',
    colorClass: 'text-emerald-400',
    bgClass: 'bg-emerald-500/10',
    borderClass: 'border-emerald-500/30',
    pulseClass: 'animate-pulse',
  },
  stable: {
    label: 'Estável',
    description: 'Performance consistente',
    icon: 'Activity',
    colorClass: 'text-cyan-400',
    bgClass: 'bg-cyan-500/10',
    borderClass: 'border-cyan-500/30',
  },
  observation: {
    label: 'Em Observação',
    description: 'Sinais que requerem monitoramento',
    icon: 'Stethoscope',
    colorClass: 'text-amber-400',
    bgClass: 'bg-amber-500/10',
    borderClass: 'border-amber-500/30',
  },
  alert: {
    label: 'Com Alerta',
    description: 'Problemas detectados',
    icon: 'AlertTriangle',
    colorClass: 'text-orange-400',
    bgClass: 'bg-orange-500/10',
    borderClass: 'border-orange-500/30',
    pulseClass: 'animate-pulse',
  },
  critical: {
    label: 'Crítico',
    description: 'Intervenção urgente necessária',
    icon: 'Siren',
    colorClass: 'text-red-400',
    bgClass: 'bg-red-500/10',
    borderClass: 'border-red-500/30',
    pulseClass: 'animate-pulse',
  },
};

/**
 * ABC Curve configuration
 */
export interface CurveConfig {
  label: string;
  description: string;
  colorClass: string;
  bgClass: string;
  borderClass: string;
  priority: number;
}

export const CURVE_CONFIG: Record<string, CurveConfig> = {
  'A+': {
    label: 'Curva A+',
    description: 'Recorrente em múltiplos períodos',
    colorClass: 'text-violet-400',
    bgClass: 'bg-violet-500/15',
    borderClass: 'border-violet-500/40',
    priority: 1,
  },
  'A': {
    label: 'Curva A',
    description: 'Top 80% do faturamento',
    colorClass: 'text-emerald-400',
    bgClass: 'bg-emerald-500/15',
    borderClass: 'border-emerald-500/40',
    priority: 2,
  },
  'B': {
    label: 'Curva B',
    description: '15% do faturamento',
    colorClass: 'text-cyan-400',
    bgClass: 'bg-cyan-500/15',
    borderClass: 'border-cyan-500/40',
    priority: 3,
  },
  'C': {
    label: 'Curva C',
    description: '5% do faturamento',
    colorClass: 'text-slate-400',
    bgClass: 'bg-slate-500/15',
    borderClass: 'border-slate-500/40',
    priority: 4,
  },
};

/**
 * Suggested action types (without execution)
 */
export interface SuggestedAction {
  type: 'send_candidate' | 'stagnation_risk' | 'healthy' | 'declining' | 'critical_intervention';
  title: string;
  description: string;
  icon: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
}

export const SUGGESTED_ACTIONS: Record<SuggestedAction['type'], Omit<SuggestedAction, 'type'>> = {
  send_candidate: {
    title: 'Potencial para Send',
    description: 'Anúncio elegível para acompanhamento profundo',
    icon: 'Sprout',
    priority: 'medium',
  },
  stagnation_risk: {
    title: 'Risco de Estagnação',
    description: 'Performance estável mas sem crescimento',
    icon: 'TrendingDown',
    priority: 'medium',
  },
  healthy: {
    title: 'Sem Intervenção Necessária',
    description: 'Anúncio operando de forma saudável',
    icon: 'CheckCircle',
    priority: 'low',
  },
  declining: {
    title: 'Sinais de Queda',
    description: 'Métricas em declínio recente',
    icon: 'ArrowDownRight',
    priority: 'high',
  },
  critical_intervention: {
    title: 'Intervenção Urgente',
    description: 'Problemas críticos identificados',
    icon: 'AlertOctagon',
    priority: 'critical',
  },
};

/**
 * Calculate health status from metrics
 */
export function calculateHealthStatus(metrics: {
  score_total?: number;
  conversion_rate_7d?: number;
  visits_trend?: number;
  stock_level?: number;
  has_complaints?: boolean;
  has_delays?: boolean;
}): RadiographyHealthStatus {
  const { score_total = 0, conversion_rate_7d = 0, visits_trend = 0, stock_level = 0, has_complaints, has_delays } = metrics;

  // Critical conditions
  if (score_total < 30 || stock_level === 0 || has_delays) {
    return 'critical';
  }

  // Alert conditions
  if (score_total < 50 || visits_trend < -30 || has_complaints) {
    return 'alert';
  }

  // Observation conditions
  if (score_total < 60 || conversion_rate_7d < 1 || visits_trend < -10) {
    return 'observation';
  }

  // Stable conditions
  if (score_total < 75 || Math.abs(visits_trend) < 5) {
    return 'stable';
  }

  // Healthy
  return 'healthy';
}

/**
 * Determine suggested action based on health and curve
 */
export function getSuggestedAction(
  healthStatus: RadiographyHealthStatus,
  curve: AbcCurve
): SuggestedAction['type'] {
  if (healthStatus === 'critical') {
    return 'critical_intervention';
  }

  if (healthStatus === 'alert') {
    return 'declining';
  }

  if (healthStatus === 'observation') {
    return 'stagnation_risk';
  }

  // Healthy or stable + Curve A/A+ = Send candidate
  if ((healthStatus === 'healthy' || healthStatus === 'stable') && (curve === 'A' || curve === 'A+')) {
    return 'send_candidate';
  }

  return 'healthy';
}
