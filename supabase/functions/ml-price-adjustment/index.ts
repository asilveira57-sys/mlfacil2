import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // Diagnóstico sem dados: confirma qual versão está publicada.
  if (req.method === 'GET' && new URL(req.url).searchParams.has('version')) {
    return new Response(JSON.stringify({ fn: 'ml-price-adjustment', version: 'availability-time-v3' }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    );

    const token = authHeader.replace('Bearer ', '');
    const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    const userId = claimsData.claims.sub as string;

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // ML API Access Gate
    const { assertMlApiAccess } = await import("../_shared/ml-api-gate.ts");
    const gate = await assertMlApiAccess(supabaseAdmin, userId);
    if (!gate.allowed) {
      console.log(`[ml-price-adjustment] Access denied: ${gate.reason}`);
      return gate.response!;
    }

    const body = await req.json();
    const { action, sellerId: requestedSellerId } = body;

    // Get ML account + token — use sellerId from request to pick the right account
    let accountQuery = supabase
      .from('ml_accounts')
      .select('*')
      .eq('user_id', userId)
      .eq('is_active', true);

    if (requestedSellerId) {
      accountQuery = accountQuery.eq('ml_user_id', requestedSellerId);
    }

    const { data: mlAccount, error: accError } = await accountQuery.limit(1).single();

    if (accError || !mlAccount) {
      return new Response(JSON.stringify({ error: 'No Mercado Livre account connected', needsAuth: true }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    let accessToken = mlAccount.access_token;
    const tokenExpiry = new Date(mlAccount.token_expires_at);
    if (tokenExpiry <= new Date()) {
      console.log('[ml-price-adjustment] Refreshing token...');
      const refreshRes = await fetch('https://api.mercadolibre.com/oauth/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          client_id: Deno.env.get('ML_APP_ID') || '',
          client_secret: Deno.env.get('ML_SECRET_KEY') || '',
          refresh_token: mlAccount.refresh_token,
        }),
      });
      if (!refreshRes.ok) throw new Error('Failed to refresh token');
      const refreshData = await refreshRes.json();
      accessToken = refreshData.access_token;
      const newExpiry = new Date();
      newExpiry.setSeconds(newExpiry.getSeconds() + refreshData.expires_in);
      await supabase.from('ml_accounts').update({
        access_token: refreshData.access_token,
        refresh_token: refreshData.refresh_token,
        token_expires_at: newExpiry.toISOString(),
      }).eq('id', mlAccount.id);
    }

    const sellerId = mlAccount.ml_user_id;

    // ── ACTION: get_seller_categories ──
    if (action === 'get_seller_categories') {
      // Fetch items in batches to collect distinct category_ids
      const categoryMap = new Map<string, number>();
      let offset = 0;
      const batchLimit = 50;
      const maxItems = 1000;

      while (offset < maxItems) {
        const url = `https://api.mercadolibre.com/users/${sellerId}/items/search?offset=${offset}&limit=${batchLimit}&status=active`;
        const searchRes = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
        if (!searchRes.ok) break;
        const searchData = await searchRes.json();
        const itemIds: string[] = searchData.results || [];
        if (itemIds.length === 0) break;

        // Multiget to get category_id for each item
        for (let i = 0; i < itemIds.length; i += 20) {
          const batch = itemIds.slice(i, i + 20);
          const multiRes = await fetch(
            `https://api.mercadolibre.com/items?ids=${batch.join(',')}&attributes=id,category_id`,
            { headers: { Authorization: `Bearer ${accessToken}` } }
          );
          if (multiRes.ok) {
            const multiData = await multiRes.json();
            for (const entry of multiData) {
              if (entry.code === 200 && entry.body?.category_id) {
                const catId = entry.body.category_id;
                categoryMap.set(catId, (categoryMap.get(catId) || 0) + 1);
              }
            }
          }
        }

        offset += batchLimit;
        const total = searchData.paging?.total || 0;
        if (offset >= total) break;
      }

      // Resolve category names in batch
      const catIds = Array.from(categoryMap.keys());
      const categories: Array<{ id: string; name: string; results: number }> = [];

      for (let i = 0; i < catIds.length; i += 20) {
        const batch = catIds.slice(i, i + 20);
        const promises = batch.map(async (catId) => {
          try {
            const res = await fetch(`https://api.mercadolibre.com/categories/${catId}`);
            if (res.ok) {
              const data = await res.json();
              return { id: catId, name: data.name || catId, results: categoryMap.get(catId) || 0 };
            }
          } catch { /* skip */ }
          return { id: catId, name: catId, results: categoryMap.get(catId) || 0 };
        });
        const resolved = await Promise.all(promises);
        categories.push(...resolved);
      }

      // Sort by count descending
      categories.sort((a, b) => b.results - a.results);

      return new Response(JSON.stringify({ categories }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // ── ACTION: search_items ──
    if (action === 'search_items') {
      const { query, categoryId, status, offset = 0, limit = 50 } = body;
      let url = `https://api.mercadolibre.com/users/${sellerId}/items/search?offset=${offset}&limit=${limit}`;
      if (query) url += `&q=${encodeURIComponent(query)}`;
      if (categoryId) url += `&category=${categoryId}`;
      if (status) url += `&status=${status}`;

      const searchRes = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
      if (!searchRes.ok) {
        const err = await searchRes.text();
        return new Response(JSON.stringify({ error: 'Search failed', details: err, status: searchRes.status }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      const searchData = await searchRes.json();
      const itemIds: string[] = searchData.results || [];
      const total = searchData.paging?.total || 0;

      // Multiget in batches of 20
      const items: any[] = [];
      for (let i = 0; i < itemIds.length; i += 20) {
        const batch = itemIds.slice(i, i + 20);
        const multiRes = await fetch(`https://api.mercadolibre.com/items?ids=${batch.join(',')}&attributes=id,title,price,status,variations,sale_terms,seller_custom_field,category_id,thumbnail,available_quantity,sold_quantity`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (multiRes.ok) {
          const multiData = await multiRes.json();
          for (const entry of multiData) {
            if (entry.code === 200 && entry.body) {
              items.push(entry.body);
            }
          }
        }
      }

      return new Response(JSON.stringify({ items, total, offset, limit }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // ── ACTION: get_item_full ──
    if (action === 'get_item_full') {
      const { itemId } = body;
      const res = await fetch(`https://api.mercadolibre.com/items/${itemId}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!res.ok) {
        return new Response(JSON.stringify({ error: 'Failed to fetch item', status: res.status }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      const item = await res.json();
      return new Response(JSON.stringify({ item }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // ── ACTION: apply_price ──
    if (action === 'apply_price') {
      const { itemId, newPrice, variations, empresaId, oldPrice, percentual, tipoAjuste, modo, arredondamento, possuiVariacao, possuiPxq, titulo } = body;

      let payload: any;
      if (variations && variations.length > 0) {
        payload = { variations: variations.map((v: any) => ({ id: v.id, price: v.price })) };
      } else {
        payload = { price: newPrice };
      }

      console.log(`[ml-price-adjustment] Updating ${itemId} price -> ${newPrice} (mode: ${modo})`);

      const updateRes = await fetch(`https://api.mercadolibre.com/items/${itemId}`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const responseBody = await updateRes.json();

      // Log to database
      await supabaseAdmin.from('price_adjustment_logs').insert({
        empresa_id: empresaId || null,
        seller_id: sellerId,
        user_id: userId,
        item_id: itemId,
        titulo: titulo || null,
        preco_antigo: oldPrice,
        preco_novo: newPrice,
        percentual,
        tipo_ajuste: tipoAjuste,
        modo,
        arredondamento: arredondamento || 'nenhum',
        possui_variacao: possuiVariacao || false,
        possui_pxq: possuiPxq || false,
        request_payload: payload,
        response_status: updateRes.status,
        response_body: responseBody,
      });

      if (!updateRes.ok) {
        console.error(`[ml-price-adjustment] Update failed for ${itemId}:`, responseBody);
        return new Response(JSON.stringify({
          success: false,
          error: responseBody.message || 'Update failed',
          status: updateRes.status,
          responseBody,
          itemId,
        }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      return new Response(JSON.stringify({
        success: true,
        itemId,
        newPrice,
        responseBody,
      }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // ── Disponibilidade de estoque (MANUFACTURING_TIME) ──
    // sale_terms é array: sempre lemos os termos atuais e trocamos só o prazo,
    // para não apagar a garantia (WARRANTY_TIME). Unidade = dias corridos.

    // ── ACTION: scan_manufacturing_candidates ──────────────────────────────────
    // Lista, AO VIVO no Mercado Livre, os anúncios que seriam afetados.
    // Não escreve nada. Use para conferir antes de aplicar.
    if (action === 'scan_manufacturing_candidates') {
      const {
        terms,
        titleContains,
        excludeLogistic = ['fulfillment'],
        onlyActive = true,
      } = body;

      // terms: lista de termos (OU). Vazio = devolve todos os elegíveis,
      // para a tela filtrar localmente sem nova consulta ao ML.
      const norm = (s: string) => String(s).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      const alvos: string[] = (Array.isArray(terms) ? terms : (titleContains ? [titleContains] : []))
        .map((t: string) => norm(t).trim()).filter(Boolean);
      const candidatos: any[] = [];
      const ignorados = { full: 0, sem_titulo: 0, inativo: 0 };

      let offset = 0;
      const PAGE = 50;

      while (true) {
        const searchUrl =
          `https://api.mercadolibre.com/users/${sellerId}/items/search` +
          `?offset=${offset}&limit=${PAGE}` + (onlyActive ? '&status=active' : '');

        const searchRes = await fetch(searchUrl, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (!searchRes.ok) break;

        const searchData = await searchRes.json();
        const ids: string[] = searchData.results || [];
        if (ids.length === 0) break;

        for (let i = 0; i < ids.length; i += 20) {
          const lote = ids.slice(i, i + 20);
          const multiRes = await fetch(
            `https://api.mercadolibre.com/items?ids=${lote.join(',')}` +
            `&attributes=id,title,status,sale_terms,shipping,thumbnail`,
            { headers: { Authorization: `Bearer ${accessToken}` } },
          );
          if (!multiRes.ok) continue;

          for (const entry of await multiRes.json()) {
            if (entry.code !== 200 || !entry.body) continue;
            const it = entry.body;

            if (onlyActive && it.status !== 'active') { ignorados.inativo++; continue; }
            if (excludeLogistic.includes(it.shipping?.logistic_type)) { ignorados.full++; continue; }
            if (!it.title) { ignorados.sem_titulo++; continue; }
            if (alvos.length && !alvos.some((a) => norm(it.title).includes(a))) continue;

            const atual = (it.sale_terms || [])
              .find((t: any) => t.id === 'MANUFACTURING_TIME');

            candidatos.push({
              itemId: it.id,
              title: it.title,
              logisticType: it.shipping?.logistic_type ?? null,
              prazoAtual: atual?.value_name ?? null,
              thumbnail: it.thumbnail ?? null,
              outrosTermos: (it.sale_terms || [])
                .filter((t: any) => t.id !== 'MANUFACTURING_TIME')
                .map((t: any) => `${t.id}=${t.value_name}`),
            });
          }
        }

        offset += PAGE;
        if (offset >= (searchData.paging?.total || 0)) break;
      }

      return new Response(JSON.stringify({
        sellerId, total: candidatos.length, ignorados, candidatos,
      }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // ── ACTION: apply_manufacturing_time ───────────────────────────────────────
    // Aplica o prazo em UM anúncio. A tela chama em laço, igual ao apply_price.
    // Com dryRun = true, devolve o payload que SERIA enviado, sem escrever.
    if (action === 'apply_manufacturing_time') {
      const { itemId, days = 6, dryRun = false } = body;

      if (!itemId) {
        return new Response(JSON.stringify({ error: 'itemId obrigatório' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      // 1. Lê o estado atual. Nunca montamos o array do zero.
      const getRes = await fetch(
        `https://api.mercadolibre.com/items/${itemId}?attributes=id,title,status,sale_terms,shipping`,
        { headers: { Authorization: `Bearer ${accessToken}` } },
      );
      if (!getRes.ok) {
        return new Response(JSON.stringify({
          success: false, itemId, error: 'Falha ao ler o anúncio', status: getRes.status,
        }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      const item = await getRes.json();

      // 2. Trava de segurança: nunca mexe em Full nem em anúncio inativo.
      if (item.shipping?.logistic_type === 'fulfillment') {
        return new Response(JSON.stringify({
          success: false, skipped: true, itemId, reason: 'fulfillment',
        }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      if (item.status !== 'active') {
        return new Response(JSON.stringify({
          success: false, skipped: true, itemId, reason: `status=${item.status}`,
        }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      // 3. Preserva cada termo existente no formato que o ML espera de volta.
      //    Lista fechada volta por value_id; o resto volta por value_name.
      const preserveSaleTerm = (t: any) =>
        t.value_id ? { id: t.id, value_id: t.value_id } : { id: t.id, value_name: t.value_name };

      const termosAtuais = Array.isArray(item.sale_terms) ? item.sale_terms : [];
      const novoPrazo = { id: 'MANUFACTURING_TIME', value_name: `${days} dias` };

      const saleTermsNovos = [
        ...termosAtuais
          .filter((t: any) => t.id !== 'MANUFACTURING_TIME')
          .map(preserveSaleTerm),
        novoPrazo,
      ];

      const payload = { sale_terms: saleTermsNovos };
      const prazoAntes =
        termosAtuais.find((t: any) => t.id === 'MANUFACTURING_TIME')?.value_name ?? null;

      // Já está no valor desejado? Não gasta chamada de escrita.
      if (prazoAntes === novoPrazo.value_name) {
        return new Response(JSON.stringify({
          success: true, skipped: true, itemId, reason: 'ja_estava', prazoAntes,
        }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      if (dryRun) {
        return new Response(JSON.stringify({
          success: true, dryRun: true, itemId, title: item.title,
          prazoAntes, prazoDepois: novoPrazo.value_name,
          termosPreservados: termosAtuais.filter((t: any) => t.id !== 'MANUFACTURING_TIME').length,
          payload,
        }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      // 4. Escreve.
      const putRes = await fetch(`https://api.mercadolibre.com/items/${itemId}`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const respBody = await putRes.json();

      // 5. Log com os sale_terms ANTES — é o que permite desfazer depois.
      const { error: logError } = await supabaseAdmin.from('sale_term_adjustment_logs').insert({
        seller_id: sellerId,
        user_id: userId,
        item_id: itemId,
        titulo: item.title || null,
        term_id: 'MANUFACTURING_TIME',
        valor_antes: prazoAntes,
        valor_depois: novoPrazo.value_name,
        sale_terms_antes: termosAtuais,
        request_payload: payload,
        response_status: putRes.status,
        response_body: respBody,
      });
      if (logError) console.error('[manufacturing-time] log falhou:', logError.message);

      if (!putRes.ok) {
        console.error(`[manufacturing-time] ${itemId} falhou:`, respBody);
        return new Response(JSON.stringify({
          success: false, itemId, error: respBody?.message || 'PUT falhou',
          status: putRes.status, responseBody: respBody,
        }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      return new Response(JSON.stringify({
        success: true, itemId, title: item.title,
        prazoAntes, prazoDepois: novoPrazo.value_name,
      }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // ── ACTION: revert_manufacturing_time ──
    // Desfaz o último apply bem-sucedido do anúncio, voltando ao valor anterior
    // (ou removendo o prazo, se antes não havia). Confere lendo o anúncio depois.
    if (action === 'revert_manufacturing_time') {
      const { itemId } = body;
      const json = (o: unknown) => new Response(JSON.stringify(o),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      if (!itemId) return json({ success: false, error: 'itemId obrigatório' });

      const { data: ultimo } = await supabaseAdmin.from('sale_term_adjustment_logs')
        .select('id, valor_antes, acao, response_status')
        .eq('seller_id', sellerId).eq('item_id', itemId).eq('term_id', 'MANUFACTURING_TIME')
        .order('created_at', { ascending: false }).limit(1).maybeSingle();
      if (!ultimo || ultimo.acao !== 'apply' || ultimo.response_status !== 200) {
        return json({ success: false, skipped: true, itemId, reason: 'nada_a_desfazer' });
      }

      const lerItem = async () => {
        const r = await fetch(`https://api.mercadolibre.com/items/${itemId}?attributes=id,title,sale_terms`,
          { headers: { Authorization: `Bearer ${accessToken}` } });
        return r.ok ? await r.json() : null;
      };
      const item = await lerItem();
      if (!item) return json({ success: false, itemId, error: 'Falha ao ler o anúncio' });

      const preserve = (t: any) =>
        t.value_id ? { id: t.id, value_id: t.value_id } : { id: t.id, value_name: t.value_name };
      const termos = Array.isArray(item.sale_terms) ? item.sale_terms : [];
      const outros = termos.filter((t: any) => t.id !== 'MANUFACTURING_TIME').map(preserve);
      const alvo: string | null = ultimo.valor_antes ?? null;

      const tentativas: any[] = alvo
        ? [{ sale_terms: [...outros, { id: 'MANUFACTURING_TIME', value_name: alvo }] }]
        : [
            { sale_terms: [...outros, { id: 'MANUFACTURING_TIME', value_id: null, value_name: null }] },
            { sale_terms: outros },
          ];

      let putStatus = 0; let putBody: any = null; let payloadUsado: any = null; let depois: string | null = null;
      for (const payload of tentativas) {
        const putRes = await fetch(`https://api.mercadolibre.com/items/${itemId}`, {
          method: 'PUT',
          headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        putStatus = putRes.status; putBody = await putRes.json().catch(() => null); payloadUsado = payload;
        const conf = await lerItem();
        depois = (conf?.sale_terms || []).find((t: any) => t.id === 'MANUFACTURING_TIME')?.value_name ?? null;
        if (depois === alvo) break;
      }
      const ok = depois === alvo;

      const { error: logError } = await supabaseAdmin.from('sale_term_adjustment_logs').insert({
        seller_id: sellerId, user_id: userId, item_id: itemId, titulo: item.title || null,
        term_id: 'MANUFACTURING_TIME', acao: 'revert',
        valor_antes: termos.find((t: any) => t.id === 'MANUFACTURING_TIME')?.value_name ?? null,
        valor_depois: depois, sale_terms_antes: termos, request_payload: payloadUsado,
        response_status: ok ? 200 : (putStatus || 500), response_body: putBody,
      });
      if (logError) console.error('[manufacturing-time] log revert falhou:', logError.message);

      return json(ok
        ? { success: true, itemId, title: item.title, prazoDepois: depois }
        : { success: false, itemId, error: putBody?.message || `prazo continua ${depois}`, responseBody: putBody });
    }

    return new Response(JSON.stringify({ error: 'Invalid action' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (error) {
    console.error('[ml-price-adjustment] Error:', error);
    return new Response(JSON.stringify({ error: String(error) }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
