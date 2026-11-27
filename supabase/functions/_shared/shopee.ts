// Shopee Open Platform v2 — assinatura, chamadas e renovação de token (27/nov/2026).
// Segredos (Lovable Cloud → Secrets):
//   SHOPEE_PARTNER_ID   Partner ID do app (teste: 1256118)
//   SHOPEE_PARTNER_KEY  Partner Key do app (NUNCA no código nem no chat)
//   SHOPEE_HOST         opcional. Padrão: Sandbox v2 https://openplatform.sandbox.test-stable.shopee.sg
//                       (o host antigo partner.test-stable.shopeemobile.com devolve "Wrong sign" para apps novos)
//                       Produção global: https://partner.shopeemobile.com (Brasil: conferir no Go-Live)
//   SHOPEE_AMBIENTE     opcional: 'teste' (padrão) ou 'producao'
// Assinatura: hex(HMAC-SHA256(partner_key, base)), base =
//   público: partner_id + path + timestamp
//   loja:    partner_id + path + timestamp + access_token + shop_id

export const SHOPEE_HOST = (Deno.env.get('SHOPEE_HOST') || 'https://openplatform.sandbox.test-stable.shopee.sg').replace(/\/$/, '');
export const SHOPEE_AMBIENTE = Deno.env.get('SHOPEE_AMBIENTE') || 'teste';
const PARTNER_ID = Deno.env.get('SHOPEE_PARTNER_ID') || '';
const PARTNER_KEY = Deno.env.get('SHOPEE_PARTNER_KEY') || '';

export const shopeeConfigurada = () => !!PARTNER_ID && !!PARTNER_KEY;
export const partnerId = () => Number(PARTNER_ID);

async function hmac(base: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(PARTNER_KEY),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(base));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Monta a URL assinada de um endpoint. Com accessToken+shopId vira chamada de loja. */
export async function urlAssinada(path: string, extra: Record<string, string | number> = {},
  accessToken?: string, shopId?: number | string): Promise<string> {
  const ts = Math.floor(Date.now() / 1000);
  const base = `${PARTNER_ID}${path}${ts}${accessToken ?? ''}${shopId ?? ''}`;
  const sign = await hmac(base);
  const q = new URLSearchParams({ partner_id: PARTNER_ID, timestamp: String(ts), sign });
  if (accessToken) q.set('access_token', accessToken);
  if (shopId !== undefined) q.set('shop_id', String(shopId));
  for (const [k, v] of Object.entries(extra)) q.set(k, String(v));
  return `${SHOPEE_HOST}${path}?${q.toString()}`;
}

export async function chamarShopee(method: 'GET' | 'POST', path: string, opts: {
  query?: Record<string, string | number>; body?: unknown; accessToken?: string; shopId?: number | string;
} = {}) {
  const url = await urlAssinada(path, opts.query, opts.accessToken, opts.shopId);
  const r = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  });
  const text = await r.text();
  let data: any = null; try { data = JSON.parse(text); } catch { /* texto */ }
  // A Shopee responde 200 com { error: "...", message: "..." } quando falha
  const erro = !r.ok || (data?.error && data.error !== '') ? (data?.message || data?.error || text.slice(0, 300)) : null;
  return { ok: !erro, status: r.status, data, erro };
}

/** Devolve um access_token válido da loja, renovando se faltar menos de 10 min. */
export async function tokenValido(supabase: any, conta: any): Promise<string | null> {
  const expira = conta.token_expires_at ? new Date(conta.token_expires_at).getTime() : 0;
  if (conta.access_token && expira - Date.now() > 10 * 60 * 1000) return conta.access_token;
  if (!conta.refresh_token) return null;
  const r = await chamarShopee('POST', '/api/v2/auth/access_token/get', {
    body: { refresh_token: conta.refresh_token, shop_id: Number(conta.shop_id), partner_id: partnerId() },
  });
  if (!r.ok || !r.data?.access_token) {
    await supabase.from('shopee_accounts').update({ status: 'expirada', ultimo_erro: r.erro, updated_at: new Date().toISOString() })
      .eq('id', conta.id);
    return null;
  }
  await supabase.from('shopee_accounts').update({
    access_token: r.data.access_token,
    refresh_token: r.data.refresh_token,               // a Shopee troca o refresh a cada renovação
    token_expires_at: new Date(Date.now() + (r.data.expire_in || 14400) * 1000).toISOString(),
    refresh_expires_at: new Date(Date.now() + 30 * 86400000).toISOString(),
    status: 'conectada', ultimo_erro: null, updated_at: new Date().toISOString(),
  }).eq('id', conta.id);
  return r.data.access_token;
}

/** Igual a chamarShopee, mas devolve o arquivo (PDF da etiqueta). Se vier JSON é erro. */
export async function baixarShopee(path: string, body: unknown, accessToken: string, shopId: number | string) {
  const url = await urlAssinada(path, {}, accessToken, shopId);
  const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const tipo = r.headers.get('content-type') || '';
  if (tipo.includes('json')) {
    const data = await r.json().catch(() => ({}));
    return { ok: false, erro: data?.message || data?.error || `HTTP ${r.status}`, bytes: null as Uint8Array | null, tipo };
  }
  return { ok: r.ok, erro: r.ok ? null : `HTTP ${r.status}`, bytes: new Uint8Array(await r.arrayBuffer()), tipo };
}
