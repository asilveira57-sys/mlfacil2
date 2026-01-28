// Types for the Send module (Strategic Ad Cultivation)

export type SendHealthStatus = 'healthy' | 'stagnant' | 'weakening' | 'dormant';
export type SendGrowthStage = 'seed' | 'sprout' | 'growing' | 'mature' | 'fruiting';
export type SendPositionTier = 'top_page_1' | 'page_1' | 'page_2' | 'page_3_plus' | 'not_found';

export interface SendSeedBalance {
  id: string;
  user_id: string;
  seller_id: string;
  seeds_from_plan: number;
  seeds_purchased: number;
  seeds_used: number;
  plan_tier: string;
  created_at: string;
  updated_at: string;
}

export interface SendPlantedItem {
  id: string;
  user_id: string;
  seller_id: string;
  item_id: string;
  item_title: string | null;
  item_thumbnail: string | null;
  planted_at: string;
  health_status: SendHealthStatus;
  growth_stage: SendGrowthStage;
  days_planted: number;
  abc_class: string;
  is_a_plus: boolean;
  last_health_check_at: string | null;
  last_metrics_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface SendMetricsSnapshot {
  id: string;
  planted_item_id: string;
  user_id: string;
  seller_id: string;
  item_id: string;
  snapshot_date: string;
  sales_count_7d: number;
  sales_count_30d: number;
  avg_sales_interval_hours: number | null;
  sales_stability_score: number | null;
  visits_7d: number;
  visits_30d: number;
  visit_trend: number | null;
  conversion_rate: number | null;
  conversion_trend: number | null;
  position_tier: SendPositionTier | null;
  position_checked_at: string | null;
  search_keyword: string | null;
  maturity_score: number | null;
  growth_velocity: number | null;
  created_at: string;
}

export interface SendItemHistory {
  id: string;
  user_id: string;
  seller_id: string;
  item_id: string;
  event_type: 'planted' | 'removed' | 'health_changed' | 'stage_changed' | 'milestone';
  event_data: Record<string, unknown> | null;
  occurred_at: string;
}

export interface SendAplusCandidate {
  id: string;
  user_id: string;
  seller_id: string;
  item_id: string;
  item_title: string | null;
  consecutive_periods: number;
  periods_in_curve_a: string[] | null;
  total_revenue: number;
  stability_score: number;
  is_promoted_to_aplus: boolean;
  last_evaluated_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface SendSeedPurchase {
  id: string;
  user_id: string;
  seller_id: string;
  seeds_quantity: number;
  amount_brl: number;
  payment_id: string | null;
  payment_status: 'pending' | 'approved' | 'rejected' | 'cancelled';
  payment_method: string;
  expires_at: string | null;
  created_at: string;
  updated_at: string;
}

// UI helper types
export interface PlantedItemWithMetrics extends SendPlantedItem {
  latestMetrics: SendMetricsSnapshot | null;
  historyCount: number;
}

export interface EligibleItem {
  item_id: string;
  item_title: string | null;
  item_thumbnail: string | null;
  abc_class: 'A' | 'A+';
  total_revenue: number;
  sales_count: number;
  is_planted: boolean;
}

// Growth stage visual config
export const GROWTH_STAGE_CONFIG: Record<SendGrowthStage, {
  label: string;
  emoji: string;
  description: string;
  daysRequired: number;
}> = {
  seed: {
    label: 'Semente',
    emoji: '🌱',
    description: 'Recém plantada, ainda não germinou',
    daysRequired: 0,
  },
  sprout: {
    label: 'Broto',
    emoji: '🌿',
    description: 'Começando a crescer',
    daysRequired: 7,
  },
  growing: {
    label: 'Crescendo',
    emoji: '🪴',
    description: 'Em desenvolvimento ativo',
    daysRequired: 21,
  },
  mature: {
    label: 'Maduro',
    emoji: '🌳',
    description: 'Planta estabelecida e forte',
    daysRequired: 45,
  },
  fruiting: {
    label: 'Frutificando',
    emoji: '🍎',
    description: 'Produzindo resultados excelentes',
    daysRequired: 90,
  },
};

// Health status visual config
export const HEALTH_STATUS_CONFIG: Record<SendHealthStatus, {
  label: string;
  color: string;
  bgColor: string;
  description: string;
}> = {
  healthy: {
    label: 'Saudável',
    color: 'text-emerald-600',
    bgColor: 'bg-emerald-500/10',
    description: 'Crescendo bem, métricas positivas',
  },
  stagnant: {
    label: 'Estagnado',
    color: 'text-amber-600',
    bgColor: 'bg-amber-500/10',
    description: 'Sem evolução recente, precisa de atenção',
  },
  weakening: {
    label: 'Enfraquecendo',
    color: 'text-orange-600',
    bgColor: 'bg-orange-500/10',
    description: 'Métricas em queda, precisa de cuidado urgente',
  },
  dormant: {
    label: 'Dormante',
    color: 'text-slate-500',
    bgColor: 'bg-slate-500/10',
    description: 'Sem atividade recente',
  },
};

// Position tier visual config
export const POSITION_TIER_CONFIG: Record<SendPositionTier, {
  label: string;
  color: string;
  icon: string;
}> = {
  top_page_1: {
    label: 'Topo Página 1',
    color: 'text-emerald-600',
    icon: '🏆',
  },
  page_1: {
    label: 'Página 1',
    color: 'text-blue-600',
    icon: '✨',
  },
  page_2: {
    label: 'Página 2',
    color: 'text-amber-600',
    icon: '📄',
  },
  page_3_plus: {
    label: 'Página 3+',
    color: 'text-orange-600',
    icon: '📋',
  },
  not_found: {
    label: 'Não encontrado',
    color: 'text-slate-500',
    icon: '❓',
  },
};
