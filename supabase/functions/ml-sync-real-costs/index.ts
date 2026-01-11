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

// Budget limits - optimized for larger batches
const MAX_ORDERS_PER_RUN = 800;
const MAX_RUNTIME_MS = 55000;
const BATCH_SIZE = 50;

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
  
  if (type.includes('sale_fee') || type.includes('commission') || type.includes('cargo_por_venta') ||
      desc.includes('cargo por venta') || desc.includes('comisión') || desc.includes('commission')) {
    return 'sale_fee';
  }
  
  if (type.includes('shipping') || type.includes('envio') || type.includes('flete') ||
      desc.includes('mercado envíos') || desc.includes('envío') || desc.includes('flete')) {
    return 'shipping_fee';
  }
  
  if (type.includes('financing') || type.includes('installment') || type.includes('cuota') ||
      desc.includes('cuota') || desc.includes('parcelamento') || desc.includes('financiamiento')) {
    return 'installment_cost';
  }
  
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
    const { seller_id, days = 60, continue_sync = false, action, months_back = 3, force_resume = false } = body;

    if (!seller_id) {
      return new Response(JSON.stringify({ error: 'seller_id is required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`[ml-sync-real-costs] Request for seller ${seller_id}, days=${days}, continue=${continue_sync}, force=${force_resume}`);

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
        status: 'idle', 
        phase: 'idle', 
        last_error: null,
        cursor_or_offset: null,
        last_offset: null,
        last_sync_finished_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
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
        last_offset: syncState?.last_offset,
        last_heartbeat_at: syncState?.last_heartbeat_at,
      }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Check if already running (with staleness detection)
    const heartbeatAt = syncState?.last_heartbeat_at ? new Date(syncState.last_heartbeat_at).getTime() : 0;
    const isStaleRunning = syncState?.status === 'running' && syncState?.phase === 'real_costs' && 
      Date.now() - heartbeatAt > 2 * 60 * 1000; // 2 minutes without heartbeat = stale

    const canContinue = continue_sync || force_resume || syncState?.status === 'paused' || isStaleRunning;

    if (syncState?.status === 'running' && syncState?.phase === 'real_costs' && !canContinue) {
      return new Response(JSON.stringify({ 
        status: 'already_running', 
        movements_synced: syncState.movements_synced,
        cursor: syncState.cursor_or_offset,
      }), {
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
    const startOffset = canContinue ? parseInt(syncState?.cursor_or_offset || '0') : 0;
    const startProcessed = canContinue ? (syncState?.movements_synced || 0) : 0;

    console.log(`[ml-sync-real-costs] Starting from offset=${startOffset}, processed=${startProcessed}, stale=${isStaleRunning}`);

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
      last_offset: startOffset,
      last_page_size: BATCH_SIZE,
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
      start_processed: startProcessed,
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
  const orderBillingMap = new Map<string, any[]>();
  
  console.log(`[ml-sync-real-costs] Fetching billing reports for periods: ${periodKeys.join(', ')}`);
  
  for (const periodKey of periodKeys) {
    let offset = 0;
    const limit = 1000;
    let hasMore = true;
    
    while (hasMore) {
      try {
        const url = `https://api.mercadolibre.com/billing/integration/periods/key/${periodKey}/details?group=ML&offset=${offset}&limit=${limit}`;
        
        const resp = await fetchWithTimeout(url, {
          headers: { Authorization: `Bearer ${accessToken}` },
        }, 30000);
        
        if (!resp.ok) {
          console.log(`[ml-sync-real-costs] Billing report failed for ${periodKey}: ${resp.status}`);
          break;
        }
        
        const data = await resp.json();
        const details = data.results || data.details || [];
        
        console.log(`[ml-sync-real-costs] Got ${details.length} billing details for ${periodKey} at offset ${offset}`);
        
        if (details.length === 0) {
          hasMore = false;
          break;
        }
        
        const cacheRows: any[] = [];
        
        for (const detail of details) {
          let orderId: string | null = null;
          let shipmentId: string | null = null;
          
          if (detail.reference_id) orderId = String(detail.reference_id);
          if (detail.order_id) orderId = String(detail.order_id);
          if (detail.shipment_id) shipmentId = String(detail.shipment_id);
          
          if (detail.references) {
            for (const ref of detail.references) {
              if (ref.type === 'order' || ref.type === 'ORDER') orderId = String(ref.id);
              if (ref.type === 'shipment' || ref.type === 'SHIPMENT') shipmentId = String(ref.id);
            }
          }
          
          if (!orderId && !shipmentId) continue;
          
          const chargeType = detail.charge_type || detail.type || detail.concept || 'unknown';
          const description = detail.description || detail.detail || chargeType;
          const amount = Math.abs(detail.amount || detail.gross_amount || 0);
          
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
        
        await sleep(150);
      } catch (e) {
        console.error(`[ml-sync-real-costs] Error fetching billing for ${periodKey}:`, e);
        break;
      }
    }
    
    await sleep(200);
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
      return { fee: totalAmount * 0.11, source: 'estimated:fallback:11%' };
    }
    
    const data = await resp.json();
    
    if (data.sale_fee_details) {
      const percentFee = data.sale_fee_details.percentage_fee || 0;
      const fixedFee = data.sale_fee_details.fixed_fee || 0;
      const calculatedFee = (totalAmount * percentFee / 100) + fixedFee;
      return { fee: calculatedFee, source: `estimated:listing_prices:${percentFee}%` };
    }
    
    if (Array.isArray(data)) {
      for (const item of data) {
        if (item.listing_type_id === listingTypeId) {
          const percentFee = item.sale_fee_amount || 0;
          return { fee: percentFee, source: `estimated:array:${listingTypeId}` };
        }
      }
    }
    
    return { fee: totalAmount * 0.11, source: 'estimated:fallback:11%' };
  } catch (e) {
    return { fee: totalAmount * 0.11, source: 'estimated:error:11%' };
  }
}

// Helper to update sync state consistently
async function updateSyncState(
  supabase: any,
  sellerId: string,
  updates: Record<string, any>
) {
  const fullUpdates = {
    ...updates,
    last_heartbeat_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  
  await supabase.from('meli_financial_sync_state')
    .update(fullUpdates)
    .eq('seller_id', sellerId);
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
  console.log(`[ml-sync-real-costs] Background processing started, offset=${startOffset}, processed=${startProcessed}`);
  
  const runStartTime = Date.now();
  let currentAccessToken = accessToken;
  let currentRefreshToken = refreshTokenValue;
  let totalProcessed = startProcessed;
  let offset = startOffset;

  const stats = {
    ordersInPeriod: 0,
    withBillingData: 0,
    withShipmentCosts: 0,
    withEstimatedFee: 0,
    skippedAlreadyProcessed: 0,
    batchesSaved: 0,
  };

  try {
    // Step 1: Load billing data (from cache if continuing, or fetch fresh)
    let orderBillingMap = new Map<string, any[]>();
    
    if (startOffset === 0) {
      orderBillingMap = await fetchBillingDetails(supabase, userId, sellerId, currentAccessToken, periodKeys);
    } else {
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
      const ordersThisRun = totalProcessed - startProcessed;
      const runtimeMs = Date.now() - runStartTime;
      
      if (ordersThisRun >= MAX_ORDERS_PER_RUN || runtimeMs > MAX_RUNTIME_MS) {
        console.log(`[ml-sync-real-costs] Budget reached: orders=${ordersThisRun}, runtime=${runtimeMs}ms, pausing at offset ${offset}`);
        
        await updateSyncState(supabase, sellerId, {
          status: 'paused',
          phase: 'real_costs',
          cursor_or_offset: String(offset),
          last_offset: offset,
          last_page_size: BATCH_SIZE,
          movements_synced: totalProcessed,
        });
        
        console.log(`[ml-sync-real-costs] Paused. Stats: ${JSON.stringify(stats)}`);
        return;
      }

      // Update heartbeat
      await updateSyncState(supabase, sellerId, {
        last_offset: offset,
        movements_synced: totalProcessed,
        cursor_or_offset: String(offset),
      });

      // Fetch orders batch
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
        await updateSyncState(supabase, sellerId, {
          status: 'error',
          phase: 'real_costs',
          last_error: `Failed to fetch orders at offset ${offset}`,
          cursor_or_offset: String(offset),
        });
        return;
      }

      const ordersData = await ordersResp.json();
      const orders = ordersData.results || [];
      const paging = ordersData.paging || {};
      
      stats.ordersInPeriod += orders.length;
      console.log(`[ml-sync-real-costs] Fetched ${orders.length} orders at offset ${offset}, total=${paging.total || 'unknown'}`);

      if (orders.length === 0) {
        hasMore = false;
        break;
      }

      // OPTIMIZATION 1: Batch check already processed orders
      const orderIds = orders.map((o: any) => String(o.id));
      const { data: existingBreakdowns } = await supabase
        .from('order_cost_breakdown_cache')
        .select('order_id, has_real_cost')
        .eq('seller_id', sellerId)
        .in('order_id', orderIds);
      
      const alreadyProcessedSet = new Set(
        (existingBreakdowns || [])
          .filter((b: any) => b.has_real_cost)
          .map((b: any) => String(b.order_id))
      );

      // OPTIMIZATION 2: Batch fetch cached shipment costs
      const shipmentIds = orders
        .filter((o: any) => o.shipping?.id)
        .map((o: any) => String(o.shipping.id));
      
      const { data: cachedShipmentCosts } = await supabase
        .from('meli_shipment_costs_cache')
        .select('shipment_id, sender_cost')
        .eq('seller_id', sellerId)
        .in('shipment_id', shipmentIds);
      
      const shipmentCostMap = new Map(
        (cachedShipmentCosts || []).map((s: any) => [String(s.shipment_id), s.sender_cost || 0])
      );

      // Process orders and collect rows for batch upsert
      const breakdownRows: any[] = [];
      const shipmentCacheRows: any[] = [];

      for (const order of orders) {
        const orderId = String(order.id);
        const shipmentId = order.shipping?.id ? String(order.shipping.id) : null;
        const totalAmount = order.total_amount || 0;
        
        // Skip already processed
        if (alreadyProcessedSet.has(orderId)) {
          stats.skippedAlreadyProcessed++;
          totalProcessed++;
          continue;
        }

        let feeMl = 0, installmentsCost = 0, adjustments = 0;
        const sourceRefs: string[] = [];
        let hasRealBilling = false;

        // Check billing data
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
        } else {
          // Fallback: estimate fee
          const estimation = await estimateFee(currentAccessToken, totalAmount);
          feeMl = estimation.fee;
          sourceRefs.push(estimation.source);
          stats.withEstimatedFee++;
        }

        // Get shipment cost
        let shippingCostSeller = 0;
        if (shipmentId) {
          // Check cache first
          if (shipmentCostMap.has(shipmentId)) {
            shippingCostSeller = shipmentCostMap.get(shipmentId) as number;
          } else {
            // Fetch from API
            try {
              const costsResp = await fetchWithTimeout(
                `https://api.mercadolibre.com/shipments/${shipmentId}/costs`,
                { headers: { Authorization: `Bearer ${currentAccessToken}` } },
                10000
              );
              if (costsResp.ok) {
                const costsData = await costsResp.json();
                stats.withShipmentCosts++;
                
                if (costsData.senders && Array.isArray(costsData.senders)) {
                  for (const sender of costsData.senders) {
                    if (String(sender.user_id) === sellerId) {
                      shippingCostSeller = sender.cost || 0;
                    }
                  }
                }
                
                // Queue for batch cache insert
                shipmentCacheRows.push({
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
                });
                
                shipmentCostMap.set(shipmentId, shippingCostSeller);
              }
            } catch (e) {
              // Ignore shipment cost errors
            }
          }
          
          if (shippingCostSeller > 0) {
            sourceRefs.push(`shipment:cost:${shippingCostSeller.toFixed(2)}`);
          }
        }

        // Calculate total_marketplace_cost
        const totalMarketplaceCost = feeMl + shippingCostSeller + installmentsCost + adjustments;
        const hasRealCost = hasRealBilling || shippingCostSeller > 0;

        // Queue for batch upsert
        breakdownRows.push({
          user_id: userId,
          seller_id: sellerId,
          order_id: orderId,
          shipment_id: shipmentId,
          fee_ml: feeMl,
          fee_ml_source: hasRealBilling ? 'billing' : 'estimated',
          shipping_cost_seller: shippingCostSeller,
          installments_cost: installmentsCost,
          adjustments: adjustments,
          total_marketplace_cost: totalMarketplaceCost,
          source_refs: sourceRefs,
          has_real_cost: hasRealBilling,
          has_real_financial: hasRealCost,
          real_cost_synced_at: new Date().toISOString(),
          calculated_at: new Date().toISOString(),
        });

        totalProcessed++;
        
        // Small delay between API calls
        await sleep(30);
      }

      // OPTIMIZATION 3: Batch upsert breakdown rows
      if (breakdownRows.length > 0) {
        const { error: breakdownError } = await supabase
          .from('order_cost_breakdown_cache')
          .upsert(breakdownRows, { onConflict: 'seller_id,order_id' });
        
        if (breakdownError) {
          console.error(`[ml-sync-real-costs] Breakdown batch error: ${breakdownError.message}`);
        } else {
          stats.batchesSaved++;
          console.log(`[ml-sync-real-costs] Saved ${breakdownRows.length} breakdown rows`);
        }
      }

      // Batch upsert shipment cache rows
      if (shipmentCacheRows.length > 0) {
        await supabase
          .from('meli_shipment_costs_cache')
          .upsert(shipmentCacheRows, { onConflict: 'seller_id,shipment_id' });
      }

      // Pagination
      offset += orders.length;
      const total = paging.total || 0;
      hasMore = orders.length > 0 && (total > 0 ? offset < total : orders.length === BATCH_SIZE);
      
      await sleep(100);
    }

    // Complete
    console.log(`[ml-sync-real-costs] Completed: ${totalProcessed} orders processed`);
    console.log(`[ml-sync-real-costs] Final stats: ${JSON.stringify(stats)}`);
    
    await updateSyncState(supabase, sellerId, {
      status: 'idle',
      phase: 'finished',
      last_sync_finished_at: new Date().toISOString(),
      cursor_or_offset: null,
      last_offset: null,
      movements_synced: totalProcessed,
      last_error: null,
    });

  } catch (error) {
    console.error('[ml-sync-real-costs] Error:', error);
    await updateSyncState(supabase, sellerId, {
      status: 'error',
      phase: 'real_costs',
      last_error: String(error),
      cursor_or_offset: String(offset),
      last_offset: offset,
      movements_synced: totalProcessed,
    });
  }
}
