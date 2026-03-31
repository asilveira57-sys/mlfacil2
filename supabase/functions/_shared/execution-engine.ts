/**
 * Execution Engine — Shared helper for Cloud optimization.
 * Wraps the should_run_routine / update_execution_priority / log_execution_result DB functions.
 * All edge functions call this before processing each seller.
 */

export interface ExecutionDecision {
  decision: 'run' | 'skip' | 'defer';
  reason: string;
  priority_level: string;
  cooldown_applied: number;
  next_eligible_run_at: string | null;
}

/**
 * Ask the decision engine whether a routine should run for a seller.
 */
export async function shouldRunRoutine(
  supabase: any,
  sellerId: string,
  routineKey: string,
  isManual: boolean = false
): Promise<ExecutionDecision> {
  try {
    const { data, error } = await supabase.rpc('should_run_routine', {
      p_seller_id: sellerId,
      p_routine_key: routineKey,
      p_is_manual: isManual,
    });

    if (error) {
      console.warn(`[exec-engine] RPC error for ${routineKey}/${sellerId}: ${error.message}`);
      // Fail-open: allow execution if engine fails
      return { decision: 'run', reason: 'engine_error_failopen', priority_level: 'medium', cooldown_applied: 0, next_eligible_run_at: null };
    }

    return data as ExecutionDecision;
  } catch (err) {
    console.warn(`[exec-engine] Exception: ${err}`);
    return { decision: 'run', reason: 'engine_exception_failopen', priority_level: 'medium', cooldown_applied: 0, next_eligible_run_at: null };
  }
}

/**
 * Update seller priority/activity metrics for a routine.
 */
export async function updateExecutionPriority(
  supabase: any,
  sellerId: string,
  routineKey: string,
  metrics: {
    activeListings?: number;
    recentSales7d?: number;
    recentQuestions24h?: number;
  }
): Promise<void> {
  try {
    await supabase.rpc('update_execution_priority', {
      p_seller_id: sellerId,
      p_routine_key: routineKey,
      p_active_listings: metrics.activeListings ?? 0,
      p_recent_sales_7d: metrics.recentSales7d ?? 0,
      p_recent_questions_24h: metrics.recentQuestions24h ?? 0,
    });
  } catch (err) {
    console.warn(`[exec-engine] Failed to update priority for ${routineKey}/${sellerId}: ${err}`);
  }
}

/**
 * Log the result of an execution (or skip/defer decision).
 */
export async function logExecutionResult(
  supabase: any,
  sellerId: string,
  routineKey: string,
  params: {
    decision: string;
    reason: string;
    priority: string;
    cooldown: number;
    executionMs?: number;
    itemsProcessed?: number;
    isManual?: boolean;
    metadata?: Record<string, unknown>;
  }
): Promise<void> {
  try {
    await supabase.rpc('log_execution_result', {
      p_seller_id: sellerId,
      p_routine_key: routineKey,
      p_decision: params.decision,
      p_reason: params.reason,
      p_priority: params.priority,
      p_cooldown: params.cooldown,
      p_execution_ms: params.executionMs ?? 0,
      p_items_processed: params.itemsProcessed ?? 0,
      p_is_manual: params.isManual ?? false,
      p_metadata: params.metadata ?? {},
    });
  } catch (err) {
    console.warn(`[exec-engine] Failed to log result for ${routineKey}/${sellerId}: ${err}`);
  }
}
