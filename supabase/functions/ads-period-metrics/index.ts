import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const ML_APP_ID = Deno.env.get('ML_APP_ID')!;
const ML_SECRET_KEY = Deno.env.get('ML_SECRET_KEY')!;
const BATCH_SIZE = 10;
const BATCH_DELAY = 300;
const TODAY_CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour
const PAGE_SIZE = 1000;

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function getDateRange(dateFrom: string, dateTo: string): string[] {
  const dates: string[] = [];
  const start = new Date(dateFrom + 'T00:00:00Z');
  const end = new Date(dateTo + 'T00:00:00Z');
  for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
    dates.push(d.toISOString().slice(0, 10));
  }
  return dates;
}

function getTodayBRT(): string {
  const now = new Date();
  const brt = new Date(now.getTime() - 3 * 60 * 60 * 1000);
  return brt.toISOString().slice(0, 10);
}

/** Pagination helper - fetches ALL rows bypassing the 1000 row limit */
async function fetchAllRows<T = any>(queryFn: (from: number, to: number) => any): Promise<T[]> {
  const allData: T[] = [];
  let from = 0;
  let hasMore = true;
  while (hasMore) {
    const { data, error } = await queryFn(from, from + PAGE_SIZE - 1);
    if (error) {
      console.error('[fetchAllRows] Error:', error);
      throw error;
    }
    if (!data || data.length === 0) {
      hasMore = false;
    } else {
      allData.push(...(data as T[]));
      from += PAGE_SIZE;
      hasMore = data.length === PAGE_SIZE;
    }
  }
  return allData;
}

