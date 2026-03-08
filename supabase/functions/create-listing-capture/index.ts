import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface CaptureRequest {
  item_id: string;
  id_type?: 'MLB' | 'MLBU';
  seller_id?: string;
}

interface CaptureLog {
  pictures_count: number;
  pictures_source: 'api_full' | 'thumbnail_fallback' | 'none';
  description_status: 'success' | 'failed';
  description_source: 'api_public' | 'api_authenticated' | 'none';
  dimensions_found: boolean;
  attributes_count: number;
  errors: string[];
}

// ============================================================================
// RESOLUÇÃO DE MLBU → MLB (Catálogo para Item Real)
// ============================================================================
async function resolveMLBUtoMLB(mlbuId: string, accessToken?: string): Promise<{
  ok: boolean;
  itemId?: string;
  error?: string;
}> {
  console.log(`[create-listing-capture] Resolving MLBU: ${mlbuId}`);
  
  const headers: Record<string, string> = {};
  if (accessToken) {
    headers["Authorization"] = `Bearer ${accessToken}`;
  }
  
  // Tentar buscar o produto de catálogo
  const productResponse = await fetch(`https://api.mercadolibre.com/products/${mlbuId}`, {
    headers,
  });
  
  if (!productResponse.ok) {
    // Tentar formato MLB
    const numericPart = mlbuId.replace(/^MLBU/i, '');
    const mlbId = `MLB${numericPart}`;
    
    console.log(`[create-listing-capture] MLBU not found, trying MLB format: ${mlbId}`);
    
    const mlbResponse = await fetch(`https://api.mercadolibre.com/products/${mlbId}`, {
      headers,
    });
    
    if (!mlbResponse.ok) {
      return {
        ok: false,
        error: `Produto de catálogo não encontrado: ${mlbuId}`,
      };
    }
    
    const productData = await mlbResponse.json();
    if (productData.buy_box_winner?.item_id) {
      return { ok: true, itemId: productData.buy_box_winner.item_id };
    }
    
    return { ok: false, error: "Catálogo sem vendedor ativo (buy_box vazio)" };
  }
  
  const productData = await productResponse.json();
  
  if (productData.buy_box_winner?.item_id) {
    console.log(`[create-listing-capture] MLBU resolved to MLB: ${productData.buy_box_winner.item_id}`);
    return { ok: true, itemId: productData.buy_box_winner.item_id };
  }
  
  return { ok: false, error: "Catálogo sem vendedor ativo (buy_box vazio)" };
}

// ============================================================================
// MULTI-GET FETCH — Bypasses PolicyAgent on /items/{id}
// Returns data from /items?ids={id}&attributes=all
// ============================================================================
async function fetchItemMultiGet(itemId: string, accessToken?: string): Promise<{
  ok: boolean;
  data?: any;
  error?: string;
  status?: number;
  method: string;
}> {
  const url = `https://api.mercadolibre.com/items?ids=${itemId}&attributes=all`;
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (accessToken) {
    headers['Authorization'] = `Bearer ${accessToken}`;
  }
  const label = accessToken ? 'multi-get-auth' : 'multi-get-public';
  console.log(`[create-listing-capture] Fetching item ${label}: ${itemId}`);

  try {
    const response = await fetch(url, { headers });
    const results = await response.json();

    if (Array.isArray(results) && results[0]?.code === 200 && results[0]?.body) {
      console.log(`[create-listing-capture] ${label} SUCCESS: ${itemId}, pictures=${results[0].body.pictures?.length || 0}`);
      return { ok: true, data: results[0].body, status: 200, method: label };
    }
    // Some ML responses return object directly
    if (!Array.isArray(results) && results?.id) {
      return { ok: true, data: results, status: 200, method: label };
    }

    const code = results?.[0]?.code || response.status;
    console.log(`[create-listing-capture] ${label} failed: ${code}`);
    return { ok: false, error: `Multi-get failed: ${code}`, status: code, method: label };
  } catch (e: any) {
    console.log(`[create-listing-capture] ${label} error: ${e.message}`);
    return { ok: false, error: e.message, status: 0, method: label };
  }
}

