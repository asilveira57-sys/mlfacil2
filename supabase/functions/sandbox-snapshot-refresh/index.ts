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

    // 2. Get ml_accounts linked to these companies
    const companyIds = companies.map((c) => c.id);
    const { data: mlAccounts } = await supabase
      .from("ml_accounts")
      .select("id, ml_user_id, company_id, nickname")
      .eq("user_id", userId)
      .eq("is_active", true);

    // Build maps: company_id -> ml_user_id (seller string) AND company_id -> ml_account.id (UUID)
    const companySellerMap = new Map<string, string>();
    const companyAccountIdMap = new Map<string, string>();
    (mlAccounts || []).forEach((a) => {
      if (a.company_id && a.ml_user_id) {
        companySellerMap.set(a.company_id, a.ml_user_id);
        companyAccountIdMap.set(a.company_id, a.id);
      }
    });

    // Fallback: marketplace_accounts
    const { data: marketplaceAccounts } = await supabase
      .from("marketplace_accounts")
      .select("id, company_id, external_user_id")
      .in("company_id", companyIds)
      .eq("is_active", true);

    (marketplaceAccounts || []).forEach((a) => {
      if (a.company_id && a.external_user_id && !companySellerMap.has(a.company_id)) {
        companySellerMap.set(a.company_id, a.external_user_id);
      }
    });

    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const weekAgoStr = weekAgo.toISOString();
    const results: any[] = [];

    for (const company of companies) {
      const sellerId = companySellerMap.get(company.id) || null;
      const accountId = companyAccountIdMap.get(company.id) || null;

      if (!sellerId) {
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
          (s, o) => s + Number(o.total_amount || 0), 0,
        );
        const ticketMedio = pedidosSemana > 0 ? totalVendasSemana / pedidosSemana : 0;

        // Top product
        const { data: topProducts } = await supabase
          .from("meli_order_items_cache")
          .select("title_short, title, quantity")
          .eq("seller_id", sellerId);

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
        const topProduct = [...productMap.values()].sort((a, b) => b.qty - a.qty)[0]?.name || null;

        // === OPERAÇÃO ===
        // Etiquetas pendentes: only count shipments from last 7 days to avoid stale records
        const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
        const { count: etiquetasReadyToPrint } = await supabase
          .from("meli_shipments_cache")
          .select("*", { count: "exact", head: true })
          .eq("seller_id", sellerId)
          .eq("shipment_status", "ready_to_ship")
          .eq("shipment_substatus", "ready_to_print")
          .gte("last_sync_at", sevenDaysAgo);

        // Print queue backup: also filter by last 7 days to avoid stale "gerada" records
        const { count: etiquetasNaFila } = await supabase
          .from("meli_print_queue")
          .select("*", { count: "exact", head: true })
          .eq("seller_id", sellerId)
          .eq("status", "gerada")
          .gte("created_at", sevenDaysAgo);

        const etiquetasPend = Math.max(etiquetasReadyToPrint || 0, etiquetasNaFila || 0);

        // Perguntas pendentes: qa_questions with status 'pending'
        const { count: perguntasPend } = await supabase
          .from("qa_questions")
          .select("*", { count: "exact", head: true })
          .eq("seller_id", sellerId)
          .eq("status", "pending");

        // Pedidos aguardando envio (from shipments cache, not orders)
        const { count: pedidosEnvio } = await supabase
          .from("meli_shipments_cache")
          .select("*", { count: "exact", head: true })
          .eq("seller_id", sellerId)
          .eq("shipment_status", "ready_to_ship")
          .in("shipment_substatus", ["ready_to_print", "invoice_pending", "ready_to_pack"]);

        // === VENDAS PARA DESPACHAR AMANHÃ ===
        // Count orders with estimated_handling_limit for tomorrow
        const spNowForDespacho = new Date(now.toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
        const tomorrow = new Date(spNowForDespacho);
        tomorrow.setDate(tomorrow.getDate() + 1);
        const tomorrowStr = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, "0")}-${String(tomorrow.getDate()).padStart(2, "0")}`;
        
        const { count: vendasDespacharAmanha } = await supabase
          .from("meli_shipments_cache")
          .select("*", { count: "exact", head: true })
          .eq("seller_id", sellerId)
          .eq("shipment_status", "ready_to_ship")
          .gte("estimated_handling_limit", `${tomorrowStr}T00:00:00`)
          .lt("estimated_handling_limit", `${tomorrowStr}T23:59:59`);

        // === ADS (from ads_period_cache which has actual synced data) ===
        const { data: adsPeriodData } = await supabase
          .from("ads_period_cache")
          .select("total_spent, total_revenue, metric_date")
          .eq("seller_id", sellerId)
          .gte("metric_date", weekAgo.toISOString().split("T")[0])
          .order("metric_date", { ascending: false })
          .limit(7);

        const gastoAds = (adsPeriodData || []).reduce((s, d) => s + Number(d.total_spent || 0), 0);
        const fatAds = (adsPeriodData || []).reduce((s, d) => s + Number(d.total_revenue || 0), 0);
        const acosMedio = fatAds > 0 ? (gastoAds / fatAds) * 100 : 0;
        const roasMedio = gastoAds > 0 ? fatAds / gastoAds : 0;

        // === CUTOFF (uses ml_account UUID as seller_id) ===
        let cutoffFlex: string | null = null;
        let cutoffColeta: string | null = null;

        if (accountId) {
          // Check if we have a fresh cutoff for today (SP timezone)
          const spNow = new Date(now.toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
          const todayStr = `${spNow.getFullYear()}-${String(spNow.getMonth() + 1).padStart(2, "0")}-${String(spNow.getDate()).padStart(2, "0")}`;

          const { data: cutoffData } = await supabase
            .from("shipping_cutoff_cache")
            .select("flex_cutoff_time, colecta_cutoff_time, updated_at")
            .eq("seller_id", accountId)
            .in("status", ["ok", "partial"])
            .order("updated_at", { ascending: false })
            .limit(1)
            .maybeSingle();

          const cutoffIsStale = !cutoffData || !cutoffData.updated_at.startsWith(todayStr);

          if (cutoffIsStale && sellerId) {
            // Trigger cutoff refresh
            try {
              console.log(`[sandbox-refresh] Triggering cutoff refresh for company=${company.id}`);
              const refreshUrl = `${supabaseUrl}/functions/v1/meli-shipping-cutoff-refresh`;
              await fetch(refreshUrl, {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  "Authorization": `Bearer ${serviceKey}`,
                },
                body: JSON.stringify({
                  company_id: company.id,
                  seller_id: accountId,
                  ml_user_id: sellerId,
                }),
              });

              // Re-read after refresh
              const { data: freshCutoff } = await supabase
                .from("shipping_cutoff_cache")
                .select("flex_cutoff_time, colecta_cutoff_time")
                .eq("seller_id", accountId)
                .in("status", ["ok", "partial"])
                .order("updated_at", { ascending: false })
                .limit(1)
                .maybeSingle();

              cutoffFlex = freshCutoff?.flex_cutoff_time || null;
              cutoffColeta = freshCutoff?.colecta_cutoff_time || null;
            } catch (cutoffErr: any) {
              console.error(`[sandbox-refresh] Cutoff refresh failed for ${company.id}:`, cutoffErr.message);
              cutoffFlex = cutoffData?.flex_cutoff_time || null;
              cutoffColeta = cutoffData?.colecta_cutoff_time || null;
            }
          } else {
            cutoffFlex = cutoffData?.flex_cutoff_time || null;
            cutoffColeta = cutoffData?.colecta_cutoff_time || null;
          }
        }

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
          pedidos_envio: pedidosEnvio || 0,
          reclamacoes_abertas: 0,
          reclamacoes_aguardando: 0,
          pos_venda_pendente: 0,
          mediacoes_abertas: 0,
          gasto_ads_semana: gastoAds,
          faturamento_ads_semana: fatAds,
          acos_medio: acosMedio,
          roas_medio: roasMedio,
          cutoff_flex_time: cutoffFlex,
          cutoff_coleta_time: cutoffColeta,
          estoque_critico: 0,
          vendas_despachar_amanha: vendasDespacharAmanha || 0,
          snapshot_status: "ok",
          snapshot_error: null,
          updated_at: new Date().toISOString(),
        };

        results.push(snapshot);
      } catch (err: any) {
        console.error(`[sandbox-refresh] Error for company ${company.id}:`, err);
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
    console.log(`[sandbox-refresh] Completed ${results.length} companies in ${executionTime}ms`);

    await supabase.from("system_logs").insert({
      level: "info",
      system_area: "sandbox",
      action: "snapshot_refresh",
      message: `Sandbox snapshot refresh completed for ${results.length} companies in ${executionTime}ms`,
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
