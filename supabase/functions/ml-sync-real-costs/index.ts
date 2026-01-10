import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

declare const EdgeRuntime: {
  waitUntil(promise: Promise<unknown>): void;
};

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const ML_APP_ID = Deno.env.get('ML_APP_ID')!;
const ML_SECRET_KEY = Deno.env.get('ML_SECRET_KEY')!;

// Budget limits - more orders per run to reduce auto-resume cycles
const MAX_ORDERS_PER_RUN = 500;
const MAX_RUNTIME_MS = 50000;

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function fetchWithTimeout(url: string, options: RequestInit = {}, timeoutMs = 20000): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
  }
}

async function refreshToken(refreshTokenValue: string): Promise<{ access_token?: string; refresh_token?: string; expires_in?: number; error?: string }> {
  try {
    const resp = await fetchWithTimeout('https://api.mercadolibre.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: ML_APP_ID,
        client_secret: ML_SECRET_KEY,
        refresh_token: refreshTokenValue,
      }),
    }, 15000);
    if (!resp.ok) return { error: await resp.text() };
    const data = await resp.json();
    return { access_token: data.access_token, refresh_token: data.refresh_token, expires_in: data.expires_in };
  } catch (e) {
    return { error: String(e) };
  }
}

// Map charge types from billing reports to our categories
function categorizeCharge(chargeType: string, description: string): 'sale_fee' | 'shipping_fee' | 'installment_cost' | 'adjustment' | 'other' {
  const type = chargeType.toLowerCase();
  const desc = description.toLowerCase();
  
  // Sale fees (commission, taxes)
  if (type.includes('sale_fee') || type.includes('commission') || type.includes('cargo_por_venta') ||
      desc.includes('cargo por venta') || desc.includes('comisión') || desc.includes('commission')) {
    return 'sale_fee';
  }
  
  // Shipping fees
  if (type.includes('shipping') || type.includes('envio') || type.includes('flete') ||
      desc.includes('mercado envíos') || desc.includes('envío') || desc.includes('flete')) {
    return 'shipping_fee';
  }
  
  // Installment costs
  if (type.includes('financing') || type.includes('installment') || type.includes('cuota') ||
      desc.includes('cuota') || desc.includes('parcelamento') || desc.includes('financiamiento')) {
    return 'installment_cost';
  }
  
  // Adjustments (refunds, compensations, bonuses)
  if (type.includes('refund') || type.includes('cancel') || type.includes('return') ||
      type.includes('bonus') || type.includes('compensation') || type.includes('adjustment') ||
      desc.includes('devolución') || desc.includes('compensación') || desc.includes('bonificación')) {
    return 'adjustment';
  }
  
  return 'other';
}