// ============================================================================
// SEARCH FALLBACK — Uses /sites/MLB/search?q={id}
// ============================================================================
async function fetchItemSearch(itemId: string, accessToken?: string): Promise<{
  ok: boolean;
  data?: any;
  error?: string;
}> {
  const url = `https://api.mercadolibre.com/sites/MLB/search?q=${itemId}&limit=1`;
  const headers: Record<string, string> = {};
  if (accessToken) {
    headers['Authorization'] = `Bearer ${accessToken}`;
  }
  console.log(`[create-listing-capture] Fetching item via SEARCH: ${itemId}`);

  try {
    const response = await fetch(url, { headers });
    const searchData = await response.json();

    if (searchData.results?.[0]?.id === itemId) {
      console.log(`[create-listing-capture] Search found item: ${itemId}`);
      return { ok: true, data: searchData.results[0] };
    }
    return { ok: false, error: 'Item not found in search' };
  } catch (e: any) {
    return { ok: false, error: e.message };
  }
}

// ============================================================================
// LEGACY SINGLE-GET (último recurso)
// ============================================================================
async function fetchItemPublic(itemId: string): Promise<{
  ok: boolean;
  data?: any;
  error?: string;
  status?: number;
}> {
  console.log(`[create-listing-capture] Fetching item LEGACY PUBLIC: ${itemId}`);
  
  const response = await fetch(`https://api.mercadolibre.com/items/${itemId}`);
  
  if (!response.ok) {
    console.log(`[create-listing-capture] Legacy public fetch failed: ${response.status}`);
    return { ok: false, error: `Item não encontrado: ${itemId}`, status: response.status };
  }
  
  const data = await response.json();
  return { ok: true, data };
}

// ============================================================================
// BUSCA DE DESCRIÇÃO PÚBLICA (com retry)
// ============================================================================
async function fetchDescriptionPublic(itemId: string, retries = 3): Promise<{
  text?: string;
  source: 'api_public' | 'none';
  error?: string;
}> {
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      console.log(`[create-listing-capture] Fetching description: ${itemId} (attempt ${attempt + 1})`);
      
      const response = await fetch(`https://api.mercadolibre.com/items/${itemId}/description`, {
        signal: AbortSignal.timeout(10000),
      });
      
      if (response.ok) {
        const descData = await response.json();
        const text = descData.plain_text || descData.text || '';
        console.log(`[create-listing-capture] Description fetched: ${text.length} chars`);
        return { text, source: 'api_public' };
      }
      
      console.log(`[create-listing-capture] Description fetch failed: ${response.status}`);
    } catch (e: any) {
      console.log(`[create-listing-capture] Description fetch error (attempt ${attempt + 1}): ${e.message}`);
      if (attempt < retries - 1) {
        await new Promise(r => setTimeout(r, 1000));
      }
    }
  }
  
  return { source: 'none', error: 'Failed to fetch description after retries' };
}

// ============================================================================
// BUSCA AUTENTICADA DE ITEM
// ============================================================================
async function fetchItemAuthenticated(itemId: string, accessToken: string): Promise<{
  ok: boolean;
  data?: any;
  description?: string;
  descriptionSource?: 'api_authenticated' | 'none';
  error?: string;
}> {
  console.log(`[create-listing-capture] Fetching item AUTHENTICATED: ${itemId}`);
  
  const response = await fetch(`https://api.mercadolibre.com/items/${itemId}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  
  if (!response.ok) {
    return { ok: false, error: `Erro ao buscar item: ${response.status}` };
  }
  
  const data = await response.json();
  
  // Também buscar descrição com autenticação
  let description: string | undefined;
  let descriptionSource: 'api_authenticated' | 'none' = 'none';
  
  try {
    const descResponse = await fetch(`https://api.mercadolibre.com/items/${itemId}/description`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (descResponse.ok) {
      const descData = await descResponse.json();
      description = descData.plain_text || descData.text;
      if (description) {
        descriptionSource = 'api_authenticated';
      }
    }
  } catch (e) {
    console.log(`[create-listing-capture] Could not fetch description with auth`);
  }
  
  return { ok: true, data, description, descriptionSource };
}

