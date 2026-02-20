import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    // Parse request
    const body = await req.json().catch(() => ({}));
    const mode = body.mode || "incremental"; // "full" | "incremental" | "snapshot"
    const requestedBy = body.requested_by || "system";

    console.log(`[global-metrics-refresh] mode=${mode} by=${requestedBy}`);

    // ---- Aggregate from real tables ----

    // 1. Total sellers (active ml_accounts)
    const { count: totalSellers } = await supabase
      .from("ml_accounts")
      .select("*", { count: "exact", head: true })
      .eq("is_active", true);

    // 2. Total pedidos (paid orders)
    const { count: totalPedidos } = await supabase
      .from("meli_orders_cache")
      .select("*", { count: "exact", head: true })
      .eq("order_status", "paid");

    // 3. Total valor vendido
    const { data: valorData } = await supabase.rpc("get_global_total_revenue");
    const totalValorVendido = valorData ?? 0;

    // 4. Total etiquetas (print queue completed)
    const { count: totalEtiquetas } = await supabase
      .from("meli_print_queue")
      .select("*", { count: "exact", head: true })
      .eq("status", "completed");

    // 5. ADS metrics
    const { data: adsData } = await supabase.rpc("get_global_ads_metrics");
    const adsMetrics = adsData ?? {
      total_spend: 0,
      total_revenue: 0,
      avg_roas: 0,
      avg_acos: 0,
    };

    // 6. Total anúncios ativos
    const { count: totalAnuncios } = await supabase
      .from("meli_listings_cache")
      .select("*", { count: "exact", head: true })
      .eq("status", "active");

    // 7. Total produtos cadastrados (all listings)
    const { count: totalProdutos } = await supabase
      .from("meli_listings_cache")
      .select("*", { count: "exact", head: true });

    // 8. Total precificações
    const { count: totalPrecificacoes } = await supabase
      .from("pricing_simulations")
      .select("*", { count: "exact", head: true });

    // 9. Total logs
    const { count: totalLogs } = await supabase
      .from("system_logs")
      .select("*", { count: "exact", head: true });

    const now = new Date().toISOString();
    const metricsPayload = {
      total_sellers: totalSellers ?? 0,
      total_pedidos: totalPedidos ?? 0,
      total_valor_vendido: totalValorVendido,
      total_etiquetas_impressas: totalEtiquetas ?? 0,
      total_ads_spend: adsMetrics.total_spend ?? 0,
      total_ads_faturamento: adsMetrics.total_revenue ?? 0,
      roas_medio_global: adsMetrics.avg_roas ?? 0,
      acos_medio_global: adsMetrics.avg_acos ?? 0,
      total_anuncios_ativos: totalAnuncios ?? 0,
      total_produtos_cadastrados: totalProdutos ?? 0,
      total_precificacoes_realizadas: totalPrecificacoes ?? 0,
      total_importacoes_vendas: 0,
      total_sugestoes_compra_geradas: 0,
      total_logs_sistema: totalLogs ?? 0,
      updated_at: now,
      ...(mode === "full"
        ? { last_full_refresh_at: now }
        : { last_incremental_at: now }),
    };

    // Upsert singleton
    const { data: existing } = await supabase
      .from("global_metrics_aggregated")
      .select("id")
      .limit(1)
      .single();

    if (existing) {
      await supabase
        .from("global_metrics_aggregated")
        .update(metricsPayload)
        .eq("id", existing.id);
    } else {
      await supabase.from("global_metrics_aggregated").insert(metricsPayload);
    }

    // Monthly snapshot mode
    if (mode === "snapshot") {
      const spDate = new Date(
        new Date().toLocaleString("en-US", {
          timeZone: "America/Sao_Paulo",
        })
      );
      // Previous month
      const snapMonth = spDate.getMonth() === 0 ? 12 : spDate.getMonth();
      const snapYear =
        spDate.getMonth() === 0
          ? spDate.getFullYear() - 1
          : spDate.getFullYear();

      await supabase.from("global_metrics_monthly_snapshot").upsert(
        {
          ano: snapYear,
          mes: snapMonth,
          total_pedidos: totalPedidos ?? 0,
          total_valor_vendido: totalValorVendido,
          total_ads_spend: adsMetrics.total_spend ?? 0,
          total_ads_faturamento: adsMetrics.total_revenue ?? 0,
          total_etiquetas: totalEtiquetas ?? 0,
          total_anuncios: totalAnuncios ?? 0,
          total_sellers: totalSellers ?? 0,
        },
        { onConflict: "ano,mes" }
      );
    }

    // Log
    const executionTime = Date.now() - startTime;
    await supabase.from("system_logs").insert({
      level: "info",
      system_area: "global_metrics",
      action: `refresh_${mode}`,
      message: `Global metrics ${mode} refresh completed in ${executionTime}ms`,
      meta_json: {
        mode,
        requested_by: requestedBy,
        execution_time_ms: executionTime,
        records: metricsPayload,
      },
    });

    return new Response(
      JSON.stringify({
        success: true,
        mode,
        execution_time_ms: executionTime,
        metrics: metricsPayload,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    const executionTime = Date.now() - startTime;
    console.error("[global-metrics-refresh] Error:", error);

    try {
      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
      const sb = createClient(supabaseUrl, serviceKey);
      await sb.from("system_logs").insert({
        level: "error",
        system_area: "global_metrics",
        action: "refresh_error",
        message: error.message,
        meta_json: { execution_time_ms: executionTime },
      });
    } catch (_) {
      // fail-safe
    }

    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
