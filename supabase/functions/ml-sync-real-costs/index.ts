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
  
  // Count orders with REAL billing data (not pending or estimated)
  const { count: withRealBilling } = await supabase
    .from("order_cost_breakdown_cache")
    .select("*", { count: "exact", head: true })
    .eq("seller_id", sellerId)
    .eq("fee_ml_source", "billing");

  // Count orders with pending billing
  const { count: withPendingBilling } = await supabase
    .from("order_cost_breakdown_cache")
    .select("*", { count: "exact", head: true })
    .eq("seller_id", sellerId)
    .eq("fee_ml_source", "pending");

  // Count total processed
  const { count: totalProcessed } = await supabase
    .from("order_cost_breakdown_cache")
    .select("*", { count: "exact", head: true })
    .eq("seller_id", sellerId);

  const coverage = { 
    total_paid: totalPaid || 0, 
    with_real_billing: withRealBilling || 0,
    with_pending_billing: withPendingBilling || 0,
    total_processed: totalProcessed || 0,
    coverage_percent: totalPaid > 0 ? Math.round((withRealBilling || 0) / totalPaid * 100) : 0 
  };

  return new Response(JSON.stringify({ 
    state: state || { status: "idle", processed: 0, total: 0, cursor_offset: 0 }, 
    coverage 
  }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

async function handlePause(supabase: any, userId: string, sellerId: string, corsHeaders: any) {
  const { data } = await supabase.from("meli_real_costs_sync_state").update({ status: "paused", updated_at: new Date().toISOString() }).eq("seller_id", sellerId).eq("user_id", userId).select().maybeSingle();
  return new Response(JSON.stringify({ message: "Paused", state: data }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

async function handleReset(supabase: any, userId: string, sellerId: string, corsHeaders: any) {
  await supabase.from("meli_real_costs_sync_state").delete().eq("seller_id", sellerId).eq("user_id", userId);
  // Also reset the cost breakdown cache to pending state
  await supabase.from("order_cost_breakdown_cache")
    .update({ 
      fee_ml: 0, 
      fee_ml_source: "pending", 
      total_marketplace_cost: 0,
      has_real_financial: false,
      real_cost_synced_at: null 
    })
    .eq("seller_id", sellerId)
    .eq("user_id", userId);
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
    const { data: newState } = await supabase.from("meli_real_costs_sync_state").insert({ 
      user_id: userId, seller_id: sellerId, status: "running", scope_days: scopeDays, 
      processed: 0, total: total || 0, cursor_offset: 0, 
      last_heartbeat_at: new Date().toISOString(), started_at: new Date().toISOString(), 
      stats_json: { billing: 0, pending: 0, with_shipping: 0 } 
    }).select().single();
    state = newState;
  } else {
    const upd: any = { status: "running", total: total || 0, last_heartbeat_at: new Date().toISOString(), updated_at: new Date().toISOString() };
    // Only reset when status is "idle" - "done" should allow continuing from where it left
    if (state.status === "idle") { 
      upd.started_at = new Date().toISOString(); 
      upd.processed = 0; 
      upd.cursor_offset = 0; 
      upd.stats_json = { billing: 0, pending: 0, with_shipping: 0 }; 
    }
    // Update scope_days if provided
    if (scopeDays && scopeDays !== state.scope_days) {
      upd.scope_days = scopeDays;
    }
    const { data: updated } = await supabase.from("meli_real_costs_sync_state").update(upd).eq("seller_id", sellerId).select().single();
    state = updated;
  }

  // Get ML account for shipping costs API
  const { data: mlAccount } = await supabase.from("ml_accounts").select("access_token").eq("ml_user_id", sellerId).eq("is_active", true).maybeSingle();
  if (!mlAccount) { 
    await supabase.from("meli_real_costs_sync_state").update({ status: "error", last_error: "ML account not found" }).eq("seller_id", sellerId); 
    return new Response(JSON.stringify({ error: "ML account not found" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }); 
  }

  let currentOffset = state.cursor_offset, processedInRun = 0;
  const stats = state.stats_json || { billing: 0, pending: 0, with_shipping: 0 };

  while (processedInRun < MAX_ORDERS_PER_RUN && Date.now() - startTime < MAX_RUNTIME_MS) {
    let q = supabase.from("meli_orders_cache").select("order_id, total_amount, shipment_id, created_at_meli").eq("seller_id", sellerId).eq("order_status", "paid").order("created_at_meli", { ascending: true }).range(currentOffset, currentOffset + PAGE_SIZE - 1);
    if (state.scope_days) { const d = new Date(); d.setDate(d.getDate() - state.scope_days); q = q.gte("created_at_meli", d.toISOString()); }
    const { data: orders } = await q;
    
    if (!orders?.length) {
      await supabase.from("meli_real_costs_sync_state").update({ status: "done", finished_at: new Date().toISOString(), updated_at: new Date().toISOString(), stats_json: stats }).eq("seller_id", sellerId);
      return new Response(JSON.stringify({ message: "Sync complete", processed: state.processed + processedInRun, total: state.total }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const orderIds = orders.map((o: any) => o.order_id);
    
    // Check existing processed orders
    const { data: existing } = await supabase.from("order_cost_breakdown_cache").select("order_id, real_cost_synced_at, fee_ml_source").eq("seller_id", sellerId).in("order_id", orderIds);
    const existingMap = new Map<string, { order_id: string; real_cost_synced_at: string | null; fee_ml_source: string | null }>((existing || []).map((b: { order_id: string; real_cost_synced_at: string | null; fee_ml_source: string | null }) => [b.order_id, b]));
    
    // Fetch billing details for these orders from our cache
    const { data: billingDetails } = await supabase
      .from("meli_billing_details_cache")
      .select("order_id, charge_type, gross_amount")
      .eq("seller_id", sellerId)
      .in("order_id", orderIds.map((id: string) => parseInt(id)));

    // Group billing details by order_id
    const billingByOrder = new Map<string, { fee_ml: number; shipping: number; installments: number; adjustments: number }>();
    for (const detail of (billingDetails || [])) {
      const orderId = String(detail.order_id);
      if (!billingByOrder.has(orderId)) {
        billingByOrder.set(orderId, { fee_ml: 0, shipping: 0, installments: 0, adjustments: 0 });
      }
      const entry = billingByOrder.get(orderId)!;
      const chargeType = (detail.charge_type || "").toLowerCase();
      const amount = Math.abs(detail.gross_amount || 0);
      const isCredit = (detail.gross_amount || 0) < 0; // Negative = credit/refund

      // Brazilian Portuguese charge types from MLB billing API
      // Comissões ML + MP (sale fees)
      if (chargeType.includes("custo por vender") || 
          chargeType.includes("custo por cobrar") ||
          chargeType.includes("cargo por venta") || 
          chargeType.includes("sale_fee") || 
          chargeType === "sale_fee_amount") {
        if (isCredit) {
          entry.adjustments -= amount; // Refund of fees
        } else {
          entry.fee_ml += amount;
        }
      } 
      // Shipping fees (tarifas de envio)
      else if (chargeType.includes("tarifa de envio") || 
               chargeType.includes("envio extra") ||
               chargeType.includes("envio intermunicipal") ||
               chargeType.includes("mercado envíos") || 
               chargeType.includes("shipping") || 
               chargeType === "shipping_fee") {
        if (isCredit) {
          entry.adjustments -= amount;
        } else {
          entry.shipping += amount;
        }
      } 
      // Installment fees (parcelamento)
      else if (chargeType.includes("taxa de parcelamento") || 
               chargeType.includes("cuota") || 
               chargeType.includes("installment")) {
        if (isCredit) {
          entry.adjustments -= amount;
        } else {
          entry.installments += amount;
        }
      } 
      // Adjustments and cancellations
      else if (chargeType.includes("ajuste") || 
               chargeType.includes("adjustment") ||
               chargeType.includes("cancelamento") ||
               chargeType.includes("reembolso") ||
               chargeType.includes("bonificação") ||
               chargeType.includes("estorno")) {
        // Credits reduce costs, debits add to costs
        if (isCredit) {
          entry.adjustments -= amount;
        } else {
          entry.adjustments += amount;
        }
      }
      // Any other charge type - add to fee_ml as fallback
      else if (amount > 0 && !isCredit) {
        entry.fee_ml += amount;
      }
    }

    const rowsToUpsert: any[] = [];

    for (const order of orders) {
      const ex = existingMap.get(order.order_id);
      // Skip if already synced with billing data in the last 24h
      if (ex?.real_cost_synced_at && ex.fee_ml_source === 'billing' && Date.now() - new Date(ex.real_cost_synced_at).getTime() < 86400000) { 
        processedInRun++; 
        continue; 
      }

      const billing = billingByOrder.get(order.order_id);
      let feeML = 0, feeMLSource = "pending", shippingCostSeller = 0, installmentsCost = 0, adjustments = 0;
      const sourceRefs: string[] = [];

      if (billing && billing.fee_ml > 0) {
        // We have real billing data!
        feeML = billing.fee_ml;
        feeMLSource = "billing";
        shippingCostSeller = billing.shipping;
        installmentsCost = billing.installments;
        adjustments = billing.adjustments;
        sourceRefs.push("billing:api");
        stats.billing++;
      } else {
        // No billing data yet - mark as pending (NOT estimated!)
        feeMLSource = "pending";
        sourceRefs.push("billing:pending");
        stats.pending++;
      }

      // Try to get shipping cost from shipment API if we don't have it from billing
      if (order.shipment_id && shippingCostSeller === 0) {
        const { data: sc } = await supabase.from("meli_shipment_costs_cache").select("sender_cost").eq("shipment_id", order.shipment_id).maybeSingle();
        if (sc) { 
          shippingCostSeller = sc.sender_cost || 0; 
          sourceRefs.push("shipment:cache"); 
          if (shippingCostSeller > 0) stats.with_shipping++;
        } else {
          try {
            const r = await fetch(`https://api.mercadolibre.com/shipments/${order.shipment_id}/costs`, { 
              headers: { Authorization: `Bearer ${mlAccount.access_token}` } 
            });
            if (r.ok) { 
              const d = await r.json(); 
              shippingCostSeller = d.sender?.cost || 0; 
              sourceRefs.push("shipment:api"); 
              if (shippingCostSeller > 0) stats.with_shipping++;
              await supabase.from("meli_shipment_costs_cache").upsert({ 
                user_id: userId, seller_id: sellerId, shipment_id: order.shipment_id, order_id: order.order_id, 
                sender_cost: shippingCostSeller, gross_amount: d.gross_amount || 0, raw_json: d, 
                synced_at: new Date().toISOString() 
              }, { onConflict: "shipment_id" }); 
            }
          } catch {}
        }
      }

      const totalMarketplaceCost = feeML + shippingCostSeller + installmentsCost + adjustments;
      
      // NEW: Calculate net values (without shipping impact on profit/margin)
      // For now, we store the shipping_cost_seller and will calculate shipping_revenue from order data
      // The key insight: profit/margin should be based on product revenue only, not inflated by shipping
      const revenueTotal = order.total_amount || 0;
      // Note: receita_envio (shipping_revenue) needs to come from order or billing data
      // For now we'll set it to 0 and let cost-engine populate it from order metadata
      const shippingRevenue = 0; // Will be populated by cost-engine from order data
      const revenueNet = revenueTotal - shippingRevenue; // Product revenue only
      
      // commission_cost = fee_ml (comissão ML) - separate from shipping
      const commissionCost = feeML;
      
      // shipping_balance = shipping_revenue - shipping_cost_seller
      const shippingBalance = shippingRevenue - shippingCostSeller;
      
      // Track missing fields for debugging
      const missingFields: string[] = [];
      if (feeMLSource === "pending") missingFields.push("sem_comissao");
      if (shippingCostSeller === 0 && order.shipment_id) missingFields.push("sem_frete_cobrado");

      rowsToUpsert.push({ 
        user_id: userId, 
        seller_id: sellerId, 
        order_id: order.order_id, 
        shipment_id: order.shipment_id, 
        revenue_total: revenueTotal,
        created_at_meli: order.created_at_meli,
        fee_ml: feeML, 
        fee_ml_source: feeMLSource, 
        shipping_cost_seller: shippingCostSeller, 
        installments_cost: installmentsCost, 
        adjustments: adjustments, 
        total_marketplace_cost: totalMarketplaceCost, 
        has_real_financial: feeMLSource === "billing", 
        has_real_cost: false, 
        source_refs: { refs: sourceRefs }, 
        real_cost_synced_at: new Date().toISOString(), 
        calculated_at: new Date().toISOString(), 
        status: feeMLSource === "billing" ? "calculated" : "pending",
        // NEW separated fields
        commission_cost: commissionCost,
        receita_envio: shippingRevenue,
        shipping_balance: shippingBalance,
        revenue_net: revenueNet,
        missing_fields: missingFields,
        // cost_net, profit_net, margin_net will be calculated by cost-engine with product costs
      });
      
      processedInRun++;
      if (Date.now() - startTime >= MAX_RUNTIME_MS) break;
    }

    if (rowsToUpsert.length) await supabase.from("order_cost_breakdown_cache").upsert(rowsToUpsert, { onConflict: "seller_id,order_id" });
    currentOffset += orders.length;
    await supabase.from("meli_real_costs_sync_state").update({ 
      cursor_offset: currentOffset, 
      processed: state.processed + processedInRun, 
      last_page_size: orders.length, 
      last_heartbeat_at: new Date().toISOString(), 
      updated_at: new Date().toISOString(), 
      stats_json: stats 
    }).eq("seller_id", sellerId);
  }

  await supabase.from("meli_real_costs_sync_state").update({ 
    status: "paused", 
    cursor_offset: currentOffset, 
    processed: state.processed + processedInRun, 
    last_heartbeat_at: new Date().toISOString(), 
    updated_at: new Date().toISOString(), 
    stats_json: stats 
  }).eq("seller_id", sellerId);
  
  return new Response(JSON.stringify({ 
    message: "Paused (budget reached)", 
    processed: state.processed + processedInRun, 
    total: state.total, 
    cursor_offset: currentOffset 
  }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