// ============================================================================
// PROCESSAR FOTOS (TODAS, não só thumbnail)
// ============================================================================
function processAllPictures(pictures: any[], thumbnail?: string): {
  processed: Array<{ id: string; url: string; secure_url: string }>;
  source: 'api_full' | 'thumbnail_fallback' | 'none';
} {
  if (!pictures || !Array.isArray(pictures) || pictures.length === 0) {
    if (thumbnail) {
      const secureUrl = thumbnail.replace(/^http:\/\//i, 'https://');
      console.log(`[create-listing-capture] No pictures array, using thumbnail fallback`);
      return {
        processed: [{ id: 'thumb', url: secureUrl, secure_url: secureUrl }],
        source: 'thumbnail_fallback',
      };
    }
    return { processed: [], source: 'none' };
  }
  
  const processed = pictures
    .map((p: any, index: number) => {
      const secureUrl = (p.secure_url || p.url || '').replace(/^http:\/\//i, 'https://');
      return {
        id: p.id || `pic_${index}`,
        url: secureUrl,
        secure_url: secureUrl,
        size: p.size,
        max_size: p.max_size,
      };
    })
    .filter((p) => p.url && p.url.length > 0);
  
  console.log(`[create-listing-capture] Processed ${processed.length} pictures`);
  return { processed, source: 'api_full' };
}

// ============================================================================
// MAIN HANDLER
// ============================================================================
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Validate auth
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ success: false, error: "Missing authorization header" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    if (userError || !user) {
      return new Response(JSON.stringify({ success: false, error: "Invalid token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { item_id, id_type, seller_id } = await req.json() as CaptureRequest;

    if (!item_id) {
      return new Response(JSON.stringify({ success: false, error: "item_id is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Initialize capture log
    const captureLog: CaptureLog = {
      pictures_count: 0,
      pictures_source: 'none',
      description_status: 'failed',
      description_source: 'none',
      dimensions_found: false,
      attributes_count: 0,
      errors: [],
    };

    // Normalize item_id
    let normalizedId = item_id.replace(/-/g, '').toUpperCase();
    let resolvedItemId = normalizedId;
    
    console.log(`[create-listing-capture] Processing: ${normalizedId}, type: ${id_type || 'auto'}`);

    // =========================================================================
    // ETAPA 1: Resolver MLBU para MLB se necessário
    // =========================================================================
    if (id_type === 'MLBU' || /^MLBU/i.test(normalizedId)) {
      let accessTokenForResolution: string | undefined;
      
      if (seller_id) {
        const { data: mlAccount } = await supabase
          .from("ml_accounts")
          .select("access_token")
          .eq("ml_user_id", String(seller_id))
          .eq("user_id", user.id)
          .maybeSingle();
        accessTokenForResolution = mlAccount?.access_token || undefined;
      }
      
      const resolution = await resolveMLBUtoMLB(normalizedId, accessTokenForResolution);
      
      if (!resolution.ok) {
        return new Response(JSON.stringify({
          success: false,
          error: "CATALOG_RESOLUTION_FAILED",
          message: resolution.error || "Não foi possível resolver o link de catálogo",
          user_guidance: "Cole o link de um anúncio específico (MLB) em vez do link de catálogo (/up/MLBU...).",
        }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      
      resolvedItemId = resolution.itemId!;
      console.log(`[create-listing-capture] MLBU resolved: ${normalizedId} → ${resolvedItemId}`);
    }

    // =========================================================================
    // ETAPA 2: Buscar credenciais ML
    // =========================================================================
    let mlAccount: { access_token: string | null; ml_user_id: string } | null = null;
    
    if (seller_id) {
      const { data } = await supabase
        .from("ml_accounts")
        .select("access_token, ml_user_id")
        .eq("ml_user_id", String(seller_id))
        .eq("user_id", user.id)
        .maybeSingle();
      mlAccount = data;
    }
    
    if (!mlAccount?.access_token) {
      const { data } = await supabase
        .from("ml_accounts")
        .select("access_token, ml_user_id")
        .eq("user_id", user.id)
        .not("access_token", "is", null)
        .limit(1)
        .maybeSingle();
      mlAccount = data;
    }

    // =========================================================================
    // ETAPA 3: Buscar dados do item (Multi-get → Search → Legacy → Fail)
    // =========================================================================
    let itemData: any = null;
    let description: string | undefined;
    let descriptionSource: 'api_public' | 'api_authenticated' | 'none' = 'none';

    // A) Multi-get autenticado
    if (mlAccount?.access_token) {
      const mgAuth = await fetchItemMultiGet(resolvedItemId, mlAccount.access_token);
      if (mgAuth.ok) itemData = mgAuth.data;
    }

    // B) Multi-get público
    if (!itemData) {
      const mgPublic = await fetchItemMultiGet(resolvedItemId);
      if (mgPublic.ok) itemData = mgPublic.data;
    }

    // C) Search fallback
    if (!itemData) {
      const searchResult = await fetchItemSearch(resolvedItemId, mlAccount?.access_token || undefined);
      if (searchResult.ok) itemData = searchResult.data;
    }

    // D) Legacy single-get público
    if (!itemData) {
      const legacyResult = await fetchItemPublic(resolvedItemId);
      if (legacyResult.ok) itemData = legacyResult.data;
    }

    // All attempts failed
    if (!itemData) {
      captureLog.errors.push('Falha ao buscar item via todas as estratégias (multi-get, search, legacy)');
      return new Response(JSON.stringify({
        success: false,
        error: "ITEM_NOT_FOUND",
        message: `Não foi possível encontrar o anúncio: ${resolvedItemId}`,
        user_guidance: "Verifique se o link está correto e se o anúncio ainda está ativo.",
      }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch description (separate endpoint, not blocked by PolicyAgent)
    const descResult = await fetchDescriptionPublic(resolvedItemId);
    description = descResult.text;
    descriptionSource = descResult.source;
    if (descResult.error) {
      captureLog.errors.push(descResult.error);
    }

    // If public description failed, try authenticated
    if (!description && mlAccount?.access_token) {
      try {
        const descResponse = await fetch(`https://api.mercadolibre.com/items/${resolvedItemId}/description`, {
          headers: { Authorization: `Bearer ${mlAccount.access_token}` },
        });
        if (descResponse.ok) {
          const descData = await descResponse.json();
          description = descData.plain_text || descData.text;
          if (description) descriptionSource = 'api_authenticated';
        }
      } catch (e) {
        console.log(`[create-listing-capture] Auth description fetch failed`);
      }
    }
    
    // =========================================================================
    // ETAPA 4: Processar dados capturados
    // =========================================================================
    
    // Processar TODAS as fotos
    const picturesResult = processAllPictures(itemData.pictures, itemData.thumbnail);
    captureLog.pictures_count = picturesResult.processed.length;
    captureLog.pictures_source = picturesResult.source;
    
    // Descrição
    captureLog.description_status = description ? 'success' : 'failed';
    captureLog.description_source = descriptionSource;
    
    // Verificar dimensões nos atributos
    const attributes = itemData.attributes || [];
    captureLog.attributes_count = attributes.length;
    
    const dimensionAttrs = ['SELLER_PACKAGE_HEIGHT', 'SELLER_PACKAGE_WIDTH', 'SELLER_PACKAGE_LENGTH', 'SELLER_PACKAGE_WEIGHT', 'PACKAGE_HEIGHT', 'PACKAGE_WIDTH', 'PACKAGE_LENGTH', 'PACKAGE_WEIGHT'];
    captureLog.dimensions_found = attributes.some((attr: any) => 
      dimensionAttrs.includes(attr.id?.toUpperCase())
    );
    
    // Validação crítica: pelo menos 1 foto (aviso se menos de 2)
    if (picturesResult.processed.length === 0) {
      captureLog.errors.push('Nenhuma foto capturada');
    } else if (picturesResult.processed.length === 1) {
      captureLog.errors.push('Apenas 1 foto capturada (mínimo recomendado: 2)');
    }
    
    // Aviso se descrição vazia
    if (!description) {
      captureLog.errors.push('Descrição não capturada');
    }
    
    console.log(`[create-listing-capture] Capture complete:`, captureLog);

    // Montar resposta
    const responseItem = {
      id: resolvedItemId,
      title: itemData.title,
      description: description || '',
      price: itemData.price,
      available_quantity: itemData.available_quantity,
      condition: itemData.condition,
      category_id: itemData.category_id,
      listing_type_id: itemData.listing_type_id,
      pictures: picturesResult.processed,
      attributes: itemData.attributes || [],
      seller_id: itemData.seller_id,
      thumbnail: itemData.thumbnail,
    };

    return new Response(JSON.stringify({
      success: true,
      item: responseItem,
      resolved_item_id: resolvedItemId,
      capture_log: captureLog,
    }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error: any) {
    console.error(`[create-listing-capture] Error:`, error);
    return new Response(JSON.stringify({
      success: false,
      error: "INTERNAL_ERROR",
      message: error.message || "Erro interno",
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
