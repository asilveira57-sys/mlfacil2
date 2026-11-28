// Magalu Open API — login do vendedor, chamadas e renovação de token (28/nov/2026).
// Doc: https://developers.magalu.com (OAuth 2.0 Authorization Code via ID Magalu).
// O app (client OAuth) é criado pelo IDM CLI, não por portal web. Um client só pode
// ter vários audiences (api.magalu.com, api-sandbox.magalu.com, services.magalu.com).
//
// Segredos (Lovable Cloud → Secrets):
//   MAGALU_CLIENT_ID      Client ID gerado pelo `idm client create`
//   MAGALU_CLIENT_SECRET  Client Secret (aparece UMA vez no idm; NUNCA no código nem no chat)
//   MAGALU_AMBIENTE       opcional: 'teste' (padrão, api-sandbox) ou 'producao' (api.magalu.com)
//   MAGALU_API_HOST       opcional: força outro host de API
//   MAGALU_REDIRECT       opcional. Padrão https://www.mktpfacil.com/magalu/callback
//   MAGALU_SCOPES         opcional: escopos pedidos no link (separados por espaço)

export const MAGALU_AMBIENTE = Deno.env.get('MAGALU_AMBIENTE') || 'teste';
export const MAGALU_API = (Deno.env.get('MAGALU_API_HOST')
  || (MAGALU_AMBIENTE === 'producao' ? 'https://api.magalu.com' : 'https://api-sandbox.magalu.com')).replace(/\/$/, '');
export const MAGALU_REDIRECT = Deno.env.get('MAGALU_REDIRECT') || 'https://www.mktpfacil.com/magalu/callback';
const ID_MAGALU = 'https://id.magalu.com';
const CLIENT_ID = Deno.env.get('MAGALU_CLIENT_ID') || '';
const CLIENT_SECRET = Deno.env.get('MAGALU_CLIENT_SECRET') || '';

// Escopos da primeira fase: identificar a loja, ler anúncios/preço/estoque e operar pedidos,
// entrega e etiqueta. Escrita em anúncio fica para depois (pedir com `idm client add-scope`).
// open:portfolio:read é obrigatório: sem ele GET /seller/v1/portfolios/me responde 401.
export const MAGALU_SCOPES = Deno.env.get('MAGALU_SCOPES') || [
  'open:portfolio:read',
  'open:portfolio-skus-seller:read',
  'open:portfolio-prices-seller:read',
  'open:portfolio-stocks-seller:read',
  'open:order-order-seller:read',
  'open:order-delivery-seller:read',
  'open:order-delivery-seller:write',
  'open:order-logistics-seller:read',
  'open:order-logistics-seller:write',
  'open:order-invoice-seller:read',
].join(' ');

export const magaluConfigurada = () => !!CLIENT_ID && !!CLIENT_SECRET;

/** Link do ID Magalu onde o vendedor faz login com a conta PJ e escolhe a loja. */
export function urlConsentimento(state: string): string {
  const q = new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: MAGALU_REDIRECT,
    scope: MAGALU_SCOPES,
    response_type: 'code',
    choose_tenants: 'true',          // o vendedor escolhe qual loja autoriza
    state,
  });
  return `${ID_MAGALU}/login?${q.toString()}`;
}

type Tokens = { access_token: string; refresh_token: string; expires_in?: number; scope?: string };

/** Troca o code (vale 10 min, uso único) pelos tokens. A troca é em JSON. */
export async function trocarCode(code: string) {
  const r = await fetch(`${ID_MAGALU}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ grant_type: 'authorization_code', client_id: CLIENT_ID, client_secret: CLIENT_SECRET, redirect_uri: MAGALU_REDIRECT, code }),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok || !data?.access_token) return { ok: false as const, erro: data?.error_description || data?.error || `HTTP ${r.status}`, data };
  return { ok: true as const, tokens: data as Tokens };
}

/** Renova o access token. A renovação é em form-urlencoded (diferente da troca). */
async function renovar(refreshToken: string) {
  const r = await fetch(`${ID_MAGALU}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'refresh_token', client_id: CLIENT_ID, client_secret: CLIENT_SECRET, refresh_token: refreshToken }),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok || !data?.access_token) return { ok: false as const, erro: data?.error_description || data?.error || `HTTP ${r.status}` };
  return { ok: true as const, tokens: data as Tokens };
}

