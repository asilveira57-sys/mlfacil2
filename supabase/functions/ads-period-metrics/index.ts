import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const ML_APP_ID = Deno.env.get('ML_APP_ID')!;
const ML_SECRET_KEY = Deno.env.get('ML_SECRET_KEY')!;
const BATCH_SIZE = 10; // Parallel requests per batch
const BATCH_DELAY = 300; // Delay between batches

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
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
    if (!gate.allowed) {
      return gate.response!;
    }

    const body = await req.json().catch(() => ({}));
    const { seller_id, date_from, date_to } = body;

    if (!seller_id || !date_from || !date_to) {
      return new Response(JSON.stringify({ error: 'seller_id, date_from, date_to are required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const startTime = Date.now();
    console.log(`[ads-period-metrics] Fetching metrics for ${seller_id} from ${date_from} to ${date_to}`);

    // Get ML account tokens
    const { data: account, error: accError } = await supabase
      .from('ml_accounts')
      .select('access_token, refresh_token, token_expires_at, country_id')
      .eq('ml_user_id', seller_id)
      .eq('user_id', user.id)
      .single();

    if (accError || !account) {
      return new Response(JSON.stringify({ error: 'Account not found' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const siteId = account.country_id || 'MLB';

    // Refresh token if expired
    let accessToken = account.access_token;
    if (new Date(account.token_expires_at) < new Date()) {
      accessToken = await refreshToken(supabase, seller_id, user.id, account.refresh_token);
      if (!accessToken) {
        return new Response(JSON.stringify({ error: 'Failed to refresh token' }), {
          status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    // Discover advertiser_id
    const advertiserId = await getAdvertiserId(accessToken, seller_id);

    // Fetch campaigns and discover items in parallel
    const [campaignsData, allItems] = await Promise.all([
      fetchCampaigns(accessToken, siteId, advertiserId || seller_id, date_from, date_to),
      discoverItems(accessToken, seller_id),
    ]);
    
    console.log(`[ads-period-metrics] Fetched ${campaignsData.length} campaigns, ${allItems.length} items discovered in ${Date.now() - startTime}ms`);

    // Fetch metrics for all items in parallel batches
    const itemsWithMetrics = await fetchItemMetricsBatch(accessToken, allItems, date_from, date_to);
    console.log(`[ads-period-metrics] Fetched metrics for ${itemsWithMetrics.length} items in ${Date.now() - startTime}ms`);

    // Aggregate summary
    const result = buildResult(campaignsData, itemsWithMetrics, date_from, date_to);

    console.log(`[ads-period-metrics] Done in ${Date.now() - startTime}ms: spent=${result.total_spent}, revenue=${result.total_revenue}, items=${itemsWithMetrics.length}`);

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

function buildResult(campaignsData: any[], itemsData: any[], date_from: string, date_to: string) {
  let total_spent = 0, total_revenue = 0, total_clicks = 0, total_impressions = 0, total_conversions = 0;

  for (const item of itemsData) {
    const m = item.metrics || {};
    total_spent += m.cost || m.spent || 0;
    total_revenue += m.total_amount || m.revenue || 0;
    total_clicks += m.clicks || 0;
    total_impressions += m.prints || m.impressions || 0;
    total_conversions += m.conversions || 0;
  }

  // If items have no metrics, try campaigns
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

  const avg_acos = total_revenue > 0 ? (total_spent / total_revenue) * 100 : 0;
  const avg_roas = total_spent > 0 ? total_revenue / total_spent : 0;
  const avg_cpc = total_clicks > 0 ? total_spent / total_clicks : 0;
  const avg_tacos = total_revenue > 0 ? (total_spent / total_revenue) * 100 : 0;

  let products_at_loss = 0, products_scalable = 0;
  for (const item of itemsData) {
    const m = item.metrics || {};
    const spent = m.cost || m.spent || 0;
    const revenue = m.total_amount || m.revenue || 0;
    const acos = revenue > 0 ? spent / revenue : 0;
    const roas = spent > 0 ? revenue / spent : 0;
    if (acos > 0.30) products_at_loss++;
    if (roas > 3 && (m.conversions || 0) > 0) products_scalable++;
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

  const items = itemsData.map(item => {
    const m = item.metrics || {};
    const spent = m.cost || m.spent || 0;
    const revenue = m.total_amount || m.revenue || 0;
    return {
      item_id: item.item_id || item.id,
      title: item.title || null,
      status: item.status,
      spent,
      revenue,
      clicks: m.clicks || 0,
      impressions: m.prints || m.impressions || 0,
      conversions: m.conversions || 0,
      acos: revenue > 0 ? spent / revenue : null,
      roas: spent > 0 ? revenue / spent : null,
    };
  });

  return {
    total_spent, total_revenue, total_clicks, total_impressions, total_conversions,
    avg_acos, avg_roas, avg_cpc, avg_tacos,
    products_at_loss, products_scalable,
    campaigns, items, date_from, date_to,
  };
}

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
  } catch {
    return sellerId;
  }
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
  } catch {
    return null;
  }
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
    console.error('[ads-period-metrics] fetchCampaigns error:', error);
  }
  return allCampaigns;
}

// Discover all ads (without metrics) - fast
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
    console.error('[ads-period-metrics] discoverItems error:', error);
  }
  return allItems;
}

// Fetch metrics for items in parallel batches of BATCH_SIZE
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
        } catch {
          return { ...item, metrics: {} };
        }
      })
    );
    results.push(...batchResults);
    
    // Delay between batches to respect rate limits
    if (i + BATCH_SIZE < items.length) {
      await sleep(BATCH_DELAY);
    }
  }
  
  return results;
}
