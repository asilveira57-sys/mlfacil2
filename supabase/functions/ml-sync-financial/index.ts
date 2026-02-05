import { createClient } from 'npm:@supabase/supabase-js@2';

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

// ===== BUDGET LIMITS =====
// Maximum orders/movements per run (for micro-batches)
const MAX_ITEMS_PER_RUN = 100;
// Maximum runtime in ms (fail-safe)
const MAX_RUNTIME_MS = 25000;

// Fetch with timeout using AbortController
async function fetchWithTimeout(url: string, options: RequestInit = {}, timeoutMs = 30000): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    return response;
  } finally {
    clearTimeout(timeoutId);
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
    const { seller_id, days = 30, mode = 'full', continue_sync = false, action } = body;

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
        return new Response(
          JSON.stringify({
            error: 'Token refresh failed',
            code: 'RECONNECT_REQUIRED',
          }),
          {
            status: 401,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        );
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
    const syncState = await getOrCreateSyncState(supabase, user.id, seller_id);

    // Cancel request: stop current background loop (it checks status each batch)
    if (action === 'cancel') {
      await updateSyncState(supabase, seller_id, {
        status: 'idle',
        phase: 'idle',
        last_error: null,
        last_sync_finished_at: new Date().toISOString(),
      });

      return new Response(JSON.stringify({ status: 'cancelled' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Detect stale running state (e.g. user navigated away and background died)
    const heartbeatAt = syncState.last_heartbeat_at ? new Date(syncState.last_heartbeat_at).getTime() : 0;
    const updatedAtMs = syncState.updated_at ? new Date(syncState.updated_at).getTime() : 0;
    const lastActivityMs = Math.max(heartbeatAt, updatedAtMs);
    const isStaleRunning =
      syncState.status === 'running' &&
      lastActivityMs > 0 &&
      Date.now() - lastActivityMs > 3 * 60 * 1000; // 3 minutes without heartbeat

    if (isStaleRunning && !continue_sync) {
      return new Response(
        JSON.stringify({
          status: 'stale_running',
          movements_synced: syncState.movements_synced,
          cursor: syncState.cursor_or_offset,
          phase: syncState.phase,
          last_offset: syncState.last_offset,
          last_heartbeat_at: syncState.last_heartbeat_at,
          updated_at: syncState.updated_at,
        }),
        {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Check if already running (not paused)
    if (syncState.status === 'running' && !continue_sync) {
      return new Response(
        JSON.stringify({
          status: 'already_running',
          movements_synced: syncState.movements_synced,
          cursor: syncState.cursor_or_offset,
          phase: syncState.phase,
          last_offset: syncState.last_offset,
          last_heartbeat_at: syncState.last_heartbeat_at,
          updated_at: syncState.updated_at,
        }),
        {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
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

    // Use existing offset if continuing (paused or stale)
    const startOffset = (continue_sync || syncState.status === 'paused') 
      ? (syncState.cursor_or_offset ? parseInt(syncState.cursor_or_offset) : 0)
      : 0;
    
    // Preserve movements_synced when continuing
    const startMovements = (continue_sync || syncState.status === 'paused')
      ? (syncState.movements_synced || 0)
      : 0;

    // Update sync state to running
    await updateSyncState(supabase, seller_id, {
      status: 'running',
      phase: 'starting',
      last_sync_started_at: new Date().toISOString(),
      last_synced_from: dateFrom.toISOString().split('T')[0],
      last_synced_to: dateTo.toISOString().split('T')[0],
      last_error: null,
      last_heartbeat_at: new Date().toISOString(),
      cursor_or_offset: String(startOffset),
      movements_synced: startMovements,
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
        startOffset,
        startMovements
      )
    );

    return new Response(JSON.stringify({ 
      status: 'started',
      mode,
      date_from: dateFrom.toISOString(),
      date_to: dateTo.toISOString(),
      start_offset: startOffset,
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
    const response = await fetchWithTimeout('https://api.mercadolibre.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: ML_APP_ID,
        client_secret: ML_SECRET_KEY,
        refresh_token: refreshToken,
      }),
    }, 15000);

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
    const errorMsg = error instanceof Error && error.name === 'AbortError' 
      ? 'Token refresh timeout' 
      : String(error);
    return { success: false, error: errorMsg };
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
      phase: 'idle',
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

// Helper to check if sync was cancelled
async function isSyncCancelled(supabase: any, sellerId: string): Promise<boolean> {
  const { data: currentState } = await supabase
    .from('meli_financial_sync_state')
    .select('status')
    .eq('seller_id', sellerId)
    .maybeSingle();

  return currentState?.status === 'idle';
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
  startOffset: number,
  startMovements: number
) {
  console.log(`[ml-sync-financial] Background processing started, offset=${startOffset}, movements=${startMovements}`);
  
  const runStartTime = Date.now();
  let currentAccessToken = accessToken;
  let currentRefreshToken = refreshToken;
  let totalMovements = startMovements;
  let offset = startOffset;
  const BATCH_SIZE = 50;
  const FETCH_TIMEOUT_MS = 30000;
  let hasMore = true;
  let itemsThisRun = 0;

  const dateFromStr = dateFrom.toISOString();
  const dateToStr = dateTo.toISOString();

  try {
    // Update phase to fetching
    await updateSyncState(supabase, sellerId, {
      phase: 'fetching',
      last_heartbeat_at: new Date().toISOString(),
      last_offset: offset,
    });

    while (hasMore) {
      // Check budgets: items or runtime
      if (itemsThisRun >= MAX_ITEMS_PER_RUN) {
        console.log(`[ml-sync-financial] Item budget reached (${itemsThisRun}/${MAX_ITEMS_PER_RUN}), pausing at offset ${offset}`);
        await updateSyncState(supabase, sellerId, {
          status: 'paused',
          phase: 'fetching',
          cursor_or_offset: String(offset),
          movements_synced: totalMovements,
          last_error: null,
          last_heartbeat_at: new Date().toISOString(),
        });
        return;
      }

      if (Date.now() - runStartTime > MAX_RUNTIME_MS) {
        console.log(`[ml-sync-financial] Runtime budget reached (${MAX_RUNTIME_MS}ms), pausing at offset ${offset}`);
        await updateSyncState(supabase, sellerId, {
          status: 'paused',
          phase: 'fetching',
          cursor_or_offset: String(offset),
          movements_synced: totalMovements,
          last_error: null,
          last_heartbeat_at: new Date().toISOString(),
        });
        return;
      }

      // Check if sync was cancelled
      if (await isSyncCancelled(supabase, sellerId)) {
        console.log(`[ml-sync-financial] Sync cancelled at offset ${offset}`);
        return;
      }

      // Update heartbeat before fetch
      await updateSyncState(supabase, sellerId, {
        phase: 'fetching',
        last_heartbeat_at: new Date().toISOString(),
        last_offset: offset,
      });

      // Try multiple API endpoints
      const endpoints = [
        `https://api.mercadolibre.com/billing/integration/movements/search?user_id=${sellerId}&date_from=${encodeURIComponent(dateFromStr)}&date_to=${encodeURIComponent(dateToStr)}&offset=${offset}&limit=${BATCH_SIZE}`,
        `https://api.mercadolibre.com/users/${sellerId}/mercadopago_account/movements/search?date_from=${encodeURIComponent(dateFromStr)}&date_to=${encodeURIComponent(dateToStr)}&offset=${offset}&limit=${BATCH_SIZE}`,
      ];
      
      let response: Response | null = null;
      let retries = 0;
      const MAX_RETRIES = 3;
      let lastError = '';
      let endpointWorked = false;

      for (const url of endpoints) {
        if (endpointWorked) break;
        
        retries = 0;
        while (retries < MAX_RETRIES) {
          try {
            response = await fetchWithTimeout(url, {
              headers: { Authorization: `Bearer ${currentAccessToken}` },
            }, FETCH_TIMEOUT_MS);

            if (response.ok) {
              endpointWorked = true;
              console.log(`[ml-sync-financial] Endpoint worked: ${url.split('?')[0]}`);
              break;
            }

            if (response.status === 401) {
              console.log(`[ml-sync-financial] Auth error, refreshing token...`);
              const refreshResult = await refreshMercadoLibreToken(currentRefreshToken);
              
              if (!refreshResult.success) {
                await updateSyncState(supabase, sellerId, {
                  status: 'error',
                  phase: 'error',
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
              lastError = `RATE_LIMITED_AT_OFFSET_${offset}`;
              console.log(`[ml-sync-financial] Rate limited, waiting ${retries * 3}s...`);
              await updateSyncState(supabase, sellerId, {
                last_heartbeat_at: new Date().toISOString(),
                last_error: lastError,
              });
              await sleep(3000 * retries);
              continue;
            }

            if (response.status === 404 || response.status === 403) {
              console.log(`[ml-sync-financial] Endpoint returned ${response.status}, trying next...`);
              break;
            }

            retries++;
            lastError = `HTTP_${response.status}_AT_OFFSET_${offset}`;
            console.log(`[ml-sync-financial] Error ${response.status}, retry ${retries}/${MAX_RETRIES}`);
            await sleep(1000 * retries);

          } catch (fetchError) {
            retries++;
            const isTimeout = fetchError instanceof Error && fetchError.name === 'AbortError';
            lastError = isTimeout ? `TIMEOUT_AT_OFFSET_${offset}` : `NETWORK_ERROR_AT_OFFSET_${offset}`;
            console.error(`[ml-sync-financial] ${isTimeout ? 'Timeout' : 'Network error'}:`, fetchError);
            await updateSyncState(supabase, sellerId, {
              last_heartbeat_at: new Date().toISOString(),
              last_error: lastError,
            });
            await sleep(1000 * retries);
          }
        }
      }

      // If all endpoints fail, use fallback with BUDGET
      if (!endpointWorked || !response || !response.ok) {
        console.log(`[ml-sync-financial] All API endpoints failed, using orders fallback with budget...`);
        await updateSyncState(supabase, sellerId, {
          phase: 'fallback_orders',
          last_heartbeat_at: new Date().toISOString(),
        });
        
        const billingResult = await fetchBillingFromOrders(
          supabase,
          userId,
          sellerId,
          currentAccessToken,
          currentRefreshToken,
          accountId,
          dateFrom,
          dateTo,
          offset,
          runStartTime
        );
        
        if (billingResult.error) {
          await updateSyncState(supabase, sellerId, {
            status: 'error',
            phase: 'error',
            last_error: billingResult.error,
            cursor_or_offset: String(billingResult.lastOffset),
            movements_synced: totalMovements + billingResult.totalProcessed,
          });
          return;
        }
        
        totalMovements += billingResult.totalProcessed;
        
        // If paused due to budget, save state
        if (billingResult.paused) {
          await updateSyncState(supabase, sellerId, {
            status: 'paused',
            phase: 'fallback_orders',
            cursor_or_offset: String(billingResult.lastOffset),
            movements_synced: totalMovements,
            last_error: null,
            last_heartbeat_at: new Date().toISOString(),
          });
          console.log(`[ml-sync-financial] Fallback paused at offset ${billingResult.lastOffset}, ${totalMovements} processed`);
          
          // Consolidate incrementally before pausing
          await consolidateOrderCostsIncremental(supabase, userId, sellerId, billingResult.processedOrderIds || []);
          return;
        }
        
        // If there's more to process, but hit budget, save state
        if (billingResult.hasMore) {
          await updateSyncState(supabase, sellerId, {
            status: 'paused',
            phase: 'fallback_orders',
            cursor_or_offset: String(billingResult.lastOffset),
            movements_synced: totalMovements,
            last_error: null,
            last_heartbeat_at: new Date().toISOString(),
          });
          console.log(`[ml-sync-financial] Fallback has more, paused at offset ${billingResult.lastOffset}`);
          
          // Consolidate incrementally
          await consolidateOrderCostsIncremental(supabase, userId, sellerId, billingResult.processedOrderIds || []);
          return;
        }
        
        // Consolidate final batch
        if (billingResult.processedOrderIds?.length) {
          await consolidateOrderCostsIncremental(supabase, userId, sellerId, billingResult.processedOrderIds);
        }
        
        hasMore = false;
        break;
      }

      const data = await response.json();
      const results = data.results || [];
      const paging = data.paging || {};
      const pageSize = results.length;

      console.log(`[ml-sync-financial] Fetched ${pageSize} movements at offset ${offset}`);

      if (pageSize === 0) {
        hasMore = false;
        break;
      }

      // Update phase to upserting
      await updateSyncState(supabase, sellerId, {
        phase: 'upserting',
        last_heartbeat_at: new Date().toISOString(),
        last_page_size: pageSize,
      });

      // Transform and upsert movements
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

      // Upsert batch
      let upsertSuccess = false;
      for (let upsertRetry = 0; upsertRetry < 3; upsertRetry++) {
        try {
          const { error: upsertError } = await supabase
            .from('meli_financial_movements_cache')
            .upsert(movementsToInsert, { onConflict: 'seller_id,movement_id' });

          if (!upsertError) {
            upsertSuccess = true;
            totalMovements += pageSize;
            itemsThisRun += pageSize;
            console.log(`[ml-sync-financial] Upserted ${pageSize} movements, total: ${totalMovements}, thisRun: ${itemsThisRun}`);
            break;
          }
          console.error(`[ml-sync-financial] Upsert error:`, upsertError);
        } catch (err) {
          console.error(`[ml-sync-financial] Upsert exception:`, err);
        }
        await sleep(1000 * (upsertRetry + 1));
      }

      // Update sync state with progress
      const nextOffset = offset + pageSize;
      await updateSyncState(supabase, sellerId, {
        phase: 'fetching',
        cursor_or_offset: String(nextOffset),
        movements_synced: totalMovements,
        last_heartbeat_at: new Date().toISOString(),
        last_offset: nextOffset,
        last_page_size: pageSize,
        last_error: null,
      });

      // Pagination
      const total = paging.total || 0;
      offset = nextOffset;
      hasMore = pageSize > 0 && (total > 0 ? offset < total : pageSize === BATCH_SIZE);

      // Rate limiting
      await sleep(300);
    }

    // Check cancellation before consolidation
    if (await isSyncCancelled(supabase, sellerId)) {
      console.log(`[ml-sync-financial] Sync cancelled before consolidation`);
      return;
    }

    // Success - consolidate order costs
    console.log(`[ml-sync-financial] Sync complete, consolidating ${totalMovements} movements...`);
    
    await updateSyncState(supabase, sellerId, {
      phase: 'consolidating',
      last_heartbeat_at: new Date().toISOString(),
    });
    
    await consolidateOrderCosts(supabase, userId, sellerId);
    
    // Final check for cancellation
    if (await isSyncCancelled(supabase, sellerId)) {
      console.log(`[ml-sync-financial] Sync cancelled during consolidation`);
      return;
    }
    
    await updateSyncState(supabase, sellerId, {
      status: 'idle',
      phase: 'finished',
      last_sync_finished_at: new Date().toISOString(),
      cursor_or_offset: null,
      movements_synced: totalMovements,
      last_error: null,
      last_heartbeat_at: new Date().toISOString(),
    });

    console.log(`[ml-sync-financial] Completed successfully: ${totalMovements} movements`);

  } catch (error) {
    console.error('[ml-sync-financial] Background error:', error);
    await updateSyncState(supabase, sellerId, {
      status: 'error',
      phase: 'error',
      last_error: String(error),
      cursor_or_offset: String(offset),
      movements_synced: totalMovements,
      last_heartbeat_at: new Date().toISOString(),
    });
  }
}

// Fallback: fetch billing from orders with BUDGETS (items + runtime)
async function fetchBillingFromOrders(
  supabase: any,
  userId: string,
  sellerId: string,
  accessToken: string,
  refreshToken: string,
  accountId: string,
  dateFrom: Date,
  dateTo: Date,
  startOffset: number,
  runStartTime: number
): Promise<{ 
  totalProcessed: number; 
  lastOffset: number; 
  hasMore: boolean; 
  paused: boolean;
  processedOrderIds: string[];
  error?: string 
}> {
  console.log(`[ml-sync-financial] Fetching billing from orders, startOffset=${startOffset}...`);
  
  let currentAccessToken = accessToken;
  let currentRefreshToken = refreshToken;
  let offset = startOffset;
  const BATCH_SIZE = 50;
  const FETCH_TIMEOUT_MS = 30000;
  let hasMore = true;
  let totalProcessed = 0;
  const processedOrderIds: string[] = [];

  const dateFromStr = encodeURIComponent(dateFrom.toISOString());
  const dateToStr = encodeURIComponent(dateTo.toISOString());

  while (hasMore) {
    // Check budgets
    if (totalProcessed >= MAX_ITEMS_PER_RUN) {
      console.log(`[ml-sync-financial] Fallback item budget reached (${totalProcessed}/${MAX_ITEMS_PER_RUN})`);
      return { totalProcessed, lastOffset: offset, hasMore: true, paused: true, processedOrderIds };
    }

    if (Date.now() - runStartTime > MAX_RUNTIME_MS) {
      console.log(`[ml-sync-financial] Fallback runtime budget reached`);
      return { totalProcessed, lastOffset: offset, hasMore: true, paused: true, processedOrderIds };
    }

    // Check cancellation
    if (await isSyncCancelled(supabase, sellerId)) {
      console.log(`[ml-sync-financial] Fallback cancelled at offset ${offset}`);
      return { totalProcessed, lastOffset: offset, hasMore, paused: false, processedOrderIds };
    }

    // Update heartbeat
    await updateSyncState(supabase, sellerId, {
      phase: 'fallback_orders',
      last_heartbeat_at: new Date().toISOString(),
      last_offset: offset,
      movements_synced: totalProcessed,
    });

    const ordersUrl = `https://api.mercadolibre.com/orders/search?seller=${sellerId}&order.date_created.from=${dateFromStr}&order.date_created.to=${dateToStr}&offset=${offset}&limit=${BATCH_SIZE}&sort=date_desc`;
    
    let response: Response | null = null;
    let retries = 0;
    const MAX_RETRIES = 10;

    while (retries < MAX_RETRIES) {
      try {
        response = await fetchWithTimeout(ordersUrl, {
          headers: { Authorization: `Bearer ${currentAccessToken}` },
        }, FETCH_TIMEOUT_MS);

        if (response.ok) break;

        if (response.status === 401) {
          const refreshResult = await refreshMercadoLibreToken(currentRefreshToken);
          if (!refreshResult.success) {
            return { totalProcessed, lastOffset: offset, hasMore, paused: false, processedOrderIds, error: 'RECONNECT_REQUIRED' };
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
          await updateSyncState(supabase, sellerId, {
            last_heartbeat_at: new Date().toISOString(),
            last_error: `RATE_LIMITED_ORDERS_OFFSET_${offset}`,
          });
          await sleep(3000 * retries);
          continue;
        }

        retries++;
        await sleep(1000 * retries);

      } catch (fetchError) {
        retries++;
        const isTimeout = fetchError instanceof Error && fetchError.name === 'AbortError';
        console.error(`[ml-sync-financial] Orders ${isTimeout ? 'timeout' : 'error'}:`, fetchError);
        await updateSyncState(supabase, sellerId, {
          last_heartbeat_at: new Date().toISOString(),
          last_error: isTimeout ? `TIMEOUT_ORDERS_OFFSET_${offset}` : `NETWORK_ERROR_ORDERS_${offset}`,
        });
        await sleep(1000 * retries);
      }
    }

    if (!response || !response.ok) {
      return { totalProcessed, lastOffset: offset, hasMore, paused: false, processedOrderIds, error: `ORDERS_FAILED_AT_OFFSET_${offset}` };
    }

    const data = await response.json();
    const orders = data.results || [];
    const paging = data.paging || {};
    const pageSize = orders.length;

    console.log(`[ml-sync-financial] Orders offset ${offset}: ${pageSize} orders`);

    if (pageSize === 0) {
      hasMore = false;
      break;
    }

    // Process each order with billing_info
    const movements: any[] = [];
    
    for (const order of orders) {
      // Check budgets during order processing
      if (totalProcessed >= MAX_ITEMS_PER_RUN) {
        console.log(`[ml-sync-financial] Mid-page item budget reached`);
        // Save partial progress with current offset (not moved to next page yet)
        return { totalProcessed, lastOffset: offset, hasMore: true, paused: true, processedOrderIds };
      }

      if (Date.now() - runStartTime > MAX_RUNTIME_MS) {
        console.log(`[ml-sync-financial] Mid-page runtime budget reached`);
        return { totalProcessed, lastOffset: offset, hasMore: true, paused: true, processedOrderIds };
      }

      // Check cancellation
      if (await isSyncCancelled(supabase, sellerId)) {
        return { totalProcessed, lastOffset: offset, hasMore, paused: false, processedOrderIds };
      }

      const orderId = order.id?.toString();
      if (!orderId) continue;

      // Check if we already have billing for this order (skip if cached)
      const { data: existingFinancial } = await supabase
        .from('meli_order_financials_cache')
        .select('order_id')
        .eq('seller_id', sellerId)
        .eq('order_id', orderId)
        .maybeSingle();

      if (existingFinancial) {
        // Already have billing, skip API call but count as processed
        totalProcessed++;
        processedOrderIds.push(orderId);
        continue;
      }

      // Fetch billing_info with retries
      let billingData = null;
      for (let billingRetry = 0; billingRetry < 5; billingRetry++) {
        try {
          const billingUrl = `https://api.mercadolibre.com/orders/${orderId}/billing_info`;
          const billingResp = await fetchWithTimeout(billingUrl, {
            headers: { Authorization: `Bearer ${currentAccessToken}` },
          }, 15000);

          if (billingResp.ok) {
            billingData = await billingResp.json();
            break;
          }

          if (billingResp.status === 404) break;
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
            amount: -(Math.abs(charge.value || 0)),
            currency_id: charge.currency_id || 'BRL',
            movement_date: order.date_created || new Date().toISOString(),
            status: 'charged',
            raw_json: charge,
          });
        }
      }

      // Cache billing info for future
      if (billingData) {
        let saleFee = 0, shippingFee = 0, installmentFee = 0;
        for (const charge of (billingData.seller?.charges || [])) {
          const amount = Math.abs(charge.value || 0);
          const type = (charge.type || '').toLowerCase();
          if (type.includes('sale_fee') || type.includes('commission')) saleFee += amount;
          else if (type.includes('shipping')) shippingFee += amount;
          else if (type.includes('financing') || type.includes('installment')) installmentFee += amount;
        }

        await supabase
          .from('meli_order_financials_cache')
          .upsert({
            user_id: userId,
            seller_id: sellerId,
            order_id: orderId,
            shipment_id: order.shipping?.id?.toString() || null,
            revenue_products: order.total_amount || 0,
            revenue_shipping: order.shipping?.cost || 0,
            cost_sale_fee: saleFee,
            cost_shipping_fee: shippingFee,
            cost_installment_fee: installmentFee,
            synced_at: new Date().toISOString(),
          }, { onConflict: 'seller_id,order_id' });
      }

      totalProcessed++;
      processedOrderIds.push(orderId);
      
      // Update heartbeat every 5 orders
      if (totalProcessed % 5 === 0) {
        await updateSyncState(supabase, sellerId, {
          last_heartbeat_at: new Date().toISOString(),
          movements_synced: totalProcessed,
        });
      }

      await sleep(100);
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

    // Update offset after page complete
    const nextOffset = offset + pageSize;
    await supabase
      .from('meli_financial_sync_state')
      .update({
        cursor_or_offset: String(nextOffset),
        movements_synced: totalProcessed,
        last_offset: nextOffset,
        last_page_size: pageSize,
        updated_at: new Date().toISOString(),
        last_heartbeat_at: new Date().toISOString(),
      })
      .eq('seller_id', sellerId);

    // Pagination
    const total = paging.total || 0;
    offset = nextOffset;
    hasMore = pageSize > 0 && (total > 0 ? offset < total : pageSize === BATCH_SIZE);

    await sleep(300);
  }

  console.log(`[ml-sync-financial] Fallback completed: ${totalProcessed} orders`);
  return { totalProcessed, lastOffset: offset, hasMore: false, paused: false, processedOrderIds };
}

// Incremental consolidation for a batch of order IDs
async function consolidateOrderCostsIncremental(supabase: any, userId: string, sellerId: string, orderIds: string[]) {
  if (!orderIds.length) return;
  
  console.log(`[ml-sync-financial] Incrementally consolidating ${orderIds.length} orders...`);

  try {
    const { data: conceptMaps } = await supabase
      .from('financial_concept_map')
      .select('concept, bucket, signal')
      .eq('seller_id', sellerId);

    const mappings: Record<string, { bucket: string; signal: string }> = {};
    for (const m of (conceptMaps || [])) {
      mappings[m.concept] = { bucket: m.bucket, signal: m.signal };
    }

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

    // Process in small batches
    const BATCH_SIZE = 50;
    for (let i = 0; i < orderIds.length; i += BATCH_SIZE) {
      const batchOrderIds = orderIds.slice(i, i + BATCH_SIZE);
      
      const { data: movements } = await supabase
        .from('meli_financial_movements_cache')
        .select('*')
        .eq('seller_id', sellerId)
        .in('order_id', batchOrderIds);

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

    console.log(`[ml-sync-financial] Incremental consolidation done for ${orderIds.length} orders`);

  } catch (error) {
    console.error(`[ml-sync-financial] Incremental consolidation error:`, error);
  }
}

// Full consolidation (used at end of complete sync)
async function consolidateOrderCosts(supabase: any, userId: string, sellerId: string) {
  console.log(`[ml-sync-financial] Consolidating all order costs...`);

  try {
    if (await isSyncCancelled(supabase, sellerId)) {
      console.log(`[ml-sync-financial] Consolidation cancelled at start`);
      return;
    }

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

    await consolidateOrderCostsIncremental(supabase, userId, sellerId, uniqueOrderIds as string[]);

    console.log(`[ml-sync-financial] Consolidated ${uniqueOrderIds.length} orders`);

  } catch (error) {
    console.error(`[ml-sync-financial] Consolidation error:`, error);
  }
}
