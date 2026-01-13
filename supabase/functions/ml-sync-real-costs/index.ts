import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MAX_ORDERS_PER_RUN = 500;
const MAX_RUNTIME_MS = 50000;
const PAGE_SIZE = 50;
const STALE_RUNNING_THRESHOLD_MS = 120000;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "No authorization header" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Invalid token" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const { seller_id, action, scope_days, force_resume } = body;

    if (!seller_id) {
      return new Response(JSON.stringify({ error: "seller_id is required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "status") return await handleGetStatus(supabase, seller_id, corsHeaders);
    if (action === "pause") return await handlePause(supabase, user.id, seller_id, corsHeaders);
    if (action === "reset") return await handleReset(supabase, user.id, seller_id, corsHeaders);
    if (action === "continue" || action === "start") {
      return await handleStartOrContinue(supabase, user.id, seller_id, scope_days, force_resume, corsHeaders);
    }
    return await handleGetStatus(supabase, seller_id, corsHeaders);
  } catch (err: unknown) {
    console.error("Error:", err);
    const message = err instanceof Error ? err.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

async function handleGetStatus(supabase: any, sellerId: string, corsHeaders: any) {
  const { data: state } = await supabase.from("meli_real_costs_sync_state").select("*").eq("seller_id", sellerId).maybeSingle();
  const { count: totalPaid } = await supabase.from("meli_orders_cache").select("*", { count: "exact", head: true }).eq("seller_id", sellerId).eq("order_status", "paid");
  const { count: withCosts } = await supabase.from("order_cost_breakdown_cache").select("*", { count: "exact", head: true }).eq("seller_id", sellerId).gt("total_marketplace_cost", 0);
  const coverage = { total_paid: totalPaid || 0, with_costs: withCosts || 0, coverage_percent: totalPaid > 0 ? Math.round((withCosts || 0) / totalPaid * 100) : 0 };
  return new Response(JSON.stringify({ state: state || { status: "idle", processed: 0, total: 0, cursor_offset: 0 }, coverage }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

async function handlePause(supabase: any, userId: string, sellerId: string, corsHeaders: any) {
  const { data } = await supabase.from("meli_real_costs_sync_state").update({ status: "paused", updated_at: new Date().toISOString() }).eq("seller_id", sellerId).eq("user_id", userId).select().maybeSingle();
  return new Response(JSON.stringify({ message: "Paused", state: data }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

async function handleReset(supabase: any, userId: string, sellerId: string, corsHeaders: any) {
  await supabase.from("meli_real_costs_sync_state").delete().eq("seller_id", sellerId).eq("user_id", userId);
  return new Response(JSON.stringify({ message: "Reset complete", state: null }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

async function handleStartOrContinue(supabase: any, userId: string, sellerId: string, scopeDays: number | null, forceResume: boolean, corsHeaders: any) {
  const startTime = Date.now();
  let { data: state } = await supabase.from("meli_real_costs_sync_state").select("*").eq("seller_id", sellerId).maybeSingle();

  if (state?.status === "running") {
    const lastHeartbeat = new Date(state.last_heartbeat_at || state.updated_at).getTime();
    if (Date.now() - lastHeartbeat < STALE_RUNNING_THRESHOLD_MS && !forceResume) {
      return new Response(JSON.stringify({ message: "Already running", state }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
  }

  let totalQuery = supabase.from("meli_orders_cache").select("*", { count: "exact", head: true }).eq("seller_id", sellerId).eq("order_status", "paid");
  if (scopeDays) { const d = new Date(); d.setDate(d.getDate() - scopeDays); totalQuery = totalQuery.gte("created_at_meli", d.toISOString()); }
  const { count: total } = await totalQuery;

  if (!state) {
    const { data: newState } = await supabase.from("meli_real_costs_sync_state").insert({ user_id: userId, seller_id: sellerId, status: "running", scope_days: scopeDays, processed: 0, total: total || 0, cursor_offset: 0, last_heartbeat_at: new Date().toISOString(), started_at: new Date().toISOString(), stats_json: { estimated: 0, billing: 0, with_shipping: 0 } }).select().single();
    state = newState;
  } else {
    const upd: any = { status: "running", total: total || 0, last_heartbeat_at: new Date().toISOString(), updated_at: new Date().toISOString() };
    if (state.status === "idle" || state.status === "done") { upd.started_at = new Date().toISOString(); upd.processed = 0; upd.cursor_offset = 0; upd.stats_json = { estimated: 0, billing: 0, with_shipping: 0 }; }
    const { data: updated } = await supabase.from("meli_real_costs_sync_state").update(upd).eq("seller_id", sellerId).select().single();
    state = updated;
  }

  const { data: mlAccount } = await supabase.from("ml_accounts").select("access_token").eq("ml_user_id", sellerId).eq("is_active", true).maybeSingle();
  if (!mlAccount) { await supabase.from("meli_real_costs_sync_state").update({ status: "error", last_error: "ML account not found" }).eq("seller_id", sellerId); return new Response(JSON.stringify({ error: "ML account not found" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }); }

  let currentOffset = state.cursor_offset, processedInRun = 0;
  const stats = state.stats_json || { estimated: 0, billing: 0, with_shipping: 0 };

  while (processedInRun < MAX_ORDERS_PER_RUN && Date.now() - startTime < MAX_RUNTIME_MS) {
    let q = supabase.from("meli_orders_cache").select("order_id, total_amount, shipment_id").eq("seller_id", sellerId).eq("order_status", "paid").order("created_at_meli", { ascending: true }).range(currentOffset, currentOffset + PAGE_SIZE - 1);
    if (state.scope_days) { const d = new Date(); d.setDate(d.getDate() - state.scope_days); q = q.gte("created_at_meli", d.toISOString()); }
    const { data: orders } = await q;
    if (!orders?.length) {
      await supabase.from("meli_real_costs_sync_state").update({ status: "done", finished_at: new Date().toISOString(), updated_at: new Date().toISOString(), stats_json: stats }).eq("seller_id", sellerId);
      return new Response(JSON.stringify({ message: "Sync complete", processed: state.processed + processedInRun, total: state.total }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const orderIds = orders.map((o: any) => o.order_id);
    const { data: existing } = await supabase.from("order_cost_breakdown_cache").select("order_id, real_cost_synced_at").eq("seller_id", sellerId).in("order_id", orderIds);
    const existingMap = new Map<string, { order_id: string; real_cost_synced_at: string | null }>((existing || []).map((b: { order_id: string; real_cost_synced_at: string | null }) => [b.order_id, b]));
    const rowsToUpsert: any[] = [];

    for (const order of orders) {
      const ex = existingMap.get(order.order_id);
      if (ex?.real_cost_synced_at && Date.now() - new Date(ex.real_cost_synced_at).getTime() < 86400000) { processedInRun++; continue; }
      const costs = await calcCosts(supabase, mlAccount.access_token, sellerId, userId, order, stats);
      if (costs) rowsToUpsert.push(costs);
      processedInRun++;
      if (Date.now() - startTime >= MAX_RUNTIME_MS) break;
    }

    if (rowsToUpsert.length) await supabase.from("order_cost_breakdown_cache").upsert(rowsToUpsert, { onConflict: "seller_id,order_id" });
    currentOffset += orders.length;
    await supabase.from("meli_real_costs_sync_state").update({ cursor_offset: currentOffset, processed: state.processed + processedInRun, last_page_size: orders.length, last_heartbeat_at: new Date().toISOString(), updated_at: new Date().toISOString(), stats_json: stats }).eq("seller_id", sellerId);
  }

  await supabase.from("meli_real_costs_sync_state").update({ status: "paused", cursor_offset: currentOffset, processed: state.processed + processedInRun, last_heartbeat_at: new Date().toISOString(), updated_at: new Date().toISOString(), stats_json: stats }).eq("seller_id", sellerId);
  return new Response(JSON.stringify({ message: "Paused (budget reached)", processed: state.processed + processedInRun, total: state.total, cursor_offset: currentOffset }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

async function calcCosts(supabase: any, accessToken: string, sellerId: string, userId: string, order: any, stats: any) {
  const { order_id, total_amount, shipment_id } = order;
  let feeML = 0, feeMLSource = "estimated", shippingCostSeller = 0;
  const sourceRefs: string[] = [];

  if (shipment_id) {
    const { data: sc } = await supabase.from("meli_shipment_costs_cache").select("sender_cost").eq("shipment_id", shipment_id).maybeSingle();
    if (sc) { shippingCostSeller = sc.sender_cost || 0; sourceRefs.push("shipment:cache"); stats.with_shipping++; }
    else {
      try {
        const r = await fetch(`https://api.mercadolibre.com/shipments/${shipment_id}/costs`, { headers: { Authorization: `Bearer ${accessToken}` } });
        if (r.ok) { const d = await r.json(); shippingCostSeller = d.sender?.cost || 0; sourceRefs.push("shipment:api"); stats.with_shipping++; await supabase.from("meli_shipment_costs_cache").upsert({ user_id: userId, seller_id: sellerId, shipment_id, order_id, sender_cost: shippingCostSeller, gross_amount: d.gross_amount || 0, raw_json: d, synced_at: new Date().toISOString() }, { onConflict: "shipment_id" }); }
      } catch {}
    }
  }

  if (total_amount > 0) {
    const priceBucket = Math.round(total_amount / 10) * 10;
    const { data: cf } = await supabase.from("meli_listing_fee_cache").select("fee_amount").eq("seller_id", sellerId).eq("price_bucket", priceBucket).maybeSingle();
    if (cf) { feeML = cf.fee_amount; sourceRefs.push("fee:cache"); }
    else {
      feeML = Math.round(total_amount * 0.17 * 100) / 100; sourceRefs.push("fee:estimated");
      try {
        const r = await fetch(`https://api.mercadolibre.com/sites/MLB/listing_prices?price=${total_amount}&listing_type_id=gold_pro`, { headers: { Authorization: `Bearer ${accessToken}` } });
        if (r.ok) { const d = await r.json(); if (d.sale_fee_amount > 0) { feeML = d.sale_fee_amount; feeMLSource = "listing_prices"; sourceRefs.push("fee:listing_prices"); stats.billing++; await supabase.from("meli_listing_fee_cache").upsert({ seller_id: sellerId, listing_type_id: "gold_pro", price_bucket: priceBucket, fee_amount: feeML, fee_percent: d.sale_fee_percent, raw_json: d, updated_at: new Date().toISOString() }, { onConflict: "seller_id,listing_type_id,price_bucket" }); } }
      } catch {}
    }
    if (feeMLSource === "estimated") stats.estimated++;
  }

  return { user_id: userId, seller_id: sellerId, order_id, shipment_id, fee_ml: feeML, fee_ml_source: feeMLSource, shipping_cost_seller: shippingCostSeller, installments_cost: 0, adjustments: 0, total_marketplace_cost: feeML + shippingCostSeller, has_real_financial: feeMLSource !== "estimated", has_real_cost: false, source_refs: { refs: sourceRefs }, real_cost_synced_at: new Date().toISOString(), calculated_at: new Date().toISOString(), status: "calculated" };
}
