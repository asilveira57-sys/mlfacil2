import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const ML_APP_ID = Deno.env.get('ML_APP_ID')!;
const ML_SECRET_KEY = Deno.env.get('ML_SECRET_KEY')!;

async function fetchWithRetry(url: string, options: RequestInit, maxRetries = 3): Promise<Response> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const response = await fetch(url, options);
    if (response.status === 429 && attempt < maxRetries) {
      const retryAfter = parseInt(response.headers.get('retry-after') || '2', 10);
      const waitMs = retryAfter * 1000 * (attempt + 1);
      console.warn(`[ads-campaign-manage] 429, waiting ${waitMs}ms (attempt ${attempt + 1})`);
      await response.text();
      await new Promise(r => setTimeout(r, waitMs));
      continue;
    }
    return response;
  }
  return fetch(url, options);
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

type Action = 'pause_campaign' | 'activate_campaign' | 'pause_ad' | 'activate_ad' | 'add_ad' | 'remove_ad';

async function logToAudit(supabase: any, level: string, action: string, userId: string | null, success: boolean, message: string, meta: Record<string, unknown> = {}) {
  try {
    await supabase.rpc('register_system_log', {
      p_level: level,
      p_system_area: 'ads_manage',
      p_action: action,
      p_user_id: userId,
      p_success: success,
      p_message: message,
      p_meta: meta,
    });
  } catch (_) { /* fail-safe */ }
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
    const { seller_id, action, campaign_id, item_id } = body as {
      seller_id: string;
      action: Action;
      campaign_id?: string;
      item_id?: string;
    };

    if (!seller_id || !action) {
      return new Response(JSON.stringify({ error: 'seller_id and action are required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get ML access token
    const { data: account } = await supabase
      .from('ml_accounts')
      .select('access_token, refresh_token, token_expires_at')
      .eq('ml_user_id', seller_id)
      .eq('user_id', user.id)
      .single();

    if (!account) {
      return new Response(JSON.stringify({ error: 'ML account not found' }), {
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

    const mlHeaders = {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    };

    let mlResponse: Response;
    let result: any;

    switch (action) {
      case 'pause_campaign':
      case 'activate_campaign': {
        if (!campaign_id) {
          return new Response(JSON.stringify({ error: 'campaign_id required' }), {
            status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
        const newStatus = action === 'pause_campaign' ? 'paused' : 'active';
        const url = `https://api.mercadolibre.com/advertising/product_ads/campaigns/${campaign_id}`;
        console.log(`[ads-campaign-manage] ${action}: PUT ${url} -> status=${newStatus}`);
        
        mlResponse = await fetchWithRetry(url, {
          method: 'PUT',
          headers: mlHeaders,
          body: JSON.stringify({ status: newStatus }),
        });

        const responseText = await mlResponse.text();
        console.log(`[ads-campaign-manage] ML response ${mlResponse.status}: ${responseText.substring(0, 500)}`);

        if (!mlResponse.ok) {
          let mlError = responseText;
          try { const parsed = JSON.parse(responseText); mlError = parsed.message || parsed.error || responseText; } catch {}
          await logToAudit(supabase, 'error', action, user.id, false, `ML API ${mlResponse.status}: ${mlError}`, { seller_id, campaign_id, ml_status: mlResponse.status });
          return new Response(JSON.stringify({ 
            error: `ML API error: ${mlResponse.status}`, 
            details: mlError,
            ml_status: mlResponse.status,
          }), {
            status: 200, 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        // Update local DB
        await supabase
          .from('ads_campaigns')
          .update({ status: newStatus, updated_at: new Date().toISOString() })
          .eq('ml_campaign_id', campaign_id)
          .eq('seller_id', seller_id);

        await logToAudit(supabase, 'info', action, user.id, true, `Campanha ${campaign_id} -> ${newStatus}`, { seller_id, campaign_id, new_status: newStatus });
        result = { success: true, action, campaign_id, new_status: newStatus, ml_response: JSON.parse(responseText || '{}') };
        break;
      }

      case 'pause_ad':
      case 'activate_ad': {
        if (!item_id) {
          return new Response(JSON.stringify({ error: 'item_id required' }), {
            status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
        const newStatus = action === 'pause_ad' ? 'paused' : 'active';
        const url = `https://api.mercadolibre.com/advertising/product_ads/ads/${item_id}`;
        console.log(`[ads-campaign-manage] ${action}: PUT ${url} -> status=${newStatus}`);

        mlResponse = await fetchWithRetry(url, {
          method: 'PUT',
          headers: mlHeaders,
          body: JSON.stringify({ status: newStatus }),
        });

        const adText = await mlResponse.text();
        console.log(`[ads-campaign-manage] ML response ${mlResponse.status}: ${adText.substring(0, 500)}`);

        if (!mlResponse.ok) {
          let mlError = adText;
          try { const parsed = JSON.parse(adText); mlError = parsed.message || parsed.error || adText; } catch {}
          await logToAudit(supabase, 'error', action, user.id, false, `ML API ${mlResponse.status}: ${mlError}`, { seller_id, item_id, ml_status: mlResponse.status });
          return new Response(JSON.stringify({ 
            error: `ML API error: ${mlResponse.status}`, 
            details: mlError,
          }), {
            status: 200,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        // Update local DB
        await supabase
          .from('ads_items')
          .update({ status: newStatus, updated_at: new Date().toISOString() })
          .eq('item_id', item_id)
          .eq('seller_id', seller_id);

        await logToAudit(supabase, 'info', action, user.id, true, `Anúncio ${item_id} -> ${newStatus}`, { seller_id, item_id, new_status: newStatus });
        result = { success: true, action, item_id, new_status: newStatus };
        break;
      }

      case 'add_ad': {
        if (!campaign_id || !item_id) {
          return new Response(JSON.stringify({ error: 'campaign_id and item_id required' }), {
            status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
        const url = `https://api.mercadolibre.com/advertising/product_ads/ads`;
        console.log(`[ads-campaign-manage] add_ad: POST ${url} campaign=${campaign_id} item=${item_id}`);

        mlResponse = await fetchWithRetry(url, {
          method: 'POST',
          headers: mlHeaders,
          body: JSON.stringify({ campaign_id: Number(campaign_id), item_id }),
        });

        const addText = await mlResponse.text();
        console.log(`[ads-campaign-manage] ML response ${mlResponse.status}: ${addText.substring(0, 500)}`);

        if (!mlResponse.ok) {
          let mlError = addText;
          try { const parsed = JSON.parse(addText); mlError = parsed.message || parsed.error || addText; } catch {}
          await logToAudit(supabase, 'error', action, user.id, false, `ML API ${mlResponse.status}: ${mlError}`, { seller_id, campaign_id, item_id, ml_status: mlResponse.status });
          return new Response(JSON.stringify({ 
            error: `ML API error: ${mlResponse.status}`, 
            details: mlError,
          }), {
            status: 200,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        await logToAudit(supabase, 'info', action, user.id, true, `Anúncio ${item_id} adicionado à campanha ${campaign_id}`, { seller_id, campaign_id, item_id });
        result = { success: true, action, campaign_id, item_id };
        break;
      }

      case 'remove_ad': {
        if (!item_id) {
          return new Response(JSON.stringify({ error: 'item_id required' }), {
            status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
        const url = `https://api.mercadolibre.com/advertising/product_ads/ads/${item_id}`;
        console.log(`[ads-campaign-manage] remove_ad: DELETE ${url}`);

        mlResponse = await fetchWithRetry(url, {
          method: 'DELETE',
          headers: mlHeaders,
        });

        const delText = await mlResponse.text();
        console.log(`[ads-campaign-manage] ML response ${mlResponse.status}: ${delText.substring(0, 500)}`);

        if (!mlResponse.ok && mlResponse.status !== 404) {
          let mlError = delText;
          try { const parsed = JSON.parse(delText); mlError = parsed.message || parsed.error || delText; } catch {}
          await logToAudit(supabase, 'error', action, user.id, false, `ML API ${mlResponse.status}: ${mlError}`, { seller_id, item_id, ml_status: mlResponse.status });
          return new Response(JSON.stringify({ 
            error: `ML API error: ${mlResponse.status}`, 
            details: mlError,
          }), {
            status: 200,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        // Remove from local DB
        await supabase
          .from('ads_items')
          .delete()
          .eq('item_id', item_id)
          .eq('seller_id', seller_id);

        await logToAudit(supabase, 'info', action, user.id, true, `Anúncio ${item_id} removido`, { seller_id, item_id });
        result = { success: true, action, item_id };
        break;
      }

      default:
        return new Response(JSON.stringify({ error: `Unknown action: ${action}` }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
    }

    return new Response(JSON.stringify(result), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error: unknown) {
    console.error('[ads-campaign-manage] Error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    try {
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
      const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
      const svc = createClient(supabaseUrl, supabaseServiceKey);
      await logToAudit(svc, 'error', 'unhandled_error', null, false, message, {});
    } catch (_) { /* fail-safe */ }
    return new Response(JSON.stringify({ error: message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
