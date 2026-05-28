import { supabase } from "@/integrations/supabase/client";

/**
 * Modo Econômico — gate central de sync automático.
 * Consulta a função SQL public.can_run_auto_sync(user_id, module) que aplica:
 *  - 3 dias sem login -> bloqueia
 *  - horário 20:00–06:00 BRT -> bloqueia
 *  - sábado >=15:00 e domingo -> bloqueia
 *  - módulos pausados -> bloqueia (somente shipping_labels/shipping_full são permitidos no auto)
 *
 * Cache em memória de 60s por (userId, module) para não martelar o RPC.
 */
const CACHE_TTL_MS = 60_000;
const cache = new Map<string, { ts: number; allowed: boolean; reason: string }>();

export type EligibilityResult = { allowed: boolean; reason: string };

export async function canRunAutoSync(
  userId: string | null | undefined,
  module: string,
): Promise<EligibilityResult> {
  if (!userId) return { allowed: false, reason: "no_user" };

  const key = `${userId}:${module}`;
  const cached = cache.get(key);
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
    return { allowed: cached.allowed, reason: cached.reason };
  }

  try {
    const { data, error } = await (supabase as any).rpc("can_run_auto_sync", {
      p_user_id: userId,
      p_module: module,
    });
    if (error) {
      // fail-closed: em caso de erro, NÃO autorizar auto sync (modo econômico)
      return { allowed: false, reason: "rpc_error" };
    }
    const payload = (data as any) || {};
    const result: EligibilityResult = {
      allowed: !!payload.allowed,
      reason: String(payload.reason || "unknown"),
    };
    cache.set(key, { ts: Date.now(), ...result });
    return result;
  } catch {
    return { allowed: false, reason: "exception" };
  }
}

/**
 * Fire-and-forget log de decisão de sync. Nunca lança.
 */
export async function logSyncDecision(params: {
  module: string;
  action: "auto_sync" | "manual_sync" | "background_preload" | "skipped";
  status: "allowed" | "blocked" | "executed" | "error";
  reason?: string;
  sellerId?: string | null;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  try {
    await (supabase as any).rpc("log_sync_decision", {
      p_module: params.module,
      p_action: params.action,
      p_status: params.status,
      p_reason: params.reason ?? null,
      p_seller_id: params.sellerId ?? null,
      p_metadata: params.metadata ?? {},
    });
  } catch {
    // fail-safe
  }
}

/** Marca o usuário como ativo (chamado ocasionalmente). */
export async function touchUserActivity(userId: string, isLogin = false) {
  try {
    await (supabase as any).rpc("touch_user_activity", {
      p_user_id: userId,
      p_is_login: isLogin,
    });
  } catch {
    // fail-safe
  }
}
