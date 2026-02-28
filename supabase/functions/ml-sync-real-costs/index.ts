import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MAX_ORDERS_PER_RUN = 800;
const MAX_RUNTIME_MS = 50000;
const PAGE_SIZE = 200;
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
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "No authorization header" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Create client with user's auth context
    const userSupabase = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } }
    });
    
    const { data: { user: authUser }, error: authError } = await userSupabase.auth.getUser();
    if (authError || !authUser) {
      console.error("[RealCosts] Auth error:", authError?.message || "No user");
      return new Response(JSON.stringify({ error: "Invalid token" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    
    const user = { id: authUser.id };

    const body = await req.json().catch(() => ({}));
    const { seller_id, action, scope_days, force_resume, mode } = body;

    if (!seller_id) {
      return new Response(JSON.stringify({ error: "seller_id is required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "status") return await handleGetStatus(supabase, seller_id, corsHeaders);
    if (action === "pause") return await handlePause(supabase, user.id, seller_id, corsHeaders);
    if (action === "reset") return await handleReset(supabase, user.id, seller_id, corsHeaders);
    if (action === "resync_single") {
      const { order_id } = body;
      if (!order_id) {
        return new Response(JSON.stringify({ error: "order_id is required for resync_single" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      return await handleResyncSingle(supabase, user.id, seller_id, order_id, corsHeaders);
    }
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
      // Default to incremental mode unless explicitly set to "full"
      const syncMode = mode || "incremental";
      return await handleStartOrContinue(supabase, user.id, seller_id, scope_days, force_resume, syncMode, corsHeaders);
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

  // Get count of orders needing sync (incremental mode target)
  const { data: needingSyncData } = await supabase.rpc("count_orders_needing_cost_sync", { p_seller_id: sellerId });
  const needingSync = needingSyncData?.[0] || { total_pending: 0, no_breakdown: 0, pending_billing: 0 };

  const coverage = { 
    total_paid: totalPaid || 0, 
    with_real_billing: withRealBilling || 0,
    with_pending_billing: withPendingBilling || 0,
    total_processed: totalProcessed || 0,
    missing_breakdown: missingBreakdown > 0 ? missingBreakdown : 0,
    coverage_percent: totalPaid > 0 ? Math.round((withRealBilling || 0) / totalPaid * 100) : 0,
    // Incremental mode stats
    needing_sync: {
      total: needingSync.total_pending || 0,
      no_breakdown: needingSync.no_breakdown || 0,
      pending_billing: needingSync.pending_billing || 0
    }
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

async function handleResyncSingle(supabase: any, userId: string, sellerId: string, orderId: string, corsHeaders: any) {
  console.log(`[RealCosts] resync_single for order ${orderId}, seller ${sellerId}`);
  
  const { data: mlAccount } = await supabase.from("ml_accounts").select("access_token, refresh_token, token_expires_at").eq("ml_user_id", sellerId).eq("is_active", true).maybeSingle();
  if (!mlAccount) {
    return new Response(JSON.stringify({ error: "ML account not found" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  const accessToken = mlAccount.access_token;

  // Get order from cache
  const { data: order } = await supabase.from("meli_orders_cache").select("order_id, shipment_id, total_amount, created_at_meli").eq("seller_id", sellerId).eq("order_id", orderId).maybeSingle();
  if (!order) {
    return new Response(JSON.stringify({ error: "Order not found in cache" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  // ---- Multi-strategy fee extraction ----
  let feeML = 0, shippingCostSeller = 0, installmentsCost = 0, adjustments = 0;
  let feeMLSource = "pending";
  const sourceRefs: string[] = [];
  let currentToken = accessToken;

  // Helper: refresh token if 401
  async function tryRefreshToken(): Promise<boolean> {
    const ML_APP_ID = Deno.env.get('ML_APP_ID') || '';
    const ML_SECRET_KEY = Deno.env.get('ML_SECRET_KEY') || '';
    const { data: acct } = await supabase.from("ml_accounts").select("id, refresh_token").eq("ml_user_id", sellerId).eq("is_active", true).maybeSingle();
    if (!acct?.refresh_token) return false;
    const tokenResp = await fetch('https://api.mercadolibre.com/oauth/token', {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'refresh_token', client_id: ML_APP_ID, client_secret: ML_SECRET_KEY, refresh_token: acct.refresh_token }),
    });
    if (tokenResp.ok) {
      const td = await tokenResp.json();
      currentToken = td.access_token;
      await supabase.from("ml_accounts").update({ access_token: td.access_token, refresh_token: td.refresh_token, token_expires_at: new Date(Date.now() + td.expires_in * 1000).toISOString(), updated_at: new Date().toISOString() }).eq("id", acct.id);
      console.log(`[RealCosts] resync_single: token refreshed for ${sellerId}`);
      return true;
    }
    await tokenResp.text();
    return false;
  }

  // Strategy 1: /orders/{orderId} → payments[].marketplace_fee (most reliable)
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const orderResp = await fetch(`https://api.mercadolibre.com/orders/${orderId}`, { headers: { Authorization: `Bearer ${currentToken}` } });
      if (orderResp.ok) {
        const orderData = await orderResp.json();
        if (orderData.payments && Array.isArray(orderData.payments)) {
          for (const payment of orderData.payments) {
            if (payment.marketplace_fee != null && payment.marketplace_fee > 0) {
              feeML += payment.marketplace_fee;
            }
          }
        }
        if (feeML > 0) {
          feeMLSource = "billing";
          sourceRefs.push("orders:api:marketplace_fee");
        }
        break;
      }
      if (orderResp.status === 401) { await orderResp.text(); if (await tryRefreshToken()) continue; break; }
      if (orderResp.status === 429) { await orderResp.text(); await new Promise(r => setTimeout(r, 1500 * (attempt + 1))); continue; }
      await orderResp.text(); break;
    } catch (e) { console.error(`[RealCosts] orders API error:`, e); break; }
  }

  // Strategy 2: If still no fee, check meli_billing_details_cache (from billing periods sync)
  if (feeML === 0) {
    const { data: billingRows } = await supabase
      .from("meli_billing_details_cache")
      .select("charge_type, gross_amount")
      .eq("seller_id", sellerId)
      .eq("order_id", parseInt(orderId));
    
    if (billingRows?.length) {
      for (const detail of billingRows) {
        const ct = (detail.charge_type || "").toLowerCase();
        const amount = Math.abs(detail.gross_amount || 0);
        if (ct.includes("custo por vender") || ct.includes("custo por cobrar") || ct.includes("sale_fee") || ct.includes("cargo por venta")) {
          feeML += amount;
        } else if (ct.includes("tarifa de envio") || ct.includes("envio extra") || ct.includes("envio intermunicipal") || ct.includes("shipping")) {
          shippingCostSeller += amount;
        } else if (ct.includes("taxa de parcelamento") || ct.includes("installment")) {
          installmentsCost += amount;
        }
      }
      if (feeML > 0) {
        feeMLSource = "billing";
        sourceRefs.push("billing_details_cache");
      } else {
        // Cache has records but no commission — DON'T close the door, let Strategy 3 try the API
        sourceRefs.push("billing_details_cache:no_commission_found");
        console.log(`[RealCosts] resync_single: order ${orderId} has billing cache but no commission — falling through to Strategy 3`);
      }
    }
  }

  // Strategy 3: If no billing at all, try /orders/{orderId}/billing_info for seller.charges
  if (feeMLSource === "pending") {
    try {
      console.log(`[RealCosts] Strategy 3: calling /orders/${orderId}/billing_info`);
      const billingResp = await fetch(`https://api.mercadolibre.com/orders/${orderId}/billing_info`, { headers: { Authorization: `Bearer ${currentToken}` } });
      console.log(`[RealCosts] Strategy 3: billing_info status=${billingResp.status} for order ${orderId}`);
      if (billingResp.ok) {
        const billingData = await billingResp.json();
        console.log(`[RealCosts] Strategy 3: billing_info raw keys=${JSON.stringify(Object.keys(billingData))} for order ${orderId}`);
        // The API may return { billing_info: { ... } } or directly the object
        const billingInfo = billingData.billing_info || billingData;
        console.log(`[RealCosts] Strategy 3: billingInfo keys=${JSON.stringify(Object.keys(billingInfo))}, has seller=${!!billingInfo.seller}, seller keys=${billingInfo.seller ? JSON.stringify(Object.keys(billingInfo.seller)) : 'N/A'}`);
        
        // Try seller.charges first
        const charges = billingInfo.seller?.charges || billingInfo.charges || [];
        console.log(`[RealCosts] Strategy 3: found ${charges.length} charges for order ${orderId}`);
        if (charges.length > 0) {
          console.log(`[RealCosts] Strategy 3: charges detail: ${JSON.stringify(charges)}`);
        }
        
        for (const charge of charges) {
          const ct = (charge.type || charge.charge_type || charge.name || '').toLowerCase();
          const amount = Math.abs(charge.value || charge.amount || charge.gross_amount || 0);
          console.log(`[RealCosts] Strategy 3: charge type="${ct}" amount=${amount}`);
          if (ct.includes('sale_fee') || ct.includes('commission') || ct.includes('fee') || ct.includes('comisi')) feeML += amount;
          else if (ct.includes('shipping') || ct.includes('envio')) shippingCostSeller += amount;
          else if (ct.includes('financing') || ct.includes('installment') || ct.includes('parcela')) installmentsCost += amount;
        }
        if (feeML > 0) { feeMLSource = "billing"; sourceRefs.push("billing_info:api"); }
        else {
          // Log full response for debugging
          console.log(`[RealCosts] Strategy 3: NO commission found. Full response: ${JSON.stringify(billingData).substring(0, 2000)}`);
        }
      } else { 
        const errText = await billingResp.text();
        console.log(`[RealCosts] Strategy 3: billing_info error response: ${errText.substring(0, 500)}`);
      }
    } catch (e) { console.error(`[RealCosts] billing_info error:`, e); }
  }

  // Final: if all 3 strategies exhausted and still no fee but have shipping, mark as billing
  if (feeMLSource === "pending" && shippingCostSeller > 0) {
    feeMLSource = "billing";
    sourceRefs.push("all_strategies_exhausted:shipping_only");
    console.log(`[RealCosts] resync_single: order ${orderId}: all 3 strategies checked, no commission found but has shipping — marking as billing`);
  }

  // Cache in meli_order_financials_cache
  if (feeMLSource === "billing") {
    await supabase.from("meli_order_financials_cache").upsert({
      seller_id: sellerId, order_id: orderId, shipment_id: order.shipment_id,
      cost_sale_fee: feeML, cost_shipping_fee: shippingCostSeller,
      cost_installment_fee: installmentsCost, cost_cancellations: adjustments,
      revenue_products: order.total_amount || 0, synced_at: new Date().toISOString(),
    }, { onConflict: "seller_id,order_id", ignoreDuplicates: false });
  }

  // Fallback: Try shipment costs API if still no shipping
  if (shippingCostSeller === 0 && order.shipment_id) {
    try {
      const r = await fetch(`https://api.mercadolibre.com/shipments/${order.shipment_id}/costs`, {
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      if (r.ok) {
        const d = await r.json();
        shippingCostSeller = d.sender?.cost || d.senders?.[0]?.cost || d.receiver?.cost || 0;
        sourceRefs.push("shipment:api:resync");
        await supabase.from("meli_shipment_costs_cache").upsert({
          user_id: userId, seller_id: sellerId, shipment_id: order.shipment_id, order_id: orderId,
          sender_cost: shippingCostSeller, gross_amount: d.gross_amount || 0, raw_json: d,
          synced_at: new Date().toISOString()
        }, { onConflict: "shipment_id" });
      } else {
        await r.text();
      }
    } catch {}
  }

  // 4. Get existing breakdown for cost_items_total and cost_packaging
  const { data: existing } = await supabase.from("order_cost_breakdown_cache").select("cost_items_total, cost_packaging").eq("seller_id", sellerId).eq("order_id", orderId).maybeSingle();
  const costItemsTotal = existing?.cost_items_total || 0;
  const costPackaging = existing?.cost_packaging || 0;

  const revenueTotal = order.total_amount || 0;
  const commissionCost = feeML;
  const totalMarketplaceCost = feeML + shippingCostSeller + adjustments;
  const costFees = feeML + adjustments;
  const costShipping = shippingCostSeller;
  const costTotal = costItemsTotal + costPackaging + costFees + costShipping;
  const profitTotal = revenueTotal - costTotal;
  const marginPercent = revenueTotal > 0 ? Math.round((profitTotal / revenueTotal) * 100) : 0;

  const missingFields: string[] = [];
  if (feeMLSource === "pending") missingFields.push("sem_comissao");
  if (shippingCostSeller === 0 && order.shipment_id) missingFields.push("sem_frete_cobrado");

  await supabase.from("order_cost_breakdown_cache").upsert({
    user_id: userId, seller_id: sellerId, order_id: orderId,
    shipment_id: order.shipment_id, revenue_total: revenueTotal,
    created_at_meli: order.created_at_meli,
    fee_ml: feeML, fee_ml_source: feeMLSource,
    shipping_cost_seller: shippingCostSeller, installments_cost: installmentsCost,
    adjustments, total_marketplace_cost: totalMarketplaceCost,
    has_real_financial: feeMLSource === "billing",
    has_real_cost: false, source_refs: { refs: sourceRefs },
    real_cost_synced_at: new Date().toISOString(),
    calculated_at: new Date().toISOString(),
    last_checked_at: new Date().toISOString(),
    status: feeMLSource === "billing" ? "calculated" : "pending",
    commission_cost: commissionCost, missing_fields: missingFields,
    cost_fees: costFees, cost_shipping: costShipping,
    cost_total: costTotal, profit_total: profitTotal, margin_percent: marginPercent,
  }, { onConflict: "seller_id,order_id" });

  return new Response(JSON.stringify({
    ok: true,
    message: `Pedido ${orderId} resincronizado`,
    data: {
      fee_ml: feeML, fee_ml_source: feeMLSource,
      shipping_cost_seller: shippingCostSeller, installments_cost: installmentsCost,
      total_marketplace_cost: totalMarketplaceCost, cost_total: costTotal,
      profit_total: profitTotal, margin_percent: marginPercent,
      source_refs: sourceRefs,
    }
  }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

// PAGINATED billing data aggregation to handle >1000 records
async function aggregateBillingData(supabase: any, sellerId: string, orderIds: string[], shipmentIds: (string | null)[]) {
  const billingByOrder = new Map<string, { fee_ml: number; shipping: number; installments: number; adjustments: number }>();
  const billingByShipment = new Map<string, { shipping: number; adjustments: number }>();

  // Paginated fetch for order billing
  // FIX: Use string matching to avoid BigInt precision loss with parseInt()
  const validOrderIds = orderIds.filter(id => /^\d+$/.test(id));
  if (validOrderIds.length > 0) {
    // Process in chunks to avoid query size limits
    for (let i = 0; i < validOrderIds.length; i += 100) {
      const chunk = validOrderIds.slice(i, i + 100);
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
  // FIX: Use string matching to avoid BigInt precision loss with parseInt()
  const validShipmentIds = shipmentIds.filter((s): s is string => s !== null && /^\d+$/.test(s));
  if (validShipmentIds.length > 0) {
    for (let i = 0; i < validShipmentIds.length; i += 100) {
      const chunk = validShipmentIds.slice(i, i + 100);
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

  // Only skip orders created less than 48h ago (billing not available yet)
  const fortyEightHoursAgo = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
  const BATCH_SIZE = 50;

  let query = supabase
    .from("order_cost_breakdown_cache")
    .select("order_id, shipment_id, revenue_total, created_at_meli, cost_items_total, cost_packaging")
    .eq("seller_id", sellerId)
    .or("fee_ml_source.eq.pending,commission_cost.eq.0")
    // Only reprocess orders older than 48h (newer ones won't have billing yet)
    .lt("created_at_meli", fortyEightHoursAgo)
    // Process oldest first so we clear the backlog progressively
    .order("created_at_meli", { ascending: true })
    .limit(BATCH_SIZE);
  
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
    // Count total pending (including recently checked) for informational purposes
    const { count: totalPendingCount } = await supabase
      .from("order_cost_breakdown_cache")
      .select("*", { count: "exact", head: true })
      .eq("seller_id", sellerId)
      .or("fee_ml_source.eq.pending,commission_cost.eq.0");

    const recentCount = (totalPendingCount || 0);
    return new Response(JSON.stringify({ 
      message: recentCount > 0 
        ? `${recentCount} pedidos pendentes aguardando dados de billing do Mercado Livre (24-48h). Nenhum precisa de reprocessamento agora.`
        : "Nenhum pedido pendente encontrado", 
      processed: 0,
      pending_waiting: recentCount,
      skipped_reason: "cooldown_or_recent"
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
  
  // ---- Multi-strategy: orders API → billing_details_cache → billing_info ----
  const rowsToUpsert: any[] = [];
  let processedCount = 0;
  let updatedCount = 0;
  let currentToken = mlAccount.access_token;

  for (const order of pendingOrders) {
    if (Date.now() - startTime >= MAX_RUNTIME_MS) break;
    
    let feeML = 0, feeMLSource = "pending", shippingCostSeller = 0, installmentsCost = 0, adjustments = 0;
    const sourceRefs: string[] = [];

    // Strategy 1: /orders/{order_id} → payments[].marketplace_fee
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const orderResp = await fetch(`https://api.mercadolibre.com/orders/${order.order_id}`, { headers: { Authorization: `Bearer ${currentToken}` } });
        if (orderResp.ok) {
          const orderData = await orderResp.json();
          if (orderData.payments && Array.isArray(orderData.payments)) {
            for (const payment of orderData.payments) {
              if (payment.marketplace_fee != null && payment.marketplace_fee > 0) {
                feeML += payment.marketplace_fee;
              }
            }
          }
          if (feeML > 0) { feeMLSource = "billing"; sourceRefs.push("orders:api:marketplace_fee"); updatedCount++; }
          break;
        }
        if (orderResp.status === 401) {
          await orderResp.text();
          const ML_APP_ID = Deno.env.get('ML_APP_ID') || '';
          const ML_SECRET_KEY = Deno.env.get('ML_SECRET_KEY') || '';
          const { data: acct } = await supabase.from("ml_accounts").select("id, refresh_token").eq("ml_user_id", sellerId).eq("is_active", true).maybeSingle();
          if (acct?.refresh_token) {
            const tr = await fetch('https://api.mercadolibre.com/oauth/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'refresh_token', client_id: ML_APP_ID, client_secret: ML_SECRET_KEY, refresh_token: acct.refresh_token }) });
            if (tr.ok) { const td = await tr.json(); currentToken = td.access_token; await supabase.from("ml_accounts").update({ access_token: td.access_token, refresh_token: td.refresh_token, token_expires_at: new Date(Date.now() + td.expires_in * 1000).toISOString(), updated_at: new Date().toISOString() }).eq("id", acct.id); continue; }
            await tr.text();
          }
          break;
        }
        if (orderResp.status === 429) { await orderResp.text(); await new Promise(r => setTimeout(r, 2000 * (attempt + 1))); continue; }
        await orderResp.text(); break;
      } catch (e) { console.error(`[ReprocessPending] orders API error for ${order.order_id}:`, e); break; }
    }

    // Strategy 2: If no fee, check billing_details_cache
    if (feeML === 0) {
      const { data: billingRows } = await supabase
        .from("meli_billing_details_cache")
        .select("charge_type, gross_amount")
        .eq("seller_id", sellerId)
        .eq("order_id", parseInt(order.order_id));
      
      if (billingRows?.length) {
        for (const detail of billingRows) {
          const ct = (detail.charge_type || "").toLowerCase();
          const amount = Math.abs(detail.gross_amount || 0);
          if (ct.includes("custo por vender") || ct.includes("custo por cobrar") || ct.includes("sale_fee") || ct.includes("cargo por venta")) {
            feeML += amount;
          } else if (ct.includes("tarifa de envio") || ct.includes("envio extra") || ct.includes("envio intermunicipal") || ct.includes("shipping")) {
            shippingCostSeller += amount;
          } else if (ct.includes("taxa de parcelamento") || ct.includes("installment")) {
            installmentsCost += amount;
          }
        }
        if (feeML > 0) { feeMLSource = "billing"; sourceRefs.push("billing_details_cache"); updatedCount++; }
        else { sourceRefs.push("billing_details_cache:no_commission_found"); }
      }
    }

    // Strategy 3: If still no fee, try /orders/{order_id}/billing_info API
    if (feeMLSource === "pending") {
      try {
        const billingResp = await fetch(`https://api.mercadolibre.com/orders/${order.order_id}/billing_info`, { headers: { Authorization: `Bearer ${currentToken}` } });
        if (billingResp.ok) {
          const billingData = await billingResp.json();
          const billingInfo = billingData.billing_info || billingData;
          if (billingInfo.seller?.charges) {
            for (const charge of billingInfo.seller.charges) {
              const ct = (charge.type || '').toLowerCase();
              const amount = Math.abs(charge.value || 0);
              if (ct.includes('sale_fee') || ct.includes('commission')) feeML += amount;
              else if (ct.includes('shipping')) shippingCostSeller += amount;
              else if (ct.includes('financing') || ct.includes('installment')) installmentsCost += amount;
            }
            if (feeML > 0) { feeMLSource = "billing"; sourceRefs.push("billing_info:api"); updatedCount++; }
          }
        } else if (billingResp.status === 401) {
          await billingResp.text();
          // Try token refresh
          const ML_APP_ID2 = Deno.env.get('ML_APP_ID') || '';
          const ML_SECRET_KEY2 = Deno.env.get('ML_SECRET_KEY') || '';
          const { data: acct2 } = await supabase.from("ml_accounts").select("id, refresh_token").eq("ml_user_id", sellerId).eq("is_active", true).maybeSingle();
          if (acct2?.refresh_token) {
            const tr2 = await fetch('https://api.mercadolibre.com/oauth/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'refresh_token', client_id: ML_APP_ID2, client_secret: ML_SECRET_KEY2, refresh_token: acct2.refresh_token }) });
            if (tr2.ok) {
              const td2 = await tr2.json();
              currentToken = td2.access_token;
              await supabase.from("ml_accounts").update({ access_token: td2.access_token, refresh_token: td2.refresh_token, token_expires_at: new Date(Date.now() + td2.expires_in * 1000).toISOString(), updated_at: new Date().toISOString() }).eq("id", acct2.id);
              // Retry billing_info with new token
              const retryResp = await fetch(`https://api.mercadolibre.com/orders/${order.order_id}/billing_info`, { headers: { Authorization: `Bearer ${currentToken}` } });
              if (retryResp.ok) {
                const retryData = await retryResp.json();
                const retryInfo = retryData.billing_info || retryData;
                if (retryInfo.seller?.charges) {
                  for (const charge of retryInfo.seller.charges) {
                    const ct = (charge.type || '').toLowerCase();
                    const amount = Math.abs(charge.value || 0);
                    if (ct.includes('sale_fee') || ct.includes('commission')) feeML += amount;
                    else if (ct.includes('shipping') && shippingCostSeller === 0) shippingCostSeller += amount;
                    else if ((ct.includes('financing') || ct.includes('installment')) && installmentsCost === 0) installmentsCost += amount;
                  }
                  if (feeML > 0) { feeMLSource = "billing"; sourceRefs.push("billing_info:api:retry"); updatedCount++; }
                }
              } else { await retryResp.text(); }
            } else { await tr2.text(); }
          }
        } else { await billingResp.text(); }
      } catch (e) { console.error(`[ReprocessPending] billing_info error for ${order.order_id}:`, e); }
    }

    // Final: if all 3 strategies exhausted and still no fee but have shipping, mark as billing (all sources checked)
    if (feeMLSource === "pending" && shippingCostSeller > 0) {
      feeMLSource = "billing";
      sourceRefs.push("all_strategies_exhausted:shipping_only");
      console.log(`[ReprocessPending] order ${order.order_id}: all 3 strategies checked, no commission found but has shipping — marking as billing`);
    }

    // Cache financials
    if (feeMLSource === "billing") {
      await supabase.from("meli_order_financials_cache").upsert({
        seller_id: sellerId, order_id: order.order_id, shipment_id: order.shipment_id,
        cost_sale_fee: feeML, cost_shipping_fee: shippingCostSeller,
        cost_installment_fee: installmentsCost, cost_cancellations: adjustments,
        revenue_products: order.revenue_total || 0, synced_at: new Date().toISOString(),
      }, { onConflict: "seller_id,order_id", ignoreDuplicates: false });
    }

    // Rate limit: 200ms between orders
    await new Promise(r => setTimeout(r, 200));

    // Fallback: shipment costs API if no shipping
    if (shippingCostSeller === 0 && order.shipment_id) {
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
            shippingCostSeller = d.sender?.cost || d.senders?.[0]?.cost || d.receiver?.cost || 0;
            sourceRefs.push("shipment:api");
            await supabase.from("meli_shipment_costs_cache").upsert({
              user_id: userId, seller_id: sellerId, shipment_id: order.shipment_id, order_id: order.order_id,
              sender_cost: shippingCostSeller, gross_amount: d.gross_amount || 0, raw_json: d,
              synced_at: new Date().toISOString()
            }, { onConflict: "shipment_id" });
          } else { await r.text(); }
        } catch {}
      }
    }

    if (feeMLSource === "pending") sourceRefs.push("billing:pending");

    const totalMarketplaceCost = feeML + shippingCostSeller + adjustments;
    const revenueTotal = order.revenue_total || 0;
    const commissionCost = feeML;
    const costItemsTotal = order.cost_items_total || 0;
    const costPackaging = order.cost_packaging || 0;
    const costFees = feeML + adjustments;
    const costShipping = shippingCostSeller;
    const costTotal = costItemsTotal + costPackaging + costFees + costShipping;
    const profitTotal = revenueTotal - costTotal;
    const marginPercent = revenueTotal > 0 ? Math.round((profitTotal / revenueTotal) * 100) : 0;
    
    const missingFields: string[] = [];
    if (feeMLSource === "pending") missingFields.push("sem_comissao");
    if (shippingCostSeller === 0 && order.shipment_id) missingFields.push("sem_frete_cobrado");

    rowsToUpsert.push({
      user_id: userId, seller_id: sellerId, order_id: order.order_id,
      shipment_id: order.shipment_id, revenue_total: revenueTotal,
      created_at_meli: order.created_at_meli,
      fee_ml: feeML, fee_ml_source: feeMLSource,
      shipping_cost_seller: shippingCostSeller, installments_cost: installmentsCost,
      adjustments, total_marketplace_cost: totalMarketplaceCost,
      has_real_financial: feeMLSource === "billing" || feeMLSource === "no_charges",
      has_real_cost: false, source_refs: { refs: sourceRefs },
      real_cost_synced_at: new Date().toISOString(),
      calculated_at: new Date().toISOString(),
      last_checked_at: new Date().toISOString(),
      status: (feeMLSource === "billing" || feeMLSource === "no_charges") ? "calculated" : "pending",
      commission_cost: commissionCost, missing_fields: missingFields,
      cost_fees: costFees, cost_shipping: costShipping,
      cost_total: costTotal, profit_total: profitTotal, margin_percent: marginPercent,
    });
    
    processedCount++;

    // Rate limit: 200ms between orders
    await new Promise(r => setTimeout(r, 200));
  }

  if (rowsToUpsert.length) {
    await supabase.from("order_cost_breakdown_cache").upsert(rowsToUpsert, { onConflict: "seller_id,order_id" });
  }

  // Count remaining pending orders for progress tracking
  const { count: remainingCount } = await supabase
    .from("order_cost_breakdown_cache")
    .select("*", { count: "exact", head: true })
    .eq("seller_id", sellerId)
    .or("fee_ml_source.eq.pending,commission_cost.eq.0")
    .lt("created_at_meli", fortyEightHoursAgo);

  const remaining = (remainingCount || 0);

  return new Response(JSON.stringify({ 
    message: `Reprocessados ${processedCount} pedidos pendentes (${updatedCount} atualizados com dados reais, ${processedCount - updatedCount} ainda aguardando billing)`,
    processed: processedCount,
    updated: updatedCount,
    still_pending: processedCount - updatedCount,
    remaining: remaining,
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
  let { data: bfState } = await supabase.from("meli_backfill_sync_state").select("*").eq("seller_id", sellerId).maybeSingle();
  
  // If there's a running/paused backfill, check stale
  if (bfState && bfState.status === 'running') {
    const lastHeartbeat = new Date(bfState.last_heartbeat_at || bfState.updated_at).getTime();
    if (Date.now() - lastHeartbeat < STALE_RUNNING_THRESHOLD_MS) {
      return new Response(JSON.stringify({ message: "Backfill already running", state: bfState }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
  }
  
  // Count total orders needing backfill
  let totalQuery = supabase.from("meli_orders_cache").select("order_id", { count: "exact", head: true }).eq("seller_id", sellerId).eq("order_status", "paid");
  if (scopeDays) {
    const d = new Date();
    d.setDate(d.getDate() - scopeDays);
    totalQuery = totalQuery.gte("created_at_meli", d.toISOString());
  }
  const { count: totalOrders } = await totalQuery;

  const cursorOffset = bfState?.cursor_offset || 0;
  
  if (!bfState) {
    const { data: newState } = await supabase.from("meli_backfill_sync_state").insert({
      user_id: userId,
      seller_id: sellerId,
      status: "running",
      cursor_offset: 0,
      total_orders: totalOrders || 0,
      processed_orders: 0,
      with_billing: 0,
      started_at: new Date().toISOString(),
      last_heartbeat_at: new Date().toISOString()
    }).select().single();
    bfState = newState;
  } else {
    await supabase.from("meli_backfill_sync_state").update({
      status: "running",
      total_orders: totalOrders || 0,
      last_heartbeat_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }).eq("seller_id", sellerId);
  }

  let currentOffset = cursorOffset;
  let processedInRun = 0;
  let createdCount = 0;
  let withBillingCount = bfState?.with_billing || 0;

  while (processedInRun < MAX_ORDERS_PER_RUN && Date.now() - startTime < MAX_RUNTIME_MS) {
    let q = supabase
      .from("meli_orders_cache")
      .select("order_id, total_amount, shipment_id, created_at_meli")
      .eq("seller_id", sellerId)
      .eq("order_status", "paid")
      .order("created_at_meli", { ascending: true })
      .range(currentOffset, currentOffset + PAGE_SIZE - 1);
    
    if (scopeDays) {
      const d = new Date();
      d.setDate(d.getDate() - scopeDays);
      q = q.gte("created_at_meli", d.toISOString());
    }

    const { data: orders } = await q;
    
    if (!orders?.length) {
      // Done!
      await supabase.from("meli_backfill_sync_state").update({
        status: "done",
        finished_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        cursor_offset: currentOffset,
        processed_orders: (bfState?.processed_orders || 0) + processedInRun,
        with_billing: withBillingCount
      }).eq("seller_id", sellerId);
      
      return new Response(JSON.stringify({
        message: `Backfill concluído! Criados ${createdCount} registros`,
        status: "done",
        processed: (bfState?.processed_orders || 0) + processedInRun,
        created: createdCount,
        with_billing: withBillingCount
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const orderIds = orders.map((o: any) => o.order_id);
    const shipmentIds = orders.map((o: any) => o.shipment_id);

    // Check which orders already have breakdowns
    const { data: existingBreakdowns } = await supabase
      .from("order_cost_breakdown_cache")
      .select("order_id")
      .eq("seller_id", sellerId)
      .in("order_id", orderIds);
    const existingSet = new Set((existingBreakdowns || []).map((b: any) => b.order_id));

    // Get billing data for orders
    const { billingByOrder, billingByShipment } = await aggregateBillingData(supabase, sellerId, orderIds, shipmentIds);

    const rowsToInsert: any[] = [];

    for (const order of orders) {
      if (existingSet.has(order.order_id)) {
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
        withBillingCount++;
      } else {
        feeMLSource = "pending";
        sourceRefs.push("billing:pending");
      }

      if (shippingCostSeller === 0 && shipmentBilling) {
        shippingCostSeller = shipmentBilling.shipping;
        adjustments += shipmentBilling.adjustments;
        sourceRefs.push("billing:shipment");
      }

      const revenueTotal = order.total_amount || 0;
      const totalMarketplaceCost = feeML + shippingCostSeller + installmentsCost + adjustments;
      
      // Calculate derived fields
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
        margin_percent: marginPercent
      });
      
      processedInRun++;
      createdCount++;
    }

    if (rowsToInsert.length) {
      await supabase.from("order_cost_breakdown_cache").insert(rowsToInsert);
    }

    currentOffset += orders.length;
    
    // Update heartbeat
    await supabase.from("meli_backfill_sync_state").update({
      cursor_offset: currentOffset,
      processed_orders: (bfState?.processed_orders || 0) + processedInRun,
      with_billing: withBillingCount,
      last_heartbeat_at: new Date().toISOString()
    }).eq("seller_id", sellerId);
  }

  // Paused due to runtime limit
  await supabase.from("meli_backfill_sync_state").update({
    status: "paused",
    cursor_offset: currentOffset,
    processed_orders: (bfState?.processed_orders || 0) + processedInRun,
    with_billing: withBillingCount,
    updated_at: new Date().toISOString()
  }).eq("seller_id", sellerId);

  return new Response(JSON.stringify({
    message: `Backfill pausado. Processados ${processedInRun} nesta execução, criados ${createdCount}`,
    status: "paused",
    processed: (bfState?.processed_orders || 0) + processedInRun,
    created: createdCount,
    cursor_offset: currentOffset,
    total: totalOrders
  }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

async function handleContinueBackfill(supabase: any, userId: string, sellerId: string, corsHeaders: any) {
  return await handleBackfillMissing(supabase, userId, sellerId, null, corsHeaders);
}

// INCREMENTAL MODE: Only process orders that actually need processing
async function handleStartOrContinue(supabase: any, userId: string, sellerId: string, scopeDays: number | null, forceResume: boolean, mode: string, corsHeaders: any) {
  const startTime = Date.now();
  let { data: state } = await supabase.from("meli_real_costs_sync_state").select("*").eq("seller_id", sellerId).maybeSingle();

  if (state?.status === "running") {
    const lastHeartbeat = new Date(state.last_heartbeat_at || state.updated_at).getTime();
    if (Date.now() - lastHeartbeat < STALE_RUNNING_THRESHOLD_MS && !forceResume) {
      return new Response(JSON.stringify({ message: "Already running", state }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
  }

  const effectiveScope = scopeDays ?? state?.scope_days ?? null;

  // Get total paid orders count
  let totalQuery = supabase.from("meli_orders_cache").select("*", { count: "exact", head: true }).eq("seller_id", sellerId).eq("order_status", "paid");
  if (effectiveScope) { 
    const d = new Date(); 
    d.setDate(d.getDate() - effectiveScope); 
    totalQuery = totalQuery.gte("created_at_meli", d.toISOString()); 
  }
  const { count: totalPaid } = await totalQuery;

  // INCREMENTAL MODE: Get count of orders needing sync
  const { data: needingSyncData } = await supabase.rpc("count_orders_needing_cost_sync", { p_seller_id: sellerId });
  const needingSync = needingSyncData?.[0]?.total_pending || 0;
  
  console.log(`[RealCosts] Mode: ${mode}, Total paid: ${totalPaid}, Needing sync: ${needingSync}`);

  // LOOP DETECTION: If pending count hasn't changed since last run, stop
  const previousPendingCount = state?.last_pending_count;
  if (needingSync > 0 && previousPendingCount !== null && previousPendingCount !== undefined && needingSync === previousPendingCount) {
    console.log(`[RealCosts] Loop detected: pending count unchanged at ${needingSync}. Marking done.`);
    if (state) {
      await supabase.from("meli_real_costs_sync_state").update({
        status: "done",
        total: totalPaid || 0,
        processed: totalPaid || 0,
        cursor_offset: 0,
        finished_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        last_pending_count: needingSync,
      }).eq("seller_id", sellerId);
    }
    return new Response(JSON.stringify({ 
      message: `${needingSync} pedidos ainda pendentes (aguardando billing do Mercado Livre, 24-48h). Sync pausado para evitar loop.`, 
      processed: 0, 
      total: needingSync,
      still_pending: needingSync,
      mode: "incremental",
      loop_prevented: true
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  // If nothing to process, mark as done immediately
  if (needingSync === 0) {
    if (state) {
      await supabase.from("meli_real_costs_sync_state").update({
        status: "done",
        total: totalPaid || 0,
        processed: totalPaid || 0,
        cursor_offset: 0,
        finished_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        last_pending_count: 0,
      }).eq("seller_id", sellerId);
    }
    return new Response(JSON.stringify({ 
      message: "Nenhum pedido precisa de processamento", 
      processed: 0, 
      total: needingSync,
      mode: "incremental"
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  const scopeChanged = state && state.scope_days !== effectiveScope;
  const isFullMode = mode === "full";

  if (!state) {
    const { data: newState } = await supabase.from("meli_real_costs_sync_state").insert({ 
      user_id: userId, seller_id: sellerId, status: "running", scope_days: effectiveScope, 
      processed: 0, total: isFullMode ? (totalPaid || 0) : needingSync, cursor_offset: 0, 
      last_heartbeat_at: new Date().toISOString(), started_at: new Date().toISOString(), 
      stats_json: { billing: 0, pending: 0, with_shipping: 0, mode: mode } 
    }).select().single();
    state = newState;
  } else {
    const upd: any = { 
      status: "running", 
      total: isFullMode ? (totalPaid || 0) : needingSync, 
      last_heartbeat_at: new Date().toISOString(), 
      updated_at: new Date().toISOString(),
      scope_days: effectiveScope 
    };
    
    // FIX: For INCREMENTAL mode, ALWAYS reset cursor_offset to 0 because the set of pending orders is dynamic
    // For FULL mode, reset only on idle/done/scope change
    if (mode === "incremental") {
      // Always start from 0 in incremental - the pending set changes between runs
      upd.started_at = new Date().toISOString(); 
      upd.processed = 0; 
      upd.cursor_offset = 0; 
      upd.stats_json = { billing: 0, pending: 0, with_shipping: 0, mode: mode }; 
      upd.finished_at = null;
      console.log(`[RealCosts] Incremental mode: resetting cursor to 0, needingSync=${needingSync}`);
    } else if (state.status === "idle" || (isFullMode && (state.status === "done" || scopeChanged))) { 
      upd.started_at = new Date().toISOString(); 
      upd.processed = 0; 
      upd.cursor_offset = 0; 
      upd.stats_json = { billing: 0, pending: 0, with_shipping: 0, mode: mode }; 
      upd.finished_at = null;
      console.log(`[RealCosts] Full mode reset: status=${state.status}, scopeChanged=${scopeChanged}`);
    } else {
      // FULL mode continuation
      upd.stats_json = { ...(state.stats_json || {}), mode: mode };
      console.log(`[RealCosts] Continuing ${mode} mode from offset ${state.cursor_offset}`);
    }
    
    const { data: updated } = await supabase.from("meli_real_costs_sync_state").update(upd).eq("seller_id", sellerId).select().single();
    state = updated;
  }

  const { data: mlAccount } = await supabase.from("ml_accounts").select("access_token").eq("ml_user_id", sellerId).eq("is_active", true).maybeSingle();
  if (!mlAccount) { 
    await supabase.from("meli_real_costs_sync_state").update({ status: "error", last_error: "ML account not found" }).eq("seller_id", sellerId); 
    return new Response(JSON.stringify({ error: "ML account not found" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }); 
  }

  let processedInRun = 0;
  const stats = state.stats_json || { billing: 0, pending: 0, with_shipping: 0, mode: mode };
  
  // INCREMENTAL MODE: Use the SQL function to get only orders needing sync
  if (mode === "incremental") {
    let currentOffset = state.cursor_offset || 0;
    
    while (processedInRun < MAX_ORDERS_PER_RUN && Date.now() - startTime < MAX_RUNTIME_MS) {
      // Use the new RPC function to get only orders needing processing
      const { data: ordersNeedingSync, error: rpcError } = await supabase.rpc("get_orders_needing_cost_sync", {
        p_seller_id: sellerId,
        p_limit: PAGE_SIZE,
        p_offset: currentOffset
      });
      
      if (rpcError) {
        console.error("[RealCosts] RPC error:", rpcError);
        break;
      }
      
      if (!ordersNeedingSync?.length) {
        // No more orders to process
        await supabase.from("meli_real_costs_sync_state").update({ 
          status: "done", 
          finished_at: new Date().toISOString(), 
          updated_at: new Date().toISOString(), 
          stats_json: stats,
          processed: state.processed + processedInRun,
          cursor_offset: currentOffset,
          last_pending_count: stats.pending || 0,
        }).eq("seller_id", sellerId);
        return new Response(JSON.stringify({ 
          message: "Sync incremental concluído", 
          processed: state.processed + processedInRun, 
          total: needingSync,
          mode: "incremental"
        }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      const orderIds = ordersNeedingSync.map((o: any) => o.order_id);
      const shipmentIds = ordersNeedingSync.map((o: any) => o.shipment_id);
      
      const { billingByOrder, billingByShipment } = await aggregateBillingData(supabase, sellerId, orderIds, shipmentIds);

      const rowsToUpsert: any[] = [];

      for (const order of ordersNeedingSync) {
        const billing = billingByOrder.get(order.order_id);
        const shipmentBilling = order.shipment_id ? billingByShipment.get(order.shipment_id) : null;
        
        let feeML = 0, feeMLSource = "pending", shippingCostSeller = 0, installmentsCost = 0, adjustments = 0;
        const sourceRefs: string[] = [];

        // FIX: Consider "has billing" if ANY movement exists for this order, even if fee_ml sums to 0
        // This prevents orders from being stuck as "pending" when billing exists but values cancel out
        const hasBillingMovements = billing && (billing.fee_ml !== 0 || billing.shipping !== 0 || billing.installments !== 0 || billing.adjustments !== 0);
        
        if (hasBillingMovements) {
          feeML = billing.fee_ml;
          feeMLSource = "billing";
          shippingCostSeller = billing.shipping;
          installmentsCost = billing.installments;
          adjustments = billing.adjustments;
          sourceRefs.push("billing:order");
          stats.billing = (stats.billing || 0) + 1;
        } else {
          feeMLSource = "pending";
          sourceRefs.push("billing:pending");
          stats.pending = (stats.pending || 0) + 1;
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
            if (shippingCostSeller > 0) stats.with_shipping = (stats.with_shipping || 0) + 1;
          } else {
            try {
              const r = await fetch(`https://api.mercadolibre.com/shipments/${order.shipment_id}/costs`, { 
                headers: { Authorization: `Bearer ${mlAccount.access_token}` } 
              });
              if (r.ok) { 
                const d = await r.json(); 
                shippingCostSeller = d.sender?.cost || 0; 
                sourceRefs.push("shipment:api"); 
                if (shippingCostSeller > 0) stats.with_shipping = (stats.with_shipping || 0) + 1;
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
        
        // Calculate derived fields
        const costFees = feeML + installmentsCost + adjustments;
        const costShipping = shippingCostSeller;
        const costTotal = costFees + costShipping;
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
          last_checked_at: new Date().toISOString(),
          status: feeMLSource === "billing" ? "calculated" : "pending",
          commission_cost: commissionCost,
          missing_fields: missingFields,
          cost_fees: costFees,
          cost_shipping: costShipping,
          cost_total: costTotal,
          profit_total: profitTotal,
          margin_percent: marginPercent
        });
        
        processedInRun++;
      }

      if (rowsToUpsert.length) {
        await supabase.from("order_cost_breakdown_cache").upsert(rowsToUpsert, { onConflict: "seller_id,order_id" });
      }

      currentOffset += ordersNeedingSync.length;

      // Update heartbeat
      await supabase.from("meli_real_costs_sync_state").update({
        cursor_offset: currentOffset,
        processed: state.processed + processedInRun,
        stats_json: stats,
        last_heartbeat_at: new Date().toISOString()
      }).eq("seller_id", sellerId);
    }

    // Paused due to runtime limit
    await supabase.from("meli_real_costs_sync_state").update({ 
      status: "paused", 
      updated_at: new Date().toISOString(), 
      stats_json: stats,
      processed: state.processed + processedInRun,
      cursor_offset: state.cursor_offset + processedInRun
    }).eq("seller_id", sellerId);
    
    return new Response(JSON.stringify({ 
      message: `Processados ${processedInRun} pedidos (incremental)`, 
      processed: state.processed + processedInRun, 
      total: needingSync,
      status: "paused",
      mode: "incremental"
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  // FULL MODE: Original logic scanning all orders
  let currentOffset = state.cursor_offset;

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
      return new Response(JSON.stringify({ 
        message: "Sync completo (full)", 
        processed: state.processed + processedInRun, 
        total: state.total,
        mode: "full"
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
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
      // Skip if already synced with billing data in the last 24h
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
        stats.billing = (stats.billing || 0) + 1;
      } else {
        feeMLSource = "pending";
        sourceRefs.push("billing:pending");
        stats.pending = (stats.pending || 0) + 1;
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
          if (shippingCostSeller > 0) stats.with_shipping = (stats.with_shipping || 0) + 1;
        } else {
          try {
            const r = await fetch(`https://api.mercadolibre.com/shipments/${order.shipment_id}/costs`, { 
              headers: { Authorization: `Bearer ${mlAccount.access_token}` } 
            });
            if (r.ok) { 
              const d = await r.json(); 
              shippingCostSeller = d.sender?.cost || 0; 
              sourceRefs.push("shipment:api"); 
              if (shippingCostSeller > 0) stats.with_shipping = (stats.with_shipping || 0) + 1;
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
        revenue_net: revenueNet,
        shipping_balance: shippingBalance,
        missing_fields: missingFields,
        cost_fees: costFees,
        cost_shipping: costShipping,
        cost_total: costTotal,
        profit_total: profitTotal,
        margin_percent: marginPercent
      });
      
      processedInRun++;
    }

    if (rowsToUpsert.length) {
      await supabase.from("order_cost_breakdown_cache").upsert(rowsToUpsert, { onConflict: "seller_id,order_id" });
    }

    currentOffset += orders.length;

    await supabase.from("meli_real_costs_sync_state").update({
      cursor_offset: currentOffset,
      processed: state.processed + processedInRun,
      stats_json: stats,
      last_heartbeat_at: new Date().toISOString()
    }).eq("seller_id", sellerId);
  }

  await supabase.from("meli_real_costs_sync_state").update({ 
    status: "paused", 
    updated_at: new Date().toISOString(), 
    stats_json: stats,
    processed: state.processed + processedInRun,
    cursor_offset: currentOffset
  }).eq("seller_id", sellerId);

  return new Response(JSON.stringify({ 
    message: `Processados ${processedInRun} pedidos (full)`, 
    processed: state.processed + processedInRun, 
    total: state.total,
    status: "paused",
    mode: "full"
  }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
