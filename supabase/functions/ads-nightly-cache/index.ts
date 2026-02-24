import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const ML_APP_ID = Deno.env.get('ML_APP_ID')!;
const ML_SECRET_KEY = Deno.env.get('ML_SECRET_KEY')!;
const PERIODS = [7, 14, 30, 60, 90];
const DELAY_BETWEEN_SELLERS_MS = 2000;
const DELAY_BETWEEN_PERIODS_MS = 500;

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function getTodayBRT(): string {
  const now = new Date();
  const brt = new Date(now.getTime() - 3 * 60 * 60 * 1000);
  return brt.toISOString().slice(0, 10);
}

function formatDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Fetch with retry for ML API rate limits */
async function fetchWithRetry(url: string, options: RequestInit, maxRetries = 3): Promise<Response> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const response = await fetch(url, options);
    if (response.status === 429 && attempt < maxRetries) {
      const retryAfter = parseInt(response.headers.get('retry-after') || '5', 10);
      const waitMs = retryAfter * 1000 * (attempt + 1);
      console.warn(`[ads-nightly-cache] 429 rate limit, waiting ${waitMs}ms (attempt ${attempt + 1})`);
      await response.text();
      await sleep(waitMs);
      continue;
    }
    return response;
  }
  return fetch(url, options);
}

function extractMetrics(m: any) {
  return {
    spent: m.cost || m.spent || 0,
    revenue: m.total_amount || m.revenue || 0,
    clicks: m.clicks || 0,
    impressions: m.prints || m.impressions || 0,
    conversions: (m.advertising_items_quantity || 0) +
      (m.direct_items_quantity && !m.advertising_items_quantity
        ? (m.direct_items_quantity || 0) + (m.indirect_items_quantity || 0) : 0),
  };
}

