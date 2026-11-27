// Shopee — pedidos e etiquetas (27/nov/2026).
// Ações (usuário logado, só nas lojas dele):
//   sync           {account_id, days?=15}  baixa pedidos (lista + detalhe) e grava em shopee_orders
//   ship_params    {account_id, order_sn}  mostra como a Shopee aceita o envio (drop-off / coleta)
//   ship           {account_id, order_sn, modo:'dropoff'|'pickup', address_id?, pickup_time_id?}
//                  "Programar envio" — muda o pedido na Shopee para PROCESSED (gera rastreio)
//   labels         {account_id, order_sns[]} gera e devolve o PDF das etiquetas (base64). Nada é gravado:
//                  a etiqueta tem o endereço do comprador (política de dados da Shopee, 90 dias).
// Sem dados pessoais no banco: ver migração 20261127004000_shopee_orders.sql.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { baixarShopee, chamarShopee, shopeeConfigurada, tokenValido } from '../_shared/shopee.ts';

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
    return json({ fn: 'shopee-orders', version: 'shopee-orders-v1' });
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
