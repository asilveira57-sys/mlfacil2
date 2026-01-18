import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

declare const EdgeRuntime: {
  waitUntil(promise: Promise<unknown>): void;
};

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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

    const url = new URL(req.url);
    const path = url.pathname.split('/').filter(Boolean).slice(1).join('/');
    const params = Object.fromEntries(url.searchParams.entries());
    const body = req.method === 'POST' ? await req.json().catch(() => ({})) : {};

    console.log(`[competitor-engine] User ${user.id} requesting: ${path}`, params);

    let result;
    switch (path) {
      // Settings
      case 'settings':
        result = await getSettings(supabase, user.id, params);
        break;
      case 'settings/update':
        result = await updateSettings(supabase, user.id, body);
        break;

      // Listings sync
      case 'listings':
        result = await getListings(supabase, user.id, params);
        break;
      case 'listings/sync':
        EdgeRuntime.waitUntil(syncListings(supabase, user.id, body.seller_id));
        result = { status: 'processing', message: 'Sincronização de anúncios iniciada' };
        break;

      // Market search
      case 'market/search':
        result = await searchMarket(supabase, user.id, body);
        break;
      case 'market/snapshot':
        result = await getMarketSnapshot(supabase, user.id, params);
        break;

      // Catalog
      case 'catalog/snapshot':
        result = await getCatalogSnapshot(supabase, user.id, params);
        break;
      case 'catalog/refresh':
        result = await refreshCatalogSnapshot(supabase, user.id, body);
        break;

      // Dashboard / Overview
      case 'overview':
        result = await getOverview(supabase, user.id, params);
        break;

      // Product detail
      case 'product':
        result = await getProductDetail(supabase, user.id, params);
        break;

      // Alerts
      case 'alerts':
        result = await getAlerts(supabase, user.id, params);
        break;
      case 'alerts/dismiss':
        result = await dismissAlert(supabase, user.id, body);
        break;
      case 'alerts/generate':
        EdgeRuntime.waitUntil(generateAlerts(supabase, user.id, body.seller_id));
        result = { status: 'processing', message: 'Gerando alertas...' };
        break;

      default:
        return new Response(JSON.stringify({ error: 'Unknown endpoint' }), {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error: unknown) {
    console.error('[competitor-engine] Error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

// ================== SETTINGS ==================

async function getSettings(supabase: any, userId: string, params: Record<string, string>) {
  const sellerId = params.seller_id;
  if (!sellerId) throw new Error('seller_id is required');

  const { data } = await supabase
    .from('competitor_settings')
    .select('*')
    .eq('seller_id', sellerId)
    .eq('user_id', userId)
    .maybeSingle();

  return data || {
    default_snapshot_ttl_hours: 12,
    max_requests_per_minute: 10,
    margin_floor_percent: 8,
    target_margin_percent: 15,
    auto_monitor_abc_a: true,
    auto_monitor_trending: true,
  };
}

async function updateSettings(supabase: any, userId: string, body: any) {
  const { seller_id, ...settings } = body;
  if (!seller_id) throw new Error('seller_id is required');

  await supabase.from('competitor_settings').upsert({
    user_id: userId,
    seller_id,
    ...settings,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'seller_id' });

  return { success: true };
}

// ================== LISTINGS ==================

async function getListings(supabase: any, userId: string, params: Record<string, string>) {
  const sellerId = params.seller_id;
  const search = params.search || '';
  const hasCatalog = params.has_catalog;
  const page = parseInt(params.page || '1');
  const pageSize = parseInt(params.page_size || '50');

  if (!sellerId) throw new Error('seller_id is required');

  let query = supabase
    .from('meli_listings_cache')
    .select('*', { count: 'exact' })
    .eq('seller_id', sellerId)
    .eq('user_id', userId)
    .order('sold_quantity', { ascending: false });

  if (search) {
    query = query.or(`title.ilike.%${search}%,sku.ilike.%${search}%,item_id.ilike.%${search}%`);
  }

  if (hasCatalog === 'true') {
    query = query.not('catalog_product_id', 'is', null);
  } else if (hasCatalog === 'false') {
    query = query.is('catalog_product_id', null);
  }

  const offset = (page - 1) * pageSize;
  query = query.range(offset, offset + pageSize - 1);

  const { data, count, error } = await query;
  if (error) throw error;

  return {
    listings: data || [],
    total: count || 0,
    page,
    page_size: pageSize,
    total_pages: Math.ceil((count || 0) / pageSize),
  };
}

async function syncListings(supabase: any, userId: string, sellerId: string) {
  console.log(`[competitor-engine] Syncing listings for seller ${sellerId}`);

  try {
    // Get ML account
    const { data: account } = await supabase
      .from('ml_accounts')
      .select('access_token, ml_user_id')
      .eq('ml_user_id', sellerId)
      .eq('user_id', userId)
      .eq('is_active', true)
      .maybeSingle();

    if (!account) {
      console.error('[competitor-engine] ML account not found');
      return;
    }

    // Fetch all items with pagination
    let offset = 0;
    const limit = 50;
    let hasMore = true;
    const allItems: any[] = [];

    while (hasMore) {
      const url = `https://api.mercadolibre.com/users/${sellerId}/items/search?offset=${offset}&limit=${limit}`;
      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${account.access_token}` },
      });

      if (!response.ok) {
        console.error('[competitor-engine] Failed to fetch items list:', response.status);
        break;
      }

      const data = await response.json();
      const itemIds = data.results || [];

      if (itemIds.length === 0) {
        hasMore = false;
        break;
      }

      // Fetch item details in batches of 20
      for (let i = 0; i < itemIds.length; i += 20) {
        const batch = itemIds.slice(i, i + 20);
        const idsParam = batch.join(',');
        const detailsUrl = `https://api.mercadolibre.com/items?ids=${idsParam}`;

        const detailsResponse = await fetch(detailsUrl, {
          headers: { Authorization: `Bearer ${account.access_token}` },
        });

        if (detailsResponse.ok) {
          const detailsData = await detailsResponse.json();
          for (const item of detailsData) {
            if (item.code === 200 && item.body) {
              allItems.push(item.body);
            }
          }
        }

        await sleep(200); // Rate limiting
      }

      offset += limit;
      hasMore = offset < (data.paging?.total || 0);
      await sleep(300);
    }

    console.log(`[competitor-engine] Fetched ${allItems.length} items`);

    // Process and upsert
    const listings = allItems.flatMap(item => {
      const baseData = {
        user_id: userId,
        seller_id: sellerId,
        item_id: item.id,
        title: item.title,
        title_short: item.title?.substring(0, 50),
        permalink: item.permalink,
        thumbnail: item.thumbnail,
        catalog_product_id: item.catalog_product_id || null,
        category_id: item.category_id,
        currency_id: item.currency_id,
        condition: item.condition,
        listing_type_id: item.listing_type_id,
        logistic_type: item.shipping?.logistic_type || null,
        status: item.status,
        health: item.health || null,
        last_sync_at: new Date().toISOString(),
      };

      // Handle variations
      if (item.variations && item.variations.length > 0) {
        return item.variations.map((v: any) => ({
          ...baseData,
          variation_id: v.id?.toString() || '',
          sku: v.seller_custom_field || item.seller_custom_field || null,
          price: v.price || item.price,
          original_price: v.original_price || item.original_price || null,
          available_quantity: v.available_quantity || 0,
          sold_quantity: v.sold_quantity || item.sold_quantity || 0,
        }));
      }

      return [{
        ...baseData,
        variation_id: '',
        sku: item.seller_custom_field || null,
        price: item.price,
        original_price: item.original_price || null,
        available_quantity: item.available_quantity || 0,
        sold_quantity: item.sold_quantity || 0,
      }];
    });

    // Batch upsert
    const BATCH_SIZE = 100;
    for (let i = 0; i < listings.length; i += BATCH_SIZE) {
      const batch = listings.slice(i, i + BATCH_SIZE);
      const { error } = await supabase
        .from('meli_listings_cache')
        .upsert(batch, { onConflict: 'seller_id,item_id,variation_id' });

      if (error) {
        console.error('[competitor-engine] Upsert error:', error);
      }
    }

    console.log(`[competitor-engine] Synced ${listings.length} listings`);

  } catch (error) {
    console.error('[competitor-engine] Sync listings error:', error);
  }
}

// ================== MARKET SEARCH ==================

async function searchMarket(supabase: any, userId: string, body: any) {
  const { seller_id, query_term, category_id, filters, force_refresh } = body;
  if (!seller_id) throw new Error('seller_id is required');
  if (!query_term && !category_id) throw new Error('query_term or category_id is required');

  // Generate snapshot key
  const snapshotKey = generateSnapshotKey(query_term, category_id, filters);

  // Check cache first
  if (!force_refresh) {
    const { data: cached } = await supabase
      .from('competitor_market_snapshots')
      .select('*')
      .eq('seller_id', seller_id)
      .eq('snapshot_key', snapshotKey)
      .gt('expires_at', new Date().toISOString())
      .maybeSingle();

    if (cached) {
      console.log('[competitor-engine] Returning cached market snapshot');
      return { ...cached, from_cache: true };
    }
  }

  // Get settings for TTL
  const settings = await getSettings(supabase, userId, { seller_id });
  const ttlHours = settings.default_snapshot_ttl_hours || 12;

  // Get ML account for API access
  const { data: account } = await supabase
    .from('ml_accounts')
    .select('access_token')
    .eq('ml_user_id', seller_id)
    .eq('user_id', userId)
    .eq('is_active', true)
    .maybeSingle();

  if (!account) throw new Error('ML account not found');

  // Build search URL
  let searchUrl = 'https://api.mercadolibre.com/sites/MLB/search?';
  const params = new URLSearchParams();
  
  if (query_term) params.set('q', query_term);
  if (category_id) params.set('category', category_id);
  params.set('limit', '50');

  // Apply filters
  if (filters) {
    if (filters.condition) params.set('ITEM_CONDITION', filters.condition);
    if (filters.shipping === 'full') params.set('shipping', 'fulfillment');
    if (filters.price_min) params.set('price', `${filters.price_min}-*`);
    if (filters.price_max) params.set('price', `*-${filters.price_max}`);
  }

  searchUrl += params.toString();
  console.log('[competitor-engine] Searching:', searchUrl);

  const response = await fetch(searchUrl, {
    headers: { Authorization: `Bearer ${account.access_token}` },
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('[competitor-engine] Search failed:', errorText);
    throw new Error('Failed to search market');
  }

  const data = await response.json();
  const results = data.results || [];
  const totalResults = data.paging?.total || results.length;

  // Calculate price distribution
  const prices = results.map((r: any) => r.price).filter((p: number) => p > 0).sort((a: number, b: number) => a - b);
  const priceStats = calculatePricePercentiles(prices);

  // Get top competitors (cheapest and most sold)
  const topCompetitors = results.slice(0, 10).map((r: any) => ({
    item_id: r.id,
    title: r.title,
    price: r.price,
    permalink: r.permalink,
    seller_id: r.seller?.id,
    seller_nickname: r.seller?.nickname,
    condition: r.condition,
    sold_quantity: r.sold_quantity || 0,
    shipping_free: r.shipping?.free_shipping || false,
    shipping_full: r.shipping?.logistic_type === 'fulfillment',
    thumbnail: r.thumbnail,
  }));

  // Save snapshot
  const snapshot = {
    user_id: userId,
    seller_id,
    snapshot_key: snapshotKey,
    query_term,
    category_id,
    filters_json: filters || null,
    collected_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + ttlHours * 60 * 60 * 1000).toISOString(),
    total_results: totalResults,
    ...priceStats,
    top_competitors_json: topCompetitors,
  };

  await supabase
    .from('competitor_market_snapshots')
    .upsert(snapshot, { onConflict: 'seller_id,snapshot_key' });

  return { ...snapshot, from_cache: false };
}

async function getMarketSnapshot(supabase: any, userId: string, params: Record<string, string>) {
  const sellerId = params.seller_id;
  const snapshotKey = params.snapshot_key;

  if (!sellerId || !snapshotKey) throw new Error('seller_id and snapshot_key are required');

  const { data } = await supabase
    .from('competitor_market_snapshots')
    .select('*')
    .eq('seller_id', sellerId)
    .eq('snapshot_key', snapshotKey)
    .maybeSingle();

  return data;
}

function generateSnapshotKey(queryTerm?: string, categoryId?: string, filters?: any): string {
  const parts = [queryTerm || '', categoryId || '', JSON.stringify(filters || {})];
  // Simple hash
  let hash = 0;
  const str = parts.join('|');
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return `mkt_${Math.abs(hash).toString(36)}`;
}

function calculatePricePercentiles(prices: number[]): any {
  if (prices.length === 0) {
    return { p10_price: null, p25_price: null, p50_price: null, p75_price: null, p90_price: null, avg_price: null, min_price: null, max_price: null };
  }

  const getPercentile = (arr: number[], p: number) => {
    const idx = Math.ceil((p / 100) * arr.length) - 1;
    return arr[Math.max(0, Math.min(idx, arr.length - 1))];
  };

  const sum = prices.reduce((a, b) => a + b, 0);

  return {
    p10_price: getPercentile(prices, 10),
    p25_price: getPercentile(prices, 25),
    p50_price: getPercentile(prices, 50),
    p75_price: getPercentile(prices, 75),
    p90_price: getPercentile(prices, 90),
    avg_price: sum / prices.length,
    min_price: prices[0],
    max_price: prices[prices.length - 1],
  };
}

// ================== CATALOG ==================

async function getCatalogSnapshot(supabase: any, userId: string, params: Record<string, string>) {
  const sellerId = params.seller_id;
  const catalogProductId = params.catalog_product_id;

  if (!sellerId || !catalogProductId) throw new Error('seller_id and catalog_product_id are required');

  const { data } = await supabase
    .from('competitor_catalog_snapshots')
    .select('*')
    .eq('seller_id', sellerId)
    .eq('catalog_product_id', catalogProductId)
    .maybeSingle();

  return data;
}

async function refreshCatalogSnapshot(supabase: any, userId: string, body: any) {
  const { seller_id, catalog_product_id, your_item_id, your_price } = body;
  if (!seller_id || !catalog_product_id) throw new Error('seller_id and catalog_product_id are required');

  // Get settings
  const settings = await getSettings(supabase, userId, { seller_id });
  const ttlHours = settings.default_snapshot_ttl_hours || 12;

  // Get ML account
  const { data: account } = await supabase
    .from('ml_accounts')
    .select('access_token')
    .eq('ml_user_id', seller_id)
    .eq('user_id', userId)
    .eq('is_active', true)
    .maybeSingle();

  if (!account) throw new Error('ML account not found');

  // Fetch catalog product info
  const catalogUrl = `https://api.mercadolibre.com/products/${catalog_product_id}`;
  const catalogResponse = await fetch(catalogUrl, {
    headers: { Authorization: `Bearer ${account.access_token}` },
  });

  if (!catalogResponse.ok) {
    throw new Error('Failed to fetch catalog product');
  }

  const catalogData = await catalogResponse.json();

  // Get offers for this catalog product
  const searchUrl = `https://api.mercadolibre.com/sites/MLB/search?catalog_product_id=${catalog_product_id}&limit=50`;
  const searchResponse = await fetch(searchUrl, {
    headers: { Authorization: `Bearer ${account.access_token}` },
  });

  // If search fails, return empty offers instead of throwing
  let offers: any[] = [];
  let totalOffers = 0;
  
  if (searchResponse.ok) {
    const searchData = await searchResponse.json();
    offers = searchData.results || [];
    totalOffers = searchData.paging?.total || offers.length;
  } else {
    // Log the error but continue with empty offers
    const errorText = await searchResponse.text();
    console.error(`[competitor-engine] Catalog search failed (${searchResponse.status}): ${errorText.slice(0, 200)}`);
    // For some catalog products, search may not return offers - that's OK
  }

  // Calculate stats
  const prices = offers.map((o: any) => o.price).filter((p: number) => p > 0).sort((a: number, b: number) => a - b);
  
  let yourPosition = null;
  if (your_price) {
    yourPosition = prices.filter((p: number) => p < your_price).length + 1;
  }

  const competitorOffers = offers.slice(0, 10).map((o: any) => ({
    item_id: o.id,
    title: o.title,
    price: o.price,
    permalink: o.permalink,
    seller_id: o.seller?.id,
    seller_nickname: o.seller?.nickname,
    condition: o.condition,
    sold_quantity: o.sold_quantity || 0,
    shipping_free: o.shipping?.free_shipping || false,
    shipping_full: o.shipping?.logistic_type === 'fulfillment',
  }));

  const snapshot = {
    user_id: userId,
    seller_id,
    catalog_product_id,
    collected_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + ttlHours * 60 * 60 * 1000).toISOString(),
    your_item_id,
    your_price,
    total_offers: totalOffers,
    market_price_min: prices[0] || null,
    market_price_median: prices.length > 0 ? prices[Math.floor(prices.length / 2)] : null,
    market_price_max: prices[prices.length - 1] || null,
    market_price_avg: prices.length > 0 ? prices.reduce((a: number, b: number) => a + b, 0) / prices.length : null,
    your_position: yourPosition,
    competitor_offers_json: competitorOffers,
  };

  await supabase
    .from('competitor_catalog_snapshots')
    .upsert(snapshot, { onConflict: 'seller_id,catalog_product_id' });

  return snapshot;
}

// ================== OVERVIEW ==================

async function getOverview(supabase: any, userId: string, params: Record<string, string>) {
  const sellerId = params.seller_id;
  if (!sellerId) throw new Error('seller_id is required');

  // Get listings count
  const { count: listingsCount } = await supabase
    .from('meli_listings_cache')
    .select('*', { count: 'exact', head: true })
    .eq('seller_id', sellerId);

  const { count: catalogCount } = await supabase
    .from('meli_listings_cache')
    .select('*', { count: 'exact', head: true })
    .eq('seller_id', sellerId)
    .not('catalog_product_id', 'is', null);

  // Get alerts count
  const { count: alertsCount } = await supabase
    .from('competitor_alerts')
    .select('*', { count: 'exact', head: true })
    .eq('seller_id', sellerId)
    .eq('is_dismissed', false);

  // Get recent alerts
  const { data: recentAlerts } = await supabase
    .from('competitor_alerts')
    .select('*')
    .eq('seller_id', sellerId)
    .eq('is_dismissed', false)
    .order('created_at', { ascending: false })
    .limit(5);

  // Get settings
  const settings = await getSettings(supabase, userId, { seller_id: sellerId });

  // Get products with cost for margin analysis
  const { data: productsWithCost } = await supabase
    .from('product_cost_catalog')
    .select('product_key, cost_value')
    .eq('seller_id', sellerId)
    .gt('cost_value', 0);

  // Get market snapshots count
  const { count: snapshotsCount } = await supabase
    .from('competitor_market_snapshots')
    .select('*', { count: 'exact', head: true })
    .eq('seller_id', sellerId);

  // Get last sync
  const { data: lastSync } = await supabase
    .from('meli_listings_cache')
    .select('last_sync_at')
    .eq('seller_id', sellerId)
    .order('last_sync_at', { ascending: false })
    .limit(1);

  return {
    listings_count: listingsCount || 0,
    catalog_count: catalogCount || 0,
    alerts_count: alertsCount || 0,
    snapshots_count: snapshotsCount || 0,
    products_with_cost: productsWithCost?.length || 0,
    recent_alerts: recentAlerts || [],
    settings,
    last_sync_at: lastSync?.[0]?.last_sync_at || null,
  };
}

// ================== PRODUCT DETAIL ==================

async function getProductDetail(supabase: any, userId: string, params: Record<string, string>) {
  const sellerId = params.seller_id;
  const itemId = params.item_id;
  const variationId = params.variation_id || '';

  if (!sellerId || !itemId) throw new Error('seller_id and item_id are required');

  // Get listing
  const { data: listing } = await supabase
    .from('meli_listings_cache')
    .select('*')
    .eq('seller_id', sellerId)
    .eq('item_id', itemId)
    .eq('variation_id', variationId)
    .maybeSingle();

  if (!listing) throw new Error('Listing not found');

  // Get cost if available
  const productKey = listing.sku || `${listing.item_id}:${listing.variation_id}`;
  const { data: costData } = await supabase
    .from('product_cost_catalog')
    .select('cost_value')
    .eq('seller_id', sellerId)
    .eq('product_key', productKey)
    .maybeSingle();

  // Get catalog snapshot if applicable
  let catalogSnapshot = null;
  if (listing.catalog_product_id) {
    const { data: snapshot } = await supabase
      .from('competitor_catalog_snapshots')
      .select('*')
      .eq('seller_id', sellerId)
      .eq('catalog_product_id', listing.catalog_product_id)
      .maybeSingle();
    catalogSnapshot = snapshot;
  }

  // Get ABC classification
  const { data: abcData } = await supabase
    .from('abc_profit_cache')
    .select('class, metric, value_total, rank')
    .eq('seller_id', sellerId)
    .eq('product_key', productKey)
    .order('metric');

  // Get settings for margin calculation
  const settings = await getSettings(supabase, userId, { seller_id: sellerId });

  // Calculate margin info
  const cost = costData?.cost_value || 0;
  const price = listing.price || 0;
  const hasCost = cost > 0;

  let marginInfo = null;
  if (hasCost && price > 0) {
    // Estimate ML fee at 16% (simplified)
    const estimatedFee = price * 0.16;
    const estimatedProfit = price - cost - estimatedFee;
    const marginPercent = (estimatedProfit / price) * 100;
    
    // Calculate minimum price for target margin
    const targetMargin = settings.target_margin_percent || 15;
    const floorMargin = settings.margin_floor_percent || 8;
    
    // price = cost + fee + profit
    // profit = price * targetMargin%
    // fee = price * 16%
    // price = cost / (1 - 0.16 - targetMargin%)
    const minPriceForTarget = cost / (1 - 0.16 - (targetMargin / 100));
    const minPriceForFloor = cost / (1 - 0.16 - (floorMargin / 100));

    marginInfo = {
      cost,
      current_margin_percent: marginPercent,
      estimated_profit: estimatedProfit,
      min_price_target: minPriceForTarget,
      min_price_floor: minPriceForFloor,
      target_margin_percent: targetMargin,
      floor_margin_percent: floorMargin,
      status: marginPercent >= targetMargin ? 'healthy' : marginPercent >= floorMargin ? 'attention' : 'risk',
    };
  }

  return {
    listing,
    cost: costData?.cost_value || null,
    has_cost: hasCost,
    catalog_snapshot: catalogSnapshot,
    abc_classification: abcData || [],
    margin_info: marginInfo,
  };
}

// ================== ALERTS ==================

async function getAlerts(supabase: any, userId: string, params: Record<string, string>) {
  const sellerId = params.seller_id;
  const includeDismissed = params.include_dismissed === 'true';
  const page = parseInt(params.page || '1');
  const pageSize = parseInt(params.page_size || '50');

  if (!sellerId) throw new Error('seller_id is required');

  let query = supabase
    .from('competitor_alerts')
    .select('*', { count: 'exact' })
    .eq('seller_id', sellerId)
    .order('created_at', { ascending: false });

  if (!includeDismissed) {
    query = query.eq('is_dismissed', false);
  }

  const offset = (page - 1) * pageSize;
  query = query.range(offset, offset + pageSize - 1);

  const { data, count, error } = await query;
  if (error) throw error;

  return {
    alerts: data || [],
    total: count || 0,
    page,
    page_size: pageSize,
    total_pages: Math.ceil((count || 0) / pageSize),
  };
}

async function dismissAlert(supabase: any, userId: string, body: any) {
  const { alert_id, resolve } = body;
  if (!alert_id) throw new Error('alert_id is required');

  const updateData: any = { is_dismissed: true };
  if (resolve) {
    updateData.resolved_at = new Date().toISOString();
  }

  await supabase
    .from('competitor_alerts')
    .update(updateData)
    .eq('id', alert_id)
    .eq('user_id', userId);

  return { success: true };
}

async function generateAlerts(supabase: any, userId: string, sellerId: string) {
  console.log(`[competitor-engine] Generating alerts for seller ${sellerId}`);

  try {
    // Get settings
    const settings = await getSettings(supabase, userId, { seller_id: sellerId });
    const floorMargin = settings.margin_floor_percent || 8;

    // Get products with costs and listings
    const { data: listings } = await supabase
      .from('meli_listings_cache')
      .select('item_id, variation_id, sku, title, price, catalog_product_id')
      .eq('seller_id', sellerId);

    const { data: costs } = await supabase
      .from('product_cost_catalog')
      .select('product_key, cost_value')
      .eq('seller_id', sellerId);

    const costMap = new Map((costs || []).map((c: any) => [c.product_key, c.cost_value]));

    const alerts: any[] = [];

    for (const listing of listings || []) {
      const productKey = listing.sku || `${listing.item_id}:${listing.variation_id || ''}`;
      const cost = Number(costMap.get(productKey)) || 0;
      const price = Number(listing.price) || 0;

      if (cost > 0 && price > 0) {
        const estimatedFee = price * 0.16;
        const profit = price - cost - estimatedFee;
        const margin = (profit / price) * 100;

        if (margin < 0) {
          alerts.push({
            user_id: userId,
            seller_id: sellerId,
            product_key: productKey,
            item_id: listing.item_id,
            catalog_product_id: listing.catalog_product_id,
            alert_type: 'negative_margin_risk',
            severity: 'danger',
            title: 'Margem Negativa',
            message_pt: `O produto "${listing.title?.substring(0, 50)}" está com margem negativa de ${margin.toFixed(1)}%. Considere aumentar o preço ou reduzir custos.`,
            data_json: { margin, price, cost, profit },
          });
        } else if (margin < floorMargin) {
          alerts.push({
            user_id: userId,
            seller_id: sellerId,
            product_key: productKey,
            item_id: listing.item_id,
            catalog_product_id: listing.catalog_product_id,
            alert_type: 'underpriced',
            severity: 'warning',
            title: 'Margem Baixa',
            message_pt: `O produto "${listing.title?.substring(0, 50)}" está com margem de ${margin.toFixed(1)}%, abaixo do mínimo de ${floorMargin}%.`,
            data_json: { margin, price, cost, profit, floor: floorMargin },
          });
        }
      }
    }

    // Upsert alerts (avoid duplicates by checking recent)
    for (const alert of alerts) {
      const { data: existing } = await supabase
        .from('competitor_alerts')
        .select('id')
        .eq('seller_id', sellerId)
        .eq('item_id', alert.item_id)
        .eq('alert_type', alert.alert_type)
        .eq('is_dismissed', false)
        .maybeSingle();

      if (!existing) {
        await supabase.from('competitor_alerts').insert(alert);
      }
    }

    console.log(`[competitor-engine] Generated ${alerts.length} new alerts`);

  } catch (error) {
    console.error('[competitor-engine] Generate alerts error:', error);
  }
}
