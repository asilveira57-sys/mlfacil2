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

    // Get user from auth header or body
    const body = await req.json().catch(() => ({}));
    let userId = body.user_id;

    if (!userId) {
      // Try JWT
      const authHeader = req.headers.get("authorization");
      if (authHeader) {
        const token = authHeader.replace("Bearer ", "");
        const { data: { user } } = await supabase.auth.getUser(token);
        userId = user?.id;
      }
    }

    if (!userId) {
      return new Response(JSON.stringify({ error: "user_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`[sandbox-refresh] Starting for user=${userId}`);

    // 1. Get all active companies for user
    const { data: companies, error: compErr } = await supabase
      .from("companies")
      .select("id, display_name")
      .eq("user_id", userId)
      .eq("is_active", true);

    if (compErr) throw compErr;
    if (!companies || companies.length === 0) {
      return new Response(JSON.stringify({ success: true, companies: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 2. Get marketplace accounts linked to these companies
    const companyIds = companies.map((c) => c.id);
    const { data: accounts } = await supabase
      .from("marketplace_accounts")
      .select("id, company_id, external_user_id")
      .in("company_id", companyIds)
      .eq("is_active", true);

    // Build a map company_id -> seller_id
    const companySellerMap = new Map<string, string>();
    (accounts || []).forEach((a) => {
      if (a.company_id && a.external_user_id) {
        companySellerMap.set(a.company_id, a.external_user_id);
      }
    });

    // Also check ml_accounts for legacy mapping
    const { data: mlAccounts } = await supabase
      .from("ml_accounts")
      .select("id, ml_user_id")
      .eq("user_id", userId)
      .eq("is_active", true);

    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const weekAgoStr = weekAgo.toISOString();
    const results: any[] = [];

    for (const company of companies) {
      const sellerId = companySellerMap.get(company.id) ||
        (mlAccounts && mlAccounts.length > 0 ? mlAccounts[0].ml_user_id : null);

      if (!sellerId) {
        // No seller linked, create empty snapshot
        results.push({
          company_id: company.id,
          user_id: userId,
          seller_id: "none",
          snapshot_status: "no_account",
        });
        continue;
      }

      try {
        // === COMERCIAL (week) ===
        const { data: salesData } = await supabase
          .from("meli_orders_cache")
          .select("order_id, total_amount")
          .eq("seller_id", sellerId)
          .eq("order_status", "paid")
          .gte("created_at_meli", weekAgoStr);

        const pedidosSemana = salesData?.length || 0;
        const totalVendasSemana = (salesData || []).reduce(
          (s, o) => s + Number(o.total_amount || 0),
          0,
        );
        const ticketMedio = pedidosSemana > 0
          ? totalVendasSemana / pedidosSemana
          : 0;

        // Top product (from items cache, last week)
        const { data: topProducts } = await supabase
          .from("meli_order_items_cache")
          .select("title_short, title, quantity")
          .eq("seller_id", sellerId);

        // Aggregate top product
        const productMap = new Map<string, { name: string; qty: number }>();
        (topProducts || []).forEach((item) => {
          const name = item.title_short || item.title || "?";
          const existing = productMap.get(name);
          if (existing) {
            existing.qty += item.quantity || 1;
          } else {
            productMap.set(name, { name, qty: item.quantity || 1 });
          }
        });
        const topProduct = [...productMap.values()].sort((a, b) =>
          b.qty - a.qty
        )[0]?.name || null;

        // === OPERAÇÃO ===
        const { count: etiquetasPend } = await supabase
          .from("meli_print_queue")
          .select("*", { count: "exact", head: true })
          .eq("seller_id", sellerId)
          .eq("status", "pending");

        const { count: perguntasPend } = await supabase
          .from("meli_questions_cache")
          .select("*", { count: "exact", head: true })
          .eq("seller_id", sellerId)
          .eq("status", "UNANSWERED");

        // === ADS ===
        const { data: adsData } = await supabase
          .from("ads_daily_metrics")
          .select("spent, revenue, acos, roas")
          .eq("seller_id", sellerId)
          .gte("metric_date", weekAgo.toISOString().split("T")[0]);

        const gastoAds = (adsData || []).reduce(
          (s, d) => s + Number(d.spent || 0),
          0,
        );
        const fatAds = (adsData || []).reduce(
          (s, d) => s + Number(d.revenue || 0),
          0,
        );
        const acosValues = (adsData || []).filter((d) => d.acos != null).map(
          (d) => Number(d.acos),
        );
        const roasValues = (adsData || []).filter((d) => d.roas != null).map(
          (d) => Number(d.roas),
        );
        const acosMedio = acosValues.length > 0
          ? acosValues.reduce((s, v) => s + v, 0) / acosValues.length
          : 0;
        const roasMedio = roasValues.length > 0
          ? roasValues.reduce((s, v) => s + v, 0) / roasValues.length
          : 0;

        // === CUTOFF ===
        const { data: cutoffData } = await supabase
          .from("shipping_cutoff_cache")
          .select("flex_cutoff_time, coleta_cutoff_time")
          .eq("seller_id", sellerId)
          .order("updated_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        const snapshot = {
          company_id: company.id,
          user_id: userId,
          seller_id: sellerId,
          total_vendas_semana: totalVendasSemana,
          pedidos_semana: pedidosSemana,
          ticket_medio: ticketMedio,
          produto_mais_vendido: topProduct,
          etiquetas_pendentes: etiquetasPend || 0,
          nf_pendentes: 0,
          perguntas_pendentes: perguntasPend || 0,
          pedidos_envio: 0,
          reclamacoes_abertas: 0,
          reclamacoes_aguardando: 0,
          pos_venda_pendente: 0,
          mediacoes_abertas: 0,
          gasto_ads_semana: gastoAds,
          faturamento_ads_semana: fatAds,
          acos_medio: acosMedio,
          roas_medio: roasMedio,
          cutoff_flex_time: cutoffData?.flex_cutoff_time || null,
          cutoff_coleta_time: cutoffData?.coleta_cutoff_time || null,
          estoque_critico: 0,
          snapshot_status: "ok",
          snapshot_error: null,
          updated_at: new Date().toISOString(),
        };

        results.push(snapshot);
      } catch (err: any) {
        console.error(
          `[sandbox-refresh] Error for company ${company.id}:`,
          err,
        );
        results.push({
          company_id: company.id,
          user_id: userId,
          seller_id: sellerId,
          snapshot_status: "error",
          snapshot_error: err.message,
          updated_at: new Date().toISOString(),
        });
      }
    }

    // 3. Upsert all snapshots
    for (const snap of results) {
      await supabase
        .from("sandbox_company_snapshot")
        .upsert(snap, { onConflict: "company_id" });
    }

    const executionTime = Date.now() - startTime;
    console.log(
      `[sandbox-refresh] Completed ${results.length} companies in ${executionTime}ms`,
    );

    // Log
    await supabase.from("system_logs").insert({
      level: "info",
      system_area: "sandbox",
      action: "snapshot_refresh",
      message:
        `Sandbox snapshot refresh completed for ${results.length} companies in ${executionTime}ms`,
      meta_json: {
        user_id: userId,
        companies_count: results.length,
        execution_time_ms: executionTime,
      },
    });

    return new Response(
      JSON.stringify({
        success: true,
        companies: results.length,
        execution_time_ms: executionTime,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error: any) {
    console.error("[sandbox-refresh] Error:", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
