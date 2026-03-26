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

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const body = await req.json().catch(() => ({}));
    const {
      user_id,
      company_id,
      seller_id,
      snapshot_type, // initial | ads | promo | periodic
      period_days = 0,
    } = body;

    if (!user_id || !snapshot_type) {
      return new Response(
        JSON.stringify({ error: "user_id and snapshot_type required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[seller-journey-snapshot] type=${snapshot_type} period=${period_days} user=${user_id}`);

    // Log event
    await supabase.from("seller_journey_logs").insert({
      user_id,
      company_id: company_id || null,
      seller_id: seller_id || null,
      event_type: "snapshot_created",
      event_data: { snapshot_type, period_days },
    });

    // ── Collect metrics ──
    const metrics: Record<string, any> = {
      orders_count: 0,
      revenue: 0,
      avg_ticket: 0,
      total_products: 0,
      products_with_sales: 0,
      products_without_sales: 0,
      modules_activated: 0,
      actions_count: 0,
      ads_connected: false,
      campaigns_count: 0,
      acos: 0,
      tacos: 0,
      roas: 0,
      ad_spend: 0,
      ad_revenue: 0,
      promotions_connected: false,
      promotions_count: 0,
      auto_promotions_count: 0,
    };

    // ── VENDAS ──
    if (seller_id && seller_id !== "pending") {
      const { count: ordersCount } = await supabase
        .from("meli_orders_cache")
        .select("*", { count: "exact", head: true })
        .eq("seller_id", seller_id)
        .eq("order_status", "paid");
      metrics.orders_count = ordersCount ?? 0;

      const { data: revData } = await supabase
        .from("meli_orders_cache")
        .select("total_amount")
        .eq("seller_id", seller_id)
        .eq("order_status", "paid");
      if (revData && revData.length > 0) {
        metrics.revenue = revData.reduce((s: number, r: any) => s + (r.total_amount || 0), 0);
        metrics.avg_ticket = metrics.orders_count > 0 ? metrics.revenue / metrics.orders_count : 0;
      }

      // ── PRODUTOS ──
      const { count: totalProducts } = await supabase
        .from("meli_listings_cache")
        .select("*", { count: "exact", head: true })
        .eq("seller_id", seller_id);
      metrics.total_products = totalProducts ?? 0;

      const { count: withSales } = await supabase
        .from("meli_listings_cache")
        .select("*", { count: "exact", head: true })
        .eq("seller_id", seller_id)
        .gt("sold_quantity", 0);
      metrics.products_with_sales = withSales ?? 0;
      metrics.products_without_sales = metrics.total_products - metrics.products_with_sales;
    }

    // ── SISTEMA ──
    if (user_id) {
      const { count: modulesCount } = await supabase
        .from("user_module_usage")
        .select("*", { count: "exact", head: true })
        .eq("user_id", user_id);
      metrics.modules_activated = modulesCount ?? 0;

      const { count: actionsCount } = await supabase
        .from("account_events")
        .select("*", { count: "exact", head: true })
        .eq("user_id", user_id);
      metrics.actions_count = actionsCount ?? 0;
    }

    // ── ADS (always collect if available) ──
    if (seller_id && seller_id !== "pending") {
      const { count: campaignsCount } = await supabase
        .from("ads_campaigns")
        .select("*", { count: "exact", head: true })
        .eq("seller_id", seller_id);
      metrics.campaigns_count = campaignsCount ?? 0;
      metrics.ads_connected = (campaignsCount ?? 0) > 0;

      if (metrics.ads_connected) {
        const { data: adsItems } = await supabase
          .from("ads_items")
          .select("spent, revenue_from_ads, acos, roas")
          .eq("seller_id", seller_id);
        if (adsItems && adsItems.length > 0) {
          metrics.ad_spend = adsItems.reduce((s: number, i: any) => s + (i.spent || 0), 0);
          metrics.ad_revenue = adsItems.reduce((s: number, i: any) => s + (i.revenue_from_ads || 0), 0);
          const validAcos = adsItems.filter((i: any) => i.acos != null && i.acos > 0);
          const validRoas = adsItems.filter((i: any) => i.roas != null && i.roas > 0);
          metrics.acos = validAcos.length > 0 ? validAcos.reduce((s: number, i: any) => s + i.acos, 0) / validAcos.length : 0;
          metrics.roas = validRoas.length > 0 ? validRoas.reduce((s: number, i: any) => s + i.roas, 0) / validRoas.length : 0;
          metrics.tacos = metrics.revenue > 0 ? (metrics.ad_spend / metrics.revenue) * 100 : 0;
        }
      }
    }

    // ── PROMOÇÕES ──
    // Check promotions tables if they exist
    try {
      if (seller_id && seller_id !== "pending") {
        const { count: promosCount } = await supabase
          .from("ml_promotions_cache")
          .select("*", { count: "exact", head: true })
          .eq("seller_id", seller_id);
        metrics.promotions_count = promosCount ?? 0;
        metrics.promotions_connected = (promosCount ?? 0) > 0;
      }
    } catch (_) {
      // Table may not exist
    }

    // ── Insert immutable snapshot ──
    const { data: snapshot, error } = await supabase
      .from("seller_journey_snapshots")
      .insert({
        user_id,
        company_id: company_id || null,
        seller_id: seller_id || null,
        snapshot_type,
        period_days,
        ...metrics,
      })
      .select("id")
      .single();

    if (error) {
      console.error("[seller-journey-snapshot] Insert error:", error);
      throw error;
    }

    console.log(`[seller-journey-snapshot] Created: ${snapshot.id}`);

    return new Response(
      JSON.stringify({ success: true, snapshot_id: snapshot.id, metrics }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("[seller-journey-snapshot] Error:", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
