// Types for ADS Rules Engine

export type AdsRuleMetric = 
  | 'acos' 
  | 'roas' 
  | 'spent' 
  | 'revenue' 
  | 'clicks' 
  | 'impressions' 
  | 'conversions'
  | 'margin_percent'
  | 'stock_level';

export type AdsRuleOperator = 
  | 'gt'      // greater than
  | 'gte'     // greater than or equal
  | 'lt'      // less than
  | 'lte'     // less than or equal
  | 'eq'      // equal
  | 'neq';    // not equal

export type AdsRuleCompareWith = 
  | 'fixed_value' 
  | 'margin_registered' 
  | 'target_acos'
  | 'target_roas';

export type AdsRulePeriod = 3 | 7 | 14 | 30;

export type AdsRuleEventType = 
  | 'violation'    // Rule violated - something needs attention
  | 'opportunity'; // Opportunity detected - positive signal

export interface AdsRuleCondition {
  metric: AdsRuleMetric;
  operator: AdsRuleOperator;
  compare_with: AdsRuleCompareWith;
  fixed_value?: number;
  period_days: AdsRulePeriod;
}

export interface AdsRuleExtraCondition {
  type: 'in_promotion' | 'stock_low' | 'no_sales' | 'has_sales';
  enabled: boolean;
}

export interface AdsRule {
  id: string;
  user_id: string;
  seller_id: string;
  workspace_id?: string;
  name: string;
  description?: string;
  conditions: AdsRuleCondition[];
  extra_conditions: AdsRuleExtraCondition[];
  event_type: AdsRuleEventType;
  severity: 'low' | 'medium' | 'high' | 'critical';
  is_enabled: boolean;
  last_evaluated_at?: string;
  last_triggered_at?: string;
  trigger_count: number;
  created_at: string;
  updated_at: string;
}

export interface AdsRuleEvent {
  id: string;
  rule_id: string;
  rule_name: string;
  item_id: string;
  item_title?: string;
  event_type: AdsRuleEventType;
  severity: string;
  message_pt: string;
  metrics_snapshot: Record<string, number>;
  created_at: string;
}

// Predefined rule templates
export interface AdsRuleTemplate {
  id: string;
  name: string;
  description: string;
  conditions: AdsRuleCondition[];
  extra_conditions: AdsRuleExtraCondition[];
  event_type: AdsRuleEventType;
  severity: 'low' | 'medium' | 'high' | 'critical';
}

export const ADS_RULE_TEMPLATES: AdsRuleTemplate[] = [
  {
    id: 'acos_above_margin',
    name: 'ACOS acima da margem',
    description: 'Detecta produtos com ACOS maior que a margem cadastrada',
    conditions: [
      { metric: 'acos', operator: 'gt', compare_with: 'margin_registered', period_days: 7 }
    ],
    extra_conditions: [],
    event_type: 'violation',
    severity: 'high',
  },
  {
    id: 'high_roas_opportunity',
    name: 'Oportunidade de escalar (ROAS alto)',
    description: 'Produtos com ROAS acima de 4 e vendas ativas',
    conditions: [
      { metric: 'roas', operator: 'gte', compare_with: 'fixed_value', fixed_value: 4, period_days: 7 }
    ],
    extra_conditions: [{ type: 'has_sales', enabled: true }],
    event_type: 'opportunity',
    severity: 'medium',
  },
  {
    id: 'promo_high_acos',
    name: 'Promoção com ACOS alto',
    description: 'Produtos em promoção com ACOS elevado',
    conditions: [
      { metric: 'acos', operator: 'gt', compare_with: 'fixed_value', fixed_value: 30, period_days: 7 }
    ],
    extra_conditions: [{ type: 'in_promotion', enabled: true }],
    event_type: 'violation',
    severity: 'critical',
  },
  {
    id: 'no_sales_with_spend',
    name: 'Gasto sem vendas',
    description: 'Produtos com gasto em ADS mas sem conversões',
    conditions: [
      { metric: 'spent', operator: 'gt', compare_with: 'fixed_value', fixed_value: 50, period_days: 14 },
      { metric: 'conversions', operator: 'eq', compare_with: 'fixed_value', fixed_value: 0, period_days: 14 }
    ],
    extra_conditions: [],
    event_type: 'violation',
    severity: 'high',
  },
  {
    id: 'low_stock_active_ads',
    name: 'Estoque baixo com ADS ativo',
    description: 'Produtos anunciados com estoque baixo',
    conditions: [],
    extra_conditions: [{ type: 'stock_low', enabled: true }],
    event_type: 'violation',
    severity: 'medium',
  },
];

// Labels for UI
export const METRIC_LABELS: Record<AdsRuleMetric, string> = {
  acos: 'ACOS (%)',
  roas: 'ROAS',
  spent: 'Gasto (R$)',
  revenue: 'Receita (R$)',
  clicks: 'Cliques',
  impressions: 'Impressões',
  conversions: 'Conversões',
  margin_percent: 'Margem (%)',
  stock_level: 'Nível de estoque',
};

export const OPERATOR_LABELS: Record<AdsRuleOperator, string> = {
  gt: 'maior que',
  gte: 'maior ou igual a',
  lt: 'menor que',
  lte: 'menor ou igual a',
  eq: 'igual a',
  neq: 'diferente de',
};

export const COMPARE_WITH_LABELS: Record<AdsRuleCompareWith, string> = {
  fixed_value: 'Valor fixo',
  margin_registered: 'Margem cadastrada',
  target_acos: 'ACOS alvo',
  target_roas: 'ROAS alvo',
};

export const PERIOD_LABELS: Record<AdsRulePeriod, string> = {
  3: 'Últimos 3 dias',
  7: 'Últimos 7 dias',
  14: 'Últimos 14 dias',
  30: 'Últimos 30 dias',
};

export const EXTRA_CONDITION_LABELS: Record<AdsRuleExtraCondition['type'], string> = {
  in_promotion: 'Produto em promoção',
  stock_low: 'Estoque baixo',
  no_sales: 'Sem vendas no período',
  has_sales: 'Com vendas no período',
};