// Get last N months period keys for billing reports
function getLastMonthsPeriodKeys(monthsBack: number): string[] {
  const keys: string[] = [];
  const now = new Date();
  
  for (let i = 0; i < monthsBack; i++) {
    const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    keys.push(`${year}-${month}-01`);
  }
  
  return keys;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing authorization header' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Invalid token' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = await req.json().catch(() => ({}));
    const { seller_id, days = 30, continue_sync = false, action, months_back = 3 } = body;

    if (!seller_id) {
      return new Response(JSON.stringify({ error: 'seller_id is required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`[ml-sync-real-costs] Starting for seller ${seller_id}, days=${days}, months_back=${months_back}`);

    // Get ML account
    const { data: account, error: accountError } = await supabase
      .from('ml_accounts')
      .select('id, access_token, refresh_token, token_expires_at, ml_user_id')
      .eq('ml_user_id', seller_id)
      .eq('user_id', user.id)
      .eq('is_active', true)
      .maybeSingle();

    if (accountError || !account) {
      return new Response(JSON.stringify({ error: 'ML account not found' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Refresh token if needed
    let validAccessToken = account.access_token;
    const tokenExpiresAt = new Date(account.token_expires_at);
    if (tokenExpiresAt.getTime() - Date.now() < 5 * 60 * 1000) {
      const refreshResult = await refreshToken(account.refresh_token);
      if (!refreshResult.access_token) {
        return new Response(JSON.stringify({ error: 'Token refresh failed', code: 'RECONNECT_REQUIRED' }), {
          status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      await supabase.from('ml_accounts').update({
        access_token: refreshResult.access_token,
        refresh_token: refreshResult.refresh_token,
        token_expires_at: new Date(Date.now() + (refreshResult.expires_in || 21600) * 1000).toISOString(),
      }).eq('id', account.id);
      validAccessToken = refreshResult.access_token;
    }

    // Get or create sync state
    const { data: syncState } = await supabase
      .from('meli_financial_sync_state')
      .select('*')
      .eq('seller_id', seller_id)
      .eq('user_id', user.id)
      .maybeSingle();

    // Cancel action
    if (action === 'cancel') {
      await supabase.from('meli_financial_sync_state').update({
        status: 'idle', phase: 'idle', last_error: null,
        last_sync_finished_at: new Date().toISOString(),
      }).eq('seller_id', seller_id);
      return new Response(JSON.stringify({ status: 'cancelled' }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get status action
    if (action === 'status') {
      return new Response(JSON.stringify({ 
        status: syncState?.status || 'idle',
        phase: syncState?.phase || 'idle',
        movements_synced: syncState?.movements_synced || 0,
        cursor: syncState?.cursor_or_offset,
        last_heartbeat_at: syncState?.last_heartbeat_at,
      }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Check if already running
    const heartbeatAt = syncState?.last_heartbeat_at ? new Date(syncState.last_heartbeat_at).getTime() : 0;
    const isStaleRunning = syncState?.status === 'running' && syncState?.phase === 'real_costs' && 
      Date.now() - heartbeatAt > 3 * 60 * 1000;

    if (syncState?.status === 'running' && syncState?.phase === 'real_costs' && !continue_sync && !isStaleRunning) {
      return new Response(JSON.stringify({ status: 'already_running', movements_synced: syncState.movements_synced }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Calculate date range
    const dateTo = new Date();
    const dateFrom = new Date();
    dateFrom.setDate(dateFrom.getDate() - days);

    // Get period keys for billing reports
    const periodKeys = getLastMonthsPeriodKeys(months_back);

    // Use existing offset if continuing
    const startOffset = (continue_sync || syncState?.status === 'paused') 
      ? parseInt(syncState?.cursor_or_offset || '0')
      : 0;
    const startProcessed = (continue_sync || syncState?.status === 'paused')
      ? (syncState?.movements_synced || 0)
      : 0;

    // Update sync state to running
    await supabase.from('meli_financial_sync_state').upsert({
      user_id: user.id,
      seller_id,
      status: 'running',
      phase: 'real_costs',
      last_sync_started_at: new Date().toISOString(),
      last_synced_from: dateFrom.toISOString().split('T')[0],
      last_synced_to: dateTo.toISOString().split('T')[0],
      last_error: null,
      last_heartbeat_at: new Date().toISOString(),
      cursor_or_offset: String(startOffset),
      movements_synced: startProcessed,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'seller_id,user_id' });

    // Start background processing
    EdgeRuntime.waitUntil(
      processRealCosts(
        supabase,
        user.id,
        seller_id,
        validAccessToken,
        account.id,
        account.refresh_token,
        dateFrom,
        dateTo,
        startOffset,
        startProcessed,
        periodKeys
      )
    );

    return new Response(JSON.stringify({ 
      status: 'started',
      date_from: dateFrom.toISOString(),
      date_to: dateTo.toISOString(),
      start_offset: startOffset,
      period_keys: periodKeys,
    }), {
      status: 202, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: unknown) {
    console.error('[ml-sync-real-costs] Error:', error);
    return new Response(JSON.stringify({ error: String(error) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

async function fetchBillingDetails(
  supabase: any,
  userId: string,
  sellerId: string,
  accessToken: string,
  periodKeys: string[]
): Promise<Map<string, any[]>> {
  // Map order_id -> list of billing details
  const orderBillingMap = new Map<string, any[]>();
  
  console.log(`[ml-sync-real-costs] Fetching billing reports for periods: ${periodKeys.join(', ')}`);
  
  for (const periodKey of periodKeys) {
    let offset = 0;
    const limit = 1000;
    let hasMore = true;
    
    while (hasMore) {
      try {
        // Using billing reports endpoint with ML group (Mercado Libre sales)
        const url = `https://api.mercadolibre.com/billing/integration/periods/key/${periodKey}/details?group=ML&offset=${offset}&limit=${limit}`;
        
        const resp = await fetchWithTimeout(url, {
          headers: { Authorization: `Bearer ${accessToken}` },
        }, 30000);
        
        if (!resp.ok) {
          console.log(`[ml-sync-real-costs] Billing report failed for ${periodKey}: ${resp.status}`);
          // Try alternative endpoint for transactions
          break;
        }
        
        const data = await resp.json();
        const details = data.results || data.details || [];
        
        console.log(`[ml-sync-real-costs] Got ${details.length} billing details for ${periodKey} at offset ${offset}`);
        
        if (details.length === 0) {
          hasMore = false;
          break;
        }
        
        // Process and cache each detail
        const cacheRows: any[] = [];
        
        for (const detail of details) {
          // Extract order_id from references
          let orderId: string | null = null;
          let shipmentId: string | null = null;
          
          // Check various reference formats
          if (detail.reference_id) {
            // Could be order_id directly
            orderId = String(detail.reference_id);
          }
          if (detail.order_id) {
            orderId = String(detail.order_id);
          }
          if (detail.shipment_id) {
            shipmentId = String(detail.shipment_id);
          }
          
          // Check nested references
          if (detail.references) {
            for (const ref of detail.references) {
              if (ref.type === 'order' || ref.type === 'ORDER') {
                orderId = String(ref.id);
              }
              if (ref.type === 'shipment' || ref.type === 'SHIPMENT') {
                shipmentId = String(ref.id);
              }
            }
          }
          
          // Skip if no order reference
          if (!orderId && !shipmentId) continue;
          
          const chargeType = detail.charge_type || detail.type || detail.concept || 'unknown';
          const description = detail.description || detail.detail || chargeType;
          const amount = Math.abs(detail.amount || detail.gross_amount || 0);
          
          // Cache row
          const detailId = detail.id || `${periodKey}-${orderId || shipmentId}-${chargeType}-${Date.now()}`;
          cacheRows.push({
            seller_id: sellerId,
            period_key: periodKey,
            detail_id: String(detailId),
            order_id: orderId ? parseInt(orderId) : null,
            shipment_id: shipmentId ? parseInt(shipmentId) : null,
            charge_type: chargeType,
            charge_description: description,
            gross_amount: detail.gross_amount || amount,
            net_amount: detail.net_amount || detail.amount || amount,
            currency_id: detail.currency_id || 'BRL',
            created_at_meli: detail.date_created || detail.created_at || null,
            raw_data: detail,
          });
          
          // Add to map if has order_id
          if (orderId) {
            if (!orderBillingMap.has(orderId)) {
              orderBillingMap.set(orderId, []);
            }
            orderBillingMap.get(orderId)!.push({
              charge_type: chargeType,
              description,
              amount,
              category: categorizeCharge(chargeType, description),
            });
          }
        }
        
        // Batch insert to cache
        if (cacheRows.length > 0) {
          const { error: cacheError } = await supabase
            .from('meli_billing_details_cache')
            .upsert(cacheRows, { onConflict: 'seller_id,detail_id' });
          
          if (cacheError) {
            console.log(`[ml-sync-real-costs] Cache insert error: ${cacheError.message}`);
          }
        }
        
        offset += details.length;
        hasMore = details.length === limit;
        
        await sleep(200);
      } catch (e) {
        console.error(`[ml-sync-real-costs] Error fetching billing for ${periodKey}:`, e);
        break;
      }
    }
    
    await sleep(300);
  }
  
  console.log(`[ml-sync-real-costs] Total orders with billing data: ${orderBillingMap.size}`);
  return orderBillingMap;
}

// Fallback: Estimate fee from listing prices API
async function estimateFee(
  accessToken: string,
  totalAmount: number,
  listingTypeId: string = 'gold_special'
): Promise<{ fee: number; source: string }> {
  try {
    const url = `https://api.mercadolibre.com/sites/MLB/listing_prices?price=${totalAmount}&listing_type_id=${listingTypeId}`;
    
    const resp = await fetchWithTimeout(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    }, 10000);
    
    if (!resp.ok) {
      console.log(`[ml-sync-real-costs] listing_prices failed: ${resp.status}`);
      // Fallback to common percentage (11%)
      return { fee: totalAmount * 0.11, source: 'estimated:fallback:11%' };
    }
    
    const data = await resp.json();
    
    // Find sale_fee_details
    if (data.sale_fee_details) {
      const percentFee = data.sale_fee_details.percentage_fee || 0;
      const fixedFee = data.sale_fee_details.fixed_fee || 0;
      const calculatedFee = (totalAmount * percentFee / 100) + fixedFee;
      return { fee: calculatedFee, source: `estimated:listing_prices:${percentFee}%` };
    }
    
    // Alternative format
    if (Array.isArray(data)) {
      for (const item of data) {
        if (item.listing_type_id === listingTypeId) {
          const percentFee = item.sale_fee_amount || 0;
          return { fee: percentFee, source: `estimated:array:${listingTypeId}` };
        }
      }
    }
    
    // Default fallback
    return { fee: totalAmount * 0.11, source: 'estimated:fallback:11%' };
  } catch (e) {
    console.log(`[ml-sync-real-costs] Fee estimation error:`, e);
    return { fee: totalAmount * 0.11, source: 'estimated:error:11%' };
  }
}

async function processRealCosts(
  supabase: any,
  userId: string,
  sellerId: string,
  accessToken: string,
  accountId: string,
  refreshTokenValue: string,
  dateFrom: Date,
  dateTo: Date,
  startOffset: number,
  startProcessed: number,
  periodKeys: string[]
) {
  console.log(`[ml-sync-real-costs] Background processing started, offset=${startOffset}`);
  
  const runStartTime = Date.now();
  let currentAccessToken = accessToken;
  let currentRefreshToken = refreshTokenValue;
  let totalProcessed = startProcessed;
  let offset = startOffset;
  const BATCH_SIZE = 50;

  // Stats for logging
  const stats = {
    ordersInPeriod: 0,
    withBillingData: 0,
    withShipmentCosts: 0,
    withEstimatedFee: 0,
    complete: 0,
    examples: [] as any[],
  };

  try {
    // Step 1: Fetch all billing reports first (if starting fresh)
    let orderBillingMap = new Map<string, any[]>();
    
    if (startOffset === 0) {
      orderBillingMap = await fetchBillingDetails(
        supabase,
        userId,
        sellerId,
        currentAccessToken,
        periodKeys
      );
    } else {
      // Load from cache if continuing
      console.log(`[ml-sync-real-costs] Loading billing data from cache...`);
      const { data: cachedBilling } = await supabase
        .from('meli_billing_details_cache')
        .select('order_id, charge_type, charge_description, net_amount')
        .eq('seller_id', sellerId)
        .not('order_id', 'is', null);
      
      if (cachedBilling) {
        for (const row of cachedBilling) {
          const orderId = String(row.order_id);
          if (!orderBillingMap.has(orderId)) {
            orderBillingMap.set(orderId, []);
          }
          orderBillingMap.get(orderId)!.push({
            charge_type: row.charge_type,
            description: row.charge_description,
            amount: Math.abs(row.net_amount || 0),
            category: categorizeCharge(row.charge_type, row.charge_description || ''),
          });
        }
      }
      console.log(`[ml-sync-real-costs] Loaded ${orderBillingMap.size} orders from billing cache`);
    }

    const dateFromStr = encodeURIComponent(dateFrom.toISOString());
    const dateToStr = encodeURIComponent(dateTo.toISOString());
    let hasMore = true;
    
    while (hasMore) {
      // Check budgets
      if (totalProcessed - startProcessed >= MAX_ORDERS_PER_RUN) {
        console.log(`[ml-sync-real-costs] Budget reached (${MAX_ORDERS_PER_RUN}), pausing at offset ${offset}`);
        await supabase.from('meli_financial_sync_state').update({
          status: 'paused', phase: 'real_costs',
          cursor_or_offset: String(offset),
          movements_synced: totalProcessed,
          last_heartbeat_at: new Date().toISOString(),
        }).eq('seller_id', sellerId);
        
        console.log(`[ml-sync-real-costs] Stats: ${JSON.stringify(stats)}`);
        return;
      }

      if (Date.now() - runStartTime > MAX_RUNTIME_MS) {
        console.log(`[ml-sync-real-costs] Runtime budget reached, pausing at offset ${offset}`);
        await supabase.from('meli_financial_sync_state').update({
          status: 'paused', phase: 'real_costs',
          cursor_or_offset: String(offset),
          movements_synced: totalProcessed,
          last_heartbeat_at: new Date().toISOString(),
        }).eq('seller_id', sellerId);
        
        console.log(`[ml-sync-real-costs] Stats: ${JSON.stringify(stats)}`);
        return;
      }

      // Update heartbeat
      await supabase.from('meli_financial_sync_state').update({
        last_heartbeat_at: new Date().toISOString(),
        last_offset: offset,
        movements_synced: totalProcessed,
      }).eq('seller_id', sellerId);

      // Fetch orders with shipment info
      const ordersUrl = `https://api.mercadolibre.com/orders/search?seller=${sellerId}&order.date_created.from=${dateFromStr}&order.date_created.to=${dateToStr}&offset=${offset}&limit=${BATCH_SIZE}&sort=date_desc`;
      
      let ordersResp: Response | null = null;
      for (let retry = 0; retry < 5; retry++) {
        try {
          ordersResp = await fetchWithTimeout(ordersUrl, {
            headers: { Authorization: `Bearer ${currentAccessToken}` },
          });
          
          if (ordersResp.ok) break;
          
          if (ordersResp.status === 401) {
            const refreshResult = await refreshToken(currentRefreshToken);
            if (refreshResult.access_token) {
              currentAccessToken = refreshResult.access_token;
              currentRefreshToken = refreshResult.refresh_token!;
              await supabase.from('ml_accounts').update({
                access_token: currentAccessToken,
                refresh_token: currentRefreshToken,
                token_expires_at: new Date(Date.now() + (refreshResult.expires_in || 21600) * 1000).toISOString(),
              }).eq('id', accountId);
            }
          }
          
          if (ordersResp.status === 429) await sleep(3000 * (retry + 1));
          else await sleep(1000 * (retry + 1));
        } catch (e) {
          await sleep(1000 * (retry + 1));
        }
      }

      if (!ordersResp || !ordersResp.ok) {
        console.error(`[ml-sync-real-costs] Failed to fetch orders at offset ${offset}`);
        await supabase.from('meli_financial_sync_state').update({
          status: 'error', phase: 'real_costs',
          last_error: `Failed to fetch orders at offset ${offset}`,
          cursor_or_offset: String(offset),
        }).eq('seller_id', sellerId);
        return;
      }

      const ordersData = await ordersResp.json();
      const orders = ordersData.results || [];
      const paging = ordersData.paging || {};
      
      stats.ordersInPeriod += orders.length;
      console.log(`[ml-sync-real-costs] Fetched ${orders.length} orders at offset ${offset}`);

      if (orders.length === 0) {
        hasMore = false;
        break;
      }

      // Process each order
      for (const order of orders) {
        const orderId = String(order.id);
        const shipmentId = order.shipping?.id ? String(order.shipping.id) : null;
        const totalAmount = order.total_amount || 0;
        
        // Check if already processed with real cost
        const { data: existingBreakdown } = await supabase
          .from('order_cost_breakdown_cache')
          .select('has_real_cost, real_cost_synced_at')
          .eq('seller_id', sellerId)
          .eq('order_id', orderId)
          .maybeSingle();

        if (existingBreakdown?.has_real_cost) {
          totalProcessed++;
          continue;
        }

        const orderExample: any = { order_id: orderId, shipment_id: shipmentId, total_amount: totalAmount };
        let feeMl = 0, installmentsCost = 0, adjustments = 0;
        const sourceRefs: string[] = [];
        let hasRealBilling = false;

        // Step 2: Check if we have billing data for this order
        const billingCharges = orderBillingMap.get(orderId);
        
        if (billingCharges && billingCharges.length > 0) {
          hasRealBilling = true;
          stats.withBillingData++;
          
          for (const charge of billingCharges) {
            const amount = charge.amount;
            
            switch (charge.category) {
              case 'sale_fee':
                feeMl += amount;
                sourceRefs.push(`billing:sale_fee:${amount.toFixed(2)}`);
                break;
              case 'shipping_fee':
                // Note: shipping from billing is seller's portion, may overlap with shipment costs
                sourceRefs.push(`billing:shipping_fee:${amount.toFixed(2)}`);
                break;
              case 'installment_cost':
                installmentsCost += amount;
                sourceRefs.push(`billing:installment:${amount.toFixed(2)}`);
                break;
              case 'adjustment':
                adjustments += amount;
                sourceRefs.push(`billing:adjustment:${amount.toFixed(2)}`);
                break;
            }
          }
          
          orderExample.billing_charges = billingCharges.length;
          orderExample.fee_ml_from_billing = feeMl;
        } else {
          // Step 3: Fallback - estimate fee
          const estimation = await estimateFee(currentAccessToken, totalAmount);
          feeMl = estimation.fee;
          sourceRefs.push(estimation.source);
          stats.withEstimatedFee++;
          orderExample.fee_ml_estimated = feeMl;
        }

        // Step 4: Fetch shipment costs (if has shipment_id)
        let shippingCostSeller = 0;
        if (shipmentId) {
          // Check cache first
          const { data: cachedShipmentCost } = await supabase
            .from('meli_shipment_costs_cache')
            .select('sender_cost')
            .eq('seller_id', sellerId)
            .eq('shipment_id', shipmentId)
            .maybeSingle();

          if (cachedShipmentCost) {
            shippingCostSeller = cachedShipmentCost.sender_cost || 0;
          } else {
            try {
              const costsResp = await fetchWithTimeout(
                `https://api.mercadolibre.com/shipments/${shipmentId}/costs`,
                { headers: { Authorization: `Bearer ${currentAccessToken}` } },
                15000
              );
              if (costsResp.ok) {
                const costsData = await costsResp.json();
                stats.withShipmentCosts++;
                
                // Extract seller cost from senders array
                if (costsData.senders && Array.isArray(costsData.senders)) {
                  for (const sender of costsData.senders) {
                    if (String(sender.user_id) === sellerId) {
                      shippingCostSeller = sender.cost || 0;
                    }
                  }
                }
                
                // Cache shipment cost
                await supabase.from('meli_shipment_costs_cache').upsert({
                  user_id: userId,
                  seller_id: sellerId,
                  shipment_id: shipmentId,
                  order_id: orderId,
                  gross_amount: costsData.gross_amount || 0,
                  sender_cost: shippingCostSeller,
                  sender_compensation: costsData.senders?.[0]?.compensation || 0,
                  receiver_cost: costsData.receiver?.cost || 0,
                  discounts_json: costsData.senders?.[0]?.discounts || null,
                  raw_json: costsData,
                  synced_at: new Date().toISOString(),
                }, { onConflict: 'seller_id,shipment_id' });

                orderExample.shipment_costs = costsData;
              }
            } catch (e) {
              console.log(`[ml-sync-real-costs] shipment costs failed for ${shipmentId}:`, e);
            }
          }
          
          if (shippingCostSeller > 0) {
            sourceRefs.push(`shipment:cost:${shippingCostSeller.toFixed(2)}`);
          }
          orderExample.shipping_cost_seller = shippingCostSeller;
        }

        // Step 5: Calculate total_marketplace_cost
        const totalMarketplaceCost = feeMl + shippingCostSeller + installmentsCost + adjustments;
        orderExample.total_marketplace_cost = totalMarketplaceCost;
        
        const hasRealCost = hasRealBilling || shippingCostSeller > 0;
        if (hasRealCost || feeMl > 0) stats.complete++;

        // Step 6: Update order_cost_breakdown_cache
        await supabase.from('order_cost_breakdown_cache').upsert({
          user_id: userId,
          seller_id: sellerId,
          order_id: orderId,
          shipment_id: shipmentId,
          fee_ml: feeMl,
          shipping_cost_seller: shippingCostSeller,
          installments_cost: installmentsCost,
          adjustments: adjustments,
          total_marketplace_cost: totalMarketplaceCost,
          source_refs: sourceRefs,
          has_real_cost: hasRealBilling, // true only if from billing reports
          has_real_financial: hasRealCost,
          real_cost_synced_at: new Date().toISOString(),
          calculated_at: new Date().toISOString(),
        }, { onConflict: 'seller_id,order_id' });

        // Store example (first 3)
        if (stats.examples.length < 3 && (hasRealCost || feeMl > 0)) {
          stats.examples.push(orderExample);
        }

        totalProcessed++;
        
        // Rate limit
        await sleep(50);
      }

      // Pagination
      offset += orders.length;
      const total = paging.total || 0;
      hasMore = orders.length > 0 && (total > 0 ? offset < total : orders.length === BATCH_SIZE);
      
      await sleep(150);
    }

    // Complete
    console.log(`[ml-sync-real-costs] Completed: ${totalProcessed} orders`);
    console.log(`[ml-sync-real-costs] Final stats: ${JSON.stringify(stats)}`);
    
    await supabase.from('meli_financial_sync_state').update({
      status: 'idle',
      phase: 'finished',
      last_sync_finished_at: new Date().toISOString(),
      cursor_or_offset: null,
      movements_synced: totalProcessed,
      last_error: null,
      last_heartbeat_at: new Date().toISOString(),
    }).eq('seller_id', sellerId);

  } catch (error) {
    console.error('[ml-sync-real-costs] Error:', error);
    await supabase.from('meli_financial_sync_state').update({
      status: 'error',
      phase: 'real_costs',
      last_error: String(error),
      cursor_or_offset: String(offset),
      movements_synced: totalProcessed,
    }).eq('seller_id', sellerId);
  }
}
