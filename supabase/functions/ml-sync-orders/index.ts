// @ts-nocheck - Deno types not available in build context
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Declare EdgeRuntime for Supabase Edge Functions
declare const EdgeRuntime: { waitUntil: (promise: Promise<unknown>) => void } | undefined;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

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

interface MLItemDetails {
  id: string;
  permalink?: string;
  catalog_product_id?: string;
  thumbnail?: string;
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

// Background processing function
async function processOrdersInBackground(
  supabaseAdmin: ReturnType<typeof createClient>,
  userId: string,
  sellerId: string,
  accessToken: string,
  dateFrom: string | null,
  dateTo: string | null,
  jobId: string
) {
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
      const mlResponse = await fetch(paginatedUrl, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
        },
      });

      if (!mlResponse.ok) {
        const errorText = await mlResponse.text();
        console.error(`[Job ${jobId}] ML API error:`, errorText);
        
        // Update job with error
        await supabaseAdmin.from('sync_jobs').update({
          status: 'error',
          error_message: `ML API error: ${mlResponse.status}`,
          completed_at: new Date().toISOString(),
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
        total_records: totalFromApi,
        processed_records: allOrders.length,
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
          `https://api.mercadolibre.com/items?ids=${idsParam}&attributes=id,permalink,catalog_product_id,thumbnail`,
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

      const { error: upsertError } = await supabaseAdmin
        .from('meli_orders_cache')
        .upsert(orderData, {
          onConflict: 'seller_id,order_id',
          ignoreDuplicates: false,
        });

      if (upsertError) {
        console.error(`[Job ${jobId}] Batch upsert error:`, upsertError);
        // Continue processing other batches
      }

      processed += batch.length;

      // Update progress
      await supabaseAdmin.from('sync_jobs').update({
        processed_records: processed,
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

        const { error: itemsUpsertError } = await supabaseAdmin
          .from('meli_order_items_cache')
          .upsert(itemsData, {
            onConflict: 'seller_id,order_id,item_id,variation_id',
            ignoreDuplicates: false,
          });

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

    // Mark job as done
    await supabaseAdmin.from('sync_jobs').update({
      status: 'done',
      processed_records: processed,
      completed_at: new Date().toISOString(),
    }).eq('id', jobId);

  } catch (error) {
    console.error(`[Job ${jobId}] Background processing error:`, error);
    await supabaseAdmin.from('sync_jobs').update({
      status: 'error',
      error_message: error instanceof Error ? error.message : 'Unknown error',
      completed_at: new Date().toISOString(),
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

    const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser(token);
    
    if (userError || !user) {
      console.error('Auth error:', userError?.message);
      return new Response(
        JSON.stringify({ error: 'User not authenticated', details: userError?.message }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Authenticated user:', user.id);

    const { seller_id, date_from, date_to } = await req.json();
    
    if (!seller_id) {
      return new Response(
        JSON.stringify({ error: 'seller_id is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Syncing orders for seller: ${seller_id}`);

    // Get ML account with access token
    const { data: mlAccount, error: mlError } = await supabaseAdmin
      .from('ml_accounts')
      .select('access_token, ml_user_id')
      .eq('user_id', user.id)
      .eq('ml_user_id', seller_id)
      .eq('is_active', true)
      .maybeSingle();

    if (mlError || !mlAccount) {
      console.error('ML account not found:', mlError?.message);
      return new Response(
        JSON.stringify({ error: 'ML account not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create job record
    const jobId = crypto.randomUUID();
    const { error: jobError } = await supabaseAdmin.from('sync_jobs').insert({
      id: jobId,
      user_id: user.id,
      seller_id: seller_id,
      job_type: 'orders',
      status: 'processing',
      total_records: 0,
      processed_records: 0,
    });

    if (jobError) {
      console.error('Failed to create job:', jobError);
    }

    // Start background processing using EdgeRuntime.waitUntil
    if (typeof EdgeRuntime !== 'undefined' && EdgeRuntime?.waitUntil) {
      EdgeRuntime.waitUntil(
        processOrdersInBackground(
          supabaseAdmin,
          user.id,
          seller_id,
          mlAccount.access_token,
          date_from,
          date_to,
          jobId
        )
      );
    } else {
      // Fallback: start async but don't await
      processOrdersInBackground(
        supabaseAdmin,
        user.id,
        seller_id,
        mlAccount.access_token,
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
