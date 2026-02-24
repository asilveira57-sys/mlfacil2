import { createClient } from 'npm:@supabase/supabase-js@2';
import { auditLog } from '../_shared/audit-log.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const ML_APP_ID = Deno.env.get('ML_APP_ID')!;
const ML_SECRET_KEY = Deno.env.get('ML_SECRET_KEY')!;

/**
 * Fetch diagnostics: /users/me + PADS advertisers check.
 * No longer attempts /oauth/token/info (returns 403 PolicyAgent).
 * app_id is populated from our own ML_APP_ID env var.
 */
async function fetchDiagnostics(accessToken: string, mlUserId?: string): Promise<{
  ml_user_id: string | null;
  site_id: string | null;
  me_status: number | null;
  me_error?: string;
  app_id: string;
  token_scope: string | null;
  // PADS advertisers check
  pads_advertisers_status: number | null;
  pads_advertisers_count: number | null;
  pads_advertisers_sample: any[] | null;
  pads_advertisers_error_body?: string;
}> {
  const result: any = {
    ml_user_id: null,
    site_id: null,
    me_status: null,
    me_error: undefined,
    app_id: ML_APP_ID || 'unknown',
    token_scope: 'read write offline_access',  // scopes we request during OAuth
    pads_advertisers_status: null,
    pads_advertisers_count: null,
    pads_advertisers_sample: null,
    pads_advertisers_error_body: undefined,
  };

  // 1) GET /users/me
  try {
    const meResp = await fetch('https://api.mercadolibre.com/users/me', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    result.me_status = meResp.status;
    if (meResp.ok) {
      const me = await meResp.json();
      result.ml_user_id = String(me.id ?? '');
      result.site_id = me.site_id ?? null;
    } else {
      result.me_error = (await meResp.text()).substring(0, 500);
    }
  } catch (e) {
    result.me_error = e instanceof Error ? e.message : 'fetch_failed';
  }

  // 2) PADS advertisers check — identifies if user has Product Ads enabled
  const userId = result.ml_user_id || mlUserId;
  if (userId) {
    try {
      const padsUrl = `https://api.mercadolibre.com/advertising/advertisers?user_id=${userId}`;
      const padsResp = await fetch(padsUrl, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      result.pads_advertisers_status = padsResp.status;
      if (padsResp.ok) {
        const padsData = await padsResp.json();
        const advertisers = Array.isArray(padsData) ? padsData : (padsData.results || padsData.advertisers || []);
        result.pads_advertisers_count = advertisers.length;
        result.pads_advertisers_sample = advertisers.slice(0, 3).map((a: any) => ({
          advertiser_id: a.advertiser_id ?? a.id ?? null,
          site_id: a.site_id ?? null,
          account_name: a.account_name ?? a.name ?? null,
        }));
      } else {
        result.pads_advertisers_error_body = (await padsResp.text()).substring(0, 500);
      }
    } catch (e) {
      result.pads_advertisers_error_body = e instanceof Error ? e.message : 'fetch_failed';
      result.pads_advertisers_status = -1;
    }
  }

  return result;
}

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

/**
 * Build error response for frontend with PADS-specific guidance.
 */
function buildErrorResponse(mlStatus: number, mlError: string, responseText: string, diag: any) {
  let userMessage = mlError;
  let errorCode = 'ML_API_ERROR';

  // PADS not enabled (404 from advertisers endpoint)
  if (diag.pads_advertisers_status === 404) {
    userMessage = 'O Produto Ads (Product Ads) não está habilitado para esta conta do Mercado Livre. Acesse "Meu perfil > Publicidade" no Mercado Livre para ativá-lo.';
    errorCode = 'PADS_NOT_ENABLED';
  }
  // PADS enabled but write permission denied
  else if (mlStatus === 401 && diag.pads_advertisers_status === 200 && diag.pads_advertisers_count > 0) {
    userMessage = 'Permissão de escrita recusada pela API do Mercado Ads para este usuário/app. Tente reconectar sua conta do Mercado Livre (desconectar e conectar novamente) para renovar as autorizações do app para Ads.';
    errorCode = 'PADS_WRITE_DENIED';
  }
  // Generic 401
  else if (mlStatus === 401) {
    userMessage = 'Sem permissão para executar esta ação na API do Mercado Livre. Verifique se o Produto Ads está habilitado e se a conta está conectada corretamente.';
    errorCode = 'ML_UNAUTHORIZED';
  }

  return {
    error: `ML API error: ${mlStatus}`,
    details: userMessage,
    error_code: errorCode,
    ml_status: mlStatus,
    ml_error_body: responseText.substring(0, 500),
    pads_advertisers_status: diag.pads_advertisers_status,
    pads_advertisers_count: diag.pads_advertisers_count,
  };
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

    // Fetch diagnostics: /users/me + PADS advertisers check
    const diag = await fetchDiagnostics(accessToken, seller_id);
    console.log(`[ads-campaign-manage] Diagnostics: ml_user_id=${diag.ml_user_id}, site_id=${diag.site_id}, app_id=${diag.app_id}, me_status=${diag.me_status}, pads_status=${diag.pads_advertisers_status}, pads_count=${diag.pads_advertisers_count}`);

    const mlHeaders = {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    };

    // Build common meta for all logs
    const baseMeta = {
      seller_id,
      campaign_id: campaign_id ?? null,
      item_id: item_id ?? null,
      ml_user_id: diag.ml_user_id,
      site_id: diag.site_id,
      app_id: diag.app_id,
      token_scope: diag.token_scope,
      me_status: diag.me_status,
      me_error: diag.me_error,
      pads_advertisers_status: diag.pads_advertisers_status,
      pads_advertisers_count: diag.pads_advertisers_count,
      pads_advertisers_sample: diag.pads_advertisers_sample,
      pads_advertisers_error_body: diag.pads_advertisers_error_body,
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
          await auditLog(supabase, { level: 'error', area: 'ads_manage', action, userId: user.id, success: false, message: `ML API ${mlResponse.status}: ${mlError}`, meta: { ...baseMeta, ml_status: mlResponse.status, ml_error_body: responseText } });
          const errBody = buildErrorResponse(mlResponse.status, mlError, responseText, diag);
          return new Response(JSON.stringify(errBody), {
            status: 200, 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        await supabase
          .from('ads_campaigns')
          .update({ status: newStatus, updated_at: new Date().toISOString() })
          .eq('ml_campaign_id', campaign_id)
          .eq('seller_id', seller_id);

        await auditLog(supabase, { level: 'info', area: 'ads_manage', action, userId: user.id, success: true, message: `Campanha ${campaign_id} -> ${newStatus}`, meta: { ...baseMeta, new_status: newStatus } });
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
          await auditLog(supabase, { level: 'error', area: 'ads_manage', action, userId: user.id, success: false, message: `ML API ${mlResponse.status}: ${mlError}`, meta: { ...baseMeta, ml_status: mlResponse.status, ml_error_body: adText } });
          const errBody = buildErrorResponse(mlResponse.status, mlError, adText, diag);
          return new Response(JSON.stringify(errBody), {
            status: 200,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        await supabase
          .from('ads_items')
          .update({ status: newStatus, updated_at: new Date().toISOString() })
          .eq('item_id', item_id)
          .eq('seller_id', seller_id);

        await auditLog(supabase, { level: 'info', area: 'ads_manage', action, userId: user.id, success: true, message: `Anúncio ${item_id} -> ${newStatus}`, meta: { ...baseMeta, new_status: newStatus } });
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
          await auditLog(supabase, { level: 'error', area: 'ads_manage', action, userId: user.id, success: false, message: `ML API ${mlResponse.status}: ${mlError}`, meta: { ...baseMeta, ml_status: mlResponse.status, ml_error_body: addText } });
          const errBody = buildErrorResponse(mlResponse.status, mlError, addText, diag);
          return new Response(JSON.stringify(errBody), {
            status: 200,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        await auditLog(supabase, { level: 'info', area: 'ads_manage', action, userId: user.id, success: true, message: `Anúncio ${item_id} adicionado à campanha ${campaign_id}`, meta: { ...baseMeta } });
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
          await auditLog(supabase, { level: 'error', area: 'ads_manage', action, userId: user.id, success: false, message: `ML API ${mlResponse.status}: ${mlError}`, meta: { ...baseMeta, ml_status: mlResponse.status, ml_error_body: delText } });
          const errBody = buildErrorResponse(mlResponse.status, mlError, delText, diag);
          return new Response(JSON.stringify(errBody), {
            status: 200,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        await supabase
          .from('ads_items')
          .delete()
          .eq('item_id', item_id)
          .eq('seller_id', seller_id);

        await auditLog(supabase, { level: 'info', area: 'ads_manage', action, userId: user.id, success: true, message: `Anúncio ${item_id} removido`, meta: { ...baseMeta } });
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
      await auditLog(svc, { level: 'error', area: 'ads_manage', action: 'unhandled_error', userId: null, success: false, message, meta: {} });
    } catch (_) { /* fail-safe */ }
    return new Response(JSON.stringify({ error: message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
