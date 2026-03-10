import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { item_ids, ml_account_id } = await req.json();

    if (!item_ids?.length) {
      return new Response(JSON.stringify({ enriched: 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Auth
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing authorization' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: userError } = await supabaseClient.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'Not authenticated' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ML API Access Gate
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );
    const { assertMlApiAccess } = await import("../_shared/ml-api-gate.ts");
    const gate = await assertMlApiAccess(supabaseAdmin, user.id);
    if (!gate.allowed) return gate.response!;

    // Get ML account with token
    let accountQuery = supabaseClient
      .from('ml_accounts')
      .select('*')
      .eq('user_id', user.id)
      .eq('is_active', true);

    if (ml_account_id) {
      accountQuery = accountQuery.eq('id', ml_account_id);
    }

    const { data: mlAccount, error: accountError } = await accountQuery.single();
    if (accountError || !mlAccount) {
      return new Response(JSON.stringify({ error: 'No ML account found', needsAuth: true }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Token refresh if needed
    let accessToken = mlAccount.access_token;
    const tokenExpiry = new Date(mlAccount.token_expires_at);
    if (tokenExpiry <= new Date()) {
      console.log('[enrich] Refreshing expired token');
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
      if (!refreshRes.ok) throw new Error('Token refresh failed');
      const refreshData = await refreshRes.json();
      accessToken = refreshData.access_token;
      const newExpiry = new Date();
      newExpiry.setSeconds(newExpiry.getSeconds() + refreshData.expires_in);
      await supabaseClient.from('ml_accounts').update({
        access_token: refreshData.access_token,
        refresh_token: refreshData.refresh_token,
        token_expires_at: newExpiry.toISOString(),
      }).eq('id', mlAccount.id);
    }

    // Fetch from ML API in batches of 20 (multi-get limit)
    const ML_BATCH = 20;
    const enrichedItems: any[] = [];

    for (let i = 0; i < item_ids.length; i += ML_BATCH) {
      const batch = item_ids.slice(i, i + ML_BATCH);
      const idsParam = batch.join(',');
      const url = `https://api.mercadolibre.com/items?ids=${idsParam}&attributes=id,title,thumbnail,status,available_quantity,price,variations`;

      const res = await fetch(url, {
        headers: { 'Authorization': `Bearer ${accessToken}`, 'Accept': 'application/json' },
      });

      if (!res.ok) {
        console.error(`[enrich] Multi-get failed: ${res.status}`);
        continue;
      }

      const results = await res.json();
      if (!Array.isArray(results)) continue;

      for (const r of results) {
        if (r.code !== 200 || !r.body) continue;
        const item = r.body;

        // Extract SKU from first variation if available
        let sku: string | null = null;
        let variationId = '0';
        if (item.variations?.length > 0) {
          const v = item.variations[0];
          variationId = String(v.id || '0');
          if (v.attributes) {
            const skuAttr = v.attributes.find((a: any) => a.id === 'SELLER_SKU');
            sku = skuAttr?.value_name || null;
          }
        }

        enrichedItems.push({
          item_id: item.id,
          title: item.title,
          thumbnail: item.thumbnail,
          status: item.status,
          available_quantity: item.available_quantity,
          price: item.price || 0,
          sku,
          variation_id: variationId,
        });
      }
    }

    // Upsert into meli_listings_cache
    if (enrichedItems.length > 0) {
      const UPSERT_BATCH = 100;
      for (let i = 0; i < enrichedItems.length; i += UPSERT_BATCH) {
        const batch = enrichedItems.slice(i, i + UPSERT_BATCH).map(e => ({
          seller_id: mlAccount.ml_user_id,
          user_id: user.id,
          item_id: e.item_id,
          title: e.title,
          thumbnail: e.thumbnail,
          status: e.status,
          available_quantity: e.available_quantity,
          price: e.price,
          sku: e.sku,
          variation_id: e.variation_id,
          last_sync_at: new Date().toISOString(),
        }));

        const { error: upsertError } = await supabaseAdmin
          .from('meli_listings_cache')
          .upsert(batch, { onConflict: 'seller_id,item_id' });

        if (upsertError) {
          console.error('[enrich] Upsert error:', upsertError.message);
        }
      }
    }

    console.log(`[enrich] Enriched ${enrichedItems.length}/${item_ids.length} items`);

    return new Response(JSON.stringify({
      enriched: enrichedItems.length,
      total: item_ids.length,
      items: enrichedItems,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('[enrich] Error:', error);
    return new Response(JSON.stringify({
      error: error instanceof Error ? error.message : 'Unknown error',
    }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
