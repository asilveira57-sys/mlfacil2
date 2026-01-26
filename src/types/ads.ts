// Types for Mercado ADS module

export interface AdsCampaign {
  id: string;
  user_id: string;
  seller_id: string;
  workspace_id?: string;
  ml_campaign_id: string;
  name: string;
  status: 'active' | 'paused' | 'ended';
  campaign_type?: string;
  daily_budget?: number;
  total_budget?: number;
  spent_total: number;
  start_date?: string;
  end_date?: string;
  raw_data?: Record<string, unknown>;
  synced_at?: string;
  created_at: string;
  updated_at: string;
}

export interface AdsAdGroup {
  id: string;
  user_id: string;
  seller_id: string;
  campaign_id: string;
  ml_ad_group_id: string;
  name: string;
  status: 'active' | 'paused';
  default_bid?: number;
  spent: number;
  clicks: number;
  impressions: number;
  conversions: number;
  raw_data?: Record<string, unknown>;
  synced_at?: string;
  created_at: string;
  updated_at: string;
}

export interface AdsItem {
  id: string;
  user_id: string;
  seller_id: string;
  ad_group_id?: string;
  item_id: string;
  product_key?: string;
  title?: string;
  category_id?: string;
  current_price?: number;
  status: 'active' | 'paused';
  bid?: number;
  spent: number;
  clicks: number;
  impressions: number;
  conversions: number;
  revenue_from_ads: number;
  acos?: number;
  roas?: number;
  raw_data?: Record<string, unknown>;
  synced_at?: string;
  created_at: string;
  updated_at: string;
}

export interface AdsDailyMetric {
  id: string;
  user_id: string;
  seller_id: string;
  metric_date: string;
  campaign_id: string;
  ad_group_id?: string;
  item_id?: string;
  spent: number;
  clicks: number;
  impressions: number;
  conversions: number;
  revenue: number;
  acos?: number;
  roas?: number;
  created_at: string;
}

export interface AdsAlert {
  id: string;
  user_id: string;
  seller_id: string;
  workspace_id?: string;
  alert_type: 'high_acos' | 'low_stock' | 'scalable' | 'no_sales' | 'promo_conflict';
  severity: 'low' | 'medium' | 'high' | 'critical';
  title: string;
  message_pt: string;
  campaign_id?: string;
  item_id?: string;
  data_json?: Record<string, unknown>;
  is_read: boolean;
  is_dismissed: boolean;
  resolved_at?: string;
  created_at: string;
}

export interface AdsAutomationRule {
  id: string;
  user_id: string;
  seller_id: string;
  workspace_id?: string;
  name: string;
  description?: string;
  rule_type: string;
  conditions: Record<string, unknown>;
  actions: Record<string, unknown>;
  is_enabled: boolean;
  last_triggered_at?: string;
  trigger_count: number;
  created_at: string;
  updated_at: string;
}

export interface AdsSyncState {
  id: string;
  user_id: string;
  seller_id: string;
  status: 'idle' | 'syncing' | 'completed' | 'error';
  last_sync_at?: string;
  last_error?: string;
  campaigns_synced: number;
  items_synced: number;
  next_sync_at?: string;
  created_at: string;
  updated_at: string;
}

// Computed/Enriched types for UI
export interface EnrichedAdsItem extends AdsItem {
  is_in_promotion?: boolean;
  margin_percent?: number;
  stock_level?: number;
  situation: 'scale' | 'maintain' | 'adjust' | 'pause';
  campaign_name?: string;
}

export interface AdsMetricsSummary {
  total_spent: number;
  total_revenue: number;
  total_clicks: number;
  total_impressions: number;
  total_conversions: number;
  avg_acos: number;
  avg_roas: number;
  products_at_loss: number;
  products_scalable: number;
}

export interface AdsFilterState {
  seller_id?: string;
  campaign_id?: string;
  category_id?: string;
  status?: string;
  acos_min?: number;
  acos_max?: number;
  roas_min?: number;
  roas_max?: number;
  in_promotion?: boolean;
  date_from?: string;
  date_to?: string;
}
