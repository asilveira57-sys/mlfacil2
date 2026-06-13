// @ts-nocheck
/**
 * cost-daily-report
 * Agrega métricas das últimas 24h e grava 1 linha em cost_daily_report.
 * Levanta alertas em cost_alerts quando thresholds são ultrapassados.
 * Idempotente: usa report_date como chave única (upsert).
 */
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-key",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const today = new Date().toISOString().slice(0, 10);

  const safe = async <T>(p: Promise<T>, fallback: T): Promise<T> => {
    try { return await p; } catch { return fallback; }
  };

  // Webhook counters
  const recv = await safe(
    supabase.from("webhook_events").select("id", { count: "exact", head: true }).gte("received_at", since),
    { count: 0 } as any,
  );
  const disc = await safe(
    supabase.from("webhook_events").select("id", { count: "exact", head: true }).eq("status", "skipped").gte("received_at", since),
    { count: 0 } as any,
  );
  const proc = await safe(
    supabase.from("webhook_events").select("id", { count: "exact", head: true }).eq("status", "processed").gte("received_at", since),
    { count: 0 } as any,
  );
  const pending = await safe(
    supabase.from("webhook_events").select("id", { count: "exact", head: true }).eq("status", "pending"),
    { count: 0 } as any,
  );

  // Table sizes via pg
  const sizes: Record<string, number> = {};
  try {
    const { data } = await supabase.rpc("exec_sql_readonly", {
      query: `select relname, pg_total_relation_size(c.oid)/1024.0/1024.0 as mb
              from pg_class c join pg_namespace n on n.oid=c.relnamespace
              where n.nspname='public' and relname in ('webhook_events','meli_print_queue_v2','meli_orders_cache')`,
    } as any);
    (data as any[] | null)?.forEach((r) => { sizes[r.relname] = Number(r.mb || 0); });
  } catch { /* exec_sql_readonly may not exist; ignore */ }

  // Sellers
  const activeSellers = await safe(
    supabase.from("profiles").select("user_id", { count: "exact", head: true })
      .gte("last_login_at", new Date(Date.now() - 3 * 86400_000).toISOString()),
    { count: 0 } as any,
  );
  const inactiveSellers = await safe(
    supabase.from("profiles").select("user_id", { count: "exact", head: true })
      .lt("last_login_at", new Date(Date.now() - 3 * 86400_000).toISOString()),
    { count: 0 } as any,
  );

  // Jobs (best-effort, only if tables exist)
  let jobsExec = 0, jobsBlockedHours = 0, jobsBlockedInactivity = 0;
  try {
    const { count } = await supabase.from("queue_execution_log").select("id", { count: "exact", head: true })
      .gte("created_at", since);
    jobsExec = count ?? 0;
  } catch { /* ignore */ }
  try {
    const { data } = await supabase.from("system_logs").select("meta_json")
      .eq("action", "auto_sync").eq("success", false).gte("created_at", since).limit(5000);
    (data as any[] | null)?.forEach((r) => {
      const reason = r?.meta_json?.reason;
      if (reason === "outside_hours" || reason === "saturday_economy" || reason === "sunday_blocked") jobsBlockedHours++;
      if (reason === "inactive_user") jobsBlockedInactivity++;
    });
  } catch { /* ignore */ }

  const row = {
    report_date: today,
    webhooks_received: (recv as any).count ?? 0,
    webhooks_discarded: (disc as any).count ?? 0,
    webhooks_processed: (proc as any).count ?? 0,
    webhooks_pending: (pending as any).count ?? 0,
    webhook_events_size_mb: sizes["webhook_events"] ?? 0,
    print_queue_size_mb: sizes["meli_print_queue_v2"] ?? 0,
    orders_cache_size_mb: sizes["meli_orders_cache"] ?? 0,
    sellers_active: (activeSellers as any).count ?? 0,
    sellers_inactive_suspended: (inactiveSellers as any).count ?? 0,
    jobs_executed: jobsExec,
    jobs_blocked_by_hours: jobsBlockedHours,
    jobs_blocked_by_inactivity: jobsBlockedInactivity,
    storage_freed_mb: 0,
    raw: { generated_at: new Date().toISOString() },
    updated_at: new Date().toISOString(),
  };

  await supabase.from("cost_daily_report").upsert(row, { onConflict: "report_date" });

  // Threshold alerts
  if (row.webhooks_pending > 50_000) {
    await supabase.rpc("raise_cost_alert", {
      p_kind: "webhook_pending_high", p_severity: "warn",
      p_payload: { pending: row.webhooks_pending },
    });
  }
  if (row.webhooks_received > 100_000) {
    await supabase.rpc("raise_cost_alert", {
      p_kind: "webhook_received_high", p_severity: "warn",
      p_payload: { received: row.webhooks_received },
    });
  }
  if (row.print_queue_size_mb > 500) {
    await supabase.rpc("raise_cost_alert", {
      p_kind: "print_queue_size_high", p_severity: "warn",
      p_payload: { size_mb: row.print_queue_size_mb },
    });
  }

  return new Response(JSON.stringify({ ok: true, report: row }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