/** Fetch with retry for ML API rate limits (429) */
async function fetchWithRetry(url: string, options: RequestInit, maxRetries = 3): Promise<Response> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const response = await fetch(url, options);
    if (response.status === 429 && attempt < maxRetries) {
      const retryAfter = parseInt(response.headers.get('retry-after') || '2', 10);
      const waitMs = retryAfter * 1000 * (attempt + 1);
      console.warn(`[fetchWithRetry] 429 rate limit, waiting ${waitMs}ms (attempt ${attempt + 1}/${maxRetries})`);
      await response.text(); // consume body
      await sleep(waitMs);
      continue;
    }
    return response;
  }
  // Should never reach here, but fallback
  return fetch(url, options);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Auth
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

    // ML API Access Gate
    const { assertMlApiAccess } = await import("../_shared/ml-api-gate.ts");
    const gate = await assertMlApiAccess(supabase, user.id);
    if (!gate.allowed) return gate.response!;

    const body = await req.json().catch(() => ({}));
    const { seller_id, date_from, date_to } = body;

    if (!seller_id || !date_from || !date_to) {
      return new Response(JSON.stringify({ error: 'seller_id, date_from, date_to are required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const startTime = Date.now();
    const today = getTodayBRT();
    const allDates = getDateRange(date_from, date_to);

    console.log(`[ads-period-metrics] Cache-first for ${seller_id}: ${allDates.length} days (${date_from} to ${date_to})`);

    // 1. Fetch cached days from DB (paginated)
    const cachedRows = await fetchAllRows((from, to) =>
      supabase
        .from('ads_period_cache')
        .select('*')
        .eq('seller_id', seller_id)
        .gte('metric_date', date_from)
        .lte('metric_date', date_to)
        .range(from, to)
    );

    const cachedMap = new Map<string, any>();
    for (const row of cachedRows) {
      cachedMap.set(row.metric_date, row);
    }

    // 2. Identify missing dates + today (always refetch if stale)
    const missingDates: string[] = [];
    for (const date of allDates) {
      const cached = cachedMap.get(date);
      if (!cached) {
        missingDates.push(date);
      } else if (date === today) {
        const fetchedAge = Date.now() - new Date(cached.fetched_at).getTime();
        if (fetchedAge > TODAY_CACHE_TTL_MS) {
          missingDates.push(date);
        }
      }
    }

    console.log(`[ads-period-metrics] Cached: ${cachedMap.size}, Missing: ${missingDates.length} in ${Date.now() - startTime}ms`);

    // 3. Fetch missing dates from ML API (with retry on 429)
    if (missingDates.length > 0) {
      const { data: account } = await supabase
        .from('ml_accounts')
        .select('access_token, refresh_token, token_expires_at, country_id')
        .eq('ml_user_id', seller_id)
        .eq('user_id', user.id)
        .single();

      if (!account) {
        return new Response(JSON.stringify({ error: 'Account not found' }), {
          status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      let accessToken = account.access_token;
      if (new Date(account.token_expires_at) < new Date()) {
        accessToken = await refreshToken(supabase, seller_id, user.id, account.refresh_token);
        if (!accessToken) {
          return new Response(JSON.stringify({ error: 'Failed to refresh token' }), {
            status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
      }

      const siteId = account.country_id || 'MLB';
      const advertiserId = await getAdvertiserId(accessToken, seller_id);

      for (let i = 0; i < missingDates.length; i += 3) {
        const batch = missingDates.slice(i, i + 3);
        const batchResults = await Promise.all(
          batch.map(date => fetchDayMetrics(accessToken, siteId, advertiserId || seller_id, seller_id, date))
        );
        
        for (let j = 0; j < batch.length; j++) {
          const date = batch[j];
          const dayData = batchResults[j];
          const cacheRow = {
            seller_id,
            user_id: user.id,
            metric_date: date,
            total_spent: dayData.total_spent,
            total_revenue: dayData.total_revenue,
            total_clicks: dayData.total_clicks,
            total_impressions: dayData.total_impressions,
            total_conversions: dayData.total_conversions,
            items_data: dayData.items,
            campaigns_data: dayData.campaigns,
            fetched_at: new Date().toISOString(),
          };

          await supabase
            .from('ads_period_cache')
            .upsert(cacheRow, { onConflict: 'seller_id,metric_date' });

          cachedMap.set(date, cacheRow);
        }

        if (i + 3 < missingDates.length) await sleep(500);
      }
    }

    // 4. Fetch seller orders from meli_orders_cache (paginated, no limit)
    const [paidOrders, cancelledOrders] = await Promise.all([
      fetchAllRows((from, to) =>
        supabase
          .from('meli_orders_cache')
          .select('total_amount, created_at_meli')
          .eq('seller_id', seller_id)
          .eq('order_status', 'paid')
          .gte('created_at_meli', date_from + 'T00:00:00-03:00')
          .lte('created_at_meli', date_to + 'T23:59:59-03:00')
          .range(from, to)
      ),
      fetchAllRows((from, to) =>
        supabase
          .from('meli_orders_cache')
          .select('total_amount, created_at_meli')
          .eq('seller_id', seller_id)
          .in('order_status', ['cancelled', 'refunded', 'partially_refunded'])
          .gte('created_at_meli', date_from + 'T00:00:00-03:00')
          .lte('created_at_meli', date_to + 'T23:59:59-03:00')
          .range(from, to)
      ),
    ]);

    console.log(`[ads-period-metrics] Seller orders: ${paidOrders.length} paid, ${cancelledOrders.length} cancelled`);

    // Aggregate seller orders by day
    const sellerDailyMap = new Map<string, { revenue: number; orders: number }>();
    for (const o of paidOrders) {
      const d = new Date(o.created_at_meli);
      const brt = new Date(d.getTime() - 3 * 60 * 60 * 1000);
      const dateKey = brt.toISOString().slice(0, 10);
      const existing = sellerDailyMap.get(dateKey) || { revenue: 0, orders: 0 };
      existing.revenue += Number(o.total_amount) || 0;
      existing.orders += 1;
      sellerDailyMap.set(dateKey, existing);
    }

    const cancelledDailyMap = new Map<string, { revenue: number; orders: number }>();
    for (const o of cancelledOrders) {
      const d = new Date(o.created_at_meli);
      const brt = new Date(d.getTime() - 3 * 60 * 60 * 1000);
      const dateKey = brt.toISOString().slice(0, 10);
      const existing = cancelledDailyMap.get(dateKey) || { revenue: 0, orders: 0 };
      existing.revenue += Number(o.total_amount) || 0;
      existing.orders += 1;
      cancelledDailyMap.set(dateKey, existing);
    }

    // Total seller metrics
    let total_seller_revenue_paid = 0;
    let total_seller_orders = 0;
    let total_cancelled_revenue = 0;
    let total_cancelled_orders = 0;

    for (const v of sellerDailyMap.values()) {
      total_seller_revenue_paid += v.revenue;
      total_seller_orders += v.orders;
    }
    for (const v of cancelledDailyMap.values()) {
      total_cancelled_revenue += v.revenue;
      total_cancelled_orders += v.orders;
    }

    const total_seller_revenue = total_seller_revenue_paid - total_cancelled_revenue;

    console.log(`[ads-period-metrics] All data ready in ${Date.now() - startTime}ms`);

    // 5. Aggregate ADS + seller data
    const result = aggregateFromCache(
      Array.from(cachedMap.values()).filter(r => r.metric_date >= date_from && r.metric_date <= date_to),
      date_from,
      date_to,
      sellerDailyMap,
      cancelledDailyMap,
      { total_seller_revenue, total_seller_orders, total_cancelled_revenue, total_cancelled_orders }
    );

    console.log(`[ads-period-metrics] Done in ${Date.now() - startTime}ms: spent=${result.total_spent}, seller_revenue=${result.total_seller_revenue}`);

    return new Response(JSON.stringify(result), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error: unknown) {
    console.error('[ads-period-metrics] Error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

function aggregateFromCache(
  rows: any[],
  dateFrom: string,
  dateTo: string,
  sellerDailyMap: Map<string, { revenue: number; orders: number }>,
  cancelledDailyMap: Map<string, { revenue: number; orders: number }>,
  sellerTotals: { total_seller_revenue: number; total_seller_orders: number; total_cancelled_revenue: number; total_cancelled_orders: number }
) {
  let total_spent = 0, total_revenue = 0, total_clicks = 0, total_impressions = 0, total_conversions = 0;
  const allItems = new Map<string, any>();
  const allCampaigns = new Map<string, any>();

  for (const row of rows) {
    total_spent += Number(row.total_spent) || 0;
    total_revenue += Number(row.total_revenue) || 0;
    total_clicks += Number(row.total_clicks) || 0;
    total_impressions += Number(row.total_impressions) || 0;
    total_conversions += Number(row.total_conversions) || 0;

    const items = row.items_data || [];
    for (const item of items) {
      const key = item.item_id || item.id;
      if (!key) continue;
      const existing = allItems.get(key) || { item_id: key, title: item.title, status: item.status, spent: 0, revenue: 0, clicks: 0, impressions: 0, conversions: 0 };
      existing.spent += item.spent || 0;
      existing.revenue += item.revenue || 0;
      existing.clicks += item.clicks || 0;
      existing.impressions += item.impressions || 0;
      existing.conversions += item.conversions || 0;
      allItems.set(key, existing);
    }

    const campaigns = row.campaigns_data || [];
    for (const c of campaigns) {
      const key = c.ml_campaign_id || c.id;
      if (!key) continue;
      const existing = allCampaigns.get(key) || { ml_campaign_id: key, name: c.name, status: c.status, spent: 0, revenue: 0, clicks: 0, impressions: 0, conversions: 0 };
      existing.spent += c.spent || 0;
      existing.revenue += c.revenue || 0;
      existing.clicks += c.clicks || 0;
      existing.impressions += c.impressions || 0;
      existing.conversions += c.conversions || 0;
      allCampaigns.set(key, existing);
    }
  }

  const items = Array.from(allItems.values()).map(item => ({
    ...item,
    acos: item.revenue > 0 ? item.spent / item.revenue : null,
    roas: item.spent > 0 ? item.revenue / item.spent : null,
  }));

  const campaigns = Array.from(allCampaigns.values());

  let products_at_loss = 0, products_scalable = 0;
  for (const item of items) {
    if (item.acos !== null && item.acos > 0.30) products_at_loss++;
    if (item.roas !== null && item.roas > 3 && item.conversions > 0) products_scalable++;
  }

  // Seller metrics
  const { total_seller_revenue, total_seller_orders, total_cancelled_revenue, total_cancelled_orders } = sellerTotals;
  const organic_revenue = Math.max(0, total_seller_revenue - total_revenue);
  const organic_percent = total_seller_revenue > 0 ? (organic_revenue / total_seller_revenue) * 100 : 0;
  const paid_percent = total_seller_revenue > 0 ? (total_revenue / total_seller_revenue) * 100 : 0;
  const tacos_total = total_seller_revenue > 0 ? (total_spent / total_seller_revenue) * 100 : 0;
  const cost_per_sale_general = total_seller_orders > 0 ? total_spent / total_seller_orders : 0;
  const cost_per_sale_ads = total_conversions > 0 ? total_spent / total_conversions : 0;

  // Build daily time series with seller data
  const daily = rows.map(row => {
    const date = row.metric_date;
    const sellerDay = sellerDailyMap.get(date) || { revenue: 0, orders: 0 };
    const cancelledDay = cancelledDailyMap.get(date) || { revenue: 0, orders: 0 };
    const netSellerRevenue = sellerDay.revenue - cancelledDay.revenue;
    const dayAdsRevenue = Number(row.total_revenue) || 0;
    return {
      date,
      spent: Number(row.total_spent) || 0,
      revenue: dayAdsRevenue,
      clicks: Number(row.total_clicks) || 0,
      impressions: Number(row.total_impressions) || 0,
      conversions: Number(row.total_conversions) || 0,
      seller_revenue: netSellerRevenue,
      organic_revenue: Math.max(0, netSellerRevenue - dayAdsRevenue),
      seller_orders: sellerDay.orders,
    };
  }).sort((a, b) => a.date.localeCompare(b.date));

  return {
    total_spent, total_revenue, total_clicks, total_impressions, total_conversions,
    avg_acos: total_revenue > 0 ? (total_spent / total_revenue) * 100 : 0,
    avg_roas: total_spent > 0 ? total_revenue / total_spent : 0,
    avg_cpc: total_clicks > 0 ? total_spent / total_clicks : 0,
    avg_tacos: total_revenue > 0 ? (total_spent / total_revenue) * 100 : 0,
    products_at_loss, products_scalable,
    // New seller metrics
    total_seller_revenue,
    total_seller_orders,
    total_cancelled_revenue,
    total_cancelled_orders,
    organic_revenue,
    organic_percent,
    paid_percent,
    tacos_total,
    cost_per_sale_general,
    cost_per_sale_ads,
    campaigns, items, daily, date_from: dateFrom, date_to: dateTo,
  };
}

// Fetch metrics for a single day
async function fetchDayMetrics(accessToken: string, siteId: string, advertiserId: string, sellerId: string, date: string) {
  const [campaignsData, allItems] = await Promise.all([
    fetchCampaigns(accessToken, siteId, advertiserId, date, date),
    discoverItems(accessToken, sellerId),
  ]);

  const itemsWithMetrics = await fetchItemMetricsBatch(accessToken, allItems, date, date);

  let total_spent = 0, total_revenue = 0, total_clicks = 0, total_impressions = 0, total_conversions = 0;
  
  const items = itemsWithMetrics.map(item => {
    const m = item.metrics || {};
    const spent = m.cost || m.spent || 0;
    const revenue = m.total_amount || m.revenue || 0;
    const clicks = m.clicks || 0;
    const impressions = m.prints || m.impressions || 0;
    const conversions = m.conversions || 0;
    total_spent += spent;
    total_revenue += revenue;
    total_clicks += clicks;
    total_impressions += impressions;
    total_conversions += conversions;
    return { item_id: item.item_id || item.id, title: item.title, status: item.status, spent, revenue, clicks, impressions, conversions };
  });

  if (total_spent === 0 && campaignsData.length > 0) {
    for (const c of campaignsData) {
      const m = c.metrics || {};
      total_spent += m.cost || m.spent || 0;
      total_revenue += m.total_amount || m.revenue || 0;
      total_clicks += m.clicks || 0;
      total_impressions += m.prints || m.impressions || 0;
      total_conversions += m.conversions || 0;
    }
  }

  const campaigns = campaignsData.map(c => {
    const m = c.metrics || {};
    return {
      ml_campaign_id: String(c.id || c.campaign_id),
      name: c.name || `Campaign ${c.id || c.campaign_id}`,
      status: c.status,
      spent: m.cost || m.spent || 0,
      revenue: m.total_amount || m.revenue || 0,
      clicks: m.clicks || 0,
      impressions: m.prints || m.impressions || 0,
      conversions: m.conversions || 0,
    };
  });

  return { total_spent, total_revenue, total_clicks, total_impressions, total_conversions, items, campaigns };
}

async function getAdvertiserId(accessToken: string, sellerId: string): Promise<string | null> {
  try {
    const response = await fetchWithRetry(`https://api.mercadolibre.com/advertising/advertisers?product_id=PADS`, {
      headers: { 'Authorization': `Bearer ${accessToken}` },
    });
    if (!response.ok) { await response.text(); return sellerId; }
    const data = await response.json();
    const advertisers = data.advertisers || data || [];
    if (Array.isArray(advertisers) && advertisers.length > 0) {
      return String(advertisers[0].advertiser_id || advertisers[0].id || sellerId);
    }
    return sellerId;
  } catch { return sellerId; }
}

async function refreshToken(supabase: any, sellerId: string, userId: string, refreshTokenValue: string): Promise<string | null> {
  try {
    const response = await fetch('https://api.mercadolibre.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: ML_APP_ID,
        client_secret: ML_SECRET_KEY,
        refresh_token: refreshTokenValue,
      }),
    });
    if (!response.ok) return null;
    const data = await response.json();
    const expiresAt = new Date(Date.now() + data.expires_in * 1000).toISOString();
    await supabase.from('ml_accounts').update({
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      token_expires_at: expiresAt,
    }).eq('ml_user_id', sellerId).eq('user_id', userId);
    return data.access_token;
  } catch { return null; }
}

async function fetchCampaigns(accessToken: string, siteId: string, sellerId: string, dateFrom: string, dateTo: string) {
  const metrics = 'clicks,prints,cost,cpc,acos,roas,total_amount';
  const allCampaigns: any[] = [];
  let offset = 0;
  const limit = 100;
  try {
    while (true) {
      const url = `https://api.mercadolibre.com/marketplace/advertising/${siteId}/advertisers/${sellerId}/product_ads/campaigns/search?date_from=${dateFrom}&date_to=${dateTo}&metrics=${metrics}&offset=${offset}&limit=${limit}`;
      const response = await fetchWithRetry(url, {
        headers: { 'Authorization': `Bearer ${accessToken}`, 'api-version': '2' },
      });
      if (!response.ok) { await response.text(); break; }
      const data = await response.json();
      const results = Array.isArray(data.results || data.campaigns || data) ? (data.results || data.campaigns || data) : [];
      if (results.length === 0) break;
      allCampaigns.push(...results);
      const total = data.paging?.total || data.total || 0;
      offset += limit;
      if (total > 0 && offset >= total) break;
      if (!data.paging && !data.total && results.length < limit) break;
      await sleep(200);
    }
  } catch (error) {
    console.error('[ads-period-metrics] fetchCampaigns error:', error);
  }
  return allCampaigns;
}

async function discoverItems(accessToken: string, sellerId: string) {
  const allItems: any[] = [];
  let offset = 0;
  const limit = 100;
  try {
    while (true) {
      const url = `https://api.mercadolibre.com/advertising/product_ads/ads/search?user_id=${sellerId}&offset=${offset}&limit=${limit}`;
      const response = await fetchWithRetry(url, { headers: { 'Authorization': `Bearer ${accessToken}` } });
      if (!response.ok) { await response.text(); break; }
      const data = await response.json();
      const results = data.results || [];
      if (!Array.isArray(results) || results.length === 0) break;
      allItems.push(...results);
      const total = data.paging?.total || 0;
      offset += limit;
      if (offset >= total) break;
      await sleep(200);
    }
  } catch (error) {
    console.error('[ads-period-metrics] discoverItems error:', error);
  }
  return allItems;
}

async function fetchItemMetricsBatch(accessToken: string, items: any[], dateFrom: string, dateTo: string) {
  const results: any[] = [];
  for (let i = 0; i < items.length; i += BATCH_SIZE) {
    const batch = items.slice(i, i + BATCH_SIZE);
    const batchResults = await Promise.all(
      batch.map(async (item) => {
        const itemId = item.item_id || item.id;
        if (!itemId) return { ...item, metrics: {} };
        try {
          const url = `https://api.mercadolibre.com/advertising/product_ads/items/${itemId}?date_from=${dateFrom}&date_to=${dateTo}&metrics=clicks,prints,cost,cpc,acos,roas,total_amount`;
          const resp = await fetchWithRetry(url, {
            headers: { 'Authorization': `Bearer ${accessToken}`, 'api-version': '2' },
          });
          if (resp.ok) {
            const data = await resp.json();
            return { ...item, ...data, metrics: data.metrics || {} };
          }
          await resp.text();
          return { ...item, metrics: {} };
        } catch { return { ...item, metrics: {} }; }
      })
    );
    results.push(...batchResults);
    if (i + BATCH_SIZE < items.length) await sleep(BATCH_DELAY);
  }
  return results;
}
