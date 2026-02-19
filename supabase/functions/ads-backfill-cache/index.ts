import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const ML_APP_ID = Deno.env.get('ML_APP_ID')!;
const ML_SECRET_KEY = Deno.env.get('ML_SECRET_KEY')!;
const BATCH_SIZE = 10;
const BATCH_DELAY = 300;
const DAYS_PER_EXECUTION = 7; // Process 7 days per call to stay under timeout

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function getTodayBRT(): string {
  const now = new Date();
  const brt = new Date(now.getTime() - 3 * 60 * 60 * 1000);
  return brt.toISOString().slice(0, 10);
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

    const body = await req.json().catch(() => ({}));
    const { seller_id, days_back = 365 } = body;

    if (!seller_id) {
      return new Response(JSON.stringify({ error: 'seller_id is required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const startTime = Date.now();
    const today = getTodayBRT();

    // Get ML account
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

    // Generate all dates we want to backfill (excluding today)
    const allDates: string[] = [];
    for (let i = 1; i <= days_back; i++) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().slice(0, 10);
      allDates.push(dateStr);
    }

    // Check which dates are already cached
    const { data: cachedRows } = await supabase
      .from('ads_period_cache')
      .select('metric_date')
      .eq('seller_id', seller_id);

    const cachedDates = new Set((cachedRows || []).map(r => r.metric_date));
    const missingDates = allDates.filter(d => !cachedDates.has(d));

    if (missingDates.length === 0) {
      return new Response(JSON.stringify({ 
        message: 'All dates already cached',
        total_cached: cachedDates.size,
        days_requested: days_back,
      }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Process only DAYS_PER_EXECUTION dates per call
    const datesToProcess = missingDates.slice(0, DAYS_PER_EXECUTION);
    console.log(`[ads-backfill] Processing ${datesToProcess.length}/${missingDates.length} missing days for ${seller_id}`);

    // Discover items once (same for all days)
    const allItems = await discoverItems(accessToken, seller_id);
    let processedCount = 0;

    for (const date of datesToProcess) {
      // Check timeout safety (~45s limit)
      if (Date.now() - startTime > 40000) {
        console.log(`[ads-backfill] Timeout safety: stopping after ${processedCount} days`);
        break;
      }

      try {
        const [campaignsData, itemsWithMetrics] = await Promise.all([
          fetchCampaigns(accessToken, siteId, advertiserId || seller_id, date, date),
          fetchItemMetricsBatch(accessToken, allItems, date, date),
        ]);

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
            name: c.name || `Campaign ${c.id}`,
            status: c.status,
            spent: m.cost || m.spent || 0,
            revenue: m.total_amount || m.revenue || 0,
            clicks: m.clicks || 0,
            impressions: m.prints || m.impressions || 0,
            conversions: m.conversions || 0,
          };
        });

        await supabase.from('ads_period_cache').upsert({
          seller_id,
          user_id: user.id,
          metric_date: date,
          total_spent, total_revenue, total_clicks, total_impressions, total_conversions,
          items_data: items,
          campaigns_data: campaigns,
          fetched_at: new Date().toISOString(),
        }, { onConflict: 'seller_id,metric_date' });

        processedCount++;
        console.log(`[ads-backfill] Cached ${date}: spent=${total_spent}, revenue=${total_revenue}`);
      } catch (err) {
        console.error(`[ads-backfill] Error on ${date}:`, err);
      }

      await sleep(500);
    }

    const remaining = missingDates.length - processedCount;
    return new Response(JSON.stringify({
      message: `Backfill processed ${processedCount} days`,
      processed: processedCount,
      remaining,
      total_cached: cachedDates.size + processedCount,
      total_requested: days_back,
      duration_ms: Date.now() - startTime,
      has_more: remaining > 0,
    }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error: unknown) {
    console.error('[ads-backfill] Error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

// --- Shared helpers (same as ads-period-metrics) ---

async function getAdvertiserId(accessToken: string, sellerId: string): Promise<string | null> {
  try {
    const response = await fetch(`https://api.mercadolibre.com/advertising/advertisers?product_id=PADS`, {
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
      const response = await fetch(url, {
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
    console.error('[ads-backfill] fetchCampaigns error:', error);
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
      const response = await fetch(url, { headers: { 'Authorization': `Bearer ${accessToken}` } });
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
    console.error('[ads-backfill] discoverItems error:', error);
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
          const resp = await fetch(url, {
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
