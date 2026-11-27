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
      const padsParams = { user_id: userId, product_id: 'PADS' };
      const padsUrl = `https://api.mercadolibre.com/advertising/advertisers?user_id=${padsParams.user_id}&product_id=${padsParams.product_id}`;
      result.pads_endpoint = padsUrl;
      result.pads_http_method = 'GET';
      result.pads_request_params = padsParams;
      const padsResp = await fetch(padsUrl, {
        headers: { Authorization: `Bearer ${accessToken}`, 'Api-Version': '1' },
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

type Action = 'pause_campaign' | 'activate_campaign' | 'update_campaign' | 'create_campaign' | 'list_campaigns'
  | 'pause_ad' | 'activate_ad' | 'add_ad' | 'move_ad' | 'remove_ad' | 'bulk_ads' | 'test_write';

/**
 * Build error response for frontend with PADS-specific guidance.
 */
function buildErrorResponse(mlStatus: number, mlError: string, responseText: string, diag: any) {
  let userMessage = mlError;
  let errorCode = 'ML_API_ERROR';

  // PADS preflight error (>= 400 but not 404)
  if (diag.pads_advertisers_status !== null && diag.pads_advertisers_status >= 400 && diag.pads_advertisers_status !== 404) {
    userMessage = `Erro no preflight PADS (HTTP ${diag.pads_advertisers_status}). Verifique se sua conta possui o Produto Ads habilitado.`;
    errorCode = 'PADS_PREFLIGHT_ERROR';
  }
  // PADS not enabled (404 from advertisers endpoint)
  else if (diag.pads_advertisers_status === 404) {
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
    pads_advertisers_error_body: diag.pads_advertisers_error_body,
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }
  if (req.method === 'GET' && new URL(req.url).searchParams.has('version')) {
    return new Response(JSON.stringify({ fn: 'ads-campaign-manage', version: 'ads-v3-recs' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
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
      pads_endpoint: diag.pads_endpoint,
      pads_http_method: diag.pads_http_method,
      pads_request_params: diag.pads_request_params,
    };

    let result: any;

    // ═══════════ API NOVA do Product Ads (a antiga foi desligada em 06/06/2025) ═══════════
    // Header api-version: 2. Base /marketplace/advertising/{SITE}. Leitura testada em 26/nov.
    const SITE = diag.site_id || 'MLB';
    const ADS = `https://api.mercadolibre.com/marketplace/advertising/${SITE}`;
    const advertiserId = diag.pads_advertisers_sample?.[0]?.advertiser_id ?? null;
    const h2 = { ...mlHeaders, 'api-version': '2' };
    const ok = (o: unknown) => new Response(JSON.stringify(o), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    const chamar = async (method: string, url: string, payload?: unknown) => {
      const r = await fetchWithRetry(url, { method, headers: h2, body: payload === undefined ? undefined : JSON.stringify(payload) });
      const text = await r.text();
      let data: any = null; try { data = JSON.parse(text); } catch { /* texto */ }
      console.log(`[ads-campaign-manage] ${action}: ${method} ${url} -> ${r.status} ${text.substring(0, 300)}`);
      return { ok: r.ok, status: r.status, text, data };
    };
    const falha = async (res: { status: number; text: string; data: any }) => {
      const mlError = res.data?.message || res.data?.error || res.text;
      await auditLog(supabase, { level: 'error', area: 'ads_manage', action, userId: user.id, success: false,
        message: `ML API ${res.status}: ${mlError}`, meta: { ...baseMeta, api: 'v2', ml_status: res.status, ml_error_body: res.text.substring(0, 1000) } });
      return ok(buildErrorResponse(res.status, mlError, res.text, diag));
    };
    const registrar = (message: string, meta: Record<string, unknown> = {}) =>
      auditLog(supabase, { level: 'info', area: 'ads_manage', action, userId: user.id, success: true, message, meta: { ...baseMeta, api: 'v2', ...meta } });
    const precisaAnunciante = () => ok({
      error: 'advertiser_not_found', error_code: 'PADS_NOT_ENABLED',
      details: 'Esta conta não tem Mercado Ads (Product Ads) ativo. Ative em Mercado Livre > Publicidade.',
    });
    const exigir = (campos: Record<string, unknown>) => {
      const faltando = Object.entries(campos).filter(([, v]) => v === undefined || v === null || v === '').map(([k]) => k);
      return faltando.length ? new Response(JSON.stringify({ error: `${faltando.join(', ')} required` }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }) : null;
    };
    const listarCampanhas = async () => {
      const todas: any[] = [];
      for (let offset = 0; offset < 2000; offset += 50) {
        const r = await chamar('GET', `${ADS}/advertisers/${advertiserId}/product_ads/campaigns/search?limit=50&offset=${offset}`);
        if (!r.ok) return { erro: r, todas };
        const lote: any[] = r.data?.results || [];
        todas.push(...lote);
        if (lote.length < 50) break;
      }
      return { erro: null, todas };
    };

    const { name, budget, acos_target, strategy, status, item_ids } = body as any;

    switch (action as string) {
      // Escrita sem efeito: manda para uma campanha o MESMO status que ela já tem.
      case 'test_write': {
        if (!advertiserId) return precisaAnunciante();
        const r = await chamar('GET', `${ADS}/advertisers/${advertiserId}/product_ads/campaigns/search?limit=1`);
        if (!r.ok) return falha(r);
        const c = r.data?.results?.[0];
        if (!c) return ok({ success: true, permissao_escrita: null, details: 'Conta sem campanhas para testar.' });
        const w = await chamar('PUT', `${ADS}/product_ads/campaigns/${c.id}`, { status: c.status });
        await auditLog(supabase, { level: w.ok ? 'info' : 'error', area: 'ads_manage', action, userId: user.id, success: w.ok,
          message: `Teste de escrita (sem efeito) na campanha ${c.id}: HTTP ${w.status}`, meta: { ...baseMeta, api: 'v2', ml_error_body: w.text.substring(0, 1000) } });
        return ok({
          success: true, permissao_escrita: w.ok, ml_status: w.status,
          campanha_testada: { id: c.id, name: c.name, status: c.status },
          details: w.ok ? 'O Mercado Livre aceitou o comando de escrita. A publicidade pode ser gerenciada pelo sistema.'
            : `O Mercado Livre recusou (HTTP ${w.status}): ${w.data?.message || w.text.substring(0, 200)}`,
        });
      }

      case 'list_campaigns': {
        if (!advertiserId) return precisaAnunciante();
        const { erro, todas } = await listarCampanhas();
        if (erro) return falha(erro);
        return ok({ success: true, advertiser_id: advertiserId, campaigns: todas });
      }

      case 'create_campaign': {
        if (!advertiserId) return precisaAnunciante();
        const e = exigir({ name, budget, strategy }); if (e) return e;
        const payload: Record<string, unknown> = {
          name, budget: Number(budget), strategy, status: status || 'active', channel: 'marketplace',
        };
        if (acos_target !== undefined && acos_target !== null && acos_target !== '') payload.acos_target = Number(acos_target);
        const r = await chamar('POST', `${ADS}/advertisers/${advertiserId}/product_ads/campaigns`, payload);
        if (!r.ok) return falha(r);
        await registrar(`Campanha criada: ${name}`, { payload });
        return ok({ success: true, action, campaign: r.data });
      }

      case 'pause_campaign':
      case 'activate_campaign':
      case 'update_campaign': {
        const e = exigir({ campaign_id }); if (e) return e;
        const payload: Record<string, unknown> = {};
        if (action === 'pause_campaign') payload.status = 'paused';
        else if (action === 'activate_campaign') payload.status = 'active';
        else {
          if (name) payload.name = name;
          if (budget !== undefined && budget !== '') payload.budget = Number(budget);
          if (acos_target !== undefined && acos_target !== '') payload.acos_target = Number(acos_target);
          if (strategy) payload.strategy = strategy;
          if (status) payload.status = status;
          if (!Object.keys(payload).length) return ok({ error: 'Nada para alterar' });
        }
        const r = await chamar('PUT', `${ADS}/product_ads/campaigns/${campaign_id}`, payload);
        if (!r.ok) return falha(r);
        const local: Record<string, unknown> = { updated_at: new Date().toISOString() };
        if (payload.status) local.status = payload.status;
        if (payload.name) local.name = payload.name;
        await supabase.from('ads_campaigns').update(local).eq('ml_campaign_id', campaign_id).eq('seller_id', seller_id);
        await registrar(`Campanha ${campaign_id} alterada`, { payload });
        result = { success: true, action, campaign_id, new_status: payload.status, changes: payload };
        break;
      }

      case 'pause_ad':
      case 'activate_ad':
      case 'add_ad':
      case 'move_ad':
      case 'remove_ad': {
        const e = exigir({ item_id }); if (e) return e;
        let payload: Record<string, unknown>;
        if (action === 'pause_ad') payload = { status: 'paused' };
        else if (action === 'activate_ad') payload = { status: 'active' };
        else if (action === 'remove_ad') payload = { campaign_id: 0 }; // tira da campanha (fica ocioso)
        else {
          const e2 = exigir({ campaign_id }); if (e2) return e2;
          payload = { campaign_id: Number(campaign_id) };
        }
        const r = await chamar('PUT', `${ADS}/product_ads/ads/${item_id}?channel=marketplace`, payload);
        if (!r.ok) return falha(r);
        if (action === 'remove_ad') {
          await supabase.from('ads_items').delete().eq('item_id', item_id).eq('seller_id', seller_id);
        } else if (payload.status) {
          await supabase.from('ads_items').update({ status: payload.status, updated_at: new Date().toISOString() })
            .eq('item_id', item_id).eq('seller_id', seller_id);
        }
        await registrar(`Anúncio ${item_id}: ${JSON.stringify(payload)}`, { payload });
        result = { success: true, action, item_id, campaign_id, new_status: payload.status };
        break;
      }

      // Em lote: até 10.000 anúncios; {status} ou {campaign_id} (0 = tirar da campanha)
      case 'bulk_ads': {
        if (!advertiserId) return precisaAnunciante();
        if (!Array.isArray(item_ids) || !item_ids.length) return ok({ error: 'item_ids required' });
        const payload: Record<string, unknown> = {};
        if (status) payload.status = status;
        if (campaign_id !== undefined && campaign_id !== null && campaign_id !== '') payload.campaign_id = Number(campaign_id);
        if (payload.campaign_id === 0) delete payload.status; // a API não aceita os dois juntos
        if (!Object.keys(payload).length) return ok({ error: 'status ou campaign_id required' });
        const r = await chamar('PUT', `${ADS}/advertisers/${advertiserId}/product_ads/ads?channel=marketplace`,
          { target: item_ids.slice(0, 10000), payload });
        if (!r.ok) return falha(r);
        await registrar(`Lote de ${item_ids.length} anúncio(s): ${JSON.stringify(payload)}`, { payload, total: item_ids.length });
        result = { success: true, action, total: item_ids.length, payload, ml_response: r.data };
        break;
      }

      // Só leitura: lê campanhas e anúncios com métricas na API nova e monta recomendações.
      // Não altera nada no Mercado Livre.
      case 'recommendations': {
        if (!advertiserId) return precisaAnunciante();
        const dias = Math.min(Math.max(Number(body.days) || 30, 7), 90);
        const fim = new Date(Date.now() - 86400000); // até ontem (o dia de hoje vem incompleto)
        const ini = new Date(fim.getTime() - (dias - 1) * 86400000);
        const d = (x: Date) => x.toISOString().slice(0, 10);
        const periodo = `date_from=${d(ini)}&date_to=${d(fim)}`;
        const METRICAS = 'clicks,prints,cost,acos,units_quantity,total_amount,organic_units_quantity,organic_units_amount';

        // Campanhas
        const campanhas: any[] = [];
        for (let offset = 0; offset < 1000; offset += 50) {
          const r = await chamar('GET', `${ADS}/advertisers/${advertiserId}/product_ads/campaigns/search?limit=50&offset=${offset}&${periodo}&metrics=${METRICAS},roas`);
          if (!r.ok) return falha(r);
          const lote: any[] = r.data?.results || [];
          campanhas.push(...lote);
          if (lote.length < 50) break;
        }
        // Anúncios (inclui os que estão fora de campanha)
        const anuncios: any[] = [];
        let totalAnuncios = 0;
        for (let offset = 0; offset < 3000; offset += 50) {
          const r = await chamar('GET', `${ADS}/advertisers/${advertiserId}/product_ads/ads/search?limit=50&offset=${offset}&${periodo}&metrics=${METRICAS}`);
          if (!r.ok) { if (offset === 0) return falha(r); break; }
          totalAnuncios = r.data?.paging?.total ?? totalAnuncios;
          const lote: any[] = r.data?.results || [];
          anuncios.push(...lote);
          if (lote.length < 50) break;
        }

        const num = (v: any) => Number(v) || 0;
        const porId = new Map(campanhas.map((c) => [String(c.id), c]));
        const ativas = campanhas.filter((c) => c.status === 'active');
        // Campanha "de escala": ativa, com o maior ACOS objetivo (mais espaço para investir)
        const escala = [...ativas].sort((a, b) => num(b.acos_target) - num(a.acos_target))[0] || null;
        const recs: any[] = [];
        const add = (r: any) => recs.push(r);
        const brl = (v: number) => `R$ ${v.toFixed(2).replace('.', ',')}`;

        for (const c of campanhas) {
          if (c.status !== 'active') continue;
          const m = c.metrics || {};
          const custo = num(m.cost), vendas = num(m.units_quantity), acos = num(m.acos), alvo = num(c.acos_target);
          const orcDia = num(c.daily_budget || c.budget);
          const base = { alvo_tipo: 'campanha', campaign_id: c.id, campanha: c.name, metricas: m, acos_objetivo: alvo, orcamento_dia: orcDia };
          if (custo >= 20 && vendas === 0) {
            add({ ...base, tipo: 'campanha_sem_venda', gravidade: 'alta', titulo: `Campanha "${c.name}" gastou ${brl(custo)} sem vender`,
              motivo: `${num(m.clicks)} cliques e nenhuma venda em ${dias} dias.`,
              sugestao: 'Pausar a campanha ou revisar os anúncios dela (preço, fotos, estoque).',
              comando: { action: 'pause_campaign', campaign_id: c.id } });
          } else if (alvo > 0 && acos > alvo * 1.3 && custo >= 30) {
            add({ ...base, tipo: 'acos_acima', gravidade: 'alta', titulo: `ACOS de "${c.name}" está em ${acos.toFixed(1)}% (objetivo ${alvo}%)`,
              motivo: `Gastou ${brl(custo)} para vender ${brl(num(m.total_amount))}. O ACOS real passou o objetivo em mais de 30%.`,
              sugestao: `Baixar o ACOS objetivo ou tirar da campanha os anúncios que gastam sem vender.`,
              comando: { action: 'update_campaign', campaign_id: c.id, acos_target: Math.max(3, Math.round(alvo * 0.85 * 100) / 100) } });
          } else if (alvo > 0 && vendas >= 3 && acos > 0 && acos <= alvo * 0.6 && orcDia > 0 && custo / dias >= orcDia * 0.85) {
            add({ ...base, tipo: 'orcamento_curto', gravidade: 'oportunidade', titulo: `"${c.name}" vende bem e está usando quase todo o orçamento`,
              motivo: `ACOS ${acos.toFixed(1)}% (objetivo ${alvo}%), ${vendas} vendas. Gasto médio ${brl(custo / dias)}/dia para orçamento de ${brl(orcDia)}/dia.`,
              sugestao: `Aumentar o orçamento diário (sugestão: ${brl(Math.ceil(orcDia * 1.3))}).`,
              comando: { action: 'update_campaign', campaign_id: c.id, budget: Math.ceil(orcDia * 1.3) } });
          } else if (num(m.prints) < 300) {
            add({ ...base, tipo: 'sem_impressao', gravidade: 'media', titulo: `"${c.name}" quase não aparece (${num(m.prints)} impressões)`,
              motivo: `Em ${dias} dias a campanha teve poucas impressões. Costuma ser ACOS objetivo baixo demais, anúncios sem estoque ou poucos anúncios.`,
              sugestao: alvo ? `Subir o ACOS objetivo (sugestão: ${Math.round(alvo * 1.3 * 100) / 100}%) ou conferir estoque dos anúncios.` : 'Conferir estoque e anúncios da campanha.',
              comando: alvo ? { action: 'update_campaign', campaign_id: c.id, acos_target: Math.min(500, Math.round(alvo * 1.3 * 100) / 100) } : null });
          }
        }

        for (const a of anuncios) {
          const m = a.metrics || {};
          const custo = num(m.cost), vendas = num(m.units_quantity), cliques = num(m.clicks), acos = num(m.acos);
          const camp = porId.get(String(a.campaign_id));
          const alvo = num(camp?.acos_target);
          const base = { alvo_tipo: 'anuncio', item_id: a.item_id, titulo_anuncio: a.title, thumbnail: a.thumbnail, permalink: a.permalink,
            campaign_id: a.campaign_id || null, campanha: camp?.name || null, metricas: m, acos_objetivo: alvo || null, status_anuncio: a.status };
          const naCampanha = a.campaign_id && Number(a.campaign_id) !== 0;
          if (a.status === 'active' && naCampanha && custo >= 15 && vendas === 0 && cliques >= 15) {
            add({ ...base, tipo: 'anuncio_sem_venda', gravidade: 'alta', titulo: `Anúncio gastou ${brl(custo)} sem vender`,
              motivo: `${cliques} cliques e nenhuma venda em ${dias} dias${camp ? ` na campanha "${camp.name}"` : ''}.`,
              sugestao: 'Pausar o anúncio na publicidade e revisar preço, fotos e título.',
              comando: { action: 'pause_ad', item_id: a.item_id } });
          } else if (a.status === 'active' && naCampanha && alvo > 0 && acos > alvo * 2 && custo >= 20) {
            add({ ...base, tipo: 'anuncio_acos_alto', gravidade: 'media', titulo: `Anúncio com ACOS ${acos.toFixed(1)}%, o dobro do objetivo (${alvo}%)`,
              motivo: `Gastou ${brl(custo)} e vendeu ${brl(num(m.total_amount))} em ${dias} dias.`,
              sugestao: 'Pausar o anúncio na publicidade ou tirá-lo da campanha.',
              comando: { action: 'pause_ad', item_id: a.item_id } });
          } else if (a.status === 'active' && naCampanha && escala && String(a.campaign_id) !== String(escala.id)
            && vendas >= 3 && alvo > 0 && acos > 0 && acos <= alvo * 0.5 && num(m.prints) < 2000) {
            add({ ...base, tipo: 'mover_escala', gravidade: 'oportunidade', titulo: `Anúncio vende barato e pode ganhar mais exposição`,
              motivo: `ACOS ${acos.toFixed(1)}% com ${vendas} vendas, mas só ${num(m.prints)} impressões.`,
              sugestao: `Mover para a campanha "${escala.name}" (ACOS objetivo ${escala.acos_target}%).`,
              campanha_destino: { id: escala.id, name: escala.name },
              comando: { action: 'move_ad', item_id: a.item_id, campaign_id: escala.id } });
          } else if (!naCampanha && num(m.organic_units_quantity) >= 5 && escala) {
            add({ ...base, tipo: 'fora_de_campanha', gravidade: 'oportunidade', titulo: `Anúncio vende sozinho e está fora da publicidade`,
              motivo: `${num(m.organic_units_quantity)} vendas orgânicas em ${dias} dias, sem campanha.`,
              sugestao: `Adicionar à campanha "${escala.name}".`,
              campanha_destino: { id: escala.id, name: escala.name },
              comando: { action: 'add_ad', item_id: a.item_id, campaign_id: escala.id } });
          }
        }

        const ordem: Record<string, number> = { alta: 0, media: 1, oportunidade: 2 };
        recs.sort((x, y) => (ordem[x.gravidade] - ordem[y.gravidade]) || (num(y.metricas?.cost) - num(x.metricas?.cost)));
        const soma = (k: string) => campanhas.reduce((s, c) => s + num(c.metrics?.[k]), 0);
        return ok({
          success: true, advertiser_id: advertiserId, periodo: { de: d(ini), ate: d(fim), dias },
          resumo: {
            campanhas: campanhas.length, campanhas_ativas: ativas.length,
            anuncios_lidos: anuncios.length, anuncios_total: totalAnuncios,
            custo: soma('cost'), vendas_ads: soma('total_amount'), unidades_ads: soma('units_quantity'),
          },
          campanhas: campanhas.map((c) => ({ id: c.id, name: c.name, status: c.status, acos_target: c.acos_target,
            budget: c.daily_budget || c.budget, strategy: c.strategy, metrics: c.metrics })),
          recomendacoes: recs,
        });
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
