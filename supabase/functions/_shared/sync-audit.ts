/**
 * Sync Audit Logger
 * Writes standardized sync events to the audit_logs table.
 * Fail-safe: errors are caught silently to never break the caller.
 */

export type SyncAction =
  | 'sync_started'
  | 'sync_finished'
  | 'sync_failed'
  | 'sync_skipped'
  | 'sync_locked'
  | 'plan_required'
  | 'over_limit_detected';

export interface SyncAuditParams {
  action: SyncAction;
  tenantId?: string | null;
  userId?: string | null;
  entityType: string;   // e.g. 'sync_job', 'billing_sync', 'orders_sync'
  entityId?: string | null; // e.g. job_id, seller_id
  metadata: SyncAuditMetadata;
}

export interface SyncAuditMetadata {
  job_id?: string;
  module: string;       // e.g. 'orders_sync', 'billing_sync', 'ads_sync'
  scope?: string;       // e.g. 'last_30d', 'last_12m', 'periodic_30m', 'hourly_48h'
  tenant_id?: string;
  seller_id?: string;
  meli_account_id?: string;
  started_at?: string;
  finished_at?: string;
  duration_ms?: number;
  // Counters
  orders_imported?: number;
  orders_updated?: number;
  items_synced?: number;
  billing_rows?: number;
  ads_campaigns?: number;
  pages_processed?: number;
  accounts_processed?: number;
  accounts_failed?: number;
  api_calls?: number;
  rate_limit_hits?: number;
  // Error info
  error_code?: string;
  error_message?: string;
  // Extra context
  [key: string]: unknown;
}

/**
 * Log a sync event to the audit_logs table.
 * This is fail-safe and will never throw.
 */
export async function logSyncEvent(
  supabase: any,
  params: SyncAuditParams
): Promise<void> {
  try {
    await supabase.from('audit_logs').insert({
      action: params.action,
      tenant_id: params.tenantId || params.metadata.tenant_id || null,
      user_id: params.userId || null,
      entity_type: params.entityType,
      entity_id: params.entityId || null,
      metadata: params.metadata,
    });
  } catch (_) {
    // fail-safe: never break the caller
    try {
      console.warn('[sync-audit] Failed to write audit log:', _);
    } catch (__) {
      // truly silent
    }
  }
}

/**
 * Helper to create a sync start log and return the start time for duration calculation.
 */
export function syncStartTimer(): { startedAt: string; startMs: number } {
  return {
    startedAt: new Date().toISOString(),
    startMs: Date.now(),
  };
}

/**
 * Calculate duration from a start timer.
 */
export function syncDuration(startMs: number): number {
  return Date.now() - startMs;
}
