import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MAX_ORDERS_PER_RUN = 800;
const MAX_RUNTIME_MS = 50000;
const PAGE_SIZE = 100;
const BILLING_PAGE_SIZE = 1000;
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
    if (action === "reprocess_pending") {
      return await handleReprocessPending(supabase, user.id, seller_id, scope_days, corsHeaders);
    }
    if (action === "backfill_missing") {
      return await handleBackfillMissing(supabase, user.id, seller_id, scope_days, corsHeaders);
    }
    if (action === "continue_backfill") {
      return await handleContinueBackfill(supabase, user.id, seller_id, corsHeaders);
    }
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
  
  const { count: withRealBilling } = await supabase
    .from("order_cost_breakdown_cache")
    .select("*", { count: "exact", head: true })
    .eq("seller_id", sellerId)
    .eq("fee_ml_source", "billing");

  const { count: withPendingBilling } = await supabase
    .from("order_cost_breakdown_cache")
    .select("*", { count: "exact", head: true })
    .eq("seller_id", sellerId)
    .eq("fee_ml_source", "pending");

  const { count: totalProcessed } = await supabase
    .from("order_cost_breakdown_cache")
    .select("*", { count: "exact", head: true })
    .eq("seller_id", sellerId);

  const missingBreakdown = (totalPaid || 0) - (totalProcessed || 0);

  const coverage = { 
    total_paid: totalPaid || 0, 
    with_real_billing: withRealBilling || 0,
    with_pending_billing: withPendingBilling || 0,
    total_processed: totalProcessed || 0,
    missing_breakdown: missingBreakdown > 0 ? missingBreakdown : 0,
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
  await supabase.from("order_cost_breakdown_cache")
    .update({ 
      fee_ml: 0, 
      fee_ml_source: "pending", 
      total_marketplace_cost: 0,
      has_real_financial: false,
      real_cost_synced_at: null,
      commission_cost: 0,
      shipping_cost_seller: 0,
      installments_cost: 0,
      adjustments: 0,
      cost_fees: 0,
      cost_shipping: 0,
    })
    .eq("seller_id", sellerId)
    .eq("user_id", userId);
  return new Response(JSON.stringify({ message: "Reset complete", state: null }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

// PAGINATED billing data aggregation to handle >1000 records
async function aggregateBillingData(supabase: any, sellerId: string, orderIds: string[], shipmentIds: (string | null)[]) {
  const billingByOrder = new Map<string, { fee_ml: number; shipping: number; installments: number; adjustments: number }>();
  const billingByShipment = new Map<string, { shipping: number; adjustments: number }>();

  // Paginated fetch for order billing
  const numericOrderIds = orderIds.map(id => parseInt(id)).filter(id => !isNaN(id));
  if (numericOrderIds.length > 0) {
    // Process in chunks to avoid query size limits
    for (let i = 0; i < numericOrderIds.length; i += 100) {
      const chunk = numericOrderIds.slice(i, i + 100);
      let offset = 0;
      while (true) {
        const { data, error } = await supabase
          .from("meli_billing_details_cache")
          .select("order_id, shipment_id, charge_type, gross_amount")
          .eq("seller_id", sellerId)
          .in("order_id", chunk)
          .range(offset, offset + BILLING_PAGE_SIZE - 1);
        
        if (error || !data?.length) break;
        
        for (const detail of data) {
          const orderId = String(detail.order_id);
          if (!billingByOrder.has(orderId)) {
            billingByOrder.set(orderId, { fee_ml: 0, shipping: 0, installments: 0, adjustments: 0 });
          }
          processChargeType(billingByOrder.get(orderId)!, detail);
        }
        
        if (data.length < BILLING_PAGE_SIZE) break;
        offset += BILLING_PAGE_SIZE;
      }
    }
  }

  // Paginated fetch for shipment billing (entries without order_id)
  const validShipmentIds = shipmentIds.filter((s): s is string => s !== null);
  const numericShipmentIds = validShipmentIds.map(id => parseInt(id)).filter(id => !isNaN(id));
  if (numericShipmentIds.length > 0) {
    for (let i = 0; i < numericShipmentIds.length; i += 100) {
      const chunk = numericShipmentIds.slice(i, i + 100);
      let offset = 0;
      while (true) {
        const { data, error } = await supabase
          .from("meli_billing_details_cache")
          .select("order_id, shipment_id, charge_type, gross_amount")
          .eq("seller_id", sellerId)
          .is("order_id", null)
          .in("shipment_id", chunk)
          .range(offset, offset + BILLING_PAGE_SIZE - 1);
        
        if (error || !data?.length) break;
        
        for (const detail of data) {
          const shipmentId = String(detail.shipment_id);
          if (!billingByShipment.has(shipmentId)) {
            billingByShipment.set(shipmentId, { shipping: 0, adjustments: 0 });
          }
          const entry = billingByShipment.get(shipmentId)!;
          const chargeType = (detail.charge_type || "").toLowerCase();
          // FIXED: Use signed amount directly
          const amount = detail.gross_amount || 0;

          if (chargeType.includes("tarifa de envio") || 
              chargeType.includes("envio extra") ||
              chargeType.includes("envio intermunicipal") ||
              chargeType.includes("mercado envíos") || 
              chargeType.includes("shipping") || 
              chargeType === "shipping_fee") {
            entry.shipping += amount;
          } else if (chargeType.includes("ajuste") || chargeType.includes("estorno")) {
            entry.adjustments += amount;
          }
        }
        
        if (data.length < BILLING_PAGE_SIZE) break;
        offset += BILLING_PAGE_SIZE;
      }
    }
  }

  return { billingByOrder, billingByShipment };
}

function processChargeType(entry: { fee_ml: number; shipping: number; installments: number; adjustments: number }, detail: any) {
  const chargeType = (detail.charge_type || "").toLowerCase();
  // FIXED: Use signed amount directly instead of Math.abs
  const amount = detail.gross_amount || 0;

  if (chargeType.includes("custo por vender") || 
      chargeType.includes("custo por cobrar") ||
      chargeType.includes("cargo por venta") || 
      chargeType.includes("sale_fee") || 
      chargeType === "sale_fee_amount") {
    entry.fee_ml += amount;
  } else if (chargeType.includes("tarifa de envio") || 
             chargeType.includes("envio extra") ||
             chargeType.includes("envio intermunicipal") ||
             chargeType.includes("mercado envíos") || 
             chargeType.includes("shipping") || 
             chargeType === "shipping_fee") {
    entry.shipping += amount;
  } else if (chargeType.includes("taxa de parcelamento") || 
             chargeType.includes("cuota") || 
             chargeType.includes("installment")) {
    entry.installments += amount;
  } else if (chargeType.includes("ajuste") || 
             chargeType.includes("adjustment") ||
             chargeType.includes("cancelamento") ||
             chargeType.includes("reembolso") ||
             chargeType.includes("bonificação") ||
             chargeType.includes("estorno")) {
    entry.adjustments += amount;
  } else if (amount > 0) {
    // Positive unknown charges go to fee_ml
    entry.fee_ml += amount;
  }
}

async function handleReprocessPending(supabase: any, userId: string, sellerId: string, scopeDays: number | null, corsHeaders: any) {
  const startTime = Date.now();
  
  const { data: mlAccount } = await supabase.from("ml_accounts").select("access_token").eq("ml_user_id", sellerId).eq("is_active", true).maybeSingle();
  if (!mlAccount) { 
    return new Response(JSON.stringify({ error: "ML account not found" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }); 
  }

  let query = supabase
    .from("order_cost_breakdown_cache")
    .select("order_id, shipment_id, revenue_total, created_at_meli, cost_items_total, cost_packaging")
    .eq("seller_id", sellerId)
    .or("fee_ml_source.eq.pending,commission_cost.eq.0")
    .order("created_at_meli", { ascending: false })
    .limit(MAX_ORDERS_PER_RUN);
  
  if (scopeDays) {
    const d = new Date();
    d.setDate(d.getDate() - scopeDays);
    query = query.gte("created_at_meli", d.toISOString());
  }
  
  const { data: pendingOrders, error: queryError } = await query;
  
  if (queryError) {
    return new Response(JSON.stringify({ error: queryError.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
  
  if (!pendingOrders?.length) {
    return new Response(JSON.stringify({ 
      message: "Nenhum pedido pendente encontrado", 
      processed: 0 
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
  
  const orderIds = pendingOrders.map((o: any) => o.order_id);
  const shipmentIds = pendingOrders.map((o: any) => o.shipment_id);

  const { billingByOrder, billingByShipment } = await aggregateBillingData(supabase, sellerId, orderIds, shipmentIds);

  const rowsToUpsert: any[] = [];
  let processedCount = 0;
  let updatedCount = 0;
  
  for (const order of pendingOrders) {
    if (Date.now() - startTime >= MAX_RUNTIME_MS) break;
    
    const billing = billingByOrder.get(order.order_id);
    const shipmentBilling = order.shipment_id ? billingByShipment.get(order.shipment_id) : null;
    
    let feeML = 0, feeMLSource = "pending", shippingCostSeller = 0, installmentsCost = 0, adjustments = 0;
    const sourceRefs: string[] = [];

    if (billing && billing.fee_ml > 0) {
      feeML = billing.fee_ml;
      feeMLSource = "billing";
      shippingCostSeller = billing.shipping;
      installmentsCost = billing.installments;
      adjustments = billing.adjustments;
      sourceRefs.push("billing:order");
      updatedCount++;
    } else {
      feeMLSource = "pending";
      sourceRefs.push("billing:pending");
    }

    if (shippingCostSeller === 0 && shipmentBilling && shipmentBilling.shipping > 0) {
      shippingCostSeller = shipmentBilling.shipping;
      adjustments += shipmentBilling.adjustments;
      sourceRefs.push("billing:shipment");
    }

    if (order.shipment_id && shippingCostSeller === 0) {
      const { data: sc } = await supabase.from("meli_shipment_costs_cache").select("sender_cost").eq("shipment_id", order.shipment_id).maybeSingle();
      if (sc) { 
        shippingCostSeller = sc.sender_cost || 0; 
        sourceRefs.push("shipment:cache"); 
      } else {
        try {
          const r = await fetch(`https://api.mercadolibre.com/shipments/${order.shipment_id}/costs`, { 
            headers: { Authorization: `Bearer ${mlAccount.access_token}` } 
          });
          if (r.ok) { 
            const d = await r.json(); 
            shippingCostSeller = d.sender?.cost || 0; 
            sourceRefs.push("shipment:api"); 
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
    const revenueTotal = order.revenue_total || 0;
    const commissionCost = feeML;
    const costItemsTotal = order.cost_items_total || 0;
    const costPackaging = order.cost_packaging || 0;
    
    // FIXED: Update legacy fields that grid uses
    const costFees = feeML + installmentsCost + adjustments;
    const costShipping = shippingCostSeller;
    const costTotal = costItemsTotal + costPackaging + costFees + costShipping;
    const profitTotal = revenueTotal - costTotal;
    const marginPercent = revenueTotal > 0 ? Math.round((profitTotal / revenueTotal) * 100) : 0;
    
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
      commission_cost: commissionCost,
      missing_fields: missingFields,
      // FIXED: Update legacy fields
      cost_fees: costFees,
      cost_shipping: costShipping,
      cost_total: costTotal,
      profit_total: profitTotal,
      margin_percent: marginPercent,
    });
    
    processedCount++;
  }

  if (rowsToUpsert.length) {
    await supabase.from("order_cost_breakdown_cache").upsert(rowsToUpsert, { onConflict: "seller_id,order_id" });
  }

  return new Response(JSON.stringify({ 
    message: `Reprocessados ${processedCount} pedidos pendentes (${updatedCount} atualizados com dados reais)`,
    processed: processedCount,
    updated: updatedCount,
    total_pending: pendingOrders.length
  }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

// PAGINATED backfill for ALL missing orders - with state persistence
async function handleBackfillMissing(supabase: any, userId: string, sellerId: string, scopeDays: number | null, corsHeaders: any) {
  const startTime = Date.now();
  
  const { data: mlAccount } = await supabase.from("ml_accounts").select("access_token").eq("ml_user_id", sellerId).eq("is_active", true).maybeSingle();
  if (!mlAccount) { 
    return new Response(JSON.stringify({ error: "ML account not found" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }); 
  }

  // Get or create backfill state
  let { data: backfillState } = await supabase
    .from("meli_backfill_sync_state")
    .select("*")
    .eq("seller_id", sellerId)
    .maybeSingle();

  // Count total orders
  let dateFilter: string | null = null;
  if (scopeDays) {
    const d = new Date();
    d.setDate(d.getDate() - scopeDays);
    dateFilter = d.toISOString();
  }

  let totalOrdersQuery = supabase.from("meli_orders_cache").select("*", { count: "exact", head: true }).eq("seller_id", sellerId).eq("order_status", "paid");
  if (dateFilter) totalOrdersQuery = totalOrdersQuery.gte("created_at_meli", dateFilter);
  const { count: totalOrders } = await totalOrdersQuery;

  // Initialize or update state
  if (!backfillState) {
    const { data: newState } = await supabase.from("meli_backfill_sync_state").insert({
      user_id: userId,
      seller_id: sellerId,
      status: "running",
      cursor_offset: 0,
      total_orders: totalOrders || 0,
      processed_orders: 0,
      with_billing: 0,
      started_at: new Date().toISOString(),
      last_heartbeat_at: new Date().toISOString(),
    }).select().single();
    backfillState = newState;
  } else {
    await supabase.from("meli_backfill_sync_state").update({
      status: "running",
      total_orders: totalOrders || 0,
      last_heartbeat_at: new Date().toISOString(),
    }).eq("seller_id", sellerId);
  }

  let batchOffset = backfillState?.cursor_offset || 0;
  let totalCreated = backfillState?.processed_orders || 0;
  let withBilling = backfillState?.with_billing || 0;
  const BATCH_SIZE = 200;

  while (Date.now() - startTime < MAX_RUNTIME_MS) {
    // Get batch of orders
    let ordersQuery = supabase
      .from("meli_orders_cache")
      .select("order_id, total_amount, shipment_id, created_at_meli")
      .eq("seller_id", sellerId)
      .eq("order_status", "paid")
      .order("created_at_meli", { ascending: true })
      .range(batchOffset, batchOffset + BATCH_SIZE - 1);
    
    if (dateFilter) {
      ordersQuery = ordersQuery.gte("created_at_meli", dateFilter);
    }

    const { data: orders } = await ordersQuery;
    if (!orders?.length) {
      // All done
      await supabase.from("meli_backfill_sync_state").update({
        status: "done",
        finished_at: new Date().toISOString(),
        last_heartbeat_at: new Date().toISOString(),
      }).eq("seller_id", sellerId);
      
      return new Response(JSON.stringify({ 
        status: "done",
        message: `Backfill completo! ${totalCreated} registros criados (${withBilling} com billing real)`,
        processed: totalCreated,
        with_billing: withBilling,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Check which ones already have breakdown
    const { data: existingBreakdowns } = await supabase
      .from("order_cost_breakdown_cache")
      .select("order_id")
      .eq("seller_id", sellerId)
      .in("order_id", orders.map((o: any) => o.order_id));

    const existingSet = new Set((existingBreakdowns || []).map((b: any) => b.order_id));
    const missingOrders = orders.filter((o: any) => !existingSet.has(o.order_id));

    if (missingOrders.length === 0) {
      batchOffset += orders.length;
      await supabase.from("meli_backfill_sync_state").update({
        cursor_offset: batchOffset,
        last_heartbeat_at: new Date().toISOString(),
      }).eq("seller_id", sellerId);
      continue;
    }

    console.log(`[BackfillMissing] Batch ${batchOffset}: ${missingOrders.length}/${orders.length} orders need creation`);

    const orderIds = missingOrders.map((o: any) => o.order_id);
    const shipmentIds = missingOrders.map((o: any) => o.shipment_id);

    const { billingByOrder, billingByShipment } = await aggregateBillingData(supabase, sellerId, orderIds, shipmentIds);

    const rowsToInsert: any[] = [];
    let batchCreated = 0;

    for (const order of missingOrders) {
      if (Date.now() - startTime >= MAX_RUNTIME_MS) break;

      const billing = billingByOrder.get(order.order_id);
      const shipmentBilling = order.shipment_id ? billingByShipment.get(order.shipment_id) : null;
      
      let feeML = 0, feeMLSource = "pending", shippingCostSeller = 0, installmentsCost = 0, adjustments = 0;
      const sourceRefs: string[] = [];

      if (billing && billing.fee_ml > 0) {
        feeML = billing.fee_ml;
        feeMLSource = "billing";
        shippingCostSeller = billing.shipping;
        installmentsCost = billing.installments;
        adjustments = billing.adjustments;
        sourceRefs.push("billing:order");
        withBilling++;
      } else {
        feeMLSource = "pending";
        sourceRefs.push("billing:pending");
      }

      if (shippingCostSeller === 0 && shipmentBilling && shipmentBilling.shipping > 0) {
        shippingCostSeller = shipmentBilling.shipping;
        adjustments += shipmentBilling.adjustments;
        sourceRefs.push("billing:shipment");
      }

      if (order.shipment_id && shippingCostSeller === 0) {
        const { data: sc } = await supabase.from("meli_shipment_costs_cache").select("sender_cost").eq("shipment_id", order.shipment_id).maybeSingle();
        if (sc?.sender_cost) { 
          shippingCostSeller = sc.sender_cost; 
          sourceRefs.push("shipment:cache"); 
        } else {
          try {
            const r = await fetch(`https://api.mercadolibre.com/shipments/${order.shipment_id}/costs`, { 
              headers: { Authorization: `Bearer ${mlAccount.access_token}` } 
            });
            if (r.ok) { 
              const d = await r.json(); 
              shippingCostSeller = d.sender?.cost || 0; 
              sourceRefs.push("shipment:api"); 
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
      const revenueTotal = order.total_amount || 0;
      
      const costFees = feeML + installmentsCost + adjustments;
      const costShipping = shippingCostSeller;
      const costTotal = costFees + costShipping;
      const profitTotal = revenueTotal - costTotal;
      const marginPercent = revenueTotal > 0 ? Math.round((profitTotal / revenueTotal) * 100) : 0;
      
      const missingFields: string[] = [];
      if (feeMLSource === "pending") missingFields.push("sem_comissao");
      if (shippingCostSeller === 0 && order.shipment_id) missingFields.push("sem_frete_cobrado");

      rowsToInsert.push({ 
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
        commission_cost: feeML,
        missing_fields: missingFields,
        cost_fees: costFees,
        cost_shipping: costShipping,
        cost_total: costTotal,
        profit_total: profitTotal,
        margin_percent: marginPercent,
      });
      
      batchCreated++;
      totalCreated++;
    }

    if (rowsToInsert.length) {
      const { error } = await supabase.from("order_cost_breakdown_cache").upsert(rowsToInsert, { onConflict: "seller_id,order_id" });
      if (error) console.error(`[BackfillMissing] Upsert error:`, error);
    }

    batchOffset += orders.length;
    
    // Update state after each batch
    await supabase.from("meli_backfill_sync_state").update({
      cursor_offset: batchOffset,
      processed_orders: totalCreated,
      with_billing: withBilling,
      last_heartbeat_at: new Date().toISOString(),
    }).eq("seller_id", sellerId);
  }

  // Paused due to runtime limit
  await supabase.from("meli_backfill_sync_state").update({
    status: "paused",
    cursor_offset: batchOffset,
    processed_orders: totalCreated,
    with_billing: withBilling,
    last_heartbeat_at: new Date().toISOString(),
  }).eq("seller_id", sellerId);

  return new Response(JSON.stringify({ 
    status: "paused",
    message: `Criados ${totalCreated} registros (pausado para continuar)`,
    processed: totalCreated,
    with_billing: withBilling,
    cursor_offset: batchOffset,
  }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

// Continue backfill from saved cursor
async function handleContinueBackfill(supabase: any, userId: string, sellerId: string, corsHeaders: any) {
  const { data: backfillState } = await supabase
    .from("meli_backfill_sync_state")
    .select("*")
    .eq("seller_id", sellerId)
    .maybeSingle();

  if (!backfillState || backfillState.status === 'done') {
    return new Response(JSON.stringify({ 
      status: "done",
      message: "Backfill já completo ou não iniciado"
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  // Just call the main backfill function - it will use the saved cursor
  return await handleBackfillMissing(supabase, userId, sellerId, null, corsHeaders);
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

  const effectiveScope = scopeDays ?? state?.scope_days ?? null;

  let totalQuery = supabase.from("meli_orders_cache").select("*", { count: "exact", head: true }).eq("seller_id", sellerId).eq("order_status", "paid");
  if (effectiveScope) { 
    const d = new Date(); 
    d.setDate(d.getDate() - effectiveScope); 
    totalQuery = totalQuery.gte("created_at_meli", d.toISOString()); 
  }
  const { count: total } = await totalQuery;

  const scopeChanged = state && state.scope_days !== effectiveScope;

  if (!state) {
    const { data: newState } = await supabase.from("meli_real_costs_sync_state").insert({ 
      user_id: userId, seller_id: sellerId, status: "running", scope_days: effectiveScope, 
      processed: 0, total: total || 0, cursor_offset: 0, 
      last_heartbeat_at: new Date().toISOString(), started_at: new Date().toISOString(), 
      stats_json: { billing: 0, pending: 0, with_shipping: 0 } 
    }).select().single();
    state = newState;
  } else {
    const upd: any = { 
      status: "running", 
      total: total || 0, 
      last_heartbeat_at: new Date().toISOString(), 
      updated_at: new Date().toISOString(),
      scope_days: effectiveScope 
    };
    
    if (state.status === "idle" || state.status === "done" || scopeChanged) { 
      upd.started_at = new Date().toISOString(); 
      upd.processed = 0; 
      upd.cursor_offset = 0; 
      upd.stats_json = { billing: 0, pending: 0, with_shipping: 0 }; 
      upd.finished_at = null;
      console.log(`[RealCosts] Resetting sync: status=${state.status}, scopeChanged=${scopeChanged}`);
    }
    
    const { data: updated } = await supabase.from("meli_real_costs_sync_state").update(upd).eq("seller_id", sellerId).select().single();
    state = updated;
  }

  const { data: mlAccount } = await supabase.from("ml_accounts").select("access_token").eq("ml_user_id", sellerId).eq("is_active", true).maybeSingle();
  if (!mlAccount) { 
    await supabase.from("meli_real_costs_sync_state").update({ status: "error", last_error: "ML account not found" }).eq("seller_id", sellerId); 
    return new Response(JSON.stringify({ error: "ML account not found" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }); 
  }

  let currentOffset = state.cursor_offset, processedInRun = 0;
  const stats = state.stats_json || { billing: 0, pending: 0, with_shipping: 0 };

  while (processedInRun < MAX_ORDERS_PER_RUN && Date.now() - startTime < MAX_RUNTIME_MS) {
    let q = supabase.from("meli_orders_cache")
      .select("order_id, total_amount, shipment_id, created_at_meli")
      .eq("seller_id", sellerId)
      .eq("order_status", "paid")
      .order("created_at_meli", { ascending: true })
      .range(currentOffset, currentOffset + PAGE_SIZE - 1);
    
    if (effectiveScope) { 
      const d = new Date(); 
      d.setDate(d.getDate() - effectiveScope); 
      q = q.gte("created_at_meli", d.toISOString()); 
    }
    
    const { data: orders } = await q;
    
    if (!orders?.length) {
      await supabase.from("meli_real_costs_sync_state").update({ 
        status: "done", 
        finished_at: new Date().toISOString(), 
        updated_at: new Date().toISOString(), 
        stats_json: stats,
        processed: state.processed + processedInRun,
        cursor_offset: currentOffset
      }).eq("seller_id", sellerId);
      return new Response(JSON.stringify({ message: "Sync complete", processed: state.processed + processedInRun, total: state.total }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const orderIds = orders.map((o: any) => o.order_id);
    const shipmentIds = orders.map((o: any) => o.shipment_id);
    
    const { data: existing } = await supabase.from("order_cost_breakdown_cache")
      .select("order_id, real_cost_synced_at, fee_ml_source, cost_items_total, cost_packaging")
      .eq("seller_id", sellerId)
      .in("order_id", orderIds);
    const existingMap = new Map<string, any>((existing || []).map((b: any) => [b.order_id, b]));
    
    const { billingByOrder, billingByShipment } = await aggregateBillingData(supabase, sellerId, orderIds, shipmentIds);

    const rowsToUpsert: any[] = [];

    for (const order of orders) {
      const ex = existingMap.get(order.order_id);
      if (ex?.real_cost_synced_at && ex.fee_ml_source === 'billing' && Date.now() - new Date(ex.real_cost_synced_at).getTime() < 86400000) { 
        processedInRun++; 
        continue; 
      }

      const billing = billingByOrder.get(order.order_id);
      const shipmentBilling = order.shipment_id ? billingByShipment.get(order.shipment_id) : null;
      
      let feeML = 0, feeMLSource = "pending", shippingCostSeller = 0, installmentsCost = 0, adjustments = 0;
      const sourceRefs: string[] = [];

      if (billing && billing.fee_ml > 0) {
        feeML = billing.fee_ml;
        feeMLSource = "billing";
        shippingCostSeller = billing.shipping;
        installmentsCost = billing.installments;
        adjustments = billing.adjustments;
        sourceRefs.push("billing:order");
        stats.billing++;
      } else {
        feeMLSource = "pending";
        sourceRefs.push("billing:pending");
        stats.pending++;
      }

      if (shippingCostSeller === 0 && shipmentBilling && shipmentBilling.shipping > 0) {
        shippingCostSeller = shipmentBilling.shipping;
        adjustments += shipmentBilling.adjustments;
        sourceRefs.push("billing:shipment");
      }

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
      const revenueTotal = order.total_amount || 0;
      const commissionCost = feeML;
      const shippingRevenue = 0;
      const revenueNet = revenueTotal - shippingRevenue;
      const shippingBalance = shippingRevenue - shippingCostSeller;
      
      // Get existing cost data for proper total calculation
      const costItemsTotal = ex?.cost_items_total || 0;
      const costPackaging = ex?.cost_packaging || 0;
      
      // FIXED: Update legacy fields
      const costFees = feeML + installmentsCost + adjustments;
      const costShipping = shippingCostSeller;
      const costTotal = costItemsTotal + costPackaging + costFees + costShipping;
      const profitTotal = revenueTotal - costTotal;
      const marginPercent = revenueTotal > 0 ? Math.round((profitTotal / revenueTotal) * 100) : 0;
      
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
        commission_cost: commissionCost,
        receita_envio: shippingRevenue,
        shipping_balance: shippingBalance,
        revenue_net: revenueNet,
        missing_fields: missingFields,
        // FIXED: Update legacy fields
        cost_fees: costFees,
        cost_shipping: costShipping,
        cost_total: costTotal,
        profit_total: profitTotal,
        margin_percent: marginPercent,
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
