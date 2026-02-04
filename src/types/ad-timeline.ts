export type StatusBucket = 'OK' | '30D' | '60D' | '90D' | '120D' | 'NO_SALES';

export type ActionType = 'END' | 'RELIST' | 'CLONE';

export type ActionStatus = 'DRAFT' | 'QUEUED' | 'RUNNING' | 'SUCCESS' | 'FAILED' | 'CANCELLED';

export interface AdTimelineStats {
  id: string;
  workspace_id: string;
  ml_account_id: string;
  item_id: string;
  last_sale_at: string | null;
  first_sale_at: string | null;
  sales_count_30d: number;
  sales_count_60d: number;
  sales_count_90d: number;
  sales_count_120d: number;
  avg_gap_hours: number | null;
  median_gap_hours: number | null;
  max_gap_hours: number | null;
  days_since_last_sale: number | null;
  status_bucket: StatusBucket;
  updated_at: string;
  created_at: string;
  // Joined from listings cache
  title?: string;
  thumbnail?: string;
  price?: number;
  status?: string;
  available_quantity?: number;
}

export interface AdTimelineEvent {
  id: string;
  workspace_id: string;
  ml_account_id: string;
  item_id: string;
  event_type: 'SALE' | 'GAP' | 'ACTION_MARKED' | 'ACTION_EXECUTED';
  occurred_at: string;
  payload: Record<string, any>;
  created_at: string;
}

export interface AdLifecycleAction {
  id: string;
  workspace_id: string;
  ml_account_id: string;
  item_id: string;
  action_type: ActionType;
  action_status: ActionStatus;
  reason: string | null;
  checklist: CloneChecklist;
  source_snapshot: Record<string, any>;
  result: Record<string, any>;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface CloneChecklist {
  title?: boolean;
  description?: boolean;
  pictures?: boolean;
  attributes?: boolean;
  price?: boolean;
  quantity?: boolean;
  shipping?: boolean;
  warranty?: boolean;
}

export interface AdLifecycleExperiment {
  id: string;
  workspace_id: string;
  ml_account_id: string;
  source_item_id: string;
  new_item_id: string | null;
  method: 'RELIST' | 'CLONE';
  baseline: Record<string, any>;
  after_7d: Record<string, any> | null;
  after_14d: Record<string, any> | null;
  after_30d: Record<string, any> | null;
  created_at: string;
  updated_at: string;
}

export interface AdTimelineSettings {
  id: string;
  workspace_id: string;
  ml_account_id: string | null;
  thresholds_days: number[];
  recalc_frequency_hours: number;
  no_sales_policy: 'INCLUDE' | 'EXCLUDE';
  action_safety: {
    require_confirmation: boolean;
    daily_limit: number;
  };
  created_at: string;
  updated_at: string;
}

export interface TimelineFilters {
  ml_account_id?: string;
  status_bucket?: StatusBucket | 'ALL';
  category_id?: string;
  search?: string;
}

export interface BucketCounts {
  OK: number;
  '30D': number;
  '60D': number;
  '90D': number;
  '120D': number;
  NO_SALES: number;
  total: number;
}
