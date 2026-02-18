import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const ML_API_BASE = 'https://api.mercadolibre.com';
const ML_APP_ID = Deno.env.get('ML_APP_ID')!;
const ML_SECRET_KEY = Deno.env.get('ML_SECRET_KEY')!;
const DELAY_MS = 200;
const MULTIGET_BATCH = 20;

function delay(ms: number) {
  return new Promise(r => setTimeout(r, ms));
}

// Refresh ML access token
async function refreshMLToken(refreshToken: string): Promise<{ access_token?: string; refresh_token?: string; expires_in?: number } | null> {
  try {
    const res = await fetch('https://api.mercadolibre.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: ML_APP_ID,
        client_secret: ML_SECRET_KEY,
        refresh_token: refreshToken,
      }),
    });
    if (!res.ok) {
      console.error('Token refresh failed:', await res.text());
      return null;
    }
    return await res.json();
  } catch (e) {
    console.error('Token refresh error:', e);
    return null;
  }
}

// Get fresh ML access token, refreshing if needed
async function getFreshAccessToken(supabaseAdmin: any, userId: string, sellerId: string): Promise<string | undefined> {
  const { data: mlAccount } = await supabaseAdmin
    .from('ml_accounts')
    .select('id, access_token, refresh_token, token_expires_at')
    .eq('user_id', userId)
    .eq('ml_user_id', sellerId)
    .eq('is_active', true)
    .single();

  if (!mlAccount) return undefined;

  const tokenExpires = mlAccount.token_expires_at ? new Date(mlAccount.token_expires_at) : null;
  
  // Always refresh to ensure fresh token (ML tokens can be invalidated server-side)
  console.log(`Refreshing ML token for seller ${sellerId}...`);
  const refreshed = await refreshMLToken(mlAccount.refresh_token);
  if (refreshed?.access_token) {
    await supabaseAdmin
      .from('ml_accounts')
      .update({
        access_token: refreshed.access_token,
        refresh_token: refreshed.refresh_token || mlAccount.refresh_token,
        token_expires_at: new Date(Date.now() + (refreshed.expires_in || 21600) * 1000).toISOString(),
      })
      .eq('id', mlAccount.id);
    console.log(`Token refreshed successfully for seller ${sellerId}`);
    return refreshed.access_token;
  }

  console.error(`Failed to refresh token for seller ${sellerId}`);
  return mlAccount.access_token; // try with old token as last resort
}

async function fetchML(path: string, accessToken?: string, timeoutMs = 8000) {
  const controller = new AbortController();
  const tid = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const headers: Record<string, string> = {};
    if (accessToken) headers['Authorization'] = `Bearer ${accessToken}`;
    const res = await fetch(`${ML_API_BASE}${path}`, { signal: controller.signal, headers });
    if (!res.ok) throw new Error(`ML API ${res.status}: ${path}`);
    return await res.json();
  } finally {
    clearTimeout(tid);
  }
}

