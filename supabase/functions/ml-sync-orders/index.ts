// @ts-nocheck - Deno types not available in build context
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { resolveAccessibleMlAccount } from "../_shared/ml-account-access.ts";

// Declare EdgeRuntime for Supabase Edge Functions
declare const EdgeRuntime: { waitUntil: (promise: Promise<unknown>) => void } | undefined;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

const ML_APP_ID = Deno.env.get('ML_APP_ID')!;
const ML_SECRET_KEY = Deno.env.get('ML_SECRET_KEY')!;

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
      console.error('[ml-sync-orders] Token refresh failed:', errorText);
      return { success: false, error: errorText };
    }

    const data = await response.json();
    console.log('[ml-sync-orders] Token refreshed successfully');
    return {
      success: true,
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires_in: data.expires_in,
    };
  } catch (error) {
    console.error('[ml-sync-orders] Token refresh error:', error);
    return { success: false, error: String(error) };
  }
}

interface MLOrderItem {
  item: {
    id: string;
    title: string;
    seller_sku?: string;
    variation_id?: number;
  };
  quantity: number;
  unit_price: number;
  currency_id?: string;
}

interface MLVariationAttribute {
  id: string;
  name: string;
  value_id: string | null;
  value_name: string | null;
}

interface MLVariation {
  id: number;
  attribute_combinations?: MLVariationAttribute[];
}

interface MLItemDetails {
  id: string;
  permalink?: string;
  catalog_product_id?: string;
  thumbnail?: string;
  variations?: MLVariation[];
}

interface MLOrder {
  id: number;
  status: string;
  date_created: string;
  buyer: {
    id: number;
    nickname: string;
    first_name?: string;
    last_name?: string;
  };
  total_amount: number;
  shipping?: {
    id: number;
  };
  order_items?: MLOrderItem[];
  comments?: string;
}

// Sleep helper for yielding between operations
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Generate title_short (first 50 chars)
const generateTitleShort = (title: string | null): string => {
  if (!title) return '';
  return title.substring(0, 50).trim();
};

// Generate product_key for cost consolidation
// Rule: if sku exists use normalized sku, else item_id:variation_id
const generateProductKey = (itemId: string, variationId: string | null, sku: string | null): string => {
  if (sku && sku.trim()) {
    // Normalize SKU: uppercase, trim
    return sku.trim().toUpperCase();
  }
  return `${itemId}:${variationId || '0'}`;
};

