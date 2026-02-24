/**
 * Centralized audit logging helper.
 * Uses the `register_system_log` RPC to write to the `system_logs` table.
 * Fail-safe: errors are caught silently to never break the caller.
 */
export async function auditLog(
  supabase: any,
  params: {
    level: string;
    area: string;
    action: string;
    userId?: string | null;
    success: boolean;
    message: string;
    meta?: Record<string, unknown>;
  }
): Promise<void> {
  try {
    await supabase.rpc('register_system_log', {
      p_level: params.level,
      p_system_area: params.area,
      p_action: params.action,
      p_user_id: params.userId || null,
      p_success: params.success,
      p_message: params.message,
      p_meta_json: params.meta || {},
    });
  } catch (_) {
    // fail-safe: never break the caller
  }
}
