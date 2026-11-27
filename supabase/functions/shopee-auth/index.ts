// Shopee — conectar loja (27/nov/2026).
// Fluxo: tela pede 'auth_url' → vendedor autoriza na Shopee → Shopee volta para
// https://www.mktpfacil.com/shopee/callback?code=...&shop_id=... → a tela chama 'exchange'
// com o usuário logado → gravamos os tokens em shopee_accounts.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { chamarShopee, partnerId, shopeeConfigurada, SHOPEE_AMBIENTE, SHOPEE_HOST, tokenValido, urlAssinada } from '../_shared/shopee.ts';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};
const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
const REDIRECT = Deno.env.get('SHOPEE_REDIRECT') || 'https://www.mktpfacil.com/shopee/callback';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
  if (req.method === 'GET' && new URL(req.url).searchParams.has('version')) {
    return json({ fn: 'shopee-auth', version: 'shopee-auth-v1', configurada: shopeeConfigurada(), ambiente: SHOPEE_AMBIENTE });
  }

  try {
    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const token = (req.headers.get('Authorization') || '').replace('Bearer ', '');
    const { data: { user } } = await supabase.auth.getUser(token);
    if (!user) return json({ error: 'Não autenticado' }, 401);

    const body = await req.json().catch(() => ({}));
    const { action } = body as { action: string };

    if (!shopeeConfigurada()) {
      return json({ error: 'shopee_nao_configurada', details: 'A integração com a Shopee ainda não foi ativada no servidor (faltam as credenciais do app).' });
    }

    switch (action) {
      // Link para o vendedor autorizar a loja dele
      case 'auth_url': {
        const url = await urlAssinada('/api/v2/shop/auth_partner', { redirect: REDIRECT });
        return json({ success: true, url, ambiente: SHOPEE_AMBIENTE });
      }

      // Troca o code pelo token e grava a loja
      case 'exchange': {
        const code = String(body.code || '');
        const shopId = Number(body.shop_id);
        if (!code || !shopId) return json({ error: 'code e shop_id são obrigatórios' }, 400);
        const r = await chamarShopee('POST', '/api/v2/auth/token/get', {
          body: { code, shop_id: shopId, partner_id: partnerId() },
        });
        if (!r.ok || !r.data?.access_token) {
          console.error('[shopee-auth] token/get', r.status, JSON.stringify(r.data));
          return json({ error: 'token_recusado', details: `A Shopee recusou a autorização: ${r.erro}` });
        }
        const agora = Date.now();
        const registro: Record<string, unknown> = {
          user_id: user.id, shop_id: shopId, ambiente: SHOPEE_AMBIENTE, status: 'conectada',
          access_token: r.data.access_token, refresh_token: r.data.refresh_token,
          token_expires_at: new Date(agora + (r.data.expire_in || 14400) * 1000).toISOString(),
          refresh_expires_at: new Date(agora + 30 * 86400000).toISOString(),
          ultimo_erro: null, updated_at: new Date().toISOString(),
        };
        // Nome e região da loja
        const info = await chamarShopee('GET', '/api/v2/shop/get_shop_info', { accessToken: r.data.access_token, shopId });
        if (info.ok) { registro.shop_name = info.data?.shop_name ?? null; registro.region = info.data?.region ?? null; }
        const { data: salvo, error } = await supabase.from('shopee_accounts')
          .upsert(registro, { onConflict: 'user_id,shop_id,ambiente' })
          .select('id, shop_id, shop_name, region, ambiente, status').single();
        if (error) return json({ error: 'falha_ao_salvar', details: error.message });
        return json({ success: true, loja: salvo });
      }

      // Teste rápido: lê os dados da loja com o token guardado (renova se precisar)
      case 'test': {
        const { data: conta } = await supabase.from('shopee_accounts').select('*')
          .eq('id', body.id).eq('user_id', user.id).single();
        if (!conta) return json({ error: 'Loja não encontrada' }, 404);
        const tk = await tokenValido(supabase, conta);
        if (!tk) return json({ error: 'token_expirado', details: 'A autorização venceu. Conecte a loja de novo.' });
        const info = await chamarShopee('GET', '/api/v2/shop/get_shop_info', { accessToken: tk, shopId: conta.shop_id });
        return json({ success: info.ok, details: info.erro, loja: info.data });
      }

      case 'disconnect': {
        const { error } = await supabase.from('shopee_accounts')
          .update({ status: 'desconectada', access_token: null, refresh_token: null, updated_at: new Date().toISOString() })
          .eq('id', body.id).eq('user_id', user.id);
        if (error) return json({ error: error.message });
        return json({ success: true });
      }

      default:
        return json({ error: `Ação desconhecida: ${action}`, host: SHOPEE_HOST }, 400);
    }
  } catch (e) {
    console.error('[shopee-auth]', e);
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
