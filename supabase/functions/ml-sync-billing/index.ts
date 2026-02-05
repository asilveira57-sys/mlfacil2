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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Validate user authentication
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
    // mode: 'full' (default for initial) or 'delta' (incremental)
    const { seller_id, months = 6, mode = 'full' } = body;

    if (!seller_id) {
      return new Response(JSON.stringify({ error: 'seller_id is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`[ml-sync-billing] Starting ${mode} billing sync for seller ${seller_id}`);

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
    const bufferMinutes = 5;
    
    if (tokenExpiresAt.getTime() - now.getTime() < bufferMinutes * 60 * 1000) {
      console.log(`[ml-sync-billing] Token expired or expiring soon, attempting refresh...`);
      
      const refreshResult = await refreshMercadoLibreToken(account.refresh_token);
      
      if (!refreshResult.success) {
        console.error(`[ml-sync-billing] Token refresh failed:`, refreshResult.error);
        return new Response(JSON.stringify({ 
          error: 'Token refresh failed', 
          code: 'RECONNECT_REQUIRED',
          message: 'Sua conexão com o Mercado Livre expirou. Por favor, reconecte sua conta.'
        }), {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Update tokens in database
      const { error: updateError } = await supabase
        .from('ml_accounts')
        .update({
          access_token: refreshResult.access_token,
          refresh_token: refreshResult.refresh_token,
          token_expires_at: new Date(Date.now() + (refreshResult.expires_in || 21600) * 1000).toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', account.id);

      if (updateError) {
        console.error(`[ml-sync-billing] Failed to update tokens:`, updateError);
      } else {
        console.log(`[ml-sync-billing] Token refreshed successfully`);
        validAccessToken = refreshResult.access_token;
      }
    }

    // For delta sync, get last sync timestamp
    let lastSyncAt: string | null = null;
    if (mode === 'delta') {
      const { data: lastSync } = await supabase
        .from('meli_order_financials_cache')
        .select('synced_at')
        .eq('seller_id', seller_id)
        .eq('user_id', user.id)
        .order('synced_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (lastSync?.synced_at) {
        lastSyncAt = lastSync.synced_at;
        console.log(`[ml-sync-billing] Delta sync from: ${lastSyncAt}`);
      } else {
        console.log(`[ml-sync-billing] No previous sync found, falling back to full sync`);
      }
    }

    // Create sync job
    const { data: job, error: jobError } = await supabase
      .from('sync_jobs')
      .insert({
        user_id: user.id,
        seller_id,
        job_type: mode === 'delta' ? 'billing_delta' : 'billing',
        status: 'processing',
        total_records: 0,
        processed_records: 0,
      })
      .select('id')
      .single();

    if (jobError) {
      console.error('[ml-sync-billing] Failed to create job:', jobError);
      return new Response(JSON.stringify({ error: 'Failed to create job' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Start background processing
    EdgeRuntime.waitUntil(
      processBillingInBackground(
        supabase, 
        user.id, 
        seller_id, 
        validAccessToken, 
        account.id, 
        account.refresh_token, 
        months, 
        job.id,
        mode,
        lastSyncAt
      )
    );

    return new Response(JSON.stringify({ 
      job_id: job.id, 
      status: 'processing',
      mode,
      last_sync_at: lastSyncAt
    }), {
      status: 202,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: unknown) {
    console.error('[ml-sync-billing] Error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

// Refresh Mercado Libre token
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
      console.error('[ml-sync-billing] Token refresh API error:', errorText);
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
    const msg = error instanceof Error ? error.message : String(error);
    console.error('[ml-sync-billing] Token refresh exception:', msg);
    return { success: false, error: msg };
  }
}

async function processBillingInBackground(
  supabase: any,
  userId: string,
  sellerId: string,
  accessToken: string,
  accountId: string,
  refreshToken: string,
  months: number,
  jobId: string,
  mode: string,
  lastSyncAt: string | null
) {
  console.log(`[ml-sync-billing] Background processing started for job ${jobId}, mode: ${mode}`);
  
  let currentAccessToken = accessToken;
  let currentRefreshToken = refreshToken;
  let totalOrdersProcessed = 0;
  let totalOrdersUpserted = 0;

  try {
    // For delta sync, use date_last_updated filter
    // For full sync, process periods
    if (mode === 'delta' && lastSyncAt) {
      // Delta sync: fetch orders updated since lastSyncAt
      const result = await processDeltaSync(
        supabase,
        userId,
        sellerId,
        currentAccessToken,
        currentRefreshToken,
        accountId,
        jobId,
        lastSyncAt
      );
      
      totalOrdersProcessed = result.processed;
      totalOrdersUpserted = result.upserted;
      
      if (result.error) {
        await updateJobStatus(supabase, jobId, 'error', result.error);
        return;
      }
      
    } else {
      // Full sync: process by periods
      const result = await processFullSync(
        supabase,
        userId,
        sellerId,
        currentAccessToken,
        currentRefreshToken,
        accountId,
        months,
        jobId
      );
      
      totalOrdersProcessed = result.processed;
      totalOrdersUpserted = result.upserted;
      
      if (result.error) {
        await updateJobStatus(supabase, jobId, 'error', result.error);
        return;
      }
    }

    await updateJobStatus(supabase, jobId, 'done');
    console.log(`[ml-sync-billing] Job ${jobId} completed: ${totalOrdersProcessed} processed, ${totalOrdersUpserted} upserted`);

  } catch (error) {
    console.error('[ml-sync-billing] Background processing error:', error);
    await updateJobStatus(supabase, jobId, 'error', String(error));
  }
}

// Delta sync: fetch orders updated since lastSyncAt
async function processDeltaSync(
  supabase: any,
  userId: string,
  sellerId: string,
  accessToken: string,
  refreshToken: string,
  accountId: string,
  jobId: string,
  lastSyncAt: string
): Promise<{ processed: number; upserted: number; error?: string }> {
  console.log(`[ml-sync-billing] Delta sync starting from ${lastSyncAt}`);
  
  let currentAccessToken = accessToken;
  let currentRefreshToken = refreshToken;
  
  const allFinancials: any[] = [];
  let offset = 0;
  const limit = 50;
  let hasMore = true;
  let totalFetched = 0;

  // Use date_last_updated to get only updated orders
  const dateFrom = encodeURIComponent(lastSyncAt);

  while (hasMore) {
    const ordersUrl = `https://api.mercadolibre.com/orders/search?seller=${sellerId}&order.date_last_updated.from=${dateFrom}&offset=${offset}&limit=${limit}&sort=date_desc`;

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
          console.log(`[ml-sync-billing] Auth error, refreshing token...`);
          const refreshResult = await refreshMercadoLibreToken(currentRefreshToken);
          
          if (!refreshResult.success) {
            return { processed: totalFetched, upserted: 0, error: 'RECONNECT_REQUIRED' };
          }
          
          currentAccessToken = refreshResult.access_token!;
          currentRefreshToken = refreshResult.refresh_token!;
          
          await supabase
            .from('ml_accounts')
            .update({
              access_token: currentAccessToken,
              refresh_token: currentRefreshToken,
              token_expires_at: new Date(Date.now() + (refreshResult.expires_in || 21600) * 1000).toISOString(),
              updated_at: new Date().toISOString(),
            })
            .eq('id', accountId);
          
          retries++;
          await sleep(1000 * retries);
          continue;
        }

        if (response.status === 429) {
          // Rate limited, wait and retry
          retries++;
          console.log(`[ml-sync-billing] Rate limited, waiting ${retries * 2}s...`);
          await sleep(2000 * retries);
          continue;
        }

        const errorText = await response.text();
        console.error(`[ml-sync-billing] Delta sync error: ${response.status} - ${errorText}`);
        retries++;
        await sleep(1000 * retries);

      } catch (fetchError) {
        retries++;
        console.error(`[ml-sync-billing] Network error:`, fetchError);
        await sleep(1000 * retries);
      }
    }

    if (!response || !response.ok) {
      console.error(`[ml-sync-billing] Failed to fetch after ${MAX_RETRIES} retries`);
      break;
    }

    const data = await response.json();
    const results = data.results || [];
    const paging = data.paging || {};

    console.log(`[ml-sync-billing] Delta fetch offset ${offset}: ${results.length} orders, total: ${paging.total || 0}`);

    // Update job progress
    await supabase
      .from('sync_jobs')
      .update({
        total_records: paging.total || 0,
        processed_records: totalFetched + results.length,
      })
      .eq('id', jobId);

    // Process each order with billing info
    for (const order of results) {
      const orderId = order.id?.toString();
      if (!orderId) continue;

      const financial = await fetchOrderBillingWithRetry(
        currentAccessToken,
        currentRefreshToken,
        accountId,
        supabase,
        order,
        (newToken, newRefresh) => {
          currentAccessToken = newToken;
          currentRefreshToken = newRefresh;
        }
      );

      if (financial) {
        allFinancials.push(financial);
      }

      totalFetched++;
      
      // Rate limiting between orders
      await sleep(100);
    }

    // Check pagination
    const total = paging.total || 0;
    offset += limit;
    hasMore = results.length === limit && offset < total;

    // Rate limiting between pages
    await sleep(500);
  }

  console.log(`[ml-sync-billing] Delta sync: ${allFinancials.length} financials collected`);

  if (allFinancials.length === 0) {
    return { processed: totalFetched, upserted: 0 };
  }

  // Aggregate and upsert
  const aggregated = aggregateByOrder(allFinancials, userId, sellerId);
  const upserted = await batchUpsertFinancials(supabase, aggregated, jobId);

  return { processed: totalFetched, upserted };
}

// Full sync: process by monthly periods
async function processFullSync(
  supabase: any,
  userId: string,
  sellerId: string,
  accessToken: string,
  refreshToken: string,
  accountId: string,
  months: number,
  jobId: string
): Promise<{ processed: number; upserted: number; error?: string }> {
  let currentAccessToken = accessToken;
  let currentRefreshToken = refreshToken;

  // Generate billing periods
  const periods: { period_id: string; year: number; month: number }[] = [];
  const now = new Date();
  for (let i = 0; i < months; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const year = d.getFullYear();
    const month = d.getMonth() + 1;
    periods.push({
      period_id: `${year}-${String(month).padStart(2, '0')}`,
      year,
      month,
    });
  }

  console.log(`[ml-sync-billing] Full sync: processing ${periods.length} periods`);

  const allFinancials: any[] = [];
  let processedPeriods = 0;
  let totalOrders = 0;

  for (const period of periods) {
    const periodKey = period.period_id;
    console.log(`[ml-sync-billing] Processing period: ${periodKey}`);

    const result = await fetchPeriodOrders(
      currentAccessToken,
      currentRefreshToken,
      accountId,
      supabase,
      sellerId,
      periodKey,
      (newToken, newRefresh) => {
        currentAccessToken = newToken;
        currentRefreshToken = newRefresh;
      }
    );

    if (result.needsReconnect) {
      return { processed: totalOrders, upserted: 0, error: 'RECONNECT_REQUIRED' };
    }

    allFinancials.push(...result.financials);
    totalOrders += result.ordersProcessed;
    processedPeriods++;

    // Update progress
    await supabase
      .from('sync_jobs')
      .update({
        total_records: periods.length,
        processed_records: processedPeriods,
      })
      .eq('id', jobId);

    // Rate limiting between periods
    await sleep(500);
  }

  console.log(`[ml-sync-billing] Full sync: ${allFinancials.length} financials from ${totalOrders} orders`);

  if (allFinancials.length === 0) {
    return { processed: totalOrders, upserted: 0 };
  }

  const aggregated = aggregateByOrder(allFinancials, userId, sellerId);
  const upserted = await batchUpsertFinancials(supabase, aggregated, jobId);

  return { processed: totalOrders, upserted };
}

async function fetchPeriodOrders(
  accessToken: string,
  refreshToken: string,
  accountId: string,
  supabase: any,
  sellerId: string,
  periodKey: string,
  updateTokens: (access: string, refresh: string) => void
): Promise<{ financials: any[]; ordersProcessed: number; needsReconnect: boolean }> {
  let currentAccessToken = accessToken;
  let currentRefreshToken = refreshToken;

  const financials: any[] = [];
  let offset = 0;
  const limit = 50;
  let hasMore = true;
  let ordersProcessed = 0;

  const [year, month] = periodKey.split('-').map(Number);
  const startDate = new Date(year, month - 1, 1);
  const endDate = new Date(year, month, 0, 23, 59, 59);

  const dateFrom = encodeURIComponent(startDate.toISOString());
  const dateTo = encodeURIComponent(endDate.toISOString());

  while (hasMore) {
    const ordersUrl = `https://api.mercadolibre.com/orders/search?seller=${sellerId}&order.date_created.from=${dateFrom}&order.date_created.to=${dateTo}&offset=${offset}&limit=${limit}&sort=date_desc`;

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
            return { financials, ordersProcessed, needsReconnect: true };
          }
          
          currentAccessToken = refreshResult.access_token!;
          currentRefreshToken = refreshResult.refresh_token!;
          updateTokens(currentAccessToken, currentRefreshToken);
          
          await supabase
            .from('ml_accounts')
            .update({
              access_token: currentAccessToken,
              refresh_token: currentRefreshToken,
              token_expires_at: new Date(Date.now() + (refreshResult.expires_in || 21600) * 1000).toISOString(),
              updated_at: new Date().toISOString(),
            })
            .eq('id', accountId);
          
          retries++;
          await sleep(1000 * retries);
          continue;
        }

        if (response.status === 429) {
          retries++;
          console.log(`[ml-sync-billing] Rate limited, waiting ${retries * 2}s...`);
          await sleep(2000 * retries);
          continue;
        }

        retries++;
        await sleep(1000 * retries);

      } catch (fetchError) {
        retries++;
        console.error(`[ml-sync-billing] Network error:`, fetchError);
        await sleep(1000 * retries);
      }
    }

    if (!response || !response.ok) {
      console.error(`[ml-sync-billing] Failed for period ${periodKey} after retries`);
      break;
    }

    const data = await response.json();
    const results = data.results || [];
    const paging = data.paging || {};

    console.log(`[ml-sync-billing] Period ${periodKey} offset ${offset}: ${results.length} orders`);

    for (const order of results) {
      const orderId = order.id?.toString();
      if (!orderId) continue;

      const financial = await fetchOrderBillingWithRetry(
        currentAccessToken,
        currentRefreshToken,
        accountId,
        supabase,
        order,
        (newToken, newRefresh) => {
          currentAccessToken = newToken;
          currentRefreshToken = newRefresh;
          updateTokens(newToken, newRefresh);
        }
      );

      if (financial) {
        financial.billing_period_key = periodKey;
        financials.push(financial);
      }

      ordersProcessed++;
      await sleep(100); // Rate limiting
    }

    const total = paging.total || 0;
    offset += limit;
    hasMore = results.length === limit && offset < total;

    await sleep(300);
  }

  return { financials, ordersProcessed, needsReconnect: false };
}

async function fetchOrderBillingWithRetry(
  accessToken: string,
  refreshToken: string,
  accountId: string,
  supabase: any,
  order: any,
  updateTokens: (access: string, refresh: string) => void
): Promise<any | null> {
  const orderId = order.id?.toString();
  if (!orderId) return null;

  let currentAccessToken = accessToken;
  let currentRefreshToken = refreshToken;

  const financial = {
    order_id: orderId,
    billing_period_key: null as string | null,
    revenue_products: order.total_amount || 0,
    revenue_shipping: order.shipping?.cost || 0,
    cost_sale_fee: 0,
    cost_shipping_fee: 0,
    cost_installment_fee: 0,
    cost_cancellations: 0,
    shipment_id: order.shipping?.id?.toString() || null,
  };

  // Try to fetch billing_info with retries
  let retries = 0;
  const MAX_RETRIES = 10;

  while (retries < MAX_RETRIES) {
    try {
      const billingUrl = `https://api.mercadolibre.com/orders/${orderId}/billing_info`;
      const billingResp = await fetch(billingUrl, {
        headers: { Authorization: `Bearer ${currentAccessToken}` },
      });

      if (billingResp.ok) {
        const billingData = await billingResp.json();
        
        if (billingData.seller?.charges) {
          for (const charge of billingData.seller.charges) {
            const chargeType = (charge.type || '').toLowerCase();
            const amount = Math.abs(charge.value || 0);
            
            if (chargeType.includes('sale_fee') || chargeType.includes('commission')) {
              financial.cost_sale_fee += amount;
            } else if (chargeType.includes('shipping')) {
              financial.cost_shipping_fee += amount;
            } else if (chargeType.includes('financing') || chargeType.includes('installment')) {
              financial.cost_installment_fee += amount;
            } else if (chargeType.includes('cancel') || chargeType.includes('refund')) {
              financial.cost_cancellations += amount;
            }
          }
        }
        break; // Success
      }

      if (billingResp.status === 404) {
        break; // No billing info, that's ok
      }

      if (billingResp.status === 401) {
        const refreshResult = await refreshMercadoLibreToken(currentRefreshToken);
        
        if (refreshResult.success) {
          currentAccessToken = refreshResult.access_token!;
          currentRefreshToken = refreshResult.refresh_token!;
          updateTokens(currentAccessToken, currentRefreshToken);
          
          await supabase
            .from('ml_accounts')
            .update({
              access_token: currentAccessToken,
              refresh_token: currentRefreshToken,
              token_expires_at: new Date(Date.now() + (refreshResult.expires_in || 21600) * 1000).toISOString(),
              updated_at: new Date().toISOString(),
            })
            .eq('id', accountId);
        }
      }

      if (billingResp.status === 429) {
        retries++;
        await sleep(2000 * retries);
        continue;
      }

      retries++;
      await sleep(500 * retries);

    } catch (error) {
      retries++;
      console.error(`[ml-sync-billing] Billing fetch error for ${orderId}:`, error);
      await sleep(500 * retries);
    }
  }

  return financial;
}

async function batchUpsertFinancials(
  supabase: any,
  financials: any[],
  jobId: string
): Promise<number> {
  const BATCH_SIZE = 50;
  let upsertedCount = 0;

  for (let i = 0; i < financials.length; i += BATCH_SIZE) {
    const batch = financials.slice(i, i + BATCH_SIZE);
    let retries = 0;
    const MAX_RETRIES = 3;

    while (retries < MAX_RETRIES) {
      try {
        const { error } = await supabase
          .from('meli_order_financials_cache')
          .upsert(batch, { onConflict: 'seller_id,order_id' });

        if (error) throw error;

        upsertedCount += batch.length;
        console.log(`[ml-sync-billing] Upserted batch ${Math.floor(i / BATCH_SIZE) + 1}, total: ${upsertedCount}/${financials.length}`);
        break;

      } catch (error) {
        retries++;
        console.error(`[ml-sync-billing] Upsert error (${retries}/${MAX_RETRIES}):`, error);
        if (retries >= MAX_RETRIES) {
          console.error(`[ml-sync-billing] Batch failed after ${MAX_RETRIES} retries`);
        }
        await sleep(1000 * retries);
      }
    }

    await sleep(200);
  }

  return upsertedCount;
}

function aggregateByOrder(financials: any[], userId: string, sellerId: string): any[] {
  const byOrderId: Record<string, any> = {};

  for (const f of financials) {
    const key = f.order_id;
    if (!byOrderId[key]) {
      byOrderId[key] = {
        user_id: userId,
        seller_id: sellerId,
        order_id: f.order_id,
        shipment_id: f.shipment_id,
        billing_period_key: f.billing_period_key,
        revenue_products: 0,
        revenue_shipping: 0,
        cost_sale_fee: 0,
        cost_shipping_fee: 0,
        cost_installment_fee: 0,
        cost_cancellations: 0,
        synced_at: new Date().toISOString(),
      };
    }

    // Only set non-zero values (avoid overwriting with zeros)
    if (f.revenue_products > 0) byOrderId[key].revenue_products = f.revenue_products;
    if (f.revenue_shipping > 0) byOrderId[key].revenue_shipping = f.revenue_shipping;
    
    byOrderId[key].cost_sale_fee += f.cost_sale_fee || 0;
    byOrderId[key].cost_shipping_fee += f.cost_shipping_fee || 0;
    byOrderId[key].cost_installment_fee += f.cost_installment_fee || 0;
    byOrderId[key].cost_cancellations += f.cost_cancellations || 0;
  }

  return Object.values(byOrderId);
}

async function updateJobStatus(
  supabase: any,
  jobId: string,
  status: string,
  errorMessage?: string
) {
  const updates: any = {
    status,
    completed_at: new Date().toISOString(),
  };

  if (errorMessage) {
    updates.error_message = errorMessage;
  }

  const { error } = await supabase
    .from('sync_jobs')
    .update(updates)
    .eq('id', jobId);

  if (error) {
    console.error(`[ml-sync-billing] Failed to update job status:`, error);
  }
}
