/**
 * operational-quick-sync
 * Mini-sync leve para pedidos "quentes" — atualiza NF + etiqueta em ciclos curtos.
 * Chamado pelo hook useOperationalQuickSync no cliente.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const startedAt = Date.now();
  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  try {
    const body = await req.json().catch(() => ({}));
    const { seller_id, company_id, user_id } = body;

    if (!seller_id || !company_id || !user_id) {
      return new Response(
        JSON.stringify({ error: "seller_id, company_id e user_id são obrigatórios" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── 1) Log: início do quick sync
    await logSystem(supabase, user_id, "quick_sync_start", {
      seller_id, company_id, action: "operational_quick_sync"
    });

    // ── 2) Verificar cooldown (evita chamadas em excesso)
    const { data: syncState } = await supabase
      .from("quick_sync_state")
      .select("is_running, cooldown_until, last_run_at")
      .eq("company_id", company_id)
      .maybeSingle();

    const now = new Date();
    if (syncState?.cooldown_until && new Date(syncState.cooldown_until) > now) {
      return new Response(
        JSON.stringify({ status: "cooldown", cooldown_until: syncState.cooldown_until }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    if (syncState?.is_running) {
      return new Response(
        JSON.stringify({ status: "already_running" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── 3) Marcar como running + setar cooldown de 45s
    await supabase.from("quick_sync_state").upsert({
      company_id,
      seller_id,
      user_id,
      is_running: true,
      cooldown_until: new Date(Date.now() + 45_000).toISOString(),
    }, { onConflict: "company_id" });

    // ── 4) Buscar pedidos quentes da fila (sem limite artificial)
    const { data: hotOrders } = await supabase
      .from("hot_orders_queue")
      .select("order_id, priority")
      .eq("seller_id", seller_id)
      .lte("next_check_at", now.toISOString())
      .gt("expires_at", now.toISOString())
      .order("priority", { ascending: false })
      .order("next_check_at", { ascending: true });

    const orders = hotOrders || [];

    if (orders.length === 0) {
      // Nada para checar agora — buscar pedidos recentes do cache como fallback
      const cutoff = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString();
      const { data: recentOrders } = await supabase
        .from("meli_orders_cache")
        .select("order_id, shipment_id, order_status")
        .eq("seller_id", seller_id)
        .in("order_status", ["paid", "handling"])
        .gte("created_at_meli", cutoff)
        .order("created_at_meli", { ascending: false });

      // Popular a fila com esses pedidos para próxima execução
      if (recentOrders && recentOrders.length > 0) {
        const queueEntries = recentOrders.map((o: any) => ({
          company_id,
          seller_id,
          user_id,
          order_id: o.order_id,
          priority: 0,
          next_check_at: new Date(Date.now() + 30_000).toISOString(),
          expires_at: new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString(),
        }));
        await supabase.from("hot_orders_queue").upsert(queueEntries, {
          onConflict: "seller_id,order_id",
          ignoreDuplicates: false,
        });
      }

      await finalize(supabase, company_id, seller_id, user_id, startedAt, 0, 0, null);
      return new Response(
        JSON.stringify({ status: "ok", orders_checked: 0, changes: 0, msg: "Fila populada com pedidos recentes" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── 5) Para cada pedido na fila, checar status de shipment no cache
    let changesFound = 0;
    const events: any[] = [];
    const nextCheckAt = new Date(Date.now() + 60_000).toISOString(); // próxima verificação em 1 min

    for (const hotOrder of orders) {
      const { data: cachedOrder } = await supabase
        .from("meli_orders_cache")
        .select("order_id, shipment_id, order_status, invoice_data, etiqueta_status")
        .eq("seller_id", seller_id)
        .eq("order_id", hotOrder.order_id)
        .maybeSingle();

      if (!cachedOrder) continue;

      // Checar se NF foi gerada
      const hasNF = !!(cachedOrder.invoice_data && 
        typeof cachedOrder.invoice_data === "object" &&
        (cachedOrder.invoice_data as any)?.fiscal_number);

      // Checar etiqueta (via shipments cache)
      let etiquetaDisponivel = false;
      if (cachedOrder.shipment_id) {
        const { data: shipment } = await supabase
          .from("meli_shipments_cache")
          .select("substatus, status")
          .eq("shipment_id", cachedOrder.shipment_id?.toString())
          .maybeSingle();

        etiquetaDisponivel = shipment?.status === "ready_to_ship" ||
          shipment?.substatus === "invoice_pending" === false;
      }

      // Registrar eventos se houve mudança
      if (hasNF) {
        events.push({
          company_id,
          seller_id,
          user_id,
          order_id: hotOrder.order_id,
          event_type: "NF_GERADA",
          status: "ok",
          metadata: { invoice_data: cachedOrder.invoice_data },
        });
        changesFound++;
      }

      if (etiquetaDisponivel) {
        events.push({
          company_id,
          seller_id,
          user_id,
          order_id: hotOrder.order_id,
          event_type: "ETIQUETA_DISPONIVEL",
          status: "ok",
          metadata: { shipment_id: cachedOrder.shipment_id },
        });
        changesFound++;
      }

      // Atualizar next_check_at na fila
      await supabase
        .from("hot_orders_queue")
        .update({
          last_checked_at: now.toISOString(),
          next_check_at: nextCheckAt,
        })
        .eq("seller_id", seller_id)
        .eq("order_id", hotOrder.order_id);
    }

    // ── 6) Inserir eventos (se houver)
    if (events.length > 0) {
      await supabase.from("operational_events").insert(events);
    }

    // ── 7) Atualizar snapshot do sandbox em TODA execução (garante contadores sincronizados)
    try {
      await supabase.functions.invoke("sandbox-snapshot-refresh", {
        body: { user_id, seller_id, company_id, partial: true },
      });
    } catch (e) {
      console.warn("[QuickSync] Sandbox refresh falhou:", e);
    }

    // ── 8) Remover pedidos expirados da fila
    await supabase
      .from("hot_orders_queue")
      .delete()
      .eq("seller_id", seller_id)
      .lt("expires_at", now.toISOString());

    await finalize(supabase, company_id, seller_id, user_id, startedAt, orders.length, changesFound, null);

    await logSystem(supabase, user_id, "quick_sync_success", {
      seller_id, company_id,
      orders_checked: orders.length,
      changes_found: changesFound,
      duration_ms: Date.now() - startedAt,
    });

    return new Response(
      JSON.stringify({
        status: "ok",
        orders_checked: orders.length,
        changes: changesFound,
        events_recorded: events.length,
        duration_ms: Date.now() - startedAt,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (err: any) {
    console.error("[QuickSync] Erro:", err);

    await logSystem(supabase, body?.user_id || "unknown", "quick_sync_error", {
      error: err?.message || String(err),
    }).catch(() => {});

    return new Response(
      JSON.stringify({ error: err?.message || "Erro interno" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  // ── Helpers ──

  async function finalize(
    db: any, company_id: string, seller_id: string, user_id: string,
    startedAt: number, checked: number, changes: number, error: string | null
  ) {
    await db.from("quick_sync_state").upsert({
      company_id,
      seller_id,
      user_id,
      is_running: false,
      last_run_at: new Date().toISOString(),
      last_run_duration_ms: Date.now() - startedAt,
      orders_checked: checked,
      changes_found: changes,
      last_error: error,
      cooldown_until: new Date(Date.now() + 45_000).toISOString(),
    }, { onConflict: "company_id" });
  }

  async function logSystem(db: any, userId: string, action: string, meta: Record<string, unknown>) {
    try {
      await db.from("system_logs").insert({
        level: "info",
        system_area: "operational_quick_sync",
        action,
        message: `QuickSync: ${action}`,
        meta_json: { user_id: userId, ...meta },
        success: !action.includes("error"),
      });
    } catch { /* fail-safe */ }
  }
});

// Needed to fix variable reference in catch
let body: any = {};