// Fetch ML API trying with auth first, then without (resilient for competitor data)
async function fetchMLResilient(path: string, accessToken?: string, timeoutMs = 8000) {
  // Try with auth token first (avoids IP-based rate limiting)
  if (accessToken) {
    try {
      return await fetchML(path, accessToken, timeoutMs);
    } catch (e) {
      console.log(`Auth request failed for ${path}, trying without auth...`);
    }
  }
  // Fallback: try without auth
  const controller = new AbortController();
  const tid = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${ML_API_BASE}${path}`, { signal: controller.signal });
    if (!res.ok) throw new Error(`ML API ${res.status}: ${path}`);
    return await res.json();
  } finally {
    clearTimeout(tid);
  }
}

// Extract MLB item ID from a listing URL or raw text
function extractItemIdFromInput(input: string): string | null {
  // Priority-ordered patterns — all capture the full "MLB..." prefix in group 1
  const patterns = [
    /item_id[=:]?(MLB\d{8,})/i,           // item_id param (most specific, e.g. item_id:MLB1347574279)
    /pdp_filters=item_id[=:]?(MLB\d{8,})/i, // pdp_filters URL variant
    /\/p\/(MLB\d+)/i,                       // product page: /p/MLB123
    /\/(MLB[-]?\d{8,})/i,                   // MLB in URL path
    /(MLB[-]?\d{8,})/i,                     // MLB anywhere in text
  ];
  for (const p of patterns) {
    const m = input.match(p);
    if (m && m[1]) {
      return m[1].replace(/-/g, '').toUpperCase();
    }
  }
  // Bare MLB ID
  if (/^MLB\d{8,}$/i.test(input.trim())) {
    return input.trim().replace(/-/g, '').toUpperCase();
  }
  // MLBU fallback — catalog product ID
  const mlbuMatch = input.match(/(MLBU\d+)/i);
  if (mlbuMatch) {
    return mlbuMatch[1].toUpperCase();
  }
  return null;
}

// Resolve seller from MLBU catalog product ID
async function resolveFromMLBU(mlbuId: string, accessToken?: string, originalInput?: string): Promise<{ ml_seller_id: string; ml_nickname: string; reputation: any }> {
  console.log(`MLBU detected: ${mlbuId}, searching catalog...`);
  // Try catalog search first
  try {
    const searchRes = await fetchMLResilient(`/sites/MLB/search?catalog_product_id=${mlbuId}&limit=1`, accessToken);
    if (searchRes?.results?.[0]?.seller?.id) {
      const sellerId = searchRes.results[0].seller.id;
      const userData = await fetchMLResilient(`/users/${sellerId}`, accessToken);
      return {
        ml_seller_id: String(userData.id),
        ml_nickname: userData.nickname || `Seller ${userData.id}`,
        reputation: userData.seller_reputation || null,
      };
    }
  } catch (e) {
    console.log(`Catalog search failed for ${mlbuId}: ${e}`);
  }
  // Try products endpoint to get item IDs
  try {
    const productData = await fetchMLResilient(`/products/${mlbuId}`, accessToken);
    if (productData?.buy_box_winner?.item_id) {
      const winnerItemId = productData.buy_box_winner.item_id;
      const itemData = await fetchMLResilient(`/items/${winnerItemId}`, accessToken);
      if (itemData?.seller_id) {
        const userData = await fetchMLResilient(`/users/${itemData.seller_id}`, accessToken);
        return {
          ml_seller_id: String(userData.id),
          ml_nickname: userData.nickname || `Seller ${userData.id}`,
          reputation: userData.seller_reputation || null,
        };
      }
    }
  } catch (e) {
    console.log(`Products endpoint failed for ${mlbuId}: ${e}`);
  }
  // Last resort: extract product title from URL slug and search
  const urlToSearch = originalInput || '';
  const slugMatch = urlToSearch.match(/mercadolivre\.com\.br\/([^\/]+)\/(?:up|p)\//i);
  if (slugMatch) {
    try {
      const titleQuery = slugMatch[1].replace(/-/g, ' ').substring(0, 60);
      console.log(`Last resort: searching by title slug "${titleQuery}"...`);
      const searchRes = await fetchMLResilient(`/sites/MLB/search?q=${encodeURIComponent(titleQuery)}&limit=1`, accessToken);
      if (searchRes?.results?.[0]?.seller?.id) {
        const sellerId = searchRes.results[0].seller.id;
        const userData = await fetchMLResilient(`/users/${sellerId}`, accessToken);
        return {
          ml_seller_id: String(userData.id),
          ml_nickname: userData.nickname || `Seller ${userData.id}`,
          reputation: userData.seller_reputation || null,
        };
      }
    } catch (e) {
      console.log(`Title search fallback failed: ${e}`);
    }
  }
  throw new Error(`Não foi possível encontrar vendedores para o produto catálogo ${mlbuId}. Tente colar o link de um anúncio específico.`);
}

// Resolve seller: accepts seller_id number, listing URL (MLB), or profile URL
async function resolveSellerFromInput(input: string, accessToken?: string): Promise<{ ml_seller_id: string; ml_nickname: string; reputation: any }> {
  const trimmed = input.trim();

  // 1. Direct numeric seller ID
  if (/^\d+$/.test(trimmed)) {
    const data = await fetchMLResilient(`/users/${trimmed}`, accessToken);
    return {
      ml_seller_id: String(data.id),
      ml_nickname: data.nickname || `Seller ${data.id}`,
      reputation: data.seller_reputation || null,
    };
  }

  // 2. Try extracting MLB item ID from URL or text → resolve seller from item
  const itemId = extractItemIdFromInput(trimmed);
  if (itemId) {
    console.log(`Resolving seller from item: ${itemId}`);
    
    // If MLBU (catalog product), search for a listing in that catalog to get seller
    if (/^MLBU/i.test(itemId)) {
      return await resolveFromMLBU(itemId, accessToken, trimmed);
    }
    
    // Regular MLB item — try with auth (resilient)
    try {
      const itemData = await fetchMLResilient(`/items/${itemId}`, accessToken);
      if (itemData?.seller_id) {
        const userData = await fetchMLResilient(`/users/${itemData.seller_id}`, accessToken);
        return {
          ml_seller_id: String(userData.id),
          ml_nickname: userData.nickname || `Seller ${userData.id}`,
          reputation: userData.seller_reputation || null,
        };
      }
    } catch (mlbError) {
      console.log(`MLB item ${itemId} failed (${mlbError}), trying MLBU fallback from URL...`);
      // If MLB item fails (403/404), try to find MLBU in the original input as fallback
      const mlbuMatch = trimmed.match(/(MLBU\d+)/i);
      if (mlbuMatch) {
        const mlbuId = mlbuMatch[1].toUpperCase();
        console.log(`Falling back to MLBU: ${mlbuId}`);
        return await resolveFromMLBU(mlbuId, accessToken, trimmed);
      }
      throw mlbError;
    }
    throw new Error(`Não foi possível identificar o vendedor do anúncio ${itemId}`);
  }

  // 3. Profile URL: extract nickname → search items by that seller to find seller_id
  const nicknameMatch = trimmed.match(/perfil\/([^\/\?]+)/i);
  if (nicknameMatch) {
    const nickname = decodeURIComponent(nicknameMatch[1]);
    // Use items search with seller nickname in query to find their items
    const searchRes = await fetchML(`/sites/MLB/search?q=${encodeURIComponent(nickname)}&limit=1`, accessToken);
    if (searchRes?.results?.[0]?.seller?.id) {
      const sellerId = searchRes.results[0].seller.id;
      const userData = await fetchML(`/users/${sellerId}`, accessToken);
      if (userData.nickname?.toLowerCase() === nickname.toLowerCase()) {
        return {
          ml_seller_id: String(userData.id),
          ml_nickname: userData.nickname,
          reputation: userData.seller_reputation || null,
        };
      }
    }
    throw new Error(`Seller não encontrado para perfil: ${nickname}. Tente colar o link de um anúncio deste vendedor.`);
  }

  // 4. Try as direct text (could be a nickname) — search items by query
  try {
    const searchRes = await fetchML(`/sites/MLB/search?q=${encodeURIComponent(trimmed)}&limit=5`, accessToken);
    if (searchRes?.results?.length > 0) {
      // Check if any result's seller nickname matches input
      for (const result of searchRes.results) {
        if (result.seller?.id) {
          const userData = await fetchML(`/users/${result.seller.id}`, accessToken);
          if (userData.nickname?.toLowerCase() === trimmed.toLowerCase()) {
            return {
              ml_seller_id: String(userData.id),
              ml_nickname: userData.nickname,
              reputation: userData.seller_reputation || null,
            };
          }
        }
      }
    }
  } catch (e) {
    console.error('Nickname search fallback error:', e);
  }

  throw new Error(`Não foi possível resolver o seller. Cole o link de um anúncio do vendedor que deseja monitorar.`);
}

// Fetch all active listings for a seller (up to 1000)
async function fetchSellerListings(mlSellerId: string, accessToken?: string): Promise<any[]> {
  const items: any[] = [];
  let offset = 0;
  const limit = 50;

  while (offset < 1000) {
    await delay(DELAY_MS);
    const data = await fetchML(`/sites/MLB/search?seller_id=${mlSellerId}&offset=${offset}&limit=${limit}`, accessToken);
    if (!data.results || data.results.length === 0) break;
    items.push(...data.results);
    offset += limit;
    if (offset >= (data.paging?.total || 0)) break;
  }
  return items;
}

// Enrich items with multiget for sold_quantity details
async function enrichItemsBatch(itemIds: string[], accessToken?: string): Promise<Map<string, any>> {
  const map = new Map<string, any>();
  for (let i = 0; i < itemIds.length; i += MULTIGET_BATCH) {
    const batch = itemIds.slice(i, i + MULTIGET_BATCH);
    await delay(DELAY_MS);
    try {
      const data = await fetchML(`/items?ids=${batch.join(',')}&attributes=id,price,original_price,sold_quantity,available_quantity,status,thumbnail,title,category_id,listing_type_id,condition,permalink,shipping`, accessToken);
      if (Array.isArray(data)) {
        for (const item of data) {
          if (item.code === 200 && item.body) {
            map.set(item.body.id, item.body);
          }
        }
      }
    } catch (e) {
      console.error('Multiget batch error:', e);
    }
  }
  return map;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabaseAdmin = createClient(supabaseUrl, serviceKey);

    // Get user auth
    const authHeader = req.headers.get('Authorization') || '';
    const token = authHeader.replace('Bearer ', '');
    
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
    
    const body = req.method === 'POST' ? await req.json() : {};
    const url = new URL(req.url);
    const action = body.action || url.searchParams.get('action') || 'list';

    // For cron sync, no user auth needed
    if (action === 'cron_sync') {
      return await handleCronSync(supabaseAdmin);
    }

    if (!user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Get fresh ML access token (with auto-refresh)
    let accessToken: string | undefined;
    if (body.seller_id) {
      accessToken = await getFreshAccessToken(supabaseAdmin, user.id, body.seller_id);
    }

    switch (action) {
      case 'add':
        return await handleAdd(supabaseAdmin, user.id, body, accessToken);
      case 'sync':
        return await handleSync(supabaseAdmin, user.id, body, accessToken);
      case 'list':
        return await handleList(supabaseAdmin, user.id, body);
      case 'detail':
        return await handleDetail(supabaseAdmin, user.id, body);
      case 'update_alias':
        return await handleUpdateAlias(supabaseAdmin, user.id, body);
      case 'delete':
        return await handleDelete(supabaseAdmin, user.id, body);
      case 'preview':
        return await handlePreview(supabaseAdmin, body, accessToken);
      default:
        return new Response(JSON.stringify({ error: 'Unknown action' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
  } catch (e) {
    console.error('competitor-seller-sync error:', e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : 'Internal error' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});

async function handlePreview(_admin: any, body: any, accessToken?: string) {
  const { input } = body;
  if (!input) throw new Error('input is required');
  
  const resolved = await resolveSellerFromInput(input, accessToken);
  
  // Quick search to get total items count
  const searchRes = await fetchML(`/sites/MLB/search?seller_id=${resolved.ml_seller_id}&limit=1`, accessToken);
  
  return new Response(JSON.stringify({
    ml_seller_id: resolved.ml_seller_id,
    ml_nickname: resolved.ml_nickname,
    reputation: resolved.reputation,
    total_items: searchRes?.paging?.total || 0,
  }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

async function handleAdd(admin: any, userId: string, body: any, accessToken?: string) {
  const { seller_id, input, user_alias } = body;
  if (!seller_id || !input) throw new Error('seller_id and input are required');

  const resolved = await resolveSellerFromInput(input, accessToken);

  // Check if already tracking
  const { data: existing } = await admin
    .from('competitor_sellers')
    .select('id')
    .eq('user_id', userId)
    .eq('seller_id', seller_id)
    .eq('ml_seller_id', resolved.ml_seller_id)
    .single();

  if (existing) {
    return new Response(JSON.stringify({ error: 'Seller já está sendo monitorado', existing_id: existing.id }), { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }

  // Fetch seller listings
  const listings = await fetchSellerListings(resolved.ml_seller_id, accessToken);
  const itemIds = listings.map((l: any) => l.id);
  const enriched = await enrichItemsBatch(itemIds, accessToken);

  // Insert seller
  const { data: seller, error: sellerError } = await admin
    .from('competitor_sellers')
    .insert({
      user_id: userId,
      seller_id,
      ml_seller_id: resolved.ml_seller_id,
      ml_nickname: resolved.ml_nickname,
      user_alias: user_alias || null,
      seller_reputation: resolved.reputation,
      total_items_tracked: listings.length,
      binding_date: new Date().toISOString(),
      last_synced_at: new Date().toISOString(),
      next_sync_at: new Date(Date.now() + 6 * 3600000).toISOString(),
    })
    .select()
    .single();

  if (sellerError) throw sellerError;

  // Insert items + initial snapshots
  const itemRows: any[] = [];
  const snapshotRows: any[] = [];

  for (const listing of listings) {
    const detail = enriched.get(listing.id) || listing;
    const row = {
      competitor_seller_id: seller.id,
      user_id: userId,
      item_id: listing.id,
      title: detail.title || listing.title,
      thumbnail: detail.thumbnail || listing.thumbnail,
      price: detail.price || listing.price,
      original_price: detail.original_price || null,
      currency_id: detail.currency_id || 'BRL',
      sold_quantity_ref: detail.sold_quantity || 0,
      available_qty_ref: detail.available_quantity || 0,
      category_id: detail.category_id || null,
      listing_type: detail.listing_type_id || null,
      condition: detail.condition || null,
      status: detail.status || 'active',
      permalink: detail.permalink || null,
      free_shipping: detail.shipping?.free_shipping || false,
      catalog_listing: detail.catalog_listing || false,
      last_synced_at: new Date().toISOString(),
    };
    itemRows.push(row);

    snapshotRows.push({
      item_id: listing.id,
      competitor_seller_id: seller.id,
      user_id: userId,
      price: detail.price || null,
      sold_quantity_ref: detail.sold_quantity || 0,
      available_qty_ref: detail.available_quantity || 0,
      status: detail.status || 'active',
    });
  }

  // Batch insert items
  if (itemRows.length > 0) {
    const { error: itemsError } = await admin.from('competitor_seller_items').insert(itemRows);
    if (itemsError) console.error('Items insert error:', itemsError);
  }

  // Batch insert snapshots
  if (snapshotRows.length > 0) {
    const { error: snapError } = await admin.from('competitor_seller_item_snapshots').insert(snapshotRows);
    if (snapError) console.error('Snapshots insert error:', snapError);
  }

  return new Response(JSON.stringify({ success: true, seller, items_count: itemRows.length }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

async function handleSync(admin: any, userId: string, body: any, accessToken?: string) {
  const { competitor_seller_id } = body;
  if (!competitor_seller_id) throw new Error('competitor_seller_id is required');

  const { data: seller } = await admin
    .from('competitor_sellers')
    .select('*')
    .eq('id', competitor_seller_id)
    .eq('user_id', userId)
    .single();

  if (!seller) throw new Error('Seller not found');

  return await syncSeller(admin, seller, accessToken);
}

async function syncSeller(admin: any, seller: any, accessToken?: string) {
  const listings = await fetchSellerListings(seller.ml_seller_id, accessToken);
  const itemIds = listings.map((l: any) => l.id);
  const enriched = await enrichItemsBatch(itemIds, accessToken);

  // Get existing items
  const { data: existingItems } = await admin
    .from('competitor_seller_items')
    .select('item_id, sold_quantity_ref')
    .eq('competitor_seller_id', seller.id);

  const existingMap = new Map((existingItems || []).map((i: any) => [i.item_id, i]));

  const upsertItems: any[] = [];
  const snapshotRows: any[] = [];

  for (const listing of listings) {
    const detail = enriched.get(listing.id) || listing;
    
    upsertItems.push({
      competitor_seller_id: seller.id,
      user_id: seller.user_id,
      item_id: listing.id,
      title: detail.title || listing.title,
      thumbnail: detail.thumbnail || listing.thumbnail,
      price: detail.price || listing.price,
      original_price: detail.original_price || null,
      currency_id: detail.currency_id || 'BRL',
      sold_quantity_ref: detail.sold_quantity || 0,
      available_qty_ref: detail.available_quantity || 0,
      category_id: detail.category_id || null,
      listing_type: detail.listing_type_id || null,
      condition: detail.condition || null,
      status: detail.status || 'active',
      permalink: detail.permalink || null,
      free_shipping: detail.shipping?.free_shipping || false,
      catalog_listing: detail.catalog_listing || false,
      last_synced_at: new Date().toISOString(),
    });

    snapshotRows.push({
      item_id: listing.id,
      competitor_seller_id: seller.id,
      user_id: seller.user_id,
      price: detail.price || null,
      sold_quantity_ref: detail.sold_quantity || 0,
      available_qty_ref: detail.available_quantity || 0,
      status: detail.status || 'active',
    });
  }

  // Upsert items
  if (upsertItems.length > 0) {
    await admin.from('competitor_seller_items').upsert(upsertItems, { onConflict: 'competitor_seller_id,item_id' });
  }

  // Insert snapshots
  if (snapshotRows.length > 0) {
    await admin.from('competitor_seller_item_snapshots').insert(snapshotRows);
  }

  // Mark items not in current listings as closed
  const activeItemIds = new Set(listings.map((l: any) => l.id));
  const closedIds = [...existingMap.keys()].filter(id => !activeItemIds.has(id));
  if (closedIds.length > 0) {
    await admin
      .from('competitor_seller_items')
      .update({ status: 'closed', last_synced_at: new Date().toISOString() })
      .eq('competitor_seller_id', seller.id)
      .in('item_id', closedIds);
  }

  // Update seller
  await admin
    .from('competitor_sellers')
    .update({
      total_items_tracked: listings.length,
      last_synced_at: new Date().toISOString(),
      next_sync_at: new Date(Date.now() + (seller.sync_interval_hours || 6) * 3600000).toISOString(),
    })
    .eq('id', seller.id);

  return new Response(JSON.stringify({ success: true, items_synced: listings.length }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

async function handleList(admin: any, userId: string, body: any) {
  const { seller_id, status } = body;
  
  let query = admin
    .from('competitor_sellers')
    .select('*')
    .eq('user_id', userId);

  if (seller_id) query = query.eq('seller_id', seller_id);
  if (status && status !== 'all') query = query.eq('status', status);

  query = query.order('created_at', { ascending: false });
  const { data, error } = await query;

  if (error) throw error;

  return new Response(JSON.stringify({ sellers: data || [] }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

async function handleDetail(admin: any, userId: string, body: any) {
  const { competitor_seller_id } = body;
  if (!competitor_seller_id) throw new Error('competitor_seller_id required');

  const { data: seller } = await admin
    .from('competitor_sellers')
    .select('*')
    .eq('id', competitor_seller_id)
    .eq('user_id', userId)
    .single();

  if (!seller) throw new Error('Not found');

  const { data: items } = await admin
    .from('competitor_seller_items')
    .select('*')
    .eq('competitor_seller_id', competitor_seller_id)
    .order('sold_quantity_ref', { ascending: false });

  // Get latest and first snapshots for delta calculation
  const { data: snapshots } = await admin
    .from('competitor_seller_item_snapshots')
    .select('item_id, sold_quantity_ref, price, captured_at')
    .eq('competitor_seller_id', competitor_seller_id)
    .order('captured_at', { ascending: true });

  // Calculate deltas per item
  const deltas: Record<string, { sales_delta: number; price_change: number; first_seen: string }> = {};
  if (snapshots) {
    const byItem: Record<string, any[]> = {};
    for (const s of snapshots) {
      if (!byItem[s.item_id]) byItem[s.item_id] = [];
      byItem[s.item_id].push(s);
    }
    for (const [itemId, snaps] of Object.entries(byItem)) {
      const first = snaps[0];
      const last = snaps[snaps.length - 1];
      deltas[itemId] = {
        sales_delta: Math.max(0, (last.sold_quantity_ref || 0) - (first.sold_quantity_ref || 0)),
        price_change: (last.price || 0) - (first.price || 0),
        first_seen: first.captured_at,
      };
    }
  }

  return new Response(JSON.stringify({ seller, items: items || [], deltas }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

async function handleUpdateAlias(admin: any, userId: string, body: any) {
  const { competitor_seller_id, user_alias } = body;
  if (!competitor_seller_id) throw new Error('competitor_seller_id required');

  const { error } = await admin
    .from('competitor_sellers')
    .update({ user_alias })
    .eq('id', competitor_seller_id)
    .eq('user_id', userId);

  if (error) throw error;
  return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

async function handleDelete(admin: any, userId: string, body: any) {
  const { competitor_seller_id } = body;
  if (!competitor_seller_id) throw new Error('competitor_seller_id required');

  const { error } = await admin
    .from('competitor_sellers')
    .delete()
    .eq('id', competitor_seller_id)
    .eq('user_id', userId);

  if (error) throw error;
  return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

async function handleCronSync(admin: any) {
  const now = new Date().toISOString();
  const { data: sellers } = await admin
    .from('competitor_sellers')
    .select('*')
    .eq('status', 'ativo')
    .lte('next_sync_at', now)
    .limit(10);

  if (!sellers || sellers.length === 0) {
    return new Response(JSON.stringify({ synced: 0 }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }

  let synced = 0;
  for (const seller of sellers) {
    try {
      // Get access token from ml_accounts
      const { data: mlAccount } = await admin
        .from('ml_accounts')
        .select('access_token')
        .eq('user_id', seller.user_id)
        .eq('ml_user_id', seller.seller_id)
        .eq('is_active', true)
        .single();

      await syncSeller(admin, seller, mlAccount?.access_token);
      synced++;
    } catch (e) {
      console.error(`Sync failed for seller ${seller.id}:`, e);
      await admin
        .from('competitor_sellers')
        .update({ next_sync_at: new Date(Date.now() + 3600000).toISOString() })
        .eq('id', seller.id);
    }
  }

  return new Response(JSON.stringify({ synced }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}
