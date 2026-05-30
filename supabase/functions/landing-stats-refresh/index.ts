import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const startTime = Date.now();
  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const periodEnd = new Date();
    const periodStart = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    // Aggregate via batched scan (no artificial cap)
    let totalValor = 0;
    let totalPedidos = 0;
    const batchSize = 1000;
    let from = 0;
    while (true) {
      const { data, error } = await supabase
        .from("meli_orders_cache")
        .select("total_amount", { count: "exact" })
        .eq("order_status", "paid")
        .gte("created_at_meli", periodStart.toISOString())
        .range(from, from + batchSize - 1);
      if (error) throw error;
      if (!data || data.length === 0) break;
      for (const row of data) {
        const v = Number((row as any).total_amount) || 0;
        totalValor += v;
        totalPedidos += 1;
      }
      if (data.length < batchSize) break;
      from += batchSize;
    }

    const ticketMedio = totalPedidos > 0 ? totalValor / totalPedidos : 0;
    const pedidosPorDia = totalPedidos / 30;

    const payload = {
      total_valor_30d: totalValor,
      total_pedidos_30d: totalPedidos,
      ticket_medio_30d: ticketMedio,
      pedidos_por_dia_30d: pedidosPorDia,
      period_start: periodStart.toISOString(),
      period_end: periodEnd.toISOString(),
      updated_at: new Date().toISOString(),
    };

    const { data: existing } = await supabase
      .from("landing_public_stats")
      .select("id")
      .limit(1)
      .maybeSingle();

    if (existing) {
      await supabase.from("landing_public_stats").update(payload).eq("id", existing.id);
    } else {
      await supabase.from("landing_public_stats").insert(payload);
    }

    const executionTime = Date.now() - startTime;
    await supabase.from("system_logs").insert({
      level: "info",
      system_area: "landing_stats",
      action: "refresh",
      message: `Landing stats refresh completed in ${executionTime}ms`,
      meta_json: { execution_time_ms: executionTime, ...payload },
    });

    return new Response(
      JSON.stringify({ success: true, execution_time_ms: executionTime, stats: payload }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[landing-stats-refresh] Error:", error);
    return new Response(
      JSON.stringify({ success: false, error: (error as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
