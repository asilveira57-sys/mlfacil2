import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

declare const EdgeRuntime: {
  waitUntil(promise: Promise<unknown>): void;
};

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const ML_APP_ID = Deno.env.get('ML_APP_ID')!;
const ML_SECRET_KEY = Deno.env.get('ML_SECRET_KEY')!;
const RATE_LIMIT_DELAY = 500; // ms between API calls

// Popular categories to collect
const POPULAR_CATEGORIES = [
  { id: 'MLB5672', name: 'Acessórios para Veículos' },
  { id: 'MLB1051', name: 'Celulares e Telefones' },
  { id: 'MLB1648', name: 'Computadores' },
  { id: 'MLB1144', name: 'Eletrodomésticos' },
  { id: 'MLB1000', name: 'Eletrônicos' },
  { id: 'MLB1276', name: 'Esportes e Fitness' },
  { id: 'MLB263532', name: 'Ferramentas' },
  { id: 'MLB1574', name: 'Casa, Móveis e Decoração' },
  { id: 'MLB1499', name: 'Indústria e Comércio' },
  { id: 'MLB1384', name: 'Bebês' },
];

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    let body: any = {};
    try {
      body = await req.json();
    } catch {
      // Empty body is ok for cron calls
    }

    const { site_id = 'MLB', category_id, collect_type = 'all', collect_all_categories = false } = body;

    // Get an active ML account to use for authenticated API calls
    const { data: mlAccount, error: accError } = await supabase
      .from('ml_accounts')
      .select('ml_user_id, access_token, refresh_token, token_expires_at, user_id')
      .eq('is_active', true)
      .limit(1)
      .maybeSingle();

    if (accError || !mlAccount) {
      console.log('[trends-collect-public] No active ML account found, cannot collect trends');
      return new Response(JSON.stringify({ 
        error: 'No active ML account available',
        message: 'Uma conta do Mercado Livre precisa estar conectada para coletar tendências'
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Refresh token if needed
    let accessToken = mlAccount.access_token;
    if (new Date(mlAccount.token_expires_at) < new Date()) {
      const refreshed = await refreshToken(supabase, mlAccount.ml_user_id, mlAccount.user_id, mlAccount.refresh_token);
      if (!refreshed) {
        console.error('[trends-collect-public] Failed to refresh token');
        return new Response(JSON.stringify({ error: 'Token refresh failed' }), {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      accessToken = refreshed;
    }

    // For cron calls or explicit request, collect all popular categories
    if (collect_all_categories || !category_id) {
      console.log(`[trends-collect-public] Starting collection for all popular categories`);
      
      EdgeRuntime.waitUntil(
        collectAllCategories(supabase, site_id, accessToken)
      );

      return new Response(JSON.stringify({ 
        status: 'processing', 
        message: 'Collecting all popular categories in background' 
      }), {
        status: 202,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`[trends-collect-public] Starting ${collect_type} collection for site ${site_id}, category ${category_id || 'root'}`);

    EdgeRuntime.waitUntil(
      processPublicCollection(supabase, site_id, category_id, collect_type, accessToken)
    );

    return new Response(JSON.stringify({ 
      status: 'processing', 
      message: 'Collection started in background' 
    }), {
      status: 202,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error: unknown) {
    console.error('[trends-collect-public] Error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

async function refreshToken(supabase: any, sellerId: string, userId: string, refreshTokenValue: string): Promise<string | null> {
  try {
    const response = await fetch('https://api.mercadolibre.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: ML_APP_ID,
        client_secret: ML_SECRET_KEY,
        refresh_token: refreshTokenValue,
      }),
    });

    if (!response.ok) {
      console.error('[trends-collect-public] Token refresh failed');
      return null;
    }

    const data = await response.json();
    const expiresAt = new Date(Date.now() + data.expires_in * 1000).toISOString();

    await supabase
      .from('ml_accounts')
      .update({
        access_token: data.access_token,
        refresh_token: data.refresh_token,
        token_expires_at: expiresAt,
        updated_at: new Date().toISOString(),
      })
      .eq('ml_user_id', sellerId)
      .eq('user_id', userId);

    return data.access_token;
  } catch (error) {
    console.error('[trends-collect-public] Token refresh error:', error);
    return null;
  }
}

async function collectAllCategories(supabase: any, siteId: string, accessToken: string) {
  const today = new Date().toISOString().split('T')[0];
  
  console.log(`[trends-collect-public] Starting collection for ${POPULAR_CATEGORIES.length + 1} categories`);

  // Collect root trends first
  await collectTrends(supabase, siteId, null, today, accessToken);
  await sleep(RATE_LIMIT_DELAY);

  // Collect trends and highlights for each popular category
  for (const category of POPULAR_CATEGORIES) {
    try {
      console.log(`[trends-collect-public] Collecting ${category.name}`);
      await collectTrends(supabase, siteId, category.id, today, accessToken);
      await sleep(RATE_LIMIT_DELAY);
      await collectHighlights(supabase, siteId, category.id, today, accessToken);
      await sleep(RATE_LIMIT_DELAY * 2); // Extra delay between categories
    } catch (error) {
      console.error(`[trends-collect-public] Error collecting ${category.id}:`, error);
    }
  }

  console.log(`[trends-collect-public] Completed collection for all categories`);
}

async function processPublicCollection(
  supabase: any,
  siteId: string,
  categoryId: string | null,
  collectType: string,
  accessToken: string
) {
  try {
    const today = new Date().toISOString().split('T')[0];

    if (collectType === 'trends' || collectType === 'all') {
      await collectTrends(supabase, siteId, categoryId, today, accessToken);
    }

    if ((collectType === 'highlights' || collectType === 'all') && categoryId) {
      await collectHighlights(supabase, siteId, categoryId, today, accessToken);
    }

    console.log(`[trends-collect-public] Collection completed for ${siteId}/${categoryId || 'root'}`);
  } catch (error) {
    console.error('[trends-collect-public] Background processing error:', error);
  }
}

async function collectTrends(
  supabase: any,
  siteId: string,
  categoryId: string | null,
  today: string,
  accessToken: string
) {
  try {
    // Fetch trends from ML API with authentication
    let url = `https://api.mercadolibre.com/trends/${siteId}`;
    if (categoryId) {
      url += `/${categoryId}`;
    }

    console.log(`[trends-collect-public] Fetching trends from ${url}`);
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });

    if (!response.ok) {
      if (response.status === 429) {
        console.warn('[trends-collect-public] Rate limited, will retry later');
        return;
      }
      const errorText = await response.text();
      console.error(`[trends-collect-public] Failed to fetch trends: ${response.status} - ${errorText}`);
      return;
    }

    const trendsData = await response.json();
    console.log(`[trends-collect-public] Got ${trendsData?.length || 0} trends`);

    // For null category_id, we need to use a special value for the unique constraint
    const categoryValue = categoryId || '__ROOT__';

    // Check if snapshot exists
    const { data: existing } = await supabase
      .from('trend_snapshots')
      .select('id')
      .eq('site_id', siteId)
      .eq('category_id', categoryValue)
      .eq('snapshot_date', today)
      .maybeSingle();

    if (existing) {
      // Update existing
      const { error: updateError } = await supabase
        .from('trend_snapshots')
        .update({
          trends_data: trendsData,
        })
        .eq('id', existing.id);

      if (updateError) {
        console.error('[trends-collect-public] Failed to update trends snapshot:', updateError);
      } else {
        console.log(`[trends-collect-public] Updated trends snapshot for ${siteId}/${categoryId || 'root'}`);
      }
    } else {
      // Insert new
      const { error: insertError } = await supabase
        .from('trend_snapshots')
        .insert({
          site_id: siteId,
          category_id: categoryValue,
          snapshot_date: today,
          trends_data: trendsData,
          keywords_data: null,
        });

      if (insertError) {
        console.error('[trends-collect-public] Failed to insert trends snapshot:', insertError);
      } else {
        console.log(`[trends-collect-public] Saved trends snapshot for ${siteId}/${categoryId || 'root'}`);
      }
    }
  } catch (error) {
    console.error('[trends-collect-public] Error in collectTrends:', error);
  }
}

async function collectHighlights(
  supabase: any,
  siteId: string,
  categoryId: string,
  today: string,
  accessToken: string
) {
  const diagPrefix = `[trends-collect-public][highlights][${siteId}/${categoryId}]`;

  try {
    console.log(`${diagPrefix} start today=${today}`);

    // A) Log detalhado do highlights
    const url = `https://api.mercadolibre.com/highlights/${siteId}/category/${categoryId}`;
    console.log(`${diagPrefix} fetching highlights url=${url}`);

    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    const highlightsText = await response.text();
    console.log(`${diagPrefix} highlights status=${response.status} ok=${response.ok}`);
    if (!response.ok) {
      console.error(`${diagPrefix} highlights error body=${highlightsText}`);
    }

    let highlightsData: any = null;
    try {
      highlightsData = highlightsText ? JSON.parse(highlightsText) : null;
    } catch (e) {
      console.error(`${diagPrefix} highlights JSON parse failed`);
    }

    const content: any[] = Array.isArray(highlightsData?.content) ? highlightsData.content : [];
    console.log(`${diagPrefix} highlights content.length=${content.length}`);

    const contentSample = content.slice(0, 3).map((h: any) => ({ id: h?.id, type: h?.type }));
    console.log(`${diagPrefix} highlights content.sample(3)=`, contentSample);

    // Sempre gerar itens-base para nunca ficar 0 (mesmo sem enriquecimento)
    // Também ajuda auditoria quando type != ITEM.
    const baseFromHighlights = content
      .slice(0, 20)
      .filter((h: any) => !!h?.id)
      .map((h: any, idx: number) => {
        const rawType = String(h?.type ?? '').toUpperCase();
        return {
          item_id: String(h.id),
          rank: idx + 1,
          // se for ITEM, tentaremos preencher título/thumbnail depois
          // se não for ITEM, deixamos um marcador para auditoria
          title: rawType && rawType !== 'ITEM' ? `[${rawType}] ${String(h.id)}` : null,
          thumbnail: null,
          price: null,
          sold_quantity: null,
          permalink: null,
          _raw_type: rawType,
        };
      });

    // B) Log + enriquecimento em lote (somente ITEM)
    const itemIdsForEnrichment = baseFromHighlights
      .filter((it: any) => it._raw_type === 'ITEM')
      .map((it: any) => it.item_id);

    console.log(`${diagPrefix} enrich candidates (type=ITEM) count=${itemIdsForEnrichment.length}`);

    const enrichedMap = new Map<string, any>();

    if (itemIdsForEnrichment.length > 0) {
      const idsParam = itemIdsForEnrichment.join(',');
      const batchUrl = `https://api.mercadolibre.com/items?ids=${encodeURIComponent(idsParam)}`;
      console.log(`${diagPrefix} fetching batch items url=${batchUrl}`);

      const batchResponse = await fetch(batchUrl, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      const batchText = await batchResponse.text();
      console.log(`${diagPrefix} batch status=${batchResponse.status} ok=${batchResponse.ok}`);

      if (!batchResponse.ok) {
        console.error(`${diagPrefix} batch error body=${batchText}`);
      } else {
        let batchData: any[] = [];
        try {
          batchData = batchText ? JSON.parse(batchText) : [];
        } catch {
          console.error(`${diagPrefix} batch JSON parse failed`);
        }

        const okCount = (batchData || []).filter((x: any) => x?.code === 200).length;
        const failCount = (batchData || []).length - okCount;
        console.log(`${diagPrefix} batch parsed len=${(batchData || []).length} code200=${okCount} fail=${failCount}`);

        for (const entry of batchData || []) {
          if (entry?.code === 200 && entry?.body?.id) {
            enrichedMap.set(String(entry.body.id), entry.body);
          } else if (entry?.code && entry?.body) {
            console.error(`${diagPrefix} batch entry error code=${entry.code} body=`, entry.body);
          }
        }
      }
    }

    // Aplica enriquecimento onde tiver code 200; mantém base mesmo quando falhar.
    let items = baseFromHighlights.map((it: any) => {
      const body = enrichedMap.get(it.item_id);
      if (!body) return it;
      return {
        ...it,
        title: body.title ?? it.title,
        thumbnail: body.thumbnail ?? null,
        price: body.price ?? null,
        sold_quantity: body.sold_quantity ?? null,
        permalink: body.permalink ?? null,
      };
    });

    // Remove campo interno
    items = items.map(({ _raw_type, ...rest }: any) => rest);

    console.log(`${diagPrefix} final items before fallback count=${items.length}`);

    // Fallback: se highlights não retornou nada, usar search.
    if (items.length === 0) {
      console.log(`${diagPrefix} fallback to search (no items from highlights)`);
      items = await fetchBestSellersViaSearch(siteId, categoryId, accessToken);
      console.log(`${diagPrefix} fallback search items count=${items.length}`);
    }

    if (items.length === 0) {
      console.log(`${diagPrefix} no items found via any method`);
      return;
    }

    // Snapshot + persistência
    const { data: existing } = await supabase
      .from('highlights_snapshots')
      .select('id')
      .eq('site_id', siteId)
      .eq('category_id', categoryId)
      .eq('snapshot_date', today)
      .maybeSingle();

    let snapshotId: string;

    if (existing) {
      snapshotId = existing.id;
    } else {
      const { data: newSnapshot, error: snapError } = await supabase
        .from('highlights_snapshots')
        .insert({
          site_id: siteId,
          category_id: categoryId,
          snapshot_date: today,
        })
        .select('id')
        .single();

      if (snapError || !newSnapshot) {
        console.error(`${diagPrefix} failed to create highlights snapshot:`, snapError);
        return;
      }
      snapshotId = newSnapshot.id;
    }

    // Add snapshot_id to items
    const itemsWithSnapshot = items.map((item: any) => ({
      ...item,
      snapshot_id: snapshotId,
    }));

    console.log(`${diagPrefix} saving snapshotId=${snapshotId} items=${itemsWithSnapshot.length}`);

    // Delete old items for this snapshot and insert new ones
    const { error: delError } = await supabase
      .from('highlights_items')
      .delete()
      .eq('snapshot_id', snapshotId);

    if (delError) {
      console.error(`${diagPrefix} delete previous items failed:`, delError);
    }

    const { error: insertError } = await supabase
      .from('highlights_items')
      .insert(itemsWithSnapshot);

    if (insertError) {
      console.error(`${diagPrefix} insert highlights items failed:`, insertError);
    } else {
      console.log(`${diagPrefix} saved highlights items ok count=${itemsWithSnapshot.length}`);
    }
  } catch (error) {
    console.error(`${diagPrefix} error in collectHighlights:`, error);
  }
}

// Fallback: fetch best sellers via search API sorted by sold_quantity
async function fetchBestSellersViaSearch(
  siteId: string,
  categoryId: string,
  accessToken: string
): Promise<any[]> {
  const diagPrefix = `[trends-collect-public][highlights][${siteId}/${categoryId}][search-fallback]`;

  const url = `https://api.mercadolibre.com/sites/${siteId}/search?category=${categoryId}&sort=sold_quantity_desc&limit=20`;

  // 1) tenta com token
  try {
    console.log(`${diagPrefix} fetching url=${url} auth=on`);
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    const text = await response.text();
    console.log(`${diagPrefix} status=${response.status} ok=${response.ok}`);

    if (response.ok) {
      const data = text ? JSON.parse(text) : {};
      const results = data.results || [];
      console.log(`${diagPrefix} results.length=${results.length}`);

      return results.map((item: any, idx: number) => ({
        item_id: item.id,
        rank: idx + 1,
        title: item.title,
        thumbnail: item.thumbnail,
        price: item.price,
        sold_quantity: item.sold_quantity,
        permalink: item.permalink,
      }));
    }

    console.error(`${diagPrefix} error body=${text}`);

    // 2) se 403, tenta sem token (algumas rotas funcionam melhor público)
    if (response.status === 403) {
      console.warn(`${diagPrefix} got 403 with auth, retrying without auth`);
      const resp2 = await fetch(url);
      const text2 = await resp2.text();
      console.log(`${diagPrefix} retry-noauth status=${resp2.status} ok=${resp2.ok}`);

      if (!resp2.ok) {
        console.error(`${diagPrefix} retry-noauth error body=${text2}`);
        return [];
      }

      const data2 = text2 ? JSON.parse(text2) : {};
      const results2 = data2.results || [];
      console.log(`${diagPrefix} retry-noauth results.length=${results2.length}`);

      return results2.map((item: any, idx: number) => ({
        item_id: item.id,
        rank: idx + 1,
        title: item.title,
        thumbnail: item.thumbnail,
        price: item.price,
        sold_quantity: item.sold_quantity,
        permalink: item.permalink,
      }));
    }

    return [];
  } catch (error) {
    console.error(`${diagPrefix} error:`, error);
    return [];
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