async function refreshToken(supabase: any, sellerId: string, refreshTokenStr: string): Promise<string | null> {
  try {
    const resp = await fetch('https://api.mercadolibre.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        grant_type: 'refresh_token',
        client_id: ML_APP_ID,
        client_secret: ML_SECRET_KEY,
        refresh_token: refreshTokenStr,
      }),
    });
    if (!resp.ok) return null;
    const data = await resp.json();
    const expiresAt = new Date(Date.now() + data.expires_in * 1000).toISOString();
    await supabase.from('ml_accounts').update({
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      token_expires_at: expiresAt,
    }).eq('ml_user_id', sellerId);
    return data.access_token;
  } catch {
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // Auth: accept cron key or service role
  const cronKey = req.headers.get('x-cron-key');
  const CRON_SECRET = Deno.env.get('CRON_JOB_SECRET') || 'default-cron-secret';
  const authHeader = req.headers.get('Authorization');
  
  if (cronKey !== CRON_SECRET && !authHeader?.includes(Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '___')) {
    // Also accept anon key for cron invocation
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY') || '';
    if (!authHeader?.includes(anonKey)) {
      return new Response('Unauthorized', { status: 401, headers: corsHeaders });
    }
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  const startTime = Date.now();
  const today = getTodayBRT();
  const stats = { sellers: 0, cached: 0, errors: 0, skipped: 0 };

  try {
    // Get all active ADS connections
    const { data: connections, error: connErr } = await supabase
      .from('ads_connections')
      .select('seller_id, user_id, status')
      .eq('status', 'connected')
      .eq('auto_sync_enabled', true);

    if (connErr) throw connErr;
    if (!connections || connections.length === 0) {
      console.log('[ads-nightly-cache] No active connections');
      return new Response(JSON.stringify({ status: 'idle', stats }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`[ads-nightly-cache] Processing ${connections.length} connections`);

    for (const conn of connections) {
      stats.sellers++;

      try {
        // Get ML account token
        const { data: account } = await supabase
          .from('ml_accounts')
          .select('access_token, refresh_token, token_expires_at')
          .eq('ml_user_id', conn.seller_id)
          .eq('user_id', conn.user_id)
          .eq('is_active', true)
          .maybeSingle();

        if (!account) {
          console.warn(`[ads-nightly-cache] No active account for ${conn.seller_id}`);
          stats.skipped++;
          continue;
        }

        let accessToken = account.access_token;
        if (new Date(account.token_expires_at) < new Date()) {
          accessToken = await refreshToken(supabase, conn.seller_id, account.refresh_token);
          if (!accessToken) {
            console.error(`[ads-nightly-cache] Token refresh failed for ${conn.seller_id}`);
            stats.errors++;
            continue;
          }
        }

        // Pre-cache each standard period
        for (const days of PERIODS) {
          const dateTo = today;
          const dateFromDate = new Date();
          dateFromDate.setDate(dateFromDate.getDate() - days);
          const dateFrom = formatDate(dateFromDate);
          const rangeCacheKey = `R:${dateFrom}:${dateTo}`;

          try {
            // Check if we already have a fresh cache
            const { data: existing } = await supabase
              .from('ads_period_cache')
              .select('fetched_at')
              .eq('seller_id', conn.seller_id)
              .eq('range_key', rangeCacheKey)
              .maybeSingle();

            if (existing) {
              const age = Date.now() - new Date(existing.fetched_at).getTime();
              // Skip if less than 6 hours old
              if (age < 6 * 60 * 60 * 1000) {
                continue;
              }
            }

            // Fetch campaign metrics from ML API
            const campaignsUrl = `https://api.mercadolibre.com/advertising/advertisers/${conn.seller_id}/campaigns?status=active,paused&date_from=${dateFrom}&date_to=${dateTo}&metrics=clicks,prints,cost,cpc,acos,roas,total_amount,direct_items_quantity,indirect_items_quantity,advertising_items_quantity`;
            const campResp = await fetchWithRetry(campaignsUrl, {
              headers: { 'Authorization': `Bearer ${accessToken}` },
            });

            let campaigns: any[] = [];
            let total_spent = 0, total_revenue = 0, total_clicks = 0, total_impressions = 0, total_conversions = 0;

            if (campResp.ok) {
              const campData = await campResp.json();
              const campResults = Array.isArray(campData) ? campData : (campData.results || []);
              
              for (const c of campResults) {
                const m = c.metrics || c;
                const ex = extractMetrics(m);
                total_spent += ex.spent;
                total_revenue += ex.revenue;
                total_clicks += ex.clicks;
                total_impressions += ex.impressions;
                total_conversions += ex.conversions;
                campaigns.push({
                  ml_campaign_id: String(c.id || c.campaign_id),
                  name: c.name || `Campaign ${c.id}`,
                  status: c.status,
                  ...ex,
                });
              }
            } else {
              const errText = await campResp.text();
              console.warn(`[ads-nightly-cache] Campaign API error for ${conn.seller_id} ${days}d: ${campResp.status} ${errText.substring(0, 100)}`);
              stats.errors++;
              continue;
            }

            // Don't cache zeros (likely rate limited)
            if (total_spent === 0 && total_revenue === 0 && total_clicks === 0) {
              console.warn(`[ads-nightly-cache] Skipping zero-data cache for ${conn.seller_id} ${days}d`);
              continue;
            }

            // Save to cache
            await supabase.from('ads_period_cache')
              .delete()
              .eq('seller_id', conn.seller_id)
              .eq('range_key', rangeCacheKey);

            await supabase.from('ads_period_cache').insert({
              seller_id: conn.seller_id,
              user_id: conn.user_id,
              metric_date: dateFrom,
              range_key: rangeCacheKey,
              total_spent,
              total_revenue,
              total_clicks,
              total_impressions,
              total_conversions,
              campaigns_data: campaigns,
              items_data: [],
              fetched_at: new Date().toISOString(),
            });

            stats.cached++;
            console.log(`[ads-nightly-cache] Cached ${conn.seller_id} ${days}d: spent=${total_spent}, revenue=${total_revenue}`);

            await sleep(DELAY_BETWEEN_PERIODS_MS);
          } catch (periodErr) {
            console.error(`[ads-nightly-cache] Error caching ${conn.seller_id} ${days}d:`, periodErr);
            stats.errors++;
          }
        }

        await sleep(DELAY_BETWEEN_SELLERS_MS);
      } catch (sellerErr) {
        console.error(`[ads-nightly-cache] Error processing seller ${conn.seller_id}:`, sellerErr);
        stats.errors++;
      }
    }

    const duration = Date.now() - startTime;
    console.log(`[ads-nightly-cache] Done in ${duration}ms:`, stats);

    return new Response(JSON.stringify({ status: 'completed', stats, duration_ms: duration }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('[ads-nightly-cache] Fatal error:', error);
    return new Response(JSON.stringify({ error: String(error) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