// Background processing function with token refresh support
async function processOrdersInBackground(
  supabaseAdmin: ReturnType<typeof createClient>,
  userId: string,
  sellerId: string,
  initialAccessToken: string,
  accountId: string,
  refreshToken: string,
  dateFrom: string | null,
  dateTo: string | null,
  jobId: string
) {
  let accessToken = initialAccessToken;
  try {
    console.log(`[Job ${jobId}] Starting background sync for seller ${sellerId}`);

    // Build ML API URL
    let mlUrl = `https://api.mercadolibre.com/orders/search?seller=${sellerId}&sort=date_desc`;
    
    if (dateFrom) {
      mlUrl += `&order.date_created.from=${dateFrom}`;
    }
    if (dateTo) {
      mlUrl += `&order.date_created.to=${dateTo}`;
    }

    // Fetch ALL orders with pagination (no limit)
    let allOrders: MLOrder[] = [];
    let offset = 0;
    const limit = 50;
    let hasMore = true;
    let totalFromApi = 0;

    while (hasMore) {
      const paginatedUrl = `${mlUrl}&offset=${offset}&limit=${limit}`;
      
      // Fetch with retry and token refresh
      let mlResponse: Response | null = null;
      let retryCount = 0;
      const maxRetries = 3;
      
      while (retryCount < maxRetries) {
        mlResponse = await fetch(paginatedUrl, {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
          },
        });

        if (mlResponse.ok) {
          break;
        }

        // Handle 401 - try to refresh token
        if (mlResponse.status === 401 && retryCount < maxRetries - 1) {
          console.log(`[Job ${jobId}] Got 401, attempting token refresh (attempt ${retryCount + 1})`);
          
          const refreshResult = await refreshMercadoLibreToken(refreshToken);
          
          if (refreshResult.success && refreshResult.access_token) {
            accessToken = refreshResult.access_token;
            
            // Update token in database
            await supabaseAdmin
              .from('ml_accounts')
              .update({
                access_token: refreshResult.access_token,
                refresh_token: refreshResult.refresh_token,
                token_expires_at: new Date(Date.now() + (refreshResult.expires_in || 21600) * 1000).toISOString(),
                updated_at: new Date().toISOString(),
              })
              .eq('id', accountId);
            
            console.log(`[Job ${jobId}] Token refreshed successfully, retrying...`);
            retryCount++;
            await sleep(1000);
            continue;
          } else {
            console.error(`[Job ${jobId}] Token refresh failed:`, refreshResult.error);
          }
        }
        
        // Other errors or max retries reached
        const errorText = await mlResponse.text();
        console.error(`[Job ${jobId}] ML API error:`, errorText);
        
        await supabaseAdmin.from('sync_jobs').update({
          status: 'failed',
          finished_at: new Date().toISOString(),
          metadata: { seller_id: sellerId, error_message: `ML API error: ${mlResponse!.status} - Token refresh failed` },
        }).eq('id', jobId);
        
        return;
      }
      
      if (!mlResponse || !mlResponse.ok) {
        await supabaseAdmin.from('sync_jobs').update({
          status: 'failed',
          finished_at: new Date().toISOString(),
          metadata: { seller_id: sellerId, error_message: 'Failed to fetch orders after retries' },
        }).eq('id', jobId);
        return;
      }

      const data = await mlResponse.json();
      const orders = data.results || [];
      totalFromApi = data.paging?.total || 0;
      allOrders = [...allOrders, ...orders];

      console.log(`[Job ${jobId}] Fetched ${orders.length} orders, total: ${allOrders.length}/${totalFromApi}`);

      // Update progress
      await supabaseAdmin.from('sync_jobs').update({
        metadata: {
          seller_id: sellerId,
          total_records: totalFromApi,
          processed_records: allOrders.length,
        },
      }).eq('id', jobId);

      if (orders.length < limit || allOrders.length >= totalFromApi) {
        hasMore = false;
      } else {
        offset += limit;
        await sleep(100);
      }

      // Failsafe: max 50k orders to prevent infinite loops
      if (allOrders.length >= 50000) {
        console.log(`[Job ${jobId}] Reached failsafe limit of 50000 orders`);
        hasMore = false;
      }
    }

    console.log(`[Job ${jobId}] Total orders fetched: ${allOrders.length}`);

    // ====== BATCH UPSERT ORDERS (100 at a time) ======
    const BATCH_SIZE = 100;
    let processed = 0;
    let ordersWritten = 0;
    let itemsWritten = 0;

    // Collect all order items for batch insert
    interface OrderItemData {
      user_id: string;
      seller_id: string;
      order_id: string;
      shipment_id: string | null;
      item_id: string;
      variation_id: string | null;
      sku: string | null;
      title: string;
      title_short: string;
      quantity: number;
      unit_price: number;
      currency_id: string | null;
      product_key: string;
      created_at_meli: string;
      permalink: string | null;
      catalog_product_id: string | null;
      thumbnail: string | null;
      variation_attributes: { name: string; value: string }[] | null;
    }
    const allOrderItems: OrderItemData[] = [];

    // Cache for item details (to avoid fetching same item multiple times)
    const itemDetailsCache = new Map<string, MLItemDetails>();

    // Collect unique item IDs to fetch details
    const uniqueItemIds = new Set<string>();
    for (const order of allOrders) {
      if (order.order_items && order.order_items.length > 0) {
        for (const item of order.order_items) {
          if (item.item?.id) {
            uniqueItemIds.add(item.item.id);
          }
        }
      }
    }

    console.log(`[Job ${jobId}] Fetching details for ${uniqueItemIds.size} unique items`);

    // Fetch item details in batches (ML multiget supports up to 20 items)
    const itemIdsList = Array.from(uniqueItemIds);
    const ITEMS_FETCH_BATCH = 20;
    
    for (let i = 0; i < itemIdsList.length; i += ITEMS_FETCH_BATCH) {
      const batchIds = itemIdsList.slice(i, i + ITEMS_FETCH_BATCH);
      const idsParam = batchIds.join(',');
      
      try {
        const itemsResponse = await fetch(
          `https://api.mercadolibre.com/items?ids=${idsParam}&attributes=id,permalink,catalog_product_id,thumbnail,variations.id,variations.attribute_combinations`,
          {
            headers: {
              'Authorization': `Bearer ${accessToken}`,
            },
          }
        );

        if (itemsResponse.ok) {
          const itemsData = await itemsResponse.json();
          for (const result of itemsData) {
            if (result.code === 200 && result.body) {
              itemDetailsCache.set(result.body.id, {
                id: result.body.id,
                permalink: result.body.permalink || null,
                catalog_product_id: result.body.catalog_product_id || null,
                thumbnail: result.body.thumbnail || null,
                variations: result.body.variations || [],
              });
            }
          }
        }
      } catch (err) {
        console.error(`[Job ${jobId}] Error fetching item details batch:`, err);
      }

      // Small delay between batches
      if (i + ITEMS_FETCH_BATCH < itemIdsList.length) {
        await sleep(100);
      }
    }

    console.log(`[Job ${jobId}] Item details cached: ${itemDetailsCache.size}`);

    // Track items count per order
    const orderItemsCount: Record<string, number> = {};

    for (let i = 0; i < allOrders.length; i += BATCH_SIZE) {
      const batch = allOrders.slice(i, i + BATCH_SIZE);
      
      // Extract items from this batch first to count them
      for (const order of batch) {
        const orderId = order.id.toString();
        const shipmentId = order.shipping?.id?.toString() || null;
        let itemCount = 0;

        if (order.order_items && order.order_items.length > 0) {
          for (const item of order.order_items) {
            const itemId = item.item?.id || 'unknown';
            // CRITICAL: variation_id must never be null to match unique constraint
            const variationId = item.item?.variation_id?.toString() || '';
            const sku = item.item?.seller_sku || null;
            const title = item.item?.title || 'Produto sem título';
            const titleShort = generateTitleShort(title);
            const productKey = generateProductKey(itemId, variationId || null, sku);
            const quantity = item.quantity || 1;

            // Get cached item details
            const itemDetails = itemDetailsCache.get(itemId);

            // Extract variation attributes from item details
            let variationAttrs: { name: string; value: string }[] | null = null;
            if (variationId && itemDetails?.variations) {
              const variation = itemDetails.variations.find(
                (v) => v.id?.toString() === variationId
              );
              if (variation?.attribute_combinations?.length) {
                variationAttrs = variation.attribute_combinations
                  .filter((a) => a.name && a.value_name)
                  .map((a) => ({ name: a.name, value: a.value_name! }));
                if (variationAttrs.length === 0) variationAttrs = null;
              }
            }

            allOrderItems.push({
              user_id: userId,
              seller_id: sellerId,
              order_id: orderId,
              shipment_id: shipmentId,
              item_id: itemId,
              variation_id: variationId,
              sku: sku,
              title: title,
              title_short: titleShort,
              quantity: quantity,
              unit_price: item.unit_price || 0,
              currency_id: item.currency_id || 'BRL',
              product_key: productKey,
              created_at_meli: order.date_created,
              permalink: itemDetails?.permalink || null,
              catalog_product_id: itemDetails?.catalog_product_id || null,
              thumbnail: itemDetails?.thumbnail || null,
              variation_attributes: variationAttrs,
            });

            itemCount += quantity;
          }
        }

        orderItemsCount[orderId] = itemCount;
      }

      // Build order data with items_count
      const orderData = batch.map(order => {
        const orderId = order.id.toString();
        const buyerName = order.buyer?.first_name && order.buyer?.last_name 
          ? `${order.buyer.first_name} ${order.buyer.last_name}`.trim()
          : order.buyer?.nickname || null;

        return {
          user_id: userId,
          seller_id: sellerId,
          order_id: orderId,
          pack_id: order.pack_id ? order.pack_id.toString() : null,
          created_at_meli: order.date_created,
          order_status: order.status,
          shipment_id: order.shipping?.id?.toString() || null,
          buyer_nickname: order.buyer?.nickname || null,
          buyer_name: buyerName,
          order_comment: order.comments || null,
          total_amount: order.total_amount || null,
          items_count: orderItemsCount[orderId] || 0,
          items_synced_at: orderItemsCount[orderId] > 0 ? new Date().toISOString() : null,
          last_sync_at: new Date().toISOString(),
        };
      });

      // Só grava o que mudou — um SELECT indexado é muito mais barato que um
      // UPDATE, que reescreve a linha inteira e todos os índices dela.
      const norm = (v: any) => (v === null || v === undefined ? '' : String(v));
      const batchOrderIds = orderData.map((o) => String(o.order_id));
      const existingOrders = new Map<string, any>();
      {
        const { data: existingData } = await supabaseAdmin
          .from('meli_orders_cache')
          .select('order_id, order_status, shipment_id, pack_id, buyer_nickname, buyer_name, total_amount, items_count')
          .eq('seller_id', sellerId)
          .in('order_id', batchOrderIds);
        (existingData || []).forEach((r: any) => existingOrders.set(String(r.order_id), r));
      }

      const changedOrders = orderData.filter((o) => {
        const cur = existingOrders.get(String(o.order_id));
        if (!cur) return true;
        return norm(cur.order_status) !== norm(o.order_status)
          || norm(cur.shipment_id) !== norm(o.shipment_id)
          || norm(cur.pack_id) !== norm(o.pack_id)
          || norm(cur.buyer_nickname) !== norm(o.buyer_nickname)
          || norm(cur.buyer_name) !== norm(o.buyer_name)
          || Number(cur.total_amount ?? 0) !== Number(o.total_amount ?? 0)
          || Number(cur.items_count ?? 0) !== Number(o.items_count ?? 0);
      });

      if (changedOrders.length > 0) {
        const { error: upsertError } = await supabaseAdmin
          .from('meli_orders_cache')
          .upsert(changedOrders, {
            onConflict: 'seller_id,order_id',
            ignoreDuplicates: false,
          });

        if (upsertError) {
          console.error(`[Job ${jobId}] Batch upsert error:`, upsertError);
          // Continue processing other batches
        }
        ordersWritten += changedOrders.length;
      }

      processed += batch.length;

      // Update progress
      await supabaseAdmin.from('sync_jobs').update({
        metadata: {
          seller_id: sellerId,
          total_records: allOrders.length,
          processed_records: processed,
        },
      }).eq('id', jobId);

      // Yield between batches
      if (i + BATCH_SIZE < allOrders.length) {
        await sleep(50);
      }
    }

    console.log(`[Job ${jobId}] Orders processed: ${processed}, Items to sync: ${allOrderItems.length}`);

    // ====== BATCH UPSERT ORDER ITEMS ======
    if (allOrderItems.length > 0) {
      const ITEMS_BATCH_SIZE = 100;
      let itemsProcessed = 0;
      let itemsErrors = 0;

      for (let i = 0; i < allOrderItems.length; i += ITEMS_BATCH_SIZE) {
        const itemsBatch = allOrderItems.slice(i, i + ITEMS_BATCH_SIZE);

        const itemsData = itemsBatch.map(item => ({
          user_id: item.user_id,
          seller_id: item.seller_id,
          order_id: item.order_id,
          shipment_id: item.shipment_id,
          item_id: item.item_id,
          variation_id: item.variation_id,
          sku: item.sku,
          title: item.title,
          title_short: item.title_short,
          quantity: item.quantity,
          unit_price: item.unit_price,
          currency_id: item.currency_id,
          product_key: item.product_key,
          created_at_meli: item.created_at_meli,
          last_sync_at: new Date().toISOString(),
          permalink: item.permalink,
          catalog_product_id: item.catalog_product_id,
          thumbnail: item.thumbnail,
        }));

        const itemKey = (r: any) => `${r.order_id}|${r.item_id}|${r.variation_id ?? ''}`;
        const batchItemOrderIds = [...new Set(itemsData.map((r: any) => String(r.order_id)))];
        const existingItems = new Map<string, any>();
        {
          const { data: existingItemData } = await supabaseAdmin
            .from('meli_order_items_cache')
            .select('order_id, item_id, variation_id, quantity, unit_price, title, sku, product_key, shipment_id, thumbnail, permalink')
            .eq('seller_id', sellerId)
            .in('order_id', batchItemOrderIds);
          (existingItemData || []).forEach((r: any) => existingItems.set(itemKey(r), r));
        }

        const changedItems = itemsData.filter((r: any) => {
          const cur = existingItems.get(itemKey(r));
          if (!cur) return true;
          return Number(cur.quantity ?? 0) !== Number(r.quantity ?? 0)
            || Number(cur.unit_price ?? 0) !== Number(r.unit_price ?? 0)
            || String(cur.title ?? '') !== String(r.title ?? '')
            || String(cur.sku ?? '') !== String(r.sku ?? '')
            || String(cur.product_key ?? '') !== String(r.product_key ?? '')
            || String(cur.shipment_id ?? '') !== String(r.shipment_id ?? '')
            || String(cur.thumbnail ?? '') !== String(r.thumbnail ?? '')
            || String(cur.permalink ?? '') !== String(r.permalink ?? '');
        });

        if (changedItems.length > 0) {
          const { error: itemsUpsertError } = await supabaseAdmin
            .from('meli_order_items_cache')
            .upsert(changedItems, {
              onConflict: 'seller_id,order_id,item_id,variation_id',
              ignoreDuplicates: false,
            });

          if (itemsUpsertError) {
            console.error(`[Job ${jobId}] Items batch upsert error:`, itemsUpsertError);
            itemsErrors++;
            // Continue processing - don't stop sync for individual item errors
          }
          itemsWritten += changedItems.length;
        }

        if (itemsUpsertError) {
          console.error(`[Job ${jobId}] Items batch upsert error:`, itemsUpsertError);
          itemsErrors++;
          // Continue processing - don't stop sync for individual item errors
        }

        itemsProcessed += itemsBatch.length;

        // Yield between batches
        if (i + ITEMS_BATCH_SIZE < allOrderItems.length) {
          await sleep(50);
        }
      }

      console.log(`[Job ${jobId}] Order items synced: ${itemsProcessed}, errors: ${itemsErrors}`);
    }

    console.log(`[Job ${jobId}] Sync complete: ${processed} orders, ${allOrderItems.length} items`);

    // ====== ENRICH MISSING BUYER NAMES ======
    // The search API sometimes doesn't return buyer.first_name/last_name
    // Fetch individual order details for orders missing buyer_name
    try {
      const { data: ordersMissingBuyer } = await supabaseAdmin
        .from('meli_orders_cache')
        .select('order_id')
        .eq('seller_id', sellerId)
        .is('buyer_name', null)
        .not('order_status', 'eq', 'cancelled')
        .order('created_at_meli', { ascending: false })
        .limit(50);

      if (ordersMissingBuyer && ordersMissingBuyer.length > 0) {
        console.log(`[Job ${jobId}] Enriching buyer names for ${ordersMissingBuyer.length} orders...`);
        let enriched = 0;

        for (const row of ordersMissingBuyer) {
          try {
            const resp = await fetch(`https://api.mercadolibre.com/orders/${row.order_id}`, {
              headers: { Authorization: `Bearer ${accessToken}` },
            });
            if (resp.ok) {
              const detail = await resp.json();
              const buyerName = detail.buyer?.first_name && detail.buyer?.last_name
                ? `${detail.buyer.first_name} ${detail.buyer.last_name}`.trim()
                : detail.buyer?.nickname || null;
              if (buyerName) {
                await supabaseAdmin
                  .from('meli_orders_cache')
                  .update({ buyer_name: buyerName, buyer_nickname: detail.buyer?.nickname || null })
                  .eq('seller_id', sellerId)
                  .eq('order_id', row.order_id);
                enriched++;
              }
            } else if (resp.status === 429) {
              console.log(`[Job ${jobId}] Rate limited during buyer enrichment, stopping`);
              break;
            }
            await sleep(200); // Rate limit: 5 req/s
          } catch { /* skip */ }
        }
        console.log(`[Job ${jobId}] Enriched ${enriched}/${ordersMissingBuyer.length} buyer names`);
      }
    } catch (enrichErr) {
      console.warn(`[Job ${jobId}] Buyer enrichment error (non-fatal):`, enrichErr);
    }

    // ====== BILLING & COST AUTO-SYNC DISABLED ======
    // All billing/cost calculations are now manual-only to control cloud costs.
    // Users must click "Recalcular" in the Cost module to trigger calculations.
    console.log(`[Job ${jobId}] Billing/cost auto-sync DISABLED — manual-only mode`);

    // Mark job as done
    await supabaseAdmin.from('sync_jobs').update({
      status: 'success',
      finished_at: new Date().toISOString(),
      metadata: {
        seller_id: sellerId,
        total_records: allOrders.length,
        processed_records: processed,
        items_synced: allOrderItems.length,
      },
    }).eq('id', jobId);

  } catch (error) {
    console.error(`[Job ${jobId}] Background processing error:`, error);
    await supabaseAdmin.from('sync_jobs').update({
      status: 'failed',
      finished_at: new Date().toISOString(),
      metadata: { seller_id: sellerId, error_message: error instanceof Error ? error.message : 'Unknown error' },
    }).eq('id', jobId);
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      console.error('Missing or invalid authorization header');
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const token = authHeader.replace('Bearer ', '');

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const supabaseAuth = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser(token);
    
    if (userError || !user) {
      console.error('Auth error:', userError?.message);
      return new Response(
        JSON.stringify({ error: 'User not authenticated', details: userError?.message }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Authenticated user:', user.id);

    // ML API Access Gate - check trial/subscription
    const { assertMlApiAccess } = await import("../_shared/ml-api-gate.ts");
    const gate = await assertMlApiAccess(supabaseAdmin, user.id);
    if (!gate.allowed) {
      console.log(`[ml-sync-orders] Access denied: ${gate.reason}`);
      return gate.response!;
    }

    const { seller_id, date_from, date_to } = await req.json();
    
    if (!seller_id) {
      return new Response(
        JSON.stringify({ error: 'seller_id is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Syncing orders for seller: ${seller_id}`);

    // Get ML account with access token AND refresh token
    const { data: mlAccount, error: mlError, reason: mlReason } = await resolveAccessibleMlAccount(
      supabaseAdmin,
      supabaseAuth,
      user.id,
      seller_id,
      'id, user_id, access_token, refresh_token, token_expires_at, ml_user_id, company_id',
    );

    if (mlError || !mlAccount) {
      console.error('ML account not found:', mlError?.message || mlReason);
      return new Response(
        JSON.stringify({ error: 'ML account not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Pre-check if token needs refresh BEFORE starting background job
    let validAccessToken = mlAccount.access_token;
    const tokenExpiresAt = new Date(mlAccount.token_expires_at);
    const now = new Date();
    
    if (tokenExpiresAt.getTime() - now.getTime() < 5 * 60 * 1000) {
      console.log('[ml-sync-orders] Token expiring soon, refreshing before sync...');
      const refreshResult = await refreshMercadoLibreToken(mlAccount.refresh_token);
      
      if (!refreshResult.success) {
        return new Response(
          JSON.stringify({ 
            error: 'Token refresh failed - reconecte sua conta ML', 
            code: 'RECONNECT_REQUIRED'
          }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      await supabaseAdmin
        .from('ml_accounts')
        .update({
          access_token: refreshResult.access_token,
          refresh_token: refreshResult.refresh_token,
          token_expires_at: new Date(Date.now() + (refreshResult.expires_in || 21600) * 1000).toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', mlAccount.id);

      validAccessToken = refreshResult.access_token!;
      console.log('[ml-sync-orders] Token refreshed successfully before sync');
    }

    // Resolve tenant_id for sync_jobs
    let tenantId: string | null = null;
    if (mlAccount.company_id) {
      const { data: company } = await supabaseAdmin
        .from('companies')
        .select('tenant_id')
        .eq('id', mlAccount.company_id)
        .maybeSingle();
      tenantId = company?.tenant_id || mlAccount.company_id;
    }
    if (!tenantId) tenantId = mlAccount.company_id || user.id;

    // Create job record (new schema)
    const jobId = crypto.randomUUID();
    const { error: jobError } = await supabaseAdmin.from('sync_jobs').insert({
      id: jobId,
      tenant_id: tenantId,
      module: 'shipping_labels_orders',
      scope: 'manual',
      status: 'running',
      started_at: new Date().toISOString(),
      created_by_user_id: user.id,
      metadata: {
        seller_id: seller_id,
        total_records: 0,
        processed_records: 0,
      },
    });

    if (jobError) {
      console.error('Failed to create job:', jobError);
    }

    // Start background processing using EdgeRuntime.waitUntil
    if (typeof EdgeRuntime !== 'undefined' && EdgeRuntime?.waitUntil) {
      EdgeRuntime.waitUntil(
        processOrdersInBackground(
          supabaseAdmin,
            mlAccount.user_id || user.id,
          seller_id,
          validAccessToken,
          mlAccount.id,
          mlAccount.refresh_token,
          date_from,
          date_to,
          jobId
        )
      );
    } else {
      // Fallback: start async but don't await
      processOrdersInBackground(
        supabaseAdmin,
        mlAccount.user_id || user.id,
        seller_id,
        validAccessToken,
        mlAccount.id,
        mlAccount.refresh_token,
        date_from,
        date_to,
        jobId
      ).catch(err => console.error('Background processing failed:', err));
    }

    // Return immediately with job_id
    return new Response(
      JSON.stringify({ 
        accepted: true,
        job_id: jobId,
        message: 'Sync started in background',
      }),
      { status: 202, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in ml-sync-orders:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
