import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { touchUserActivity } from "@/hooks/useSyncEligibility";

/**
 * Modo Economia Operacional — heartbeat de sessão ativa.
 *
 * - Monitora interação real do usuário (mouse, teclado, scroll, click).
 * - Enquanto houver atividade nos últimos 30min, envia heartbeat a cada 60s
 *   atualizando `profiles.last_active_at`.
 * - Após 30min ociosos, para de bater. Volta a bater na próxima interação.
 * - O backend usa `last_active_at` para decidir se processa webhooks e
 *   se permite auto-sync (ver `can_run_auto_sync` / `is_user_session_active`).
 */
const HEARTBEAT_INTERVAL_MS = 60_000;
const IDLE_THRESHOLD_MS = 30 * 60_000;
const ACTIVITY_EVENTS = ["mousemove", "keydown", "scroll", "click", "touchstart"] as const;

export function useActiveSessionTracker() {
  const userIdRef = useRef<string | null>(null);
  const lastActivityRef = useRef<number>(Date.now());
  const lastHeartbeatRef = useRef<number>(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    let mounted = true;

    const markActivity = () => {
      lastActivityRef.current = Date.now();
    };

    const sendHeartbeat = async () => {
      const userId = userIdRef.current;
      if (!userId) return;
      const sinceActivity = Date.now() - lastActivityRef.current;
      if (sinceActivity > IDLE_THRESHOLD_MS) return; // idle: nada a fazer
      const sinceHeartbeat = Date.now() - lastHeartbeatRef.current;
      if (sinceHeartbeat < HEARTBEAT_INTERVAL_MS - 1000) return;
      lastHeartbeatRef.current = Date.now();
      try {
        await touchUserActivity(userId, false);
      } catch {
        /* fail-safe */
      }
    };

    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        markActivity();
        sendHeartbeat();
      }
    };

    ACTIVITY_EVENTS.forEach((evt) =>
      window.addEventListener(evt, markActivity, { passive: true } as AddEventListenerOptions),
    );
    document.addEventListener("visibilitychange", onVisibility);

    timerRef.current = setInterval(sendHeartbeat, HEARTBEAT_INTERVAL_MS);

    // Inicializa userId a partir da sessão atual e reage a SIGNED_IN/OUT
    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      userIdRef.current = data.session?.user?.id ?? null;
      if (userIdRef.current) sendHeartbeat();
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT") {
        userIdRef.current = null;
        return;
      }
      if (session?.user?.id) {
        userIdRef.current = session.user.id;
        markActivity();
        sendHeartbeat();
      }
    });

    return () => {
      mounted = false;
      ACTIVITY_EVENTS.forEach((evt) => window.removeEventListener(evt, markActivity));
      document.removeEventListener("visibilitychange", onVisibility);
      if (timerRef.current) clearInterval(timerRef.current);
      subscription.unsubscribe();
    };
  }, []);
}
