// listing-exams — "exames" da Radiografia v2. Guarda por anúncio e por dia, sem perder histórico.
//
// collect {sellerId, cursor}: na 1ª chamada (cursor 0) lista no ML os anúncios ativos e pausados
//   e guarda a lista em listing_exam_runs. Cada chamada processa um lote:
//   - estado atual (preço, preço original, estoque, status, qualidade `health`, idade) → listing_exam_items
//   - visitas por dia (time_window): 150 dias na 1ª vez; depois só os dias que faltam → listing_daily_metrics
//   Devolve next_cursor; a tela chama de novo até done = true.
// claims {sellerId}: reclamações dos últimos 120 dias, ligadas ao anúncio pelo pedido → listing_claims
// GET ?version → diagnóstico de publicação.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const VERSION = 'listing-exams-v1';
const ML = 'https://api.mercadolibre.com';
const LOTE = 100;          // anúncios por chamada (~20-40 s)
const CONCORRENCIA = 8;
const DIAS_BACKFILL = 150;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};
const json = (o: unknown, status = 200) =>
  new Response(JSON.stringify(o), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const hojeUTC = () => new Date().toISOString().slice(0, 10);

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method === 'GET' && new URL(req.url).searchParams.has('version')) {
    return json({ fn: 'listing-exams', version: VERSION });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) return json({ error: 'Unauthorized' }, 401);
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(authHeader.replace('Bearer ', ''));
    if (claimsError || !claimsData?.claims) return json({ error: 'Unauthorized' }, 401);
    const userId = claimsData.claims.sub as string;
    const admin = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');

    const { assertMlApiAccess } = await import("../_shared/ml-api-gate.ts");
    const gate = await assertMlApiAccess(admin, userId);
    if (!gate.allowed) return gate.response!;

    const body = await req.json();
    const { action } = body;
    const sellerId = String(body.sellerId || '');
    if (!sellerId) return json({ ok: false, error: 'sellerId obrigatório' });

    // ── Token da conta (só se for do usuário) ──
    const { data: acc } = await supabase.from('ml_accounts').select('*')
      .eq('user_id', userId).eq('is_active', true).eq('ml_user_id', sellerId).limit(1).maybeSingle();
    if (!acc) return json({ ok: false, error: 'Conta não conectada ao seu usuário' });
    let token: string = acc.access_token;
    if (new Date(acc.token_expires_at) <= new Date(Date.now() + 60_000)) {
      const r = await fetch(`${ML}/oauth/token`, {
        method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'refresh_token', client_id: Deno.env.get('ML_APP_ID') || '',
          client_secret: Deno.env.get('ML_SECRET_KEY') || '', refresh_token: acc.refresh_token,
        }),
      });
      if (!r.ok) return json({ ok: false, error: 'Não consegui renovar o acesso da conta. Reconecte a conta.' });
      const d = await r.json();
      token = d.access_token;
      const exp = new Date(); exp.setSeconds(exp.getSeconds() + d.expires_in);
      await supabase.from('ml_accounts').update({
        access_token: d.access_token, refresh_token: d.refresh_token, token_expires_at: exp.toISOString(),
      }).eq('id', acc.id);
    }

    const getML = async (path: string) => {
      let r = await fetch(`${ML}${path}`, { headers: { Authorization: `Bearer ${token}` } });
      if (r.status === 429) { await sleep(3000); r = await fetch(`${ML}${path}`, { headers: { Authorization: `Bearer ${token}` } }); }
      const d = await r.json().catch(() => null);
      return { ok: r.ok, status: r.status, data: d };
    };

    // ════════════════ collect ════════════════
    if (action === 'collect') {
      let cursor = Number(body.cursor) || 0;
      let lista: string[];

      if (cursor === 0) {
        // Lista ativos + pausados (scan não tem limite de 1.000)
        lista = [];
        for (const status of ['active', 'paused']) {
          let scroll: string | null = null;
          for (let p = 0; p < 200; p++) {
            const s = await getML(`/users/${sellerId}/items/search?search_type=scan&limit=100&status=${status}` +
              (scroll ? `&scroll_id=${encodeURIComponent(scroll)}` : ''));
            if (!s.ok) break;
            const ids: string[] = s.data?.results || [];
            scroll = s.data?.scroll_id || null;
            if (!ids.length) break;
            lista.push(...ids);
            if (!scroll) break;
          }
        }
        lista = [...new Set(lista)];
        await admin.from('listing_exam_runs').upsert({
          seller_id: sellerId, item_ids: lista, total: lista.length, last_cursor: 0,
          started_at: new Date().toISOString(), finished_at: null,
        });
      } else {
        const { data: run } = await admin.from('listing_exam_runs').select('item_ids').eq('seller_id', sellerId).maybeSingle();
        lista = (run?.item_ids as string[]) || [];
      }

      const lote = lista.slice(cursor, cursor + LOTE);
      const hoje = hojeUTC();

      // 1. Estado atual (multiget de 20)
      const linhas: any[] = [];
      for (let i = 0; i < lote.length; i += 20) {
        const ids = lote.slice(i, i + 20);
        const m = await getML(`/items?ids=${ids.join(',')}&attributes=id,title,thumbnail,secure_thumbnail,permalink,status,price,original_price,available_quantity,sold_quantity,health,listing_type_id,shipping,catalog_listing,user_product_id,date_created`);
        if (!m.ok || !Array.isArray(m.data)) continue;
        for (const e of m.data) {
          if (e.code !== 200 || !e.body) continue;
          const it = e.body;
          linhas.push({
            seller_id: sellerId, item_id: it.id, title: it.title, thumbnail: it.secure_thumbnail || it.thumbnail,
            permalink: it.permalink, status: it.status, price: it.price, original_price: it.original_price ?? null,
            available_quantity: it.available_quantity, sold_quantity: it.sold_quantity,
            health: typeof it.health === 'number' ? it.health : null, listing_type_id: it.listing_type_id,
            logistic_type: it.shipping?.logistic_type ?? null, free_shipping: !!it.shipping?.free_shipping,
            catalog_listing: !!it.catalog_listing, user_product_id: it.user_product_id ?? null,
            date_created: it.date_created ?? null, updated_at: new Date().toISOString(),
          });
        }
      }
      if (linhas.length) await admin.from('listing_exam_items').upsert(linhas);

      // 2. Visitas por dia: só o que falta
      const { data: ultimos } = await admin.rpc('listing_last_visit_day', { p_seller: sellerId, p_items: lote });
      const ultimoPor = new Map<string, string>((ultimos || []).map((u: any) => [u.item_id, u.last_day]));
      let diasGravados = 0; let falhas = 0;

      for (let i = 0; i < lote.length; i += CONCORRENCIA) {
        const fatia = lote.slice(i, i + CONCORRENCIA);
        const res = await Promise.all(fatia.map(async (itemId) => {
          const ult = ultimoPor.get(itemId);
          // inclui sempre ontem e hoje (o dia corrente ainda está mudando)
          const dias = ult
            ? Math.min(DIAS_BACKFILL, Math.max(2, Math.ceil((Date.parse(hoje) - Date.parse(ult)) / 86400000) + 1))
            : DIAS_BACKFILL;
          const v = await getML(`/items/${itemId}/visits/time_window?last=${dias}&unit=day`);
          if (!v.ok || !Array.isArray(v.data?.results)) return { itemId, rows: null };
          return {
            itemId,
            rows: v.data.results
              .filter((d: any) => d.date)
              .map((d: any) => ({ seller_id: sellerId, item_id: itemId, day: String(d.date).slice(0, 10), visits: Number(d.total) || 0 })),
          };
        }));
        const rows = res.flatMap((r) => r.rows || []);
        falhas += res.filter((r) => !r.rows).length;
        if (rows.length) {
          await admin.from('listing_daily_metrics').upsert(rows.map((r) => ({ ...r, collected_at: new Date().toISOString() })));
          diasGravados += rows.length;
        }
        await sleep(120);
      }

      const next = cursor + lote.length;
      const done = next >= lista.length;
      await admin.from('listing_exam_runs').update({
        last_cursor: next, ...(done ? { finished_at: new Date().toISOString() } : {}),
      }).eq('seller_id', sellerId);

      return json({ ok: true, total: lista.length, processed: next, next_cursor: done ? null : next, done,
        itens_atualizados: linhas.length, dias_de_visita: diasGravados, falhas_visitas: falhas });
    }

    // ════════════════ claims ════════════════
    if (action === 'claims') {
      const desde = new Date(Date.now() - 120 * 86400000).toISOString();
      const todas: any[] = [];
      let erro: string | null = null;
      for (let offset = 0; offset < 1000; offset += 50) {
        const r = await getML(`/post-purchase/v1/claims/search?player_role=respondent&player_user_id=${sellerId}` +
          `&range=date_created:after:${encodeURIComponent(desde)}&limit=50&offset=${offset}&sort=date_created:desc`);
        if (!r.ok) { erro = `HTTP ${r.status}: ${r.data?.message || r.data?.error || ''}`; break; }
        const dados: any[] = r.data?.data || r.data?.results || [];
        todas.push(...dados);
        const total = Number(r.data?.paging?.total ?? dados.length);
        if (dados.length < 50 || offset + 50 >= total) break;
      }

      let gravadas = 0;
      if (todas.length) {
        const pedidos = [...new Set(todas.map((c) => String(c.resource_id || '')).filter(Boolean))];
        const { data: itens } = await admin.from('meli_order_items_cache')
          .select('order_id, item_id').eq('seller_id', sellerId).in('order_id', pedidos);
        const itemDoPedido = new Map<string, string>((itens || []).map((i: any) => [String(i.order_id), i.item_id]));
        const linhas = todas.map((c) => ({
          claim_id: String(c.id), seller_id: sellerId, order_id: c.resource_id ? String(c.resource_id) : null,
          item_id: itemDoPedido.get(String(c.resource_id)) ?? null, reason_id: c.reason_id ?? null,
          status: c.status ?? null, stage: c.stage ?? null, type: c.type ?? null,
          date_created: c.date_created ?? null, updated_at: new Date().toISOString(),
        }));
        await admin.from('listing_claims').upsert(linhas);
        gravadas = linhas.length;
      }
      await admin.from('listing_exam_runs').update({ claims_at: new Date().toISOString(), claims_error: erro })
        .eq('seller_id', sellerId);
      return json({ ok: !erro || gravadas > 0, reclamacoes: gravadas, error: erro });
    }

    return json({ error: 'Invalid action' }, 400);
  } catch (error) {
    console.error('[listing-exams] Error:', error);
    return json({ ok: false, error: String(error) }, 500);
  }
});
