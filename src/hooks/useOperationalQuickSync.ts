/**
 * useOperationalQuickSync
 * Hook que gerencia a fila hot de pedidos e dispara o quick sync em ciclos curtos.
 * Usado pelo Sandbox, Envios e Etiquetas.
 */
import { useEffect, useRef, useCallback, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

// Intervalo entre execuções do quick sync (30s quando ativo, 60s quando idle)
const ACTIVE_INTERVAL_MS = 30_000;
const IDLE_INTERVAL_MS = 60_000;

// Cooldown mínimo entre cliques manuais de "Atualizar agora"
const MANUAL_COOLDOWN_MS = 45_000;

export interface QuickSyncStatus {
  isRunning: boolean;
  lastRunAt: string | null;
  ordersChecked: number;
  changesFound: number;
  lastError: string | null;
  cooldownUntil: string | null;
  inCooldown: boolean;
  secondsUntilCooldownEnd: number;
}

interface UseOperationalQuickSyncOptions {
  sellerId: string | null;
  companyId: string | null;
  enabled?: boolean;
  onChangesDetected?: () => void;
}

export function useOperationalQuickSync({
  sellerId,
  companyId,
  enabled = true,
  onChangesDetected,
}: UseOperationalQuickSyncOptions) {
  const [status, setStatus] = useState<QuickSyncStatus>({
    isRunning: false,
    lastRunAt: null,
    ordersChecked: 0,
    changesFound: 0,
    lastError: null,
    cooldownUntil: null,
    inCooldown: false,
    secondsUntilCooldownEnd: 0,
  });

  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const cooldownTimerRef = useRef<NodeJS.Timeout | null>(null);
  const isRunningRef = useRef(false);
  const lastManualRunRef = useRef<number>(0);

  // Atualizar countdown de cooldown a cada segundo
  const updateCooldownCountdown = useCallback((cooldownUntil: string | null) => {
    if (cooldownTimerRef.current) clearInterval(cooldownTimerRef.current);
    if (!cooldownUntil) return;

    const tick = () => {
      const remaining = Math.max(0, Math.ceil((new Date(cooldownUntil).getTime() - Date.now()) / 1000));
      setStatus(prev => ({
        ...prev,
        inCooldown: remaining > 0,
        secondsUntilCooldownEnd: remaining,
      }));
      if (remaining === 0 && cooldownTimerRef.current) {
        clearInterval(cooldownTimerRef.current);
      }
    };

    tick();
    cooldownTimerRef.current = setInterval(tick, 1000);
  }, []);

  // Enfileirar pedidos recentes na hot_orders_queue
  const enqueueRecentOrders = useCallback(async (
    userId: string,
    sId: string,
    cId: string,
  ) => {
    try {
      const cutoff = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString();
      const { data: recentOrders } = await supabase
        .from('meli_orders_cache')
        .select('order_id')
        .eq('seller_id', sId)
        .in('order_status', ['paid', 'handling'])
        .gte('created_at_meli', cutoff)
        .order('created_at_meli', { ascending: false });

      if (!recentOrders || recentOrders.length === 0) return;

      const entries = recentOrders.map((o: any) => ({
        company_id: cId,
        seller_id: sId,
        user_id: userId,
        order_id: o.order_id,
        priority: 1,
        next_check_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString(),
      }));

      await supabase.from('hot_orders_queue').upsert(entries, {
        onConflict: 'seller_id,order_id',
        ignoreDuplicates: false,
      });
    } catch (e) {
      console.warn('[QuickSync] Erro ao enfileirar pedidos:', e);
    }
  }, []);

  // Keep stable refs for callbacks used inside intervals
  const onChangesDetectedRef = useRef(onChangesDetected);
  onChangesDetectedRef.current = onChangesDetected;

  const sellerIdRef = useRef(sellerId);
  sellerIdRef.current = sellerId;
  const companyIdRef = useRef(companyId);
  companyIdRef.current = companyId;

  // Executar o quick sync
  const runQuickSync = useCallback(async (manual = false) => {
    const sId = sellerIdRef.current;
    const cId = companyIdRef.current;
    if (!sId || !cId || !enabled) return;
    if (isRunningRef.current) return;

    // Verificar cooldown manual
    if (manual && Date.now() - lastManualRunRef.current < MANUAL_COOLDOWN_MS) {
      const remaining = Math.ceil((MANUAL_COOLDOWN_MS - (Date.now() - lastManualRunRef.current)) / 1000);
      setStatus(prev => ({
        ...prev,
        inCooldown: true,
        secondsUntilCooldownEnd: remaining,
      }));
      return;
    }

    if (manual) lastManualRunRef.current = Date.now();

    isRunningRef.current = true;
    setStatus(prev => ({ ...prev, isRunning: true }));

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Log: início da operação
      await logSandbox('quick_sync_triggered', {
        seller_id: sId, company_id: cId, manual,
      });

      const { data, error } = await supabase.functions.invoke('operational-quick-sync', {
        body: { seller_id: sId, company_id: cId, user_id: user.id },
      });

      if (error) throw error;

      const result = data as any;
      const cooldownUntil = result?.cooldown_until || new Date(Date.now() + 45_000).toISOString();

      setStatus({
        isRunning: false,
        lastRunAt: new Date().toISOString(),
        ordersChecked: result?.orders_checked ?? 0,
        changesFound: result?.changes ?? 0,
        lastError: null,
        cooldownUntil,
        inCooldown: true,
        secondsUntilCooldownEnd: 45,
      });

      updateCooldownCountdown(cooldownUntil);

      if ((result?.changes ?? 0) > 0) {
        onChangesDetectedRef.current?.();
      }
    } catch (err: any) {
      console.error('[QuickSync] Erro:', err);
      setStatus(prev => ({
        ...prev,
        isRunning: false,
        lastError: err?.message || 'Erro desconhecido',
      }));
      await logSandbox('quick_sync_error', { error: err?.message });
    } finally {
      isRunningRef.current = false;
    }
  }, [enabled, updateCooldownCountdown]);

  // Setup: enfileirar pedidos ao montar + iniciar intervalo
  useEffect(() => {
    if (!sellerId || !companyId || !enabled) return;

    let mounted = true;

    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || !mounted) return;

      // Enfileirar pedidos recentes imediatamente
      await enqueueRecentOrders(user.id, sellerId, companyId);

      // Primeira execução após 2s
      setTimeout(() => { if (mounted) runQuickSync(false); }, 2000);

      // Intervalo automático
      intervalRef.current = setInterval(() => {
        if (mounted) runQuickSync(false);
      }, ACTIVE_INTERVAL_MS);

      await logSandbox('quick_sync_session_start', { seller_id: sellerId, company_id: companyId });
    };

    init();

    return () => {
      mounted = false;
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (cooldownTimerRef.current) clearInterval(cooldownTimerRef.current);
    };
    // Only re-run when seller/company/enabled actually change, not when callbacks change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sellerId, companyId, enabled]);

  // Disparo manual com feedback
  const triggerManualSync = useCallback(async () => {
    await runQuickSync(true);
  }, [runQuickSync]);

  return {
    status,
    triggerManualSync,
  };
}

// ── Logging helper ──────────────────────────────────────────────────────────
async function logSandbox(action: string, meta: Record<string, unknown> = {}) {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    await supabase.from('system_logs').insert({
      level: 'info',
      system_area: 'operational_quick_sync',
      action,
      message: `QuickSync: ${action}`,
      meta_json: { user_id: user.id, ...meta },
      success: !action.includes('error'),
    });
  } catch { /* fail-safe */ }
}