/** Chamada autenticada na API da Magalu. tenantId vai no header x-tenant-id quando informado. */
export async function chamarMagalu(method: 'GET' | 'POST' | 'PUT' | 'PATCH', path: string, accessToken: string,
  opts: { query?: Record<string, string | number>; body?: unknown; tenantId?: string; host?: string } = {}) {
  const q = opts.query ? `?${new URLSearchParams(Object.entries(opts.query).map(([k, v]) => [k, String(v)])).toString()}` : '';
  const headers: Record<string, string> = { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' };
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
  if (opts.tenantId) headers['x-tenant-id'] = opts.tenantId;
  const r = await fetch(`${opts.host || MAGALU_API}${path}${q}`, {
    method, headers, body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  });
  const text = await r.text();
  let data: any = null; try { data = JSON.parse(text); } catch { /* texto */ }
  const erro = r.ok ? null : (data?.message || data?.error || data?.detail || text.slice(0, 300) || `HTTP ${r.status}`);
  return { ok: r.ok, status: r.status, data, erro };
}

/** Lê os claims do JWT sem validar (só para achar o tenant se /portfolios/me falhar). */
function claimsJwt(token: string): Record<string, any> {
  try {
    const p = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(atob(p + '='.repeat((4 - (p.length % 4)) % 4)));
  } catch { return {}; }
}

/**
 * Descobre qual loja o vendedor autorizou. A resposta do token NÃO traz a loja:
 * o caminho oficial é GET /seller/v1/portfolios/me (tenant.id e seller.name).
 * Plano B: claims do JWT (nomes variam; guardamos o que achar).
 */
export async function identificarLoja(accessToken: string) {
  const me = await chamarMagalu('GET', '/seller/v1/portfolios/me', accessToken);
  if (me.ok && me.data?.tenant?.id) {
    return { tenantId: String(me.data.tenant.id), nome: me.data?.seller?.name ?? me.data?.tenant?.name ?? null, origem: 'portfolios/me', erro: null };
  }
  const c = claimsJwt(accessToken);
  const tenant = c.tenant_id || c.tenant?.id || c['https://magalu.com/tenant_id'] || c.tenants?.[0]?.uuid || c.tenants?.[0]?.id || c.sub;
  return { tenantId: tenant ? String(tenant) : null, nome: c.tenant?.name || c.name || null, origem: 'jwt', erro: me.erro };
}

/** Devolve um access_token válido, renovando se faltar menos de 10 min. A Magalu troca o refresh a cada renovação. */
export async function tokenValido(supabase: any, conta: any): Promise<string | null> {
  const expira = conta.token_expires_at ? new Date(conta.token_expires_at).getTime() : 0;
  if (conta.access_token && expira - Date.now() > 10 * 60 * 1000) return conta.access_token;
  if (!conta.refresh_token) return null;
  const r = await renovar(conta.refresh_token);
  if (!r.ok) {
    await supabase.from('magalu_accounts').update({ status: 'expirada', ultimo_erro: r.erro, updated_at: new Date().toISOString() })
      .eq('id', conta.id);
    return null;
  }
  await supabase.from('magalu_accounts').update({
    access_token: r.tokens.access_token,
    refresh_token: r.tokens.refresh_token || conta.refresh_token,   // se não vier refresh novo, mantém o antigo
    token_expires_at: new Date(Date.now() + (r.tokens.expires_in || 7200) * 1000).toISOString(),
    status: 'conectada', ultimo_erro: null, updated_at: new Date().toISOString(),
  }).eq('id', conta.id);
  return r.tokens.access_token;
}
