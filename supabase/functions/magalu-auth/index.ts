// Magalu — conectar loja (28/nov/2026), no mesmo molde da shopee-auth.
// Fluxo: tela pede 'auth_url' → vendedor entra no ID Magalu com a conta PJ, escolhe a loja e autoriza →
// Magalu volta para https://www.mktpfacil.com/magalu/callback?code=...&state=... → a tela confere o state
// e chama 'exchange' com o usuário logado → descobrimos a loja (portfolios/me) e gravamos em magalu_accounts.
import { createClient } from 'npm:@supabase/supabase-js@2';
import {
  chamarMagalu, identificarLoja, magaluConfigurada, MAGALU_AMBIENTE, MAGALU_API, MAGALU_SCOPES,
  tokenValido, trocarCode, urlConsentimento,
} from '../_shared/magalu.ts';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};
const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
  if (req.method === 'GET' && new URL(req.url).searchParams.has('version')) {
    return json({ fn: 'magalu-auth', version: 'magalu-auth-v1', configurada: magaluConfigurada(), ambiente: MAGALU_AMBIENTE, api: MAGALU_API });
  }

  try {
    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const token = (req.headers.get('Authorization') || '').replace('Bearer ', '');
    const { data: { user } } = await supabase.auth.getUser(token);
    if (!user) return json({ error: 'Não autenticado' }, 401);

    const body = await req.json().catch(() => ({}));
    const { action } = body as { action: string };

    if (!magaluConfigurada()) {
      return json({ error: 'magalu_nao_configurada', details: 'A integração com a Magalu ainda não foi ativada no servidor (faltam as credenciais do app).' });
    }

    switch (action) {
      // Link do ID Magalu. O state é aleatório; a tela guarda e confere na volta (proteção contra CSRF).
      case 'auth_url': {
        const state = crypto.randomUUID();
        return json({ success: true, url: urlConsentimento(state), state, ambiente: MAGALU_AMBIENTE });
      }

      // Troca o code pelo token, descobre a loja e grava
      case 'exchange': {
        const code = String(body.code || '');
        if (!code) return json({ error: 'code é obrigatório' }, 400);
        const t = await trocarCode(code);
        if (!t.ok) {
          console.error('[magalu-auth] oauth/token', JSON.stringify(t.data));
          return json({ error: 'token_recusado', details: `A Magalu recusou a autorização: ${t.erro}` });
        }
        const loja = await identificarLoja(t.tokens.access_token);
        if (!loja.tenantId) {
          console.error('[magalu-auth] loja não identificada', loja.erro);
          return json({ error: 'loja_nao_identificada', details: `A autorização deu certo, mas não foi possível identificar a loja: ${loja.erro || 'sem tenant'}` });
        }
        const registro = {
          user_id: user.id, tenant_id: loja.tenantId, seller_name: loja.nome, ambiente: MAGALU_AMBIENTE,
          status: 'conectada', scopes: t.tokens.scope ?? MAGALU_SCOPES,
          access_token: t.tokens.access_token, refresh_token: t.tokens.refresh_token,
          token_expires_at: new Date(Date.now() + (t.tokens.expires_in || 7200) * 1000).toISOString(),
          ultimo_erro: loja.origem === 'jwt' ? `Loja identificada pelo token (portfolios/me: ${loja.erro})` : null,
          updated_at: new Date().toISOString(),
        };
        const { data: salvo, error } = await supabase.from('magalu_accounts')
          .upsert(registro, { onConflict: 'user_id,tenant_id,ambiente' })
          .select('id, tenant_id, seller_name, ambiente, status').single();
        if (error) return json({ error: 'falha_ao_salvar', details: error.message });
        return json({ success: true, loja: salvo });
      }

      // Teste rápido: lê a loja e o pedido mais recente com o token guardado (renova se precisar)
      case 'test': {
        const { data: conta } = await supabase.from('magalu_accounts').select('*')
          .eq('id', body.id).eq('user_id', user.id).single();
        if (!conta) return json({ error: 'Loja não encontrada' }, 404);
        const tk = await tokenValido(supabase, conta);
        if (!tk) return json({ error: 'token_expirado', details: 'A autorização venceu. Conecte a loja de novo.' });
        const me = await chamarMagalu('GET', '/seller/v1/portfolios/me', tk);
        const pedidos = await chamarMagalu('GET', '/seller/v1/orders', tk, { query: { _limit: 1, _sort: 'purchased_at:desc' } });
        if (me.ok && me.data?.seller?.name && me.data.seller.name !== conta.seller_name) {
          await supabase.from('magalu_accounts').update({ seller_name: me.data.seller.name, updated_at: new Date().toISOString() }).eq('id', conta.id);
        }
        return json({
          success: me.ok,
          details: me.erro,
          loja: me.data,
          pedidos: { ok: pedidos.ok, status: pedidos.status, erro: pedidos.erro, total: pedidos.data?.meta?.page?.count ?? pedidos.data?.meta?.page?.total ?? null },
        });
      }

      case 'disconnect': {
        const { error } = await supabase.from('magalu_accounts')
          .update({ status: 'desconectada', access_token: null, refresh_token: null, updated_at: new Date().toISOString() })
          .eq('id', body.id).eq('user_id', user.id);
        if (error) return json({ error: error.message });
        return json({ success: true });
      }

      default:
        return json({ error: `Ação desconhecida: ${action}`, api: MAGALU_API }, 400);
    }
  } catch (e) {
    console.error('[magalu-auth]', e);
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
