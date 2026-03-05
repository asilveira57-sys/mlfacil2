// @ts-nocheck - Deno types not available in build context
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { logSyncEvent, syncStartTimer, syncDuration } from "../_shared/sync-audit.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

const ML_APP_ID = Deno.env.get('ML_APP_ID')!;
const ML_SECRET_KEY = Deno.env.get('ML_SECRET_KEY')!;
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const JOB_NAME = 'orders-nightly-sync';
const LOCK_TTL_MINUTES = 60;
const SYNC_DAYS = 30;
const BATCH_SIZE = 50;
const DELAY_BETWEEN_REQUESTS_MS = 300;
const DELAY_BETWEEN_ACCOUNTS_MS = 2000;

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Token refresh function
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
      console.error('[nightly-sync] Token refresh failed:', errorText);
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
    console.error('[nightly-sync] Token refresh error:', error);
    return { success: false, error: String(error) };
  }
}

// Generate product_key for consolidation
const generateProductKey = (itemId: string, variationId: string | null, sku: string | null): string => {
  if (sku && sku.trim()) {
    return sku.trim().toUpperCase();
  }
  return `${itemId}:${variationId || '0'}`;
};

const generateTitleShort = (title: string | null): string => {
  if (!title) return '';
  return title.substring(0, 50).trim();
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const startTime = Date.now();
  const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  try {
    const timer = syncStartTimer();
    console.log(`[nightly-sync] Starting at ${timer.startedAt}`);

    await logSyncEvent(supabaseAdmin, {
      action: 'sync_started',
      entityType: 'orders_sync',
      entityId: JOB_NAME,
      metadata: { module: 'orders_sync', scope: 'nightly_30d', started_at: timer.startedAt },
    });
    try {
      const { data: pendingJobs } = await supabaseAdmin
        .from("orders_historical_sync_jobs")
        .select("id, seller_id")
        .eq("status", "pending")
        .lte("scheduled_for", new Date().toISOString())
        .order("created_at", { ascending: true })
        .limit(5);

      if (pendingJobs && pendingJobs.length > 0) {
        console.log(`[nightly-sync] Found ${pendingJobs.length} pending historical import jobs`);
        for (const job of pendingJobs) {
          try {
            await fetch(`${SUPABASE_URL}/functions/v1/orders-historical-import`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "x-internal-key": SUPABASE_SERVICE_ROLE_KEY,
              },
              body: JSON.stringify({ seller_id: job.seller_id, action: "start" }),
            });
            console.log(`[nightly-sync] Triggered historical import for ${job.seller_id}`);
            await sleep(2000);
          } catch (err) {
            console.error(`[nightly-sync] Failed to trigger historical import for ${job.seller_id}:`, err);
          }
        }
      }
    } catch (err) {
      console.error("[nightly-sync] Error checking historical jobs:", err);
    }

    // Check and acquire lock
    const { data: scheduler, error: fetchError } = await supabaseAdmin
      .from('sync_scheduler')
      .select('*')
      .eq('job_name', JOB_NAME)
      .single();

    if (fetchError) {
      console.error('[nightly-sync] Error fetching scheduler:', fetchError);
      return new Response(JSON.stringify({ error: 'Scheduler not found' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Check if locked by another process
    if (scheduler.status === 'running' && scheduler.lock_expires_at) {
      const lockExpires = new Date(scheduler.lock_expires_at);
      if (lockExpires > new Date()) {
        console.log('[nightly-sync] Job is already running, skipping');
        await logSyncEvent(supabaseAdmin, {
          action: 'sync_skipped',
          entityType: 'orders_sync',
          entityId: JOB_NAME,
          metadata: { module: 'orders_sync', scope: 'nightly_30d', error_message: 'Job already running' },
        });
        return new Response(JSON.stringify({ 
          status: 'skipped', 
          reason: 'Job already running',
          lock_expires_at: scheduler.lock_expires_at 
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    // Acquire lock
    const lockExpiresAt = new Date(Date.now() + LOCK_TTL_MINUTES * 60 * 1000);
    await supabaseAdmin
      .from('sync_scheduler')
      .update({
        status: 'running',
        lock_expires_at: lockExpiresAt.toISOString(),
        locked_by: 'nightly-job',
        error_message: null,
      })
      .eq('job_name', JOB_NAME);

    // Get all active ML accounts
    const { data: accounts, error: accountsError } = await supabaseAdmin
      .from('ml_accounts')
      .select('id, user_id, ml_user_id, access_token, refresh_token, token_expires_at, nickname')
      .eq('is_active', true);

    if (accountsError) {
      throw new Error(`Failed to fetch accounts: ${accountsError.message}`);
    }

    console.log(`[nightly-sync] Found ${accounts?.length || 0} active accounts`);

    const stats = {
      accounts_processed: 0,
      accounts_failed: 0,
      total_orders: 0,
      total_items: 0,
      started_at: new Date().toISOString(),
    };

    // Calculate date range (last 30 days)
    const now = new Date();
    const daysAgo = new Date(now);
    daysAgo.setDate(now.getDate() - SYNC_DAYS);

    const formatDate = (d: Date, time: string) =>
      `${d.toISOString().split('T')[0]}T${time}-03:00`;

    const dateFrom = formatDate(daysAgo, '00:00:00.000');
    const dateTo = formatDate(now, '23:59:59.999');

    // Process each account
    for (const account of accounts || []) {
      try {
        console.log(`[nightly-sync] Processing account ${account.nickname || account.ml_user_id}`);

        let accessToken = account.access_token;

        // Check if token needs refresh
        const tokenExpires = account.token_expires_at ? new Date(account.token_expires_at) : null;
        if (!tokenExpires || tokenExpires < new Date()) {
          console.log(`[nightly-sync] Token expired for ${account.ml_user_id}, refreshing...`);
          
          const refreshResult = await refreshMercadoLibreToken(account.refresh_token);
          if (refreshResult.success && refreshResult.access_token) {
            accessToken = refreshResult.access_token;
            
            await supabaseAdmin
              .from('ml_accounts')
              .update({
                access_token: refreshResult.access_token,
                refresh_token: refreshResult.refresh_token,
                token_expires_at: new Date(Date.now() + (refreshResult.expires_in || 21600) * 1000).toISOString(),
                updated_at: new Date().toISOString(),
              })
              .eq('id', account.id);
          } else {
            console.error(`[nightly-sync] Token refresh failed for ${account.ml_user_id}`);
            stats.accounts_failed++;
            continue;
          }
        }

        // Fetch orders from ML API
        let allOrders: any[] = [];
        let offset = 0;
        let hasMore = true;

        const baseUrl = `https://api.mercadolibre.com/orders/search?seller=${account.ml_user_id}&sort=date_desc&order.date_created.from=${dateFrom}&order.date_created.to=${dateTo}`;

        while (hasMore) {
          const url = `${baseUrl}&offset=${offset}&limit=${BATCH_SIZE}`;
          
          const response = await fetch(url, {
            headers: { 'Authorization': `Bearer ${accessToken}` },
          });

          if (!response.ok) {
            if (response.status === 401) {
              // Try token refresh once more
              const refreshResult = await refreshMercadoLibreToken(account.refresh_token);
              if (refreshResult.success && refreshResult.access_token) {
                accessToken = refreshResult.access_token;
                await supabaseAdmin
                  .from('ml_accounts')
                  .update({
                    access_token: refreshResult.access_token,
                    refresh_token: refreshResult.refresh_token,
                    token_expires_at: new Date(Date.now() + (refreshResult.expires_in || 21600) * 1000).toISOString(),
                  })
                  .eq('id', account.id);
                continue; // Retry with new token
              }
            }
            console.error(`[nightly-sync] ML API error for ${account.ml_user_id}:`, response.status);
            break;
          }

          const data = await response.json();
          const orders = data.results || [];
          allOrders = [...allOrders, ...orders];

          if (orders.length < BATCH_SIZE) {
            hasMore = false;
          } else {
            offset += BATCH_SIZE;
            await sleep(DELAY_BETWEEN_REQUESTS_MS);
          }

          // Failsafe
          if (allOrders.length >= 10000) {
            hasMore = false;
          }
        }

        console.log(`[nightly-sync] Fetched ${allOrders.length} orders for ${account.ml_user_id}`);

        // Collect unique item IDs for details
        const uniqueItemIds = new Set<string>();
        for (const order of allOrders) {
          if (order.order_items) {
            for (const item of order.order_items) {
              if (item.item?.id) {
                uniqueItemIds.add(item.item.id);
              }
            }
          }
        }

        // Fetch item details
        const itemDetailsCache = new Map<string, any>();
        const itemIdsList = Array.from(uniqueItemIds);
        
        for (let i = 0; i < itemIdsList.length; i += 20) {
          const batchIds = itemIdsList.slice(i, i + 20).join(',');
          try {
            const itemsResponse = await fetch(
              `https://api.mercadolibre.com/items?ids=${batchIds}&attributes=id,permalink,catalog_product_id,thumbnail`,
              { headers: { 'Authorization': `Bearer ${accessToken}` } }
            );

            if (itemsResponse.ok) {
              const itemsData = await itemsResponse.json();
              for (const result of itemsData) {
                if (result.code === 200 && result.body) {
                  itemDetailsCache.set(result.body.id, result.body);
                }
              }
            }
          } catch (err) {
            console.error('[nightly-sync] Error fetching item details:', err);
          }
          await sleep(100);
        }

        // Upsert orders
        const allOrderItems: any[] = [];
        const orderItemsCount: Record<string, number> = {};

        for (const order of allOrders) {
          const orderId = order.id.toString();
          const shipmentId = order.shipping?.id?.toString() || null;
          let itemCount = 0;

          if (order.order_items && order.order_items.length > 0) {
            for (const item of order.order_items) {
              const itemId = item.item?.id || 'unknown';
              const variationId = item.item?.variation_id?.toString() || '';
              const sku = item.item?.seller_sku || null;
              const title = item.item?.title || 'Produto sem título';
              const itemDetails = itemDetailsCache.get(itemId);

              allOrderItems.push({
                user_id: account.user_id,
                seller_id: account.ml_user_id,
                order_id: orderId,
                shipment_id: shipmentId,
                item_id: itemId,
                variation_id: variationId,
                sku: sku,
                title: title,
                title_short: generateTitleShort(title),
                quantity: item.quantity || 1,
                unit_price: item.unit_price || 0,
                currency_id: item.currency_id || 'BRL',
                product_key: generateProductKey(itemId, variationId || null, sku),
                created_at_meli: order.date_created,
                last_sync_at: new Date().toISOString(),
                permalink: itemDetails?.permalink || null,
                catalog_product_id: itemDetails?.catalog_product_id || null,
                thumbnail: itemDetails?.thumbnail || null,
              });

              itemCount += item.quantity || 1;
            }
          }

          orderItemsCount[orderId] = itemCount;
        }

        // Batch upsert orders
        for (let i = 0; i < allOrders.length; i += 100) {
          const batch = allOrders.slice(i, i + 100);
          const orderData = batch.map(order => {
            const orderId = order.id.toString();
            const buyerName = order.buyer?.first_name && order.buyer?.last_name
              ? `${order.buyer.first_name} ${order.buyer.last_name}`.trim()
              : order.buyer?.nickname || null;

            return {
              user_id: account.user_id,
              seller_id: account.ml_user_id,
              order_id: orderId,
              pack_id: order.pack_id ? order.pack_id.toString() : null,
              created_at_meli: order.date_created,
              order_status: order.status,
              shipment_id: order.shipping?.id?.toString() || null,
              buyer_nickname: order.buyer?.nickname || null,
              buyer_name: buyerName,
              total_amount: order.total_amount || null,
              items_count: orderItemsCount[orderId] || 0,
              items_synced_at: orderItemsCount[orderId] > 0 ? new Date().toISOString() : null,
              last_sync_at: new Date().toISOString(),
            };
          });

          await supabaseAdmin
            .from('meli_orders_cache')
            .upsert(orderData, { onConflict: 'seller_id,order_id' });
        }

        // Batch upsert items
        for (let i = 0; i < allOrderItems.length; i += 100) {
          const batch = allOrderItems.slice(i, i + 100);
          await supabaseAdmin
            .from('meli_order_items_cache')
            .upsert(batch, { onConflict: 'seller_id,order_id,item_id,variation_id' });
        }

        stats.accounts_processed++;
        stats.total_orders += allOrders.length;
        stats.total_items += allOrderItems.length;

        // Delay between accounts to respect rate limits
        await sleep(DELAY_BETWEEN_ACCOUNTS_MS);

      } catch (accountError) {
        console.error(`[nightly-sync] Error processing account ${account.ml_user_id}:`, accountError);
        stats.accounts_failed++;
      }
    }

    // Update scheduler with completion
    const duration = syncDuration(timer.startMs);
    stats.finished_at = new Date().toISOString();
    stats.duration_ms = duration;

    await supabaseAdmin
      .from('sync_scheduler')
      .update({
        status: 'idle',
        last_run_at: new Date().toISOString(),
        next_run_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        lock_expires_at: null,
        locked_by: null,
        stats: stats,
        error_message: stats.accounts_failed > 0 ? `${stats.accounts_failed} accounts failed` : null,
      })
      .eq('job_name', JOB_NAME);

    // Audit: sync_finished
    await logSyncEvent(supabaseAdmin, {
      action: 'sync_finished',
      entityType: 'orders_sync',
      entityId: JOB_NAME,
      metadata: {
        module: 'orders_sync',
        scope: 'nightly_30d',
        started_at: timer.startedAt,
        finished_at: stats.finished_at,
        duration_ms: duration,
        orders_imported: stats.total_orders,
        items_synced: stats.total_items,
        accounts_processed: stats.accounts_processed,
        accounts_failed: stats.accounts_failed,
      },
    });

    // Gap 18: Reevaluate tenant limits after order sync
    try {
      const { data: allAccounts } = await supabaseAdmin
        .from('ml_accounts')
        .select('company_id')
        .eq('is_active', true);
      const tenantIds = [...new Set((allAccounts || []).map(a => a.company_id).filter(Boolean))];
      for (const tenantId of tenantIds) {
        try {
          await supabaseAdmin.rpc('rpc_compute_sales_30d', { p_tenant_id: tenantId });
          console.log(`[nightly-sync] Computed sales 30d for tenant ${tenantId}`);
        } catch (err) {
          console.warn(`[nightly-sync] Failed to compute sales for tenant ${tenantId}:`, err);
        }
      }
    } catch (err) {
      console.warn('[nightly-sync] Failed to reevaluate tenant limits:', err);
    }

    console.log(`[nightly-sync] Completed in ${duration}ms:`, stats);

    return new Response(JSON.stringify({
      success: true,
      stats,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('[nightly-sync] Fatal error:', error);

    await logSyncEvent(supabaseAdmin, {
      action: 'sync_failed',
      entityType: 'orders_sync',
      entityId: JOB_NAME,
      metadata: { module: 'orders_sync', scope: 'nightly_30d', error_message: String(error) },
    });

    // Release lock on error
    await supabaseAdmin
      .from('sync_scheduler')
      .update({
        status: 'error',
        lock_expires_at: null,
        locked_by: null,
        error_message: String(error),
      })
      .eq('job_name', JOB_NAME);

    return new Response(JSON.stringify({ error: String(error) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
