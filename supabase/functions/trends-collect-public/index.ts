import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

declare const EdgeRuntime: {
  waitUntil(promise: Promise<unknown>): void;
};

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const RATE_LIMIT_DELAY = 300; // ms between API calls

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Validate user authentication
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing authorization header' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Invalid token' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = await req.json();
    const { site_id = 'MLB', category_id, collect_type = 'trends' } = body;

    console.log(`[trends-collect-public] Starting ${collect_type} collection for site ${site_id}, category ${category_id || 'root'}`);

    // Return immediately and process in background
    EdgeRuntime.waitUntil(
      processPublicCollection(supabase, site_id, category_id, collect_type)
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

async function processPublicCollection(
  supabase: any,
  siteId: string,
  categoryId: string | null,
  collectType: string
) {
  try {
    const today = new Date().toISOString().split('T')[0];

    if (collectType === 'trends' || collectType === 'all') {
      await collectTrends(supabase, siteId, categoryId, today);
    }

    if ((collectType === 'highlights' || collectType === 'all') && categoryId) {
      await collectHighlights(supabase, siteId, categoryId, today);
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
  today: string
) {
  try {
    // Fetch trends from ML public API
    let url = `https://api.mercadolibre.com/trends/${siteId}`;
    if (categoryId) {
      url += `/${categoryId}`;
    }

    const response = await fetch(url);

    if (!response.ok) {
      if (response.status === 429) {
        console.warn('[trends-collect-public] Rate limited, will retry later');
        return;
      }
      console.error(`[trends-collect-public] Failed to fetch trends: ${response.status}`);
      return;
    }

    const trendsData = await response.json();

    // Save snapshot
    const { error: upsertError } = await supabase
      .from('trend_snapshots')
      .upsert({
        site_id: siteId,
        category_id: categoryId,
        snapshot_date: today,
        trends_data: trendsData,
        keywords_data: null, // Keywords would require additional API calls
      }, {
        onConflict: 'site_id,category_id,snapshot_date',
      });

    if (upsertError) {
      console.error('[trends-collect-public] Failed to save trends snapshot:', upsertError);
    } else {
      console.log(`[trends-collect-public] Saved trends snapshot for ${siteId}/${categoryId || 'root'}`);
    }
  } catch (error) {
    console.error('[trends-collect-public] Error in collectTrends:', error);
  }
}

async function collectHighlights(
  supabase: any,
  siteId: string,
  categoryId: string,
  today: string
) {
  try {
    // Fetch highlights (best sellers) from ML API
    const url = `https://api.mercadolibre.com/highlights/${siteId}/category/${categoryId}`;

    const response = await fetch(url);

    if (!response.ok) {
      if (response.status === 429) {
        console.warn('[trends-collect-public] Rate limited on highlights');
        return;
      }
      if (response.status === 404) {
        console.log(`[trends-collect-public] No highlights for category ${categoryId}`);
        return;
      }
      console.error(`[trends-collect-public] Failed to fetch highlights: ${response.status}`);
      return;
    }

    const highlightsData = await response.json();
    const content = highlightsData.content || [];

    if (content.length === 0) {
      console.log(`[trends-collect-public] No highlights content for ${categoryId}`);
      return;
    }

    // Create or update snapshot
    const { data: snapshot, error: snapError } = await supabase
      .from('highlights_snapshots')
      .upsert({
        site_id: siteId,
        category_id: categoryId,
        snapshot_date: today,
      }, {
        onConflict: 'site_id,category_id,snapshot_date',
      })
      .select('id')
      .single();

    if (snapError || !snapshot) {
      console.error('[trends-collect-public] Failed to create highlights snapshot:', snapError);
      return;
    }

    // Fetch item details for each highlight
    const items: any[] = [];
    for (let i = 0; i < content.length && i < 20; i++) {
      const itemId = content[i].id;
      
      await sleep(RATE_LIMIT_DELAY);

      try {
        const itemResponse = await fetch(`https://api.mercadolibre.com/items/${itemId}`);
        
        if (itemResponse.ok) {
          const itemData = await itemResponse.json();
          items.push({
            snapshot_id: snapshot.id,
            item_id: itemId,
            rank: i + 1,
            title: itemData.title,
            thumbnail: itemData.thumbnail,
            price: itemData.price,
            sold_quantity: itemData.sold_quantity,
            permalink: itemData.permalink,
          });
        }
      } catch (error) {
        console.error(`[trends-collect-public] Error fetching item ${itemId}:`, error);
      }
    }

    if (items.length > 0) {
      // Delete old items for this snapshot and insert new ones
      await supabase
        .from('highlights_items')
        .delete()
        .eq('snapshot_id', snapshot.id);

      const { error: insertError } = await supabase
        .from('highlights_items')
        .insert(items);

      if (insertError) {
        console.error('[trends-collect-public] Failed to insert highlights items:', insertError);
      } else {
        console.log(`[trends-collect-public] Saved ${items.length} highlights items for ${categoryId}`);
      }
    }
  } catch (error) {
    console.error('[trends-collect-public] Error in collectHighlights:', error);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
