// Shopee — pedidos e etiquetas (27/nov/2026).
// Ações (usuário logado, só nas lojas dele):
//   sync           {account_id, days?=15}  baixa pedidos (lista + detalhe) e grava em shopee_orders
//   ship_params    {account_id, order_sn}  mostra como a Shopee aceita o envio (drop-off / coleta)
//   ship           {account_id, order_sn, modo:'dropoff'|'pickup', address_id?, pickup_time_id?}
//                  "Programar envio" — muda o pedido na Shopee para PROCESSED (gera rastreio)
//   create_test_item {account_id}  SÓ no ambiente de teste: cria um anúncio de teste pela API
//                  (o upload de foto pelo Seller Center do sandbox está quebrado). Base para, no futuro,
//                  levar anúncios do Mercado Livre para a Shopee.
//   labels         {account_id, order_sns[]} gera e devolve o PDF das etiquetas (base64). Nada é gravado:
//                  a etiqueta tem o endereço do comprador (política de dados da Shopee, 90 dias).
// Sem dados pessoais no banco: ver migração 20261127004000_shopee_orders.sql.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { baixarShopee, chamarShopee, shopeeConfigurada, SHOPEE_AMBIENTE, tokenValido, urlAssinada } from '../_shared/shopee.ts';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};
const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
const iso = (s?: number) => (s ? new Date(s * 1000).toISOString() : null);
const espera = (ms: number) => new Promise((r) => setTimeout(r, ms));

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
  if (req.method === 'GET' && new URL(req.url).searchParams.has('version')) {
    return json({ fn: 'shopee-orders', version: 'shopee-orders-v2' });
  }
  try {
    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const token = (req.headers.get('Authorization') || '').replace('Bearer ', '');
    const { data: { user } } = await supabase.auth.getUser(token);
    if (!user) return json({ error: 'Não autenticado' }, 401);
    if (!shopeeConfigurada()) return json({ error: 'shopee_nao_configurada' });

    const body = await req.json().catch(() => ({}));
    const { action, account_id } = body as { action: string; account_id: string };

    const { data: conta } = await supabase.from('shopee_accounts').select('*')
      .eq('id', account_id).eq('user_id', user.id).single();
    if (!conta) return json({ error: 'Loja Shopee não encontrada' }, 404);
    const tk = await tokenValido(supabase, conta);
    if (!tk) return json({ error: 'token_expirado', details: 'A autorização da loja venceu. Conecte a loja de novo.' });
    const shopId = Number(conta.shop_id);
    const loja = (method: 'GET' | 'POST', path: string, o: { query?: Record<string, string | number>; body?: unknown } = {}) =>
      chamarShopee(method, path, { ...o, accessToken: tk, shopId });

    switch (action) {
      case 'sync': {
        const dias = Math.min(Math.max(Number(body.days) || 15, 1), 90);
        const agora = Math.floor(Date.now() / 1000);
        const sns: string[] = [];
        // A Shopee aceita janelas de até 15 dias em get_order_list
        for (let fim = agora; fim > agora - dias * 86400; fim -= 15 * 86400) {
          const ini = Math.max(fim - 15 * 86400, agora - dias * 86400);
          let cursor = '';
          for (let pg = 0; pg < 50; pg++) {
            const r = await loja('GET', '/api/v2/order/get_order_list', { query: {
              time_range_field: 'create_time', time_from: ini, time_to: fim, page_size: 100, cursor,
            } });
            if (!r.ok) return json({ error: 'falha_lista', details: r.erro });
            for (const o of r.data?.response?.order_list || []) sns.push(o.order_sn);
            if (!r.data?.response?.more) break;
            cursor = r.data.response.next_cursor;
          }
        }
        let gravados = 0;
        for (let i = 0; i < sns.length; i += 50) {
          const r = await loja('GET', '/api/v2/order/get_order_detail', { query: {
            order_sn_list: sns.slice(i, i + 50).join(','),
            response_optional_fields: 'item_list,total_amount,shipping_carrier,package_list,pay_time',
          } });
          if (!r.ok) return json({ error: 'falha_detalhe', details: r.erro, gravados });
          const linhas = (r.data?.response?.order_list || []).map((o: any) => ({
            user_id: user.id, shopee_account_id: conta.id, shop_id: shopId, order_sn: o.order_sn,
            order_status: o.order_status, create_time: iso(o.create_time), update_time: iso(o.update_time),
            total_amount: o.total_amount ?? null, currency: o.currency ?? null,
            shipping_carrier: o.shipping_carrier || o.package_list?.[0]?.shipping_carrier || null,
            package_number: o.package_list?.[0]?.package_number || null,
            itens: (o.item_list || []).map((it: any) => ({
              nome: it.item_name, sku: it.model_sku || it.item_sku || null, variacao: it.model_name || null,
              quantidade: it.model_quantity_purchased, item_id: it.item_id, model_id: it.model_id,
            })),
            synced_at: new Date().toISOString(),
          }));
          if (linhas.length) {
            const { error } = await supabase.from('shopee_orders').upsert(linhas, { onConflict: 'shop_id,order_sn' });
            if (error) return json({ error: 'falha_gravar', details: error.message, gravados });
            gravados += linhas.length;
          }
        }
        return json({ success: true, encontrados: sns.length, gravados, dias });
      }

      case 'ship_params': {
        const r = await loja('GET', '/api/v2/logistics/get_shipping_parameter', { query: { order_sn: body.order_sn } });
        if (!r.ok) return json({ error: 'falha', details: r.erro });
        return json({ success: true, parametros: r.data?.response });
      }

      case 'ship': {
        const { data: ped } = await supabase.from('shopee_orders').select('package_number')
          .eq('shop_id', shopId).eq('order_sn', body.order_sn).single();
        const payload: Record<string, unknown> = { order_sn: body.order_sn };
        if (ped?.package_number) payload.package_number = ped.package_number;
        if (body.modo === 'pickup') payload.pickup = { address_id: Number(body.address_id), pickup_time_id: String(body.pickup_time_id) };
        else payload.dropoff = {};
        const r = await loja('POST', '/api/v2/logistics/ship_order', { body: payload });
        if (!r.ok) return json({ error: 'falha_envio', details: r.erro });
        // Rastreio pode demorar alguns segundos para sair
        let rastreio: string | null = null;
        for (let t = 0; t < 4 && !rastreio; t++) {
          await espera(1500);
          const q: Record<string, string> = { order_sn: body.order_sn };
          if (ped?.package_number) q.package_number = ped.package_number;
          const tr = await loja('GET', '/api/v2/logistics/get_tracking_number', { query: q });
          rastreio = tr.data?.response?.tracking_number || null;
        }
        await supabase.from('shopee_orders').update({ order_status: 'PROCESSED', tracking_number: rastreio })
          .eq('shop_id', shopId).eq('order_sn', body.order_sn);
        return json({ success: true, tracking_number: rastreio });
      }

      case 'create_test_item': {
        if (SHOPEE_AMBIENTE !== 'teste') return json({ error: 'Só disponível no ambiente de teste' }, 400);
        const log: unknown[] = [];
        // 1) Foto: envia o logo do site pela API de mídia (sem passar pelo navegador)
        const img = await fetch('https://www.mktpfacil.com/favicon-512.png');
        if (!img.ok) return json({ error: 'falha_imagem_origem', details: `HTTP ${img.status}` });
        const fd = new FormData();
        fd.append('image', new Blob([await img.arrayBuffer()], { type: 'image/png' }), 'produto-teste.png');
        const up = await fetch(await urlAssinada('/api/v2/media_space/upload_image'), { method: 'POST', body: fd });
        const upJson: any = await up.json().catch(() => ({}));
        const imageId = upJson?.response?.image_info?.image_id
          || upJson?.response?.image_info_list?.[0]?.image_info?.image_id;
        if (!imageId) return json({ error: 'falha_upload_imagem', details: upJson?.message || upJson?.error || up.status });
        log.push({ imagem: imageId });

        // 2) Canais de envio habilitados na loja
        const ch = await loja('GET', '/api/v2/logistics/get_channel_list');
        const canais = (ch.data?.response?.logistics_channel_list || []).filter((c: any) => c.enabled);
        const logistic_info = canais.slice(0, 5).map((c: any) => ({ logistic_id: c.logistics_channel_id, enabled: true }));
        log.push({ canais: canais.map((c: any) => `${c.logistics_channel_id} ${c.logistics_channel_name}`) });
        if (!logistic_info.length) return json({ error: 'sem_canal_envio', details: 'A loja de teste não tem canal de envio habilitado.', log });

        // 3) Categoria folha: prioriza papelaria/etiqueta; tenta algumas até a Shopee aceitar
        const cat = await loja('GET', '/api/v2/product/get_category', { query: { language: 'pt-BR' } });
        const folhas = (cat.data?.response?.category_list || []).filter((c: any) => !c.has_children);
        const pref = folhas.filter((c: any) => /etiqueta|adesiv|papel|escrit/i.test(c.display_category_name || c.original_category_name || ''));
        const candidatas = [...pref, ...folhas.filter((c: any) => !pref.includes(c))].slice(0, 6);

        const base: Record<string, unknown> = {
          item_name: 'Etiqueta Adesiva Teste MKTP Facil 40x40 Rolo 1000 Unidades',
          description: 'Produto de teste criado pelo MKTP Facil no ambiente sandbox da Shopee para validar pedidos e etiquetas. Nao comprar.',
          original_price: 25.9,
          seller_stock: [{ stock: 100 }],
          weight: 0.3,
          dimension: { package_length: 12, package_width: 12, package_height: 6 },
          condition: 'NEW',
          item_status: 'NORMAL',
          image: { image_id_list: [imageId] },
          brand: { brand_id: 0, original_brand_name: 'NoBrand' },
          logistic_info,
        };
        const fiscal = { tax_info: { ncm: '48211000', same_state_cfop: '5102', diff_state_cfop: '6102', csosn: '102', origin: '0', measure_unit: 'UN' } };
        for (const c of candidatas) {
          for (const extra of [{}, fiscal]) {
            const r = await loja('POST', '/api/v2/product/add_item', { body: { ...base, ...extra, category_id: c.category_id } });
            log.push({ categoria: `${c.category_id} ${c.display_category_name}`, fiscal: !!(extra as any).tax_info, erro: r.erro });
            if (r.ok && r.data?.response?.item_id) {
              return json({ success: true, item_id: r.data.response.item_id, categoria: c.display_category_name, log });
            }
            if (!/tax|ncm|cfop|fiscal|invoice/i.test(String(r.erro))) break; // fiscal não resolve: próxima categoria
          }
        }
        return json({ error: 'falha_criar_item', details: 'A Shopee recusou o anúncio de teste em todas as categorias tentadas.', log });
      }

      case 'labels': {
        const sns: string[] = Array.isArray(body.order_sns) ? body.order_sns.slice(0, 50) : [];
        if (!sns.length) return json({ error: 'Nenhum pedido selecionado' }, 400);
        const { data: peds } = await supabase.from('shopee_orders').select('order_sn, package_number, tracking_number')
          .eq('shop_id', shopId).in('order_sn', sns);
        const lista = (peds || []).map((p: any) => ({ order_sn: p.order_sn, ...(p.package_number ? { package_number: p.package_number } : {}) }));
        // Tipo de etiqueta sugerido pela Shopee (térmica quando disponível)
        const par = await loja('POST', '/api/v2/logistics/get_shipping_document_parameter', { body: { order_list: lista } });
        const tipos = (par.data?.response?.result_list || []).map((x: any) => x.selectable_shipping_document_type || []).flat();
        const tipo = tipos.includes('THERMAL_AIR_WAYBILL') ? 'THERMAL_AIR_WAYBILL'
          : (par.data?.response?.result_list?.[0]?.suggest_shipping_document_type || 'NORMAL_AIR_WAYBILL');
        const comRastreio = (peds || []).map((p: any) => ({
          order_sn: p.order_sn, ...(p.package_number ? { package_number: p.package_number } : {}),
          ...(p.tracking_number ? { tracking_number: p.tracking_number } : {}), shipping_document_type: tipo,
        }));
        const cr = await loja('POST', '/api/v2/logistics/create_shipping_document', { body: { order_list: comRastreio } });
        if (!cr.ok) return json({ error: 'falha_criar_etiqueta', details: cr.erro, tipo });
        const falhas = (cr.data?.response?.result_list || []).filter((x: any) => x.fail_error);
        // Espera ficar pronta (até ~12 s)
        let prontos = false;
        for (let t = 0; t < 8 && !prontos; t++) {
          await espera(1500);
          const st = await loja('POST', '/api/v2/logistics/get_shipping_document_result', {
            body: { order_list: lista.map((l) => ({ ...l, shipping_document_type: tipo })) },
          });
          const res = st.data?.response?.result_list || [];
          prontos = res.length > 0 && res.every((x: any) => x.status === 'READY' || x.fail_error);
        }
        if (!prontos) return json({ error: 'etiqueta_em_processamento', details: 'A Shopee ainda está gerando as etiquetas. Tente de novo em alguns segundos.' });
        const dl = await baixarShopee('/api/v2/logistics/download_shipping_document',
          { shipping_document_type: tipo, order_list: lista }, tk, shopId);
        if (!dl.ok || !dl.bytes) return json({ error: 'falha_baixar', details: dl.erro, falhas });
        await supabase.from('shopee_orders').update({ etiqueta_baixada_em: new Date().toISOString() })
          .eq('shop_id', shopId).in('order_sn', sns);
        let bin = '';
        for (let i = 0; i < dl.bytes.length; i += 8192) bin += String.fromCharCode(...dl.bytes.subarray(i, i + 8192));
        return json({ success: true, tipo, arquivo_tipo: dl.tipo, pdf_base64: btoa(bin), falhas });
      }

      default:
        return json({ error: `Ação desconhecida: ${action}` }, 400);
    }
  } catch (e) {
    console.error('[shopee-orders]', e);
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
