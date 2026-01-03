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

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

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
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Invalid token' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = await req.json().catch(() => ({}));
    const { seller_id, days = 30, mode = 'full', continue_sync = false } = body;

    if (!seller_id) {
      return new Response(JSON.stringify({ error: 'seller_id is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`[ml-sync-financial] Starting ${mode} sync for seller ${seller_id}, days=${days}`);

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
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Check if token needs refresh
    let validAccessToken = account.access_token;
    const tokenExpiresAt = new Date(account.token_expires_at);
    const now = new Date();
    
    if (tokenExpiresAt.getTime() - now.getTime() < 5 * 60 * 1000) {
      console.log(`[ml-sync-financial] Token expired, refreshing...`);
      const refreshResult = await refreshMercadoLibreToken(account.refresh_token);
      
      if (!refreshResult.success) {
        return new Response(JSON.stringify({ 
          error: 'Token refresh failed', 
          code: 'RECONNECT_REQUIRED'
        }), {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      await supabase
        .from('ml_accounts')
        .update({
          access_token: refreshResult.access_token,
          refresh_token: refreshResult.refresh_token,
          token_expires_at: new Date(Date.now() + (refreshResult.expires_in || 21600) * 1000).toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', account.id);

      validAccessToken = refreshResult.access_token!;
    }

    // Get or create sync state
    let syncState = await getOrCreateSyncState(supabase, user.id, seller_id);
    
    // Check if already running
    if (syncState.status === 'running' && !continue_sync) {
      return new Response(JSON.stringify({ 
        status: 'already_running',
        movements_synced: syncState.movements_synced,
        cursor: syncState.cursor_or_offset
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Calculate date range
    const dateTo = new Date();
    let dateFrom: Date;
    
    if (mode === 'delta' && syncState.last_sync_finished_at) {
      // Start from last successful sync
      dateFrom = new Date(syncState.last_sync_finished_at);
      dateFrom.setDate(dateFrom.getDate() - 1); // 1 day overlap for safety
    } else {
      dateFrom = new Date();
      dateFrom.setDate(dateFrom.getDate() - days);
    }

    // Update sync state to running
    await updateSyncState(supabase, seller_id, {
      status: 'running',
      last_sync_started_at: new Date().toISOString(),
      last_synced_from: dateFrom.toISOString().split('T')[0],
      last_synced_to: dateTo.toISOString().split('T')[0],
      last_error: null,
    });

    // Start background processing
    EdgeRuntime.waitUntil(
      processFinancialMovements(
        supabase,
        user.id,
        seller_id,
        validAccessToken,
        account.id,
        account.refresh_token,
        dateFrom,
        dateTo,
        continue_sync ? syncState.cursor_or_offset : null
      )
    );

    return new Response(JSON.stringify({ 
      status: 'started',
      mode,
      date_from: dateFrom.toISOString(),
      date_to: dateTo.toISOString(),
    }), {
      status: 202,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: unknown) {
    console.error('[ml-sync-financial] Error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

async function refreshMercadoLibreToken(refreshToken: string): Promise<{
  success: boolean;
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  error?: string;
}> {
  try {
    const response = await fetch('https://api.mercadolibre.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: ML_APP_ID,
        client_secret: ML_SECRET_KEY,
        refresh_token: refreshToken,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return { success: false, error: errorText };
    }

    const data = await response.json();
    return {
      success: true,
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires_in: data.expires_in,
    };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}

async function getOrCreateSyncState(supabase: any, userId: string, sellerId: string) {
  const { data: existing } = await supabase
    .from('meli_financial_sync_state')
    .select('*')
    .eq('seller_id', sellerId)
    .eq('user_id', userId)
    .maybeSingle();

  if (existing) return existing;

  const { data: created } = await supabase
    .from('meli_financial_sync_state')
    .insert({
      user_id: userId,
      seller_id: sellerId,
      status: 'idle',
      movements_synced: 0,
    })
    .select()
    .single();

  return created;
}

async function updateSyncState(supabase: any, sellerId: string, updates: any) {
  await supabase
    .from('meli_financial_sync_state')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('seller_id', sellerId);
}

async function processFinancialMovements(
  supabase: any,
  userId: string,
  sellerId: string,
  accessToken: string,
  accountId: string,
  refreshToken: string,
  dateFrom: Date,
  dateTo: Date,
  startCursor: string | null
) {
  console.log(`[ml-sync-financial] Background processing started`);
  
  let currentAccessToken = accessToken;
  let currentRefreshToken = refreshToken;
  let totalMovements = 0;
  let offset = startCursor ? parseInt(startCursor) : 0;
  const BATCH_SIZE = 50;
  let hasMore = true;

  const dateFromStr = dateFrom.toISOString();
  const dateToStr = dateTo.toISOString();

  try {
    while (hasMore) {
      // Fetch movements from ML API
      const url = `https://api.mercadolibre.com/users/${sellerId}/billing/financial-transactions/search?date_from=${encodeURIComponent(dateFromStr)}&date_to=${encodeURIComponent(dateToStr)}&offset=${offset}&limit=${BATCH_SIZE}`;
      
      let response;
      let retries = 0;
      const MAX_RETRIES = 10;

      while (retries < MAX_RETRIES) {
        try {
          response = await fetch(url, {
            headers: { Authorization: `Bearer ${currentAccessToken}` },
          });

          if (response.ok) break;

          if (response.status === 401) {
            console.log(`[ml-sync-financial] Auth error, refreshing token...`);
            const refreshResult = await refreshMercadoLibreToken(currentRefreshToken);
            
            if (!refreshResult.success) {
              await updateSyncState(supabase, sellerId, {
                status: 'error',
                last_error: 'RECONNECT_REQUIRED',
                cursor_or_offset: String(offset),
              });
              return;
            }
            
            currentAccessToken = refreshResult.access_token!;
            currentRefreshToken = refreshResult.refresh_token!;
            
            await supabase
              .from('ml_accounts')
              .update({
                access_token: currentAccessToken,
                refresh_token: currentRefreshToken,
                token_expires_at: new Date(Date.now() + (refreshResult.expires_in || 21600) * 1000).toISOString(),
              })
              .eq('id', accountId);
            
            retries++;
            await sleep(1000 * retries);
            continue;
          }

          if (response.status === 429) {
            retries++;
            console.log(`[ml-sync-financial] Rate limited, waiting ${retries * 3}s...`);
            await sleep(3000 * retries);
            continue;
          }

          // For 404, try alternative endpoint
          if (response.status === 404) {
            console.log(`[ml-sync-financial] API endpoint not found, trying alternative...`);
            break;
          }

          retries++;
          console.log(`[ml-sync-financial] Error ${response.status}, retry ${retries}/${MAX_RETRIES}`);
          await sleep(1000 * retries);

        } catch (fetchError) {
          retries++;
          console.error(`[ml-sync-financial] Network error:`, fetchError);
          await sleep(1000 * retries);
        }
      }

      // If main endpoint fails, try billing endpoint
      if (!response || !response.ok) {
        console.log(`[ml-sync-financial] Trying billing orders approach...`);
        const billingResult = await fetchBillingFromOrders(
          supabase,
          userId,
          sellerId,
          currentAccessToken,
          currentRefreshToken,
          accountId,
          dateFrom,
          dateTo,
          offset
        );
        
        if (billingResult.error) {
          await updateSyncState(supabase, sellerId, {
            status: 'error',
            last_error: billingResult.error,
            cursor_or_offset: String(offset),
            movements_synced: totalMovements,
          });
          return;
        }
        
        totalMovements = billingResult.totalProcessed;
        hasMore = false;
        break;
      }

      const data = await response.json();
      const results = data.results || [];
      const paging = data.paging || {};

      console.log(`[ml-sync-financial] Fetched ${results.length} movements at offset ${offset}`);

      if (results.length === 0) {
        hasMore = false;
        break;
      }

      // Transform and upsert movements - IMMEDIATELY
      const movementsToInsert = results.map((m: any) => ({
        user_id: userId,
        seller_id: sellerId,
        movement_id: String(m.id || `${m.date}_${m.type}_${offset}`),
        order_id: m.order_id || m.reference?.order_id || null,
        shipment_id: m.reference?.shipment_id || null,
        payment_id: m.reference?.payment_id || m.payment_id || null,
        concept: m.type || m.fee_type || m.financial_entity || 'unknown',
        amount: m.amount || m.gross_amount || 0,
        currency_id: m.currency_id || 'BRL',
        movement_date: m.date_created || m.date || new Date().toISOString(),
        status: m.status || null,
        raw_json: m,
        last_sync_at: new Date().toISOString(),
      }));

      // Upsert batch with retries
      let upsertSuccess = false;
      for (let upsertRetry = 0; upsertRetry < 3; upsertRetry++) {
        try {
          const { error: upsertError } = await supabase
            .from('meli_financial_movements_cache')
            .upsert(movementsToInsert, { onConflict: 'seller_id,movement_id' });

          if (!upsertError) {
            upsertSuccess = true;
            totalMovements += results.length;
            console.log(`[ml-sync-financial] Upserted ${results.length} movements, total: ${totalMovements}`);
            break;
          }
          console.error(`[ml-sync-financial] Upsert error:`, upsertError);
        } catch (err) {
          console.error(`[ml-sync-financial] Upsert exception:`, err);
        }
        await sleep(1000 * (upsertRetry + 1));
      }

      // Update sync state with progress - cursor para retomar
      await updateSyncState(supabase, sellerId, {
        cursor_or_offset: String(offset + results.length),
        movements_synced: totalMovements,
      });

      // Pagination
      const total = paging.total || 0;
      offset += BATCH_SIZE;
      hasMore = results.length === BATCH_SIZE && offset < total;

      // Rate limiting
      await sleep(300);
    }

    // Success - consolidate order costs
    console.log(`[ml-sync-financial] Sync complete, consolidating ${totalMovements} movements...`);
    
    await consolidateOrderCosts(supabase, userId, sellerId);
    
    await updateSyncState(supabase, sellerId, {
      status: 'idle',
      last_sync_finished_at: new Date().toISOString(),
      cursor_or_offset: null,
      movements_synced: totalMovements,
      last_error: null,
    });

    console.log(`[ml-sync-financial] Completed successfully: ${totalMovements} movements`);

  } catch (error) {
    console.error('[ml-sync-financial] Background error:', error);
    await updateSyncState(supabase, sellerId, {
      status: 'error',
      last_error: String(error),
      cursor_or_offset: String(offset),
      movements_synced: totalMovements,
    });
  }
}

// Fallback: fetch billing from orders if transactions API not available
async function fetchBillingFromOrders(
  supabase: any,
  userId: string,
  sellerId: string,
  accessToken: string,
  refreshToken: string,
  accountId: string,
  dateFrom: Date,
  dateTo: Date,
  startOffset: number
): Promise<{ totalProcessed: number; error?: string }> {
  console.log(`[ml-sync-financial] Fetching billing from orders...`);
  
  let currentAccessToken = accessToken;
  let currentRefreshToken = refreshToken;
  let offset = startOffset;
  const BATCH_SIZE = 50;
  let hasMore = true;
  let totalProcessed = 0;

  const dateFromStr = encodeURIComponent(dateFrom.toISOString());
  const dateToStr = encodeURIComponent(dateTo.toISOString());

  while (hasMore) {
    const ordersUrl = `https://api.mercadolibre.com/orders/search?seller=${sellerId}&order.date_created.from=${dateFromStr}&order.date_created.to=${dateToStr}&offset=${offset}&limit=${BATCH_SIZE}&sort=date_desc`;
    
    let response;
    let retries = 0;
    const MAX_RETRIES = 10;

    while (retries < MAX_RETRIES) {
      try {
        response = await fetch(ordersUrl, {
          headers: { Authorization: `Bearer ${currentAccessToken}` },
        });

        if (response.ok) break;

        if (response.status === 401) {
          const refreshResult = await refreshMercadoLibreToken(currentRefreshToken);
          if (!refreshResult.success) {
            return { totalProcessed, error: 'RECONNECT_REQUIRED' };
          }
          
          currentAccessToken = refreshResult.access_token!;
          currentRefreshToken = refreshResult.refresh_token!;
          
          await supabase
            .from('ml_accounts')
            .update({
              access_token: currentAccessToken,
              refresh_token: currentRefreshToken,
              token_expires_at: new Date(Date.now() + (refreshResult.expires_in || 21600) * 1000).toISOString(),
            })
            .eq('id', accountId);
          
          retries++;
          await sleep(1000 * retries);
          continue;
        }

        if (response.status === 429) {
          retries++;
          await sleep(3000 * retries);
          continue;
        }

        retries++;
        await sleep(1000 * retries);

      } catch (fetchError) {
        retries++;
        await sleep(1000 * retries);
      }
    }

    if (!response || !response.ok) {
      return { totalProcessed, error: `Failed after ${MAX_RETRIES} retries` };
    }

    const data = await response.json();
    const orders = data.results || [];
    const paging = data.paging || {};

    console.log(`[ml-sync-financial] Orders offset ${offset}: ${orders.length} orders`);

    // Process each order with billing_info
    const movements: any[] = [];
    
    for (const order of orders) {
      const orderId = order.id?.toString();
      if (!orderId) continue;

      // Fetch billing_info with retries
      let billingData = null;
      for (let billingRetry = 0; billingRetry < 10; billingRetry++) {
        try {
          const billingUrl = `https://api.mercadolibre.com/orders/${orderId}/billing_info`;
          const billingResp = await fetch(billingUrl, {
            headers: { Authorization: `Bearer ${currentAccessToken}` },
          });

          if (billingResp.ok) {
            billingData = await billingResp.json();
            break;
          }

          if (billingResp.status === 404) break; // No billing info
          if (billingResp.status === 401) {
            const refreshResult = await refreshMercadoLibreToken(currentRefreshToken);
            if (refreshResult.success) {
              currentAccessToken = refreshResult.access_token!;
              currentRefreshToken = refreshResult.refresh_token!;
              await supabase
                .from('ml_accounts')
                .update({
                  access_token: currentAccessToken,
                  refresh_token: currentRefreshToken,
                  token_expires_at: new Date(Date.now() + (refreshResult.expires_in || 21600) * 1000).toISOString(),
                })
                .eq('id', accountId);
            }
          }
          if (billingResp.status === 429) {
            await sleep(3000 * (billingRetry + 1));
          }
        } catch (e) {
          await sleep(500 * (billingRetry + 1));
        }
      }

      // Create movements from order + billing data
      // Revenue from order
      movements.push({
        user_id: userId,
        seller_id: sellerId,
        movement_id: `order_${orderId}_revenue`,
        order_id: orderId,
        shipment_id: order.shipping?.id?.toString() || null,
        concept: 'order_revenue',
        amount: order.total_amount || 0,
        currency_id: order.currency_id || 'BRL',
        movement_date: order.date_created || new Date().toISOString(),
        status: order.status,
        raw_json: { source: 'order', total_amount: order.total_amount },
      });

      // Shipping revenue if paid
      if (order.shipping?.cost > 0) {
        movements.push({
          user_id: userId,
          seller_id: sellerId,
          movement_id: `order_${orderId}_shipping_revenue`,
          order_id: orderId,
          shipment_id: order.shipping?.id?.toString() || null,
          concept: 'shipping_revenue',
          amount: order.shipping.cost,
          currency_id: order.currency_id || 'BRL',
          movement_date: order.date_created || new Date().toISOString(),
          status: order.status,
          raw_json: { source: 'order_shipping' },
        });
      }

      // Parse billing_info charges
      if (billingData?.seller?.charges) {
        for (let idx = 0; idx < billingData.seller.charges.length; idx++) {
          const charge = billingData.seller.charges[idx];
          movements.push({
            user_id: userId,
            seller_id: sellerId,
            movement_id: `order_${orderId}_charge_${idx}`,
            order_id: orderId,
            shipment_id: order.shipping?.id?.toString() || null,
            concept: charge.type || 'charge',
            amount: -(Math.abs(charge.value || 0)), // Negative for costs
            currency_id: charge.currency_id || 'BRL',
            movement_date: order.date_created || new Date().toISOString(),
            status: 'charged',
            raw_json: charge,
          });
        }
      }

      totalProcessed++;
      await sleep(100); // Rate limit
    }

    // Upsert movements batch
    if (movements.length > 0) {
      for (let upsertRetry = 0; upsertRetry < 3; upsertRetry++) {
        try {
          const { error } = await supabase
            .from('meli_financial_movements_cache')
            .upsert(movements, { onConflict: 'seller_id,movement_id' });

          if (!error) {
            console.log(`[ml-sync-financial] Upserted ${movements.length} movements from orders`);
            break;
          }
        } catch (e) {
          console.error(`[ml-sync-financial] Upsert error:`, e);
        }
        await sleep(1000);
      }
    }

    // Update progress
    await supabase
      .from('meli_financial_sync_state')
      .update({
        cursor_or_offset: String(offset + orders.length),
        movements_synced: totalProcessed,
        updated_at: new Date().toISOString(),
      })
      .eq('seller_id', sellerId);

    // Pagination
    const total = paging.total || 0;
    offset += BATCH_SIZE;
    hasMore = orders.length === BATCH_SIZE && offset < total;

    await sleep(300);
  }

  return { totalProcessed };
}

// Consolidate movements into order_cost_breakdown_cache
async function consolidateOrderCosts(supabase: any, userId: string, sellerId: string) {
  console.log(`[ml-sync-financial] Consolidating order costs...`);

  try {
    // Get all unique order_ids from movements
    const { data: orderIds } = await supabase
      .from('meli_financial_movements_cache')
      .select('order_id')
      .eq('seller_id', sellerId)
      .not('order_id', 'is', null);

    if (!orderIds || orderIds.length === 0) {
      console.log(`[ml-sync-financial] No orders to consolidate`);
      return;
    }

    const uniqueOrderIds = [...new Set(orderIds.map((r: any) => r.order_id))];
    console.log(`[ml-sync-financial] Consolidating ${uniqueOrderIds.length} orders...`);

    // Get concept mappings
    const { data: conceptMaps } = await supabase
      .from('financial_concept_map')
      .select('concept, bucket, signal')
      .eq('seller_id', sellerId);

    const mappings: Record<string, { bucket: string; signal: string }> = {};
    for (const m of (conceptMaps || [])) {
      mappings[m.concept] = { bucket: m.bucket, signal: m.signal };
    }

    // Default mappings
    const defaultMappings: Record<string, string> = {
      'order_revenue': 'receita_produtos',
      'shipping_revenue': 'receita_envio',
      'sale_fee': 'tarifa_venda_e_impostos',
      'commission': 'tarifa_venda_e_impostos',
      'shipping_fee': 'tarifas_envio',
      'shipping': 'tarifas_envio',
      'financing': 'taxa_parcelamento_equivalente',
      'installment': 'taxa_parcelamento_equivalente',
      'financing_fee': 'taxa_parcelamento_equivalente',
      'refund': 'cancelamentos_reembolsos',
      'cancel': 'cancelamentos_reembolsos',
      'chargeback': 'cancelamentos_reembolsos',
    };

    // Process in batches
    const BATCH_SIZE = 100;
    for (let i = 0; i < uniqueOrderIds.length; i += BATCH_SIZE) {
      const batchOrderIds = uniqueOrderIds.slice(i, i + BATCH_SIZE);
      
      // Get movements for these orders
      const { data: movements } = await supabase
        .from('meli_financial_movements_cache')
        .select('*')
        .eq('seller_id', sellerId)
        .in('order_id', batchOrderIds);

      // Aggregate by order
      const orderAggregates: Record<string, any> = {};

      for (const mov of (movements || [])) {
        const orderId = mov.order_id;
        if (!orderAggregates[orderId]) {
          orderAggregates[orderId] = {
            user_id: userId,
            seller_id: sellerId,
            order_id: orderId,
            shipment_id: mov.shipment_id,
            receita_produtos: 0,
            receita_acrescimo: 0,
            taxa_parcelamento_equivalente: 0,
            tarifa_venda_e_impostos: 0,
            receita_envio: 0,
            tarifas_envio: 0,
            custo_envio_declarado: 0,
            custo_diferenca_peso_medidas: 0,
            cancelamentos_reembolsos: 0,
            total_liquido: 0,
            has_real_financial: true,
            missing_financial_count: 0,
            status: 'ok',
            calculated_at: new Date().toISOString(),
          };
        }

        const agg = orderAggregates[orderId];
        const concept = mov.concept?.toLowerCase() || '';
        let bucket = mappings[concept]?.bucket || null;
        
        // Try default mappings
        if (!bucket) {
          for (const [key, val] of Object.entries(defaultMappings)) {
            if (concept.includes(key)) {
              bucket = val;
              break;
            }
          }
        }

        const signal = mappings[concept]?.signal || 'manter';
        let amount = mov.amount || 0;
        if (signal === 'inverter') amount = -amount;

        if (bucket && agg[bucket] !== undefined) {
          agg[bucket] += amount;
        }
      }

      // Calculate totals and upsert
      const breakdowns = Object.values(orderAggregates).map((agg: any) => {
        agg.total_liquido = 
          agg.receita_produtos + 
          agg.receita_acrescimo + 
          agg.receita_envio + 
          agg.taxa_parcelamento_equivalente +
          agg.tarifa_venda_e_impostos + 
          agg.tarifas_envio + 
          agg.custo_envio_declarado +
          agg.custo_diferenca_peso_medidas +
          agg.cancelamentos_reembolsos;
        
        return agg;
      });

      if (breakdowns.length > 0) {
        await supabase
          .from('order_cost_breakdown_cache')
          .upsert(breakdowns, { onConflict: 'seller_id,order_id' });
      }
    }

    console.log(`[ml-sync-financial] Consolidated ${uniqueOrderIds.length} orders`);

  } catch (error) {
    console.error(`[ml-sync-financial] Consolidation error:`, error);
  }
}
