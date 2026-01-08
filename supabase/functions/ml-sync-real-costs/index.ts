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

// Budget limits
const MAX_ORDERS_PER_RUN = 100;
const MAX_RUNTIME_MS = 25000;

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

async function refreshToken(refreshToken: string): Promise<{ access_token?: string; refresh_token?: string; expires_in?: number; error?: string }> {
  try {
    const resp = await fetchWithTimeout('https://api.mercadolibre.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: ML_APP_ID,
        client_secret: ML_SECRET_KEY,
        refresh_token: refreshToken,
      }),
    }, 15000);
    if (!resp.ok) return { error: await resp.text() };
    const data = await resp.json();
    return { access_token: data.access_token, refresh_token: data.refresh_token, expires_in: data.expires_in };
  } catch (e) {
    return { error: String(e) };
  }
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
    const { seller_id, days = 30, continue_sync = false, action } = body;

    if (!seller_id) {
      return new Response(JSON.stringify({ error: 'seller_id is required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`[ml-sync-real-costs] Starting for seller ${seller_id}, days=${days}`);

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

    // Get or create sync state (reuse meli_financial_sync_state with phase 'real_costs')
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
        startProcessed
      )
    );

    return new Response(JSON.stringify({ 
      status: 'started',
      date_from: dateFrom.toISOString(),
      date_to: dateTo.toISOString(),
      start_offset: startOffset,
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
  startProcessed: number
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
    withBilling: 0,
    withShipmentCosts: 0,
    complete: 0,
    examples: [] as any[],
  };

  const dateFromStr = encodeURIComponent(dateFrom.toISOString());
  const dateToStr = encodeURIComponent(dateTo.toISOString());

  try {
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

        const orderExample: any = { order_id: orderId, shipment_id: shipmentId };

        // 1. Fetch billing_info (for fees/installments)
        let billingData = null;
        try {
          const billingResp = await fetchWithTimeout(
            `https://api.mercadolibre.com/orders/${orderId}/billing_info`,
            { headers: { Authorization: `Bearer ${currentAccessToken}` } },
            15000
          );
          if (billingResp.ok) {
            billingData = await billingResp.json();
            stats.withBilling++;
          }
        } catch (e) {
          console.log(`[ml-sync-real-costs] billing_info failed for ${orderId}:`, e);
        }

        // Parse billing data
        let feeMl = 0, installmentsCost = 0, adjustments = 0;
        const sourceRefs: string[] = [];
        
        if (billingData?.seller?.charges) {
          for (const charge of billingData.seller.charges) {
            const amount = Math.abs(charge.value || 0);
            const type = (charge.type || '').toLowerCase();
            
            if (type.includes('sale_fee') || type.includes('commission') || type.includes('tax')) {
              feeMl += amount;
              sourceRefs.push(`billing:${type}:${amount}`);
            } else if (type.includes('financing') || type.includes('installment')) {
              installmentsCost += amount;
              sourceRefs.push(`billing:${type}:${amount}`);
            } else if (type.includes('refund') || type.includes('cancel') || type.includes('return')) {
              adjustments += amount;
              sourceRefs.push(`billing:${type}:${amount}`);
            }
          }
          orderExample.billing_charges = billingData.seller.charges.length;
          orderExample.fee_ml = feeMl;
          orderExample.installments_cost = installmentsCost;
        }

        // 2. Fetch shipment costs (if has shipment_id)
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
            sourceRefs.push(`shipment:cost:${shippingCostSeller}`);
          }
          orderExample.shipping_cost_seller = shippingCostSeller;
        }

        // 3. Calculate total_marketplace_cost
        const totalMarketplaceCost = feeMl + shippingCostSeller + installmentsCost + adjustments;
        orderExample.total_marketplace_cost = totalMarketplaceCost;
        
        const hasRealCost = feeMl > 0 || shippingCostSeller > 0 || installmentsCost > 0;
        if (hasRealCost) stats.complete++;

        // 4. Update order_cost_breakdown_cache
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
          has_real_cost: hasRealCost,
          has_real_financial: hasRealCost,
          real_cost_synced_at: new Date().toISOString(),
          calculated_at: new Date().toISOString(),
        }, { onConflict: 'seller_id,order_id' });

        // Store example (first 3)
        if (stats.examples.length < 3 && hasRealCost) {
          stats.examples.push(orderExample);
        }

        totalProcessed++;
        
        // Rate limit
        await sleep(100);
      }

      // Pagination
      offset += orders.length;
      const total = paging.total || 0;
      hasMore = orders.length > 0 && (total > 0 ? offset < total : orders.length === BATCH_SIZE);
      
      await sleep(200);
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
