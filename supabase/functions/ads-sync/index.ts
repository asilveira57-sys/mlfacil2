import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const ML_APP_ID = Deno.env.get('ML_APP_ID')!;
const ML_SECRET_KEY = Deno.env.get('ML_SECRET_KEY')!;
const RATE_LIMIT_DELAY = 250;

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

    // ML API Access Gate
    const { assertMlApiAccess } = await import("../_shared/ml-api-gate.ts");
    const gate = await assertMlApiAccess(supabase, user.id);
    if (!gate.allowed) {
      console.log(`[ads-sync] Access denied: ${gate.reason}`);
      return gate.response!;
    }

    const body = await req.json().catch(() => ({}));
    const { seller_id } = body;

    if (!seller_id) {
      return new Response(JSON.stringify({ error: 'seller_id is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`[ads-sync] Starting sync for seller ${seller_id}`);

    // Get account tokens and site_id (country_id)
    const { data: account, error: accError } = await supabase
      .from('ml_accounts')
      .select('access_token, refresh_token, token_expires_at, country_id')
      .eq('ml_user_id', seller_id)
      .eq('user_id', user.id)
      .single();

    if (accError || !account) {
      console.error(`[ads-sync] Account not found for seller ${seller_id}:`, accError);
      return new Response(JSON.stringify({ error: 'Account not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const siteId = account.country_id || 'MLB';
    console.log(`[ads-sync] Using site_id: ${siteId}`);

    // Update sync state to syncing
    await supabase
      .from('ads_sync_state')
      .upsert({
        user_id: user.id,
        seller_id,
        status: 'syncing',
        last_sync_at: new Date().toISOString(),
      }, { onConflict: 'user_id,seller_id' });

    // Refresh token if needed
    let accessToken = account.access_token;
    if (new Date(account.token_expires_at) < new Date()) {
      accessToken = await refreshToken(supabase, seller_id, user.id, account.refresh_token);
      if (!accessToken) {
        await updateSyncState(supabase, user.id, seller_id, 'error', 'Token refresh failed');
        return new Response(JSON.stringify({ error: 'Failed to refresh token' }), {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    // Discover advertiser_id from ML API
    const advertiserId = await getAdvertiserId(accessToken, seller_id);
    if (!advertiserId) {
      await updateSyncState(supabase, user.id, seller_id, 'error', 'Advertiser ID not found. User may not have Product Ads enabled.');
      return new Response(JSON.stringify({ error: 'Advertiser ID not found. Product Ads may not be enabled for this account.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    console.log(`[ads-sync] Discovered advertiser_id: ${advertiserId}`);

    // Calculate date range (last 30 days)
    const dateTo = new Date();
    const dateFrom = new Date();
    dateFrom.setDate(dateFrom.getDate() - 30);
    const dateFromStr = dateFrom.toISOString().split('T')[0];
    const dateToStr = dateTo.toISOString().split('T')[0];

    console.log(`[ads-sync] Date range: ${dateFromStr} to ${dateToStr}`);

    // Fetch campaigns from ML Product Ads API v2
    const campaignsResult = await fetchCampaigns(accessToken, siteId, advertiserId, dateFromStr, dateToStr);
    console.log(`[ads-sync] Fetched ${campaignsResult.campaigns.length} campaigns`);

    // Upsert campaigns
    let campaignsSynced = 0;
    let itemsSynced = 0;

    for (const campaign of campaignsResult.campaigns) {
      const metrics = campaign.metrics || {};
      
      const campaignData = {
        user_id: user.id,
        seller_id,
        ml_campaign_id: String(campaign.id || campaign.campaign_id),
        name: campaign.name || `Campaign ${campaign.id || campaign.campaign_id}`,
        status: mapStatus(campaign.status),
        campaign_type: campaign.type || 'product_ads',
        daily_budget: campaign.daily_budget || campaign.budget?.daily || null,
        total_budget: campaign.total_budget || campaign.budget?.total || null,
        spent_total: metrics.cost || metrics.spent || 0,
        start_date: campaign.start_date || null,
        end_date: campaign.end_date || null,
        raw_data: campaign,
        synced_at: new Date().toISOString(),
      };

      const { data: upsertedCampaign, error: campaignError } = await supabase
        .from('ads_campaigns')
        .upsert(campaignData, { onConflict: 'seller_id,ml_campaign_id' })
        .select('id')
        .single();

      if (campaignError) {
        console.error(`[ads-sync] Campaign upsert error:`, campaignError);
        continue;
      }

      campaignsSynced++;

      // Store daily metrics for this campaign
      if (metrics && upsertedCampaign) {
        await supabase.from('ads_daily_metrics').upsert({
          user_id: user.id,
          seller_id,
          campaign_id: upsertedCampaign.id,
          metric_date: dateToStr,
          clicks: metrics.clicks || 0,
          impressions: metrics.prints || metrics.impressions || 0,
          spent: metrics.cost || 0,
          revenue: metrics.total_amount || metrics.revenue || 0,
          conversions: metrics.conversions || 0,
          acos: metrics.acos || null,
          roas: metrics.roas || null,
        }, { onConflict: 'campaign_id,metric_date' });
      }
    }

    // Fetch items/ads
    await sleep(RATE_LIMIT_DELAY);
    const itemsResult = await fetchItems(accessToken, siteId, seller_id, dateFromStr, dateToStr);
    console.log(`[ads-sync] Fetched ${itemsResult.items.length} items`);

    for (const item of itemsResult.items) {
      const metrics = item.metrics || {};
      const spent = metrics.cost || 0;
      const revenue = metrics.total_amount || metrics.revenue || 0;
      const acos = revenue > 0 ? spent / revenue : null;
      const roas = spent > 0 ? revenue / spent : null;

      const adData = {
        user_id: user.id,
        seller_id,
        ad_group_id: null,
        item_id: item.item_id || item.id,
        product_key: item.product_key || null,
        title: item.title || null,
        category_id: item.category_id || null,
        current_price: item.price || null,
        status: mapStatus(item.status),
        bid: item.bid || item.max_bid || null,
        spent,
        clicks: metrics.clicks || 0,
        impressions: metrics.prints || metrics.impressions || 0,
        conversions: metrics.conversions || 0,
        revenue_from_ads: revenue,
        acos,
        roas,
        raw_data: item,
        synced_at: new Date().toISOString(),
      };

      const { error: adError } = await supabase
        .from('ads_items')
        .upsert(adData, { 
          onConflict: 'seller_id,item_id,ad_group_id',
          ignoreDuplicates: false 
        });

      if (adError) {
        console.error(`[ads-sync] Ad item upsert error:`, adError);
      } else {
        itemsSynced++;
      }
    }

    // Generate alerts based on synced data
    await generateAlerts(supabase, user.id, seller_id);

    // Update sync state to completed
    await updateSyncState(supabase, user.id, seller_id, 'completed', null, campaignsSynced, itemsSynced);

    console.log(`[ads-sync] Completed: ${campaignsSynced} campaigns, ${itemsSynced} items`);

    return new Response(JSON.stringify({
      status: 'completed',
      campaigns_synced: campaignsSynced,
      items_synced: itemsSynced,
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error: unknown) {
    console.error('[ads-sync] Error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

async function getAdvertiserId(accessToken: string, sellerId: string): Promise<string | null> {
  try {
    const url = `https://api.mercadolibre.com/advertising/advertisers?product_id=PADS`;
    console.log(`[ads-sync] Fetching advertiser_id from: ${url}`);

    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.warn(`[ads-sync] Advertiser lookup failed: ${response.status} - ${errorText}`);
      // Fallback: try using seller_id as advertiser_id
      return sellerId;
    }

    const data = await response.json();
    console.log(`[ads-sync] Advertisers response:`, JSON.stringify(data).slice(0, 500));

    const advertisers = data.advertisers || data || [];
    if (Array.isArray(advertisers) && advertisers.length > 0) {
      // Return the first advertiser_id (or match by site_id if multiple)
      const advertiser = advertisers[0];
      return String(advertiser.advertiser_id || advertiser.id || sellerId);
    }

    // Fallback to seller_id
    console.warn(`[ads-sync] No advertisers found, falling back to seller_id`);
    return sellerId;
  } catch (error) {
    console.error('[ads-sync] getAdvertiserId error:', error);
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

    await supabase
      .from('ml_accounts')
      .update({
        access_token: data.access_token,
        refresh_token: data.refresh_token,
        token_expires_at: expiresAt,
      })
      .eq('ml_user_id', sellerId)
      .eq('user_id', userId);

    return data.access_token;
  } catch (error) {
    console.error('[ads-sync] Token refresh error:', error);
    return null;
  }
}

async function fetchCampaigns(accessToken: string, siteId: string, sellerId: string, dateFrom: string, dateTo: string) {
  // Product Ads API v2 endpoint with pagination
  const metrics = 'clicks,prints,cost,cpc,acos,roas,total_amount';
  const allCampaigns: any[] = [];
  let offset = 0;
  const limit = 100;

  try {
    while (true) {
      const url = `https://api.mercadolibre.com/marketplace/advertising/${siteId}/advertisers/${sellerId}/product_ads/campaigns/search?date_from=${dateFrom}&date_to=${dateTo}&metrics=${metrics}&offset=${offset}&limit=${limit}`;
      console.log(`[ads-sync] Fetching campaigns from: ${url}`);

      const response = await fetch(url, { 
        headers: { 
          'Authorization': `Bearer ${accessToken}`,
          'api-version': '2',
        } 
      });

      console.log(`[ads-sync] Campaigns response status: ${response.status}`);

      if (!response.ok) {
        const errorText = await response.text();
        console.warn(`[ads-sync] Campaigns fetch failed: ${response.status} - ${errorText}`);
        break;
      }

      const data = await response.json();
      console.log(`[ads-sync] Campaigns page response (offset=${offset}):`, JSON.stringify(data).slice(0, 500));
      
      // Handle different response structures
      const campaigns = data.results || data.campaigns || data || [];
      const results = Array.isArray(campaigns) ? campaigns : [];
      if (results.length === 0) break;

      allCampaigns.push(...results);

      const total = data.paging?.total || data.total || 0;
      offset += limit;
      if (total > 0 && offset >= total) break;
      // Safety: if no paging info and we got less than limit, assume done
      if (!data.paging && !data.total && results.length < limit) break;

      await sleep(RATE_LIMIT_DELAY);
    }

    console.log(`[ads-sync] Total campaigns fetched: ${allCampaigns.length}`);
    return { campaigns: allCampaigns };
  } catch (error) {
    console.error('[ads-sync] fetchCampaigns error:', error);
    return { campaigns: allCampaigns };
  }
}

async function fetchItems(accessToken: string, _siteId: string, sellerId: string, dateFrom: string, dateTo: string) {
  // Use the correct Product Ads ads/search endpoint with pagination
  const allItems: any[] = [];
  let offset = 0;
  const limit = 100;

  try {
    while (true) {
      const url = `https://api.mercadolibre.com/advertising/product_ads/ads/search?user_id=${sellerId}&status=active,paused&offset=${offset}&limit=${limit}`;
      console.log(`[ads-sync] Fetching items from: ${url}`);

      const response = await fetch(url, { 
        headers: { 
          'Authorization': `Bearer ${accessToken}`,
        } 
      });

      console.log(`[ads-sync] Items response status: ${response.status}`);

      if (!response.ok) {
        const errorText = await response.text();
        console.warn(`[ads-sync] Items fetch failed: ${response.status} - ${errorText}`);
        break;
      }

      const data = await response.json();
      console.log(`[ads-sync] Items page response (offset=${offset}):`, JSON.stringify(data).slice(0, 500));
      
      const results = data.results || [];
      if (!Array.isArray(results) || results.length === 0) break;

      allItems.push(...results);
      
      const total = data.paging?.total || 0;
      offset += limit;
      if (offset >= total) break;

      // Rate limit between pages
      await sleep(RATE_LIMIT_DELAY);
    }

    console.log(`[ads-sync] Total items fetched: ${allItems.length}`);

    // Now fetch metrics for each item via the v2 endpoint
    const itemsWithMetrics: any[] = [];
    for (const item of allItems) {
      const itemId = item.item_id || item.id;
      if (!itemId) continue;

      try {
        await sleep(RATE_LIMIT_DELAY);
        const metricsUrl = `https://api.mercadolibre.com/advertising/product_ads/items/${itemId}?date_from=${dateFrom}&date_to=${dateTo}&metrics=clicks,prints,cost,cpc,acos,roas,total_amount`;
        const metricsResp = await fetch(metricsUrl, {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'api-version': '2',
          },
        });

        if (metricsResp.ok) {
          const metricsData = await metricsResp.json();
          itemsWithMetrics.push({ ...item, ...metricsData, metrics: metricsData.metrics || {} });
        } else {
          // Use item without metrics
          itemsWithMetrics.push({ ...item, metrics: {} });
        }
      } catch {
        itemsWithMetrics.push({ ...item, metrics: {} });
      }
    }

    return { items: itemsWithMetrics };
  } catch (error) {
    console.error('[ads-sync] fetchItems error:', error);
    return { items: allItems.map(i => ({ ...i, metrics: {} })) };
  }
}

async function generateAlerts(supabase: any, userId: string, sellerId: string) {
  try {
    // Get items with high ACOS (> 40%)
    const { data: highAcosItems } = await supabase
      .from('ads_items')
      .select('*')
      .eq('seller_id', sellerId)
      .eq('user_id', userId)
      .gt('acos', 0.40)
      .eq('status', 'active');

    for (const item of highAcosItems || []) {
      const { data: existing } = await supabase
        .from('ads_alerts')
        .select('id')
        .eq('seller_id', sellerId)
        .eq('item_id', item.item_id)
        .eq('alert_type', 'high_acos')
        .eq('is_dismissed', false)
        .single();

      if (!existing) {
        await supabase.from('ads_alerts').insert({
          user_id: userId,
          seller_id: sellerId,
          alert_type: 'high_acos',
          severity: 'high',
          title: 'ACOS alto detectado',
          message_pt: `O produto "${item.title}" tem ACOS de ${((item.acos || 0) * 100).toFixed(1)}%. Considere pausar ou ajustar o lance.`,
          item_id: item.item_id,
          data_json: { acos: item.acos, spent: item.spent, revenue: item.revenue_from_ads },
        });
      }
    }

    // Get items with great ROAS (> 4) - scalable
    const { data: scalableItems } = await supabase
      .from('ads_items')
      .select('*')
      .eq('seller_id', sellerId)
      .eq('user_id', userId)
      .gt('roas', 4)
      .eq('status', 'active');

    for (const item of scalableItems || []) {
      const { data: existing } = await supabase
        .from('ads_alerts')
        .select('id')
        .eq('seller_id', sellerId)
        .eq('item_id', item.item_id)
        .eq('alert_type', 'scalable')
        .eq('is_dismissed', false)
        .single();

      if (!existing) {
        await supabase.from('ads_alerts').insert({
          user_id: userId,
          seller_id: sellerId,
          alert_type: 'scalable',
          severity: 'low',
          title: 'Oportunidade de escalar',
          message_pt: `O produto "${item.title}" tem ROAS de ${(item.roas || 0).toFixed(1)}x. Considere aumentar o orçamento.`,
          item_id: item.item_id,
          data_json: { roas: item.roas, spent: item.spent, revenue: item.revenue_from_ads },
        });
      }
    }

    console.log(`[ads-sync] Generated alerts for high ACOS: ${highAcosItems?.length || 0}, scalable: ${scalableItems?.length || 0}`);
  } catch (error) {
    console.error('[ads-sync] generateAlerts error:', error);
  }
}

async function updateSyncState(
  supabase: any,
  userId: string,
  sellerId: string,
  status: string,
  error: string | null,
  campaignsSynced?: number,
  itemsSynced?: number
) {
  await supabase
    .from('ads_sync_state')
    .upsert({
      user_id: userId,
      seller_id: sellerId,
      status,
      last_error: error,
      campaigns_synced: campaignsSynced ?? 0,
      items_synced: itemsSynced ?? 0,
      next_sync_at: new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString(),
    }, { onConflict: 'user_id,seller_id' });
}

function mapStatus(mlStatus: string): string {
  const statusMap: Record<string, string> = {
    active: 'active',
    enabled: 'active',
    paused: 'paused',
    disabled: 'paused',
    stopped: 'paused',
    ended: 'ended',
    finished: 'ended',
    deleted: 'ended',
  };
  return statusMap[mlStatus?.toLowerCase()] || 'paused';
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
