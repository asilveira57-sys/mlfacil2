// ml-item-clone — clona UM anúncio de uma conta do usuário para outra.
//
// Por que existe (substitui a mktpfacil-clone, que nunca funcionou):
// 1. PolicyAgent 403: o ML não deixa mais ler /items sem token, nem com o token
//    de outra conta. Aqui o anúncio de origem é SEMPRE lido com o token da
//    conta dona dele (a "conta de origem" escolhida na tela).
// 2. "The fields [title] are invalid": contas no modelo User Products
//    (tag user_product_seller) não aceitam `title` no POST — exigem
//    `family_name` e montam o título sozinhas a partir dos ATRIBUTOS.
//    Por isso copiamos todos os atributos da origem.
//
// Ações: load (só leitura) · clone (cria o anúncio). GET ?version para diagnóstico.
// clone com recadastrar = true: MESMA conta. Cria o novo (MLB/MLBU novos) e só então
// finaliza o antigo. Se o ML recusar por duplicado, pausa o antigo e tenta de novo;
// se ainda falhar, reativa o antigo — o vendedor nunca fica sem anúncio.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const VERSION = 'item-clone-v4';
const ML = 'https://api.mercadolibre.com';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};
const json = (o: unknown, status = 200) =>
  new Response(JSON.stringify(o), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

// Atributos que o ML calcula sozinho ou que não podem ser enviados na criação
// (validado em /items/validate em 26/nov: o ML ignora os PACKAGE_* etc. com aviso)
const ATRIBUTOS_IGNORADOS = new Set([
  'ITEM_CONDITION', // vai em `condition`
  'PACKAGE_HEIGHT', 'PACKAGE_LENGTH', 'PACKAGE_WEIGHT', 'PACKAGE_WIDTH',
  'PRODUCT_FEATURES', 'SHIPMENT_PACKING', 'UNITS_PER_PACKAGE',
]);

// Manda value_id E value_name: valores personalizados da conta (marca, modelo,
// cor) têm value_id que não resolve em outro anúncio — sem o nome, o ML recusa.
// Variação → "Cor: Branco · Tamanho: G"
const nomeVariacao = (v: any) =>
  (v.attribute_combinations || []).map((c: any) => `${c.name}: ${c.value_name}`).join(' · ') || `Variação ${v.id}`;

const termo = (a: any) => {
  const o: Record<string, unknown> = { id: a.id };
  if (a.value_id) o.value_id = a.value_id;
  if (a.value_name) o.value_name = a.value_name;
  return o;
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method === 'GET' && new URL(req.url).searchParams.has('version')) {
    return json({ fn: 'ml-item-clone', version: VERSION });
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

    const supabaseAdmin = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');

    const { assertMlApiAccess } = await import("../_shared/ml-api-gate.ts");
    const gate = await assertMlApiAccess(supabaseAdmin, userId);
    if (!gate.allowed) return gate.response!;

    const body = await req.json();
    const { action } = body;

    // ── Token de uma conta do usuário (renova se vencido) ──
    const tokenDa = async (sellerId: string): Promise<string> => {
      const { data: acc } = await supabase.from('ml_accounts').select('*')
        .eq('user_id', userId).eq('is_active', true).eq('ml_user_id', String(sellerId)).limit(1).maybeSingle();
      if (!acc) throw new Error(`Conta ${sellerId} não está conectada ao seu usuário`);
      if (new Date(acc.token_expires_at) > new Date(Date.now() + 60_000)) return acc.access_token;
      const r = await fetch(`${ML}/oauth/token`, {
        method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'refresh_token', client_id: Deno.env.get('ML_APP_ID') || '',
          client_secret: Deno.env.get('ML_SECRET_KEY') || '', refresh_token: acc.refresh_token,
        }),
      });
      if (!r.ok) throw new Error(`Não consegui renovar o acesso da conta ${acc.nickname || sellerId}. Reconecte a conta.`);
      const d = await r.json();
      const exp = new Date(); exp.setSeconds(exp.getSeconds() + d.expires_in);
      await supabase.from('ml_accounts').update({
        access_token: d.access_token, refresh_token: d.refresh_token, token_expires_at: exp.toISOString(),
      }).eq('id', acc.id);
      return d.access_token;
    };

    const getML = async (path: string, token: string) => {
      const r = await fetch(`${ML}${path}`, { headers: { Authorization: `Bearer ${token}` } });
      const d = await r.json().catch(() => null);
      return { ok: r.ok, status: r.status, data: d };
    };

    // ── Lê o anúncio de origem (MLB… ou MLBU…) com o token da conta dona ──
    const lerOrigem = async (originSellerId: string, codigo: string) => {
      const token = await tokenDa(originSellerId);
      let id = String(codigo || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
      if (!/^MLBU?\d+$/.test(id)) throw new Error('Código inválido. Use MLB123… ou MLBU123…');

      if (id.startsWith('MLBU')) {
        const s = await getML(`/users/${originSellerId}/items/search?user_product_id=${id}`, token);
        const ids: string[] = s.data?.results || [];
        if (!s.ok || ids.length === 0) throw new Error(`Nenhum anúncio do ${id} nesta conta de origem`);
        id = ids[0];
      }

      const it = await getML(`/items/${id}?include_attributes=all`, token);
      if (it.status === 403 || it.status === 404) {
        throw new Error(`O anúncio ${id} não pertence à conta de origem escolhida (ou não existe). Confira a conta de origem.`);
      }
      if (!it.ok) throw new Error(`Falha ao ler ${id}: ${it.data?.message || it.status}`);
      if (String(it.data.seller_id) !== String(originSellerId)) {
        throw new Error(`O anúncio ${id} é de outra conta. Escolha a conta dona dele como origem.`);
      }
      const desc = await getML(`/items/${id}/description`, token);
      return { item: it.data, descricao: desc.ok ? (desc.data?.plain_text || '') : '' };
    };

    const ehUserProductSeller = async (sellerId: string, token: string) => {
      const u = await getML(`/users/${sellerId}`, token);
      return Array.isArray(u.data?.tags) && u.data.tags.includes('user_product_seller');
    };

    // ════════════════════════ ACTION: load ════════════════════════
    if (action === 'load') {
      const { originSellerId, destSellerId, codigo } = body;
      try {
        const { item, descricao } = await lerOrigem(originSellerId, codigo);
        let destinoUP: boolean | null = null;
        if (destSellerId) {
          try { destinoUP = await ehUserProductSeller(destSellerId, await tokenDa(destSellerId)); } catch { destinoUP = null; }
        }
        const avisos: string[] = [];
        if (Array.isArray(item.variations) && item.variations.length > 0) {
          avisos.push(`Tem ${item.variations.length} variações. Não é possível duplicar as variações: o novo anúncio é criado sem variação, a partir da variação escolhida.`);
        }
        if (item.shipping?.logistic_type === 'fulfillment') {
          avisos.push('A origem está no Full. O clone nasce como Mercado Envios normal (o Full é por conta).');
        }
        if (item.catalog_listing) avisos.push('A origem é de catálogo. O novo é criado como anúncio comum, na mesma categoria, sem catálogo.');
        return json({
          ok: true,
          preview: {
            id: item.id, titulo: item.title, familyName: item.family_name ?? null,
            userProductId: item.user_product_id ?? null, preco: item.price, moeda: item.currency_id,
            estoque: item.available_quantity, categoria: item.category_id, tipo: item.listing_type_id,
            condicao: item.condition, status: item.status, permalink: item.permalink,
            fotos: (item.pictures || []).map((p: any) => p.secure_url || p.url),
            atributos: (item.attributes || []).filter((a: any) => a.value_name).length,
            temVariacoes: Array.isArray(item.variations) && item.variations.length > 0,
            variacoes: (item.variations || []).map((v: any) => ({
              id: String(v.id), nome: nomeVariacao(v), preco: v.price, estoque: v.available_quantity,
            })),
            freteGratis: !!item.shipping?.free_shipping, garantia: (item.sale_terms || [])
              .find((t: any) => t.id === 'WARRANTY_TIME')?.value_name ?? null,
            temDescricao: descricao.length > 0,
          },
          destinoUP, avisos,
        });
      } catch (e) {
        return json({ ok: false, error: (e as Error).message });
      }
    }

    // ════════════════════════ ACTION: clone ════════════════════════
    if (action === 'clone') {
      const { originSellerId, codigo, overrides = {}, validar = false, recadastrar = false } = body;
      const destSellerId = recadastrar ? originSellerId : body.destSellerId;
      if (!originSellerId || !destSellerId) return json({ ok: false, error: 'Escolha a conta de origem e a de destino' });
      if (!recadastrar && String(originSellerId) === String(destSellerId)) {
        return json({ ok: false, error: 'Origem e destino são a mesma conta. Para refazer o anúncio na mesma conta, use Recadastrar.' });
      }

      let item: any; let descricao = '';
      try { ({ item, descricao } = await lerOrigem(originSellerId, codigo)); }
      catch (e) { return json({ ok: false, error: (e as Error).message }); }
      // Variações: não dá para duplicar; o novo nasce SEM variação, a partir da escolhida (padrão: a 1ª)
      const variacoes: any[] = Array.isArray(item.variations) ? item.variations : [];
      const variacao: any = variacoes.length
        ? (variacoes.find((v) => String(v.id) === String(overrides.variacaoId)) || variacoes[0])
        : null;
      if (recadastrar) {
        if (item.shipping?.logistic_type === 'fulfillment' || item.inventory_id) {
          return json({ ok: false, error: 'Anúncio no Full: o estoque está preso a este anúncio. Recadastro bloqueado.' });
        }
        if (!['active', 'paused'].includes(item.status)) {
          return json({ ok: false, error: `O anúncio está "${item.status}". Só dá para recadastrar ativo ou pausado.` });
        }
      }

      let destToken: string;
      try { destToken = await tokenDa(destSellerId); }
      catch (e) { return json({ ok: false, error: (e as Error).message }); }
      const destinoUP = await ehUserProductSeller(destSellerId, destToken);

      // ── Monta o anúncio novo a partir da origem (e, se houver, de UMA variação) ──
      const nome = String(overrides.titulo || '').trim();
      const saleTerms = (item.sale_terms || []).map(termo);
      const montar = (v: any, usarOverrides: boolean): Record<string, unknown> => {
        const atributos = (item.attributes || [])
          .filter((a: any) => !ATRIBUTOS_IGNORADOS.has(a.id) && (a.value_id || a.value_name))
          .map(termo);
        if (v) {
          // A combinação da variação (ex.: Cor) e o SKU dela viram atributos do anúncio novo
          for (const a of [...(v.attribute_combinations || []), ...(v.attributes || [])]) {
            if (!a?.id || ATRIBUTOS_IGNORADOS.has(a.id) || !(a.value_id || a.value_name)) continue;
            const i = atributos.findIndex((x: any) => x.id === a.id);
            if (i >= 0) atributos[i] = termo(a); else atributos.push(termo(a));
          }
        }
        // Fotos: as da variação primeiro; se não tiver, todas
        const fotosVar = v?.picture_ids?.length
          ? (item.pictures || []).filter((p: any) => v.picture_ids.includes(p.id)) : [];
        const fotos = (fotosVar.length ? fotosVar : (item.pictures || [])).map((p: any) => ({ source: p.secure_url || p.url }));
        const precoBase = v?.price ?? item.price;
        const estoqueBase = v ? v.available_quantity : item.available_quantity;
        const p: Record<string, unknown> = {
          category_id: item.category_id,
          price: usarOverrides && Number(overrides.preco) > 0 ? Number(overrides.preco) : precoBase,
          currency_id: item.currency_id || 'BRL',
          available_quantity: usarOverrides && Number.isInteger(Number(overrides.estoque)) && Number(overrides.estoque) > 0
            ? Number(overrides.estoque) : Math.max(1, estoqueBase || 1),
          buying_mode: item.buying_mode || 'buy_it_now',
          listing_type_id: overrides.tipo || item.listing_type_id,
          condition: item.condition || 'new',
          pictures: fotos,
          attributes: atributos,
          sale_terms: saleTerms,
          shipping: { mode: 'me2', local_pick_up: !!item.shipping?.local_pick_up, free_shipping: !!item.shipping?.free_shipping },
        };
        if (item.video_id) p.video_id = item.video_id;
        if (Array.isArray(item.channels) && item.channels.length) p.channels = item.channels;
        // Modelo User Products: family_name (o ML monta o título com a cor/tamanho). Modelo antigo: title.
        if (destinoUP) p.family_name = nome || item.family_name || item.title;
        else {
          const base = nome || item.title;
          const extra = v ? (v.attribute_combinations || []).map((c: any) => c.value_name).filter(Boolean).join(' ') : '';
          p.title = (extra && !base.toLowerCase().includes(extra.toLowerCase()) ? `${base} ${extra}` : base).slice(0, 60);
        }
        return p;
      };
      const payload = montar(variacao, true);

      // validar = true → /items/validate: confere tudo sem publicar
      const postar = async (p: Record<string, unknown>) => {
        const r = await fetch(`${ML}/items${validar ? '/validate' : ''}`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${destToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(p),
        });
        const data = await r.json().catch(() => null);
        // O validate responde 400 mesmo quando só há AVISOS; sem erro real = ok
        const soAvisos = validar && r.status === 400 &&
          causas(data).length > 0 && causas(data).every((c: any) => c.type === 'warning');
        return { status: r.status, ok: r.ok || soAvisos, data };
      };

      // ════ Um anúncio por variação ════
      // Cada variação vira um anúncio próprio (foto, preço, estoque, SKU e cor dela), todos com o
      // mesmo nome do produto — no modelo User Products o ML agrupa como uma família.
      if (overrides.todasVariacoes && variacoes.length > 1) {
        const resultados: any[] = [];
        const mudarStatusT = async (id: string, st: string) => (await fetch(`${ML}/items/${id}`, {
          method: 'PUT', headers: { Authorization: `Bearer ${destToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: st }),
        })).ok;
        let antigoPausadoT = false;
        for (const v of variacoes.slice(0, 50)) {
          const p = montar(v, false);
          let r = await postar(p);
          if (!r.ok && /\[title\] are invalid|family_name/i.test(JSON.stringify(r.data || {})) && p.title) {
            delete p.title; p.family_name = nome || item.family_name || item.title; r = await postar(p);
          }
          if (recadastrar && !validar && !r.ok && !antigoPausadoT && item.status === 'active'
              && /duplicat|already exist|ya existe|similar/i.test(JSON.stringify(r.data || {}))) {
            antigoPausadoT = await mudarStatusT(item.id, 'paused');
            if (antigoPausadoT) { await new Promise((x) => setTimeout(x, 1500)); r = await postar(p); }
          }
          let descOk: boolean | null = null;
          const nid = !validar && r.ok ? r.data?.id : null;
          if (nid && descricao) {
            descOk = (await fetch(`${ML}/items/${nid}/description`, {
              method: 'POST', headers: { Authorization: `Bearer ${destToken}`, 'Content-Type': 'application/json' },
              body: JSON.stringify({ plain_text: descricao }),
            })).ok;
          }
          const erros = causas(r.data).filter((c: any) => c.type !== 'warning').map((c: any) => c.message);
          resultados.push({
            variacao: nomeVariacao(v), ok: r.ok, novoId: nid, permalink: r.data?.permalink ?? null, descricaoOk: descOk,
            error: r.ok ? null : (erros.join(' · ') || r.data?.message || `HTTP ${r.status}`),
          });
          if (!validar) {
            await supabaseAdmin.from('ml_clone_logs').insert({
              user_id: userId, origin_seller_id: String(originSellerId), dest_seller_id: String(destSellerId),
              source_item_id: item.id, new_item_id: nid, status: r.ok ? 'ok' : 'erro',
              modo: `${recadastrar ? 'recadastro/' : ''}por-variacao: ${nomeVariacao(v)}`,
              request_payload: p, response_status: r.status, response_body: r.data, description_ok: descOk,
              recadastro: !!recadastrar, old_user_product_id: item.user_product_id ?? null,
            });
          }
        }
        const criados = resultados.filter((x) => x.ok).length;
        // Recadastro: só finaliza o antigo se TODAS as variações foram criadas
        let antigoFinalizadoT: boolean | null = null;
        if (recadastrar && !validar) {
          if (criados === resultados.length) antigoFinalizadoT = await mudarStatusT(item.id, 'closed');
          else if (antigoPausadoT) { await mudarStatusT(item.id, 'active'); antigoFinalizadoT = false; }
          else antigoFinalizadoT = false;
        }
        return json({
          ok: criados > 0, porVariacao: true, validacao: !!validar, total: resultados.length, criados, resultados,
          recadastro: !!recadastrar, antigoId: item.id, antigoFinalizado: antigoFinalizadoT,
          avisoCatalogo: item.catalog_listing ? 'A origem era de catálogo; os novos foram criados como anúncios comuns.' : null,
          error: criados === resultados.length ? undefined
            : `${resultados.length - criados} de ${resultados.length} variação(ões) recusada(s)` +
              (recadastrar && !validar ? ' — o anúncio antigo foi mantido.' : '.'),
        });
      }

      let modo = (recadastrar ? 'recadastro/' : '') + (destinoUP ? 'family_name' : 'title');
      let res = await postar(payload);

      // O ML às vezes discorda da tag: troca de modelo e tenta uma vez.
      const txt = (d: any) => JSON.stringify(d || {});
      if (!res.ok && !destinoUP && /\[title\] are invalid|family_name/i.test(txt(res.data))) {
        delete payload.title; payload.family_name = nome || item.family_name || item.title; modo = 'family_name (retry)';
        res = await postar(payload);
      } else if (!res.ok && destinoUP && /\[family_name\] are invalid/i.test(txt(res.data))) {
        delete payload.family_name; payload.title = nome || item.title; modo = 'title (retry)';
        res = await postar(payload);
      }

      if (validar) {
        const c = causas(res.data);
        return json({
          ok: res.ok, validacao: true, modo,
          erros: c.filter((x: any) => x.type !== 'warning').map((x: any) => x.message),
          avisos: c.filter((x: any) => x.type === 'warning').map((x: any) => x.message),
          error: res.ok ? undefined : (c.filter((x: any) => x.type !== 'warning').map((x: any) => x.message).join(' · ')
            || res.data?.message || `HTTP ${res.status}`),
        });
      }

      // ── Recadastro: se o ML recusar por duplicado, pausa o antigo e tenta de novo ──
      const mudarStatus = async (id: string, status: string) => {
        const r = await fetch(`${ML}/items/${id}`, {
          method: 'PUT',
          headers: { Authorization: `Bearer ${destToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ status }),
        });
        return r.ok;
      };
      let antigoPausado = false;
      if (recadastrar && !res.ok && /duplicat|already exist|ya existe|similar/i.test(txt(res.data)) && item.status === 'active') {
        antigoPausado = await mudarStatus(item.id, 'paused');
        if (antigoPausado) {
          await new Promise((r) => setTimeout(r, 1500));
          res = await postar(payload);
          modo += ' (antigo pausado)';
          if (!res.ok) { await mudarStatus(item.id, 'active'); antigoPausado = false; modo += ' → antigo reativado'; }
        }
      }

      let descricaoOk: boolean | null = null;
      const novoId: string | null = res.ok ? res.data?.id : null;
      if (novoId && descricao) {
        const d = await fetch(`${ML}/items/${novoId}/description`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${destToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ plain_text: descricao }),
        });
        descricaoOk = d.ok;
      }

      // Recadastro: só depois do novo existir, finaliza o antigo. Confere o MLBU do novo.
      let antigoFinalizado: boolean | null = null;
      let upNovo: string | null = null;
      if (recadastrar && novoId) {
        antigoFinalizado = await mudarStatus(item.id, 'closed');
        const novo = await getML(`/items/${novoId}?attributes=id,user_product_id,status`, destToken);
        upNovo = novo.data?.user_product_id ?? null;
      }

      await supabaseAdmin.from('ml_clone_logs').insert({
        user_id: userId, origin_seller_id: String(originSellerId), dest_seller_id: String(destSellerId),
        source_item_id: item.id, new_item_id: novoId, status: res.ok ? 'ok' : 'erro', modo,
        request_payload: payload, response_status: res.status, response_body: res.data, description_ok: descricaoOk,
        recadastro: !!recadastrar, old_closed: antigoFinalizado,
        old_user_product_id: item.user_product_id ?? null, new_user_product_id: upNovo,
      });

      if (!res.ok) {
        const causas: any[] = Array.isArray(res.data?.cause) ? res.data.cause : [];
        const erros = causas.filter((c) => c.type !== 'warning').map((c) => c.message).filter(Boolean);
        return json({
          ok: false,
          error: erros.length ? erros.join(' · ') : (res.data?.message || `HTTP ${res.status}`),
          status: res.status, detalhe: res.data,
        });
      }
      const avisos = causas(res.data).filter((c: any) => c.type === 'warning').map((c: any) => c.message);
      return json({
        ok: true, novoId, permalink: res.data?.permalink, status: res.data?.status,
        titulo: res.data?.title, descricaoOk, modo, avisos,
        recadastro: !!recadastrar, antigoId: item.id, antigoFinalizado,
        avisoVariacao: variacao
          ? `Não é possível duplicar as variações. O anúncio foi criado sem variação, a partir de: ${nomeVariacao(variacao)}.`
          : null,
        avisoCatalogo: item.catalog_listing ? 'A origem era de catálogo; o novo foi criado como anúncio comum.' : null,
        upAntigo: item.user_product_id ?? null, upNovo,
        mesmoMLBU: !!(upNovo && item.user_product_id && upNovo === item.user_product_id),
      });
    }

    return json({ error: 'Invalid action' }, 400);
  } catch (error) {
    console.error('[ml-item-clone] Error:', error);
    return json({ error: String(error) }, 500);
  }
});

function causas(d: any): any[] {
  return Array.isArray(d?.cause) ? d.cause : [];
}
