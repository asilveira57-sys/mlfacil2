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
    const { action } = body;

    // Get ML account + token
    const { data: mlAccount, error: accError } = await supabase
      .from('ml_accounts')
      .select('*')
      .eq('user_id', userId)
      .eq('is_active', true)
      .single();

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

    return new Response(JSON.stringify({ error: 'Invalid action' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (error) {
    console.error('[ml-price-adjustment] Error:', error);
    return new Response(JSON.stringify({ error: String(error) }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
