import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface SnapshotRequest {
  item_id: string;
  id_type?: 'MLB' | 'MLBU';
  ml_account_id?: string;
  seller_id?: string;
}

interface CaptureLog {
  pictures_count: number;
  pictures_source: 'api_full' | 'api_thumbnail_fallback' | 'none';
  description_captured: boolean;
  description_source?: 'api_public' | 'api_authenticated' | 'none';
  dimensions_captured: boolean;
  dimensions_source?: 'attributes' | 'none';
  attributes_count: number;
  gtin_found: boolean;
  ean_found: boolean;
  sku_found: boolean;
  errors: string[];
}

// ============================================================================
// RESOLUÇÃO DE MLBU → MLB (Catálogo para Item Real)
// ============================================================================
async function resolveMLBUtoMLB(mlbuId: string, accessToken?: string): Promise<{
  ok: boolean;
  itemId?: string;
  error?: string;
  productData?: any;
}> {
  console.log(`[ad-item-snapshot] Resolving MLBU: ${mlbuId}`);
  
  const headers: Record<string, string> = {};
  if (accessToken) {
    headers["Authorization"] = `Bearer ${accessToken}`;
  }
  
  const productResponse = await fetch(`https://api.mercadolibre.com/products/${mlbuId}`, {
    headers,
  });
  
  if (!productResponse.ok) {
    const numericPart = mlbuId.replace(/^MLBU/i, '');
    const mlbId = `MLB${numericPart}`;
    
    console.log(`[ad-item-snapshot] MLBU not found, trying MLB format: ${mlbId}`);
    
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
      return {
        ok: true,
        itemId: productData.buy_box_winner.item_id,
        productData,
      };
    }
    
    return {
      ok: false,
      error: "Catálogo sem vendedor ativo (buy_box vazio)",
      productData,
    };
  }
  
  const productData = await productResponse.json();
  
  if (productData.buy_box_winner?.item_id) {
    console.log(`[ad-item-snapshot] MLBU resolved to MLB: ${productData.buy_box_winner.item_id}`);
    return {
      ok: true,
      itemId: productData.buy_box_winner.item_id,
      productData,
    };
  }
  
  return {
    ok: false,
    error: "Catálogo sem vendedor ativo (buy_box vazio)",
    productData,
  };
}

// ============================================================================
// BUSCA PÚBLICA DE ITEM (para clone externo - sem necessidade de token)
// ============================================================================
async function fetchItemPublic(itemId: string): Promise<{
  ok: boolean;
  data?: any;
  error?: string;
  status?: number;
}> {
  console.log(`[ad-item-snapshot] Fetching item PUBLIC (no auth): ${itemId}`);
  
  const response = await fetch(`https://api.mercadolibre.com/items/${itemId}`);
  
  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    console.log(`[ad-item-snapshot] Public fetch failed: ${response.status} - ${errorText.slice(0, 200)}`);
    return {
      ok: false,
      error: `Item não encontrado: ${itemId}`,
      status: response.status,
    };
  }
  
  const data = await response.json();
  console.log(`[ad-item-snapshot] Public fetch SUCCESS: ${itemId}, seller_id=${data.seller_id}, pictures=${data.pictures?.length || 0}`);
  return { ok: true, data };
}

// ============================================================================
// BUSCA DE DESCRIÇÃO PÚBLICA (com retry)
// ============================================================================
async function fetchDescriptionPublic(itemId: string, retries = 2): Promise<{
  text?: string;
  source: 'api_public' | 'none';
  error?: string;
}> {
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      console.log(`[ad-item-snapshot] Fetching description PUBLIC: ${itemId} (attempt ${attempt + 1})`);
      
      const response = await fetch(`https://api.mercadolibre.com/items/${itemId}/description`, {
        signal: AbortSignal.timeout(10000), // 10s timeout
      });
      
      if (response.ok) {
        const descData = await response.json();
        const text = descData.plain_text || descData.text || '';
        console.log(`[ad-item-snapshot] Description fetched: ${text.length} chars`);
        return { text, source: 'api_public' };
      }
      
      console.log(`[ad-item-snapshot] Description fetch failed: ${response.status}`);
    } catch (e: any) {
      console.log(`[ad-item-snapshot] Description fetch error (attempt ${attempt + 1}): ${e.message}`);
      if (attempt < retries - 1) {
        await new Promise(r => setTimeout(r, 1000)); // Wait 1s before retry
      }
    }
  }
  
  return { source: 'none', error: 'Failed to fetch description after retries' };
}

// ============================================================================
// EXTRAÇÃO DE DIMENSÕES DO PACOTE
// ============================================================================
function extractPackageDimensions(attributes: any[]): {
  height?: number;
  width?: number;
  length?: number;
  weight?: number;
  found: boolean;
} {
  const result: { height?: number; width?: number; length?: number; weight?: number; found: boolean } = {
    found: false,
  };
  
  if (!attributes || !Array.isArray(attributes)) return result;
  
  for (const attr of attributes) {
    const id = attr.id?.toUpperCase();
    const value = attr.value_name ? parseFloat(attr.value_name) : attr.value_struct?.number;
    
    if (value && !isNaN(value)) {
      if (id === 'SELLER_PACKAGE_HEIGHT' || id === 'PACKAGE_HEIGHT') {
        result.height = value;
        result.found = true;
      } else if (id === 'SELLER_PACKAGE_WIDTH' || id === 'PACKAGE_WIDTH') {
        result.width = value;
        result.found = true;
      } else if (id === 'SELLER_PACKAGE_LENGTH' || id === 'PACKAGE_LENGTH') {
        result.length = value;
        result.found = true;
      } else if (id === 'SELLER_PACKAGE_WEIGHT' || id === 'PACKAGE_WEIGHT') {
        result.weight = value;
        result.found = true;
      }
    }
  }
  
  return result;
}

// ============================================================================
// EXTRAÇÃO DE GTIN/EAN/SKU
// ============================================================================
function extractIdentifiers(attributes: any[]): {
  gtin?: string;
  ean?: string;
  sku?: string;
} {
  const result: { gtin?: string; ean?: string; sku?: string } = {};
  
  if (!attributes || !Array.isArray(attributes)) return result;
  
  for (const attr of attributes) {
    const id = attr.id?.toUpperCase();
    const value = attr.value_name || attr.value_id;
    
    if (!value) continue;
    
    if (id === 'GTIN') {
      result.gtin = value;
    } else if (id === 'EAN') {
      result.ean = value;
    } else if (id === 'SELLER_SKU' || id === 'SKU') {
      result.sku = value;
    }
  }
  
  return result;
}

// ============================================================================
// PROCESSAMENTO DE FOTOS COMPLETAS
// ============================================================================
function processAllPictures(pictures: any[], thumbnail?: string): {
  processed: Array<{ id: string; url: string; secure_url: string }>;
  source: 'api_full' | 'api_thumbnail_fallback' | 'none';
} {
  if (!pictures || !Array.isArray(pictures) || pictures.length === 0) {
    // Fallback para thumbnail
    if (thumbnail) {
      const secureUrl = thumbnail.replace(/^http:\/\//i, 'https://');
      console.log(`[ad-item-snapshot] No pictures array, using thumbnail fallback`);
      return {
        processed: [{ id: 'thumb', url: secureUrl, secure_url: secureUrl }],
        source: 'api_thumbnail_fallback',
      };
    }
    return { processed: [], source: 'none' };
  }
  
  // Processar todas as fotos do array completo
  const processed = pictures
    .map((p: any, index: number) => {
      // Priorizar secure_url, depois url
      const secureUrl = (p.secure_url || p.url || '').replace(/^http:\/\//i, 'https://');
      return {
        id: p.id || `pic_${index}`,
        url: secureUrl,
        secure_url: secureUrl,
      };
    })
    .filter((p) => p.url && p.url.length > 0);
  
  console.log(`[ad-item-snapshot] Processed ${processed.length} pictures from ${pictures.length} original`);
  return { processed, source: 'api_full' };
}

// ============================================================================
// BUSCA AUTENTICADA DE ITEM (para clone interno - com descrição completa)
// ============================================================================
async function fetchItemAuthenticated(itemId: string, accessToken: string): Promise<{
  ok: boolean;
  data?: any;
  description?: string;
  descriptionSource?: 'api_authenticated' | 'none';
  error?: string;
  status?: number;
}> {
  console.log(`[ad-item-snapshot] Fetching item AUTHENTICATED: ${itemId}`);
  
  const response = await fetch(`https://api.mercadolibre.com/items/${itemId}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  
  if (!response.ok) {
    return {
      ok: false,
      error: `Erro ao buscar item: ${response.status}`,
      status: response.status,
    };
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
    console.log(`[ad-item-snapshot] Could not fetch description with auth: ${e}`);
  }
  
  return { ok: true, data, description, descriptionSource };
}

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

    const { item_id, id_type, ml_account_id, seller_id } = await req.json() as SnapshotRequest;

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
      description_captured: false,
      dimensions_captured: false,
      attributes_count: 0,
      gtin_found: false,
      ean_found: false,
      sku_found: false,
      errors: [],
    };

    // Normalize item_id
    let normalizedId = item_id.replace(/-/g, '').toUpperCase();
    let resolvedItemId = normalizedId;
    let catalogResolution: any = null;
    
    console.log(`[ad-item-snapshot] Processing: ${normalizedId}, type: ${id_type || 'auto'}`);

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
          original_id: normalizedId,
          catalog_data: resolution.productData,
        }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      
      resolvedItemId = resolution.itemId!;
      catalogResolution = {
        original_catalog_id: normalizedId,
        resolved_item_id: resolvedItemId,
        product_name: resolution.productData?.name,
      };
      
      console.log(`[ad-item-snapshot] MLBU resolved: ${normalizedId} → ${resolvedItemId}`);
    }

    // =========================================================================
    // ETAPA 2: Buscar credenciais ML (para clone interno ou dados extras)
    // =========================================================================
    let mlAccount: { access_token: string | null; ml_user_id: string } | null = null;
    
    if (ml_account_id) {
      const { data } = await supabase
        .from("ml_accounts")
        .select("access_token, ml_user_id")
        .eq("ml_user_id", ml_account_id)
        .maybeSingle();
      mlAccount = data;
    }
    
    if (!mlAccount?.access_token && seller_id) {
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
    // ETAPA 3: Buscar dados do item (SEMPRE buscar dados completos)
    // =========================================================================
    let itemData: any = null;
    let description: string | undefined;
    let descriptionSource: 'api_public' | 'api_authenticated' | 'none' = 'none';
    let fetchMethod: 'public' | 'authenticated' | 'cache' = 'public';
    
    // Primeiro, tentar busca pública
    const publicResult = await fetchItemPublic(resolvedItemId);
    
    if (publicResult.ok) {
      itemData = publicResult.data;
      fetchMethod = 'public';
      
      // Determinar se o item é do usuário logado
      const isOwnItem = mlAccount?.ml_user_id && String(itemData.seller_id) === String(mlAccount.ml_user_id);
      
      if (isOwnItem && mlAccount?.access_token) {
        // Item INTERNO: buscar dados extras com autenticação
        console.log(`[ad-item-snapshot] Item is INTERNAL - fetching with auth for extra data`);
        const authResult = await fetchItemAuthenticated(resolvedItemId, mlAccount.access_token);
        if (authResult.ok) {
          itemData = authResult.data;
          description = authResult.description;
          descriptionSource = authResult.descriptionSource || 'none';
          fetchMethod = 'authenticated';
        }
      } else {
        // Item EXTERNO: buscar descrição publicamente
        console.log(`[ad-item-snapshot] Item is EXTERNAL - fetching public description`);
        const descResult = await fetchDescriptionPublic(resolvedItemId);
        description = descResult.text;
        descriptionSource = descResult.source;
        if (descResult.error) {
          captureLog.errors.push(descResult.error);
        }
      }
      
      captureLog.description_captured = !!description;
      captureLog.description_source = descriptionSource;
    } else {
      // Se busca pública falhou, tentar cache local
      console.log(`[ad-item-snapshot] Public fetch failed - trying cache`);
      captureLog.errors.push(`Public API failed: ${publicResult.status}`);
      
      const { data: cachedItem } = await supabase
        .from("meli_listings_cache")
        .select("*")
        .eq("item_id", resolvedItemId)
        .single();

      if (cachedItem) {
        console.log(`[ad-item-snapshot] Found cached data for ${resolvedItemId}`);
        fetchMethod = 'cache';
        
        // Tentar buscar dados complementares via API pública mesmo com cache
        try {
          const [publicRetry, descResult] = await Promise.all([
            fetchItemPublic(resolvedItemId),
            fetchDescriptionPublic(resolvedItemId)
          ]);
          
          if (publicRetry.ok) {
            itemData = publicRetry.data;
            description = descResult.text;
            descriptionSource = descResult.source;
            captureLog.description_captured = !!description;
            captureLog.description_source = descriptionSource;
          } else {
            // Usar cache como fallback final
            itemData = {
              id: cachedItem.item_id,
              title: cachedItem.title,
              price: cachedItem.price,
              thumbnail: cachedItem.thumbnail,
              status: cachedItem.status,
              available_quantity: cachedItem.available_quantity,
              sold_quantity: cachedItem.sold_quantity,
              category_id: cachedItem.category_id,
              seller_id: cachedItem.seller_id,
              pictures: [],
              attributes: [],
            };
            captureLog.errors.push('Using cache fallback - no pictures or attributes');
          }
        } catch (e: any) {
          captureLog.errors.push(`Cache fallback error: ${e.message}`);
          itemData = {
            id: cachedItem.item_id,
            title: cachedItem.title,
            price: cachedItem.price,
            thumbnail: cachedItem.thumbnail,
            status: cachedItem.status,
            available_quantity: cachedItem.available_quantity,
            category_id: cachedItem.category_id,
            seller_id: cachedItem.seller_id,
            pictures: [],
            attributes: [],
          };
        }
      }
      
      if (!itemData) {
        return new Response(JSON.stringify({ 
          success: false, 
          error: "ITEM_NOT_FOUND",
          message: `Não foi possível obter dados do anúncio ${resolvedItemId}`,
          user_guidance: "Verifique se o ID está correto e tente novamente.",
          api_status: publicResult.status,
          capture_log: captureLog,
        }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // =========================================================================
    // ETAPA 4: Processar fotos completas
    // =========================================================================
    const { processed: processedPictures, source: picturesSource } = processAllPictures(
      itemData.pictures,
      itemData.thumbnail
    );
    
    captureLog.pictures_count = processedPictures.length;
    captureLog.pictures_source = picturesSource;

    // =========================================================================
    // ETAPA 5: Extrair dimensões e identificadores
    // =========================================================================
    const dimensions = extractPackageDimensions(itemData.attributes || []);
    captureLog.dimensions_captured = dimensions.found;
    captureLog.dimensions_source = dimensions.found ? 'attributes' : 'none';
    
    const identifiers = extractIdentifiers(itemData.attributes || []);
    captureLog.gtin_found = !!identifiers.gtin;
    captureLog.ean_found = !!identifiers.ean;
    captureLog.sku_found = !!identifiers.sku;
    
    captureLog.attributes_count = (itemData.attributes || []).length;

    // =========================================================================
    // ETAPA 6: Detect catalog status
    // =========================================================================
    const isCatalogSource = !!(
      itemData.catalog_product_id ||
      itemData.catalog_listing === true ||
      itemData.parent_item_id
    );

    // =========================================================================
    // ETAPA 7: Build comprehensive response
    // =========================================================================
    const response = {
      success: true,
      source: fetchMethod,
      resolved_item_id: resolvedItemId,
      catalog_resolution: catalogResolution,
      capture_log: captureLog,
      item: {
        id: itemData.id,
        title: itemData.title,
        subtitle: itemData.subtitle,
        price: itemData.price,
        currency_id: itemData.currency_id,
        available_quantity: itemData.available_quantity,
        sold_quantity: itemData.sold_quantity,
        condition: itemData.condition,
        listing_type_id: itemData.listing_type_id,
        category_id: itemData.category_id,
        thumbnail: itemData.thumbnail,
        // FOTOS COMPLETAS (todas)
        pictures: processedPictures,
        // ATRIBUTOS COMPLETOS
        attributes: itemData.attributes || [],
        seller_id: itemData.seller_id,
        status: itemData.status,
        permalink: itemData.permalink,
        // DESCRIÇÃO COMPLETA
        description: description || '',
        // Catalog info
        catalog_product_id: itemData.catalog_product_id,
        catalog_listing: itemData.catalog_listing,
        parent_item_id: itemData.parent_item_id,
        is_catalog_source: isCatalogSource,
        // DIMENSÕES EXTRAÍDAS
        seller_package_height: dimensions.height,
        seller_package_width: dimensions.width,
        seller_package_length: dimensions.length,
        seller_package_weight: dimensions.weight,
        // IDENTIFICADORES CAPTURADOS (para controle do usuário)
        captured_gtin: identifiers.gtin || identifiers.ean,
        captured_ean: identifiers.ean,
        captured_sku: identifiers.sku,
        // Additional fields for cloning
        shipping: itemData.shipping,
        sale_terms: itemData.sale_terms,
        variations: itemData.variations,
      },
      user_seller_id: mlAccount?.ml_user_id,
      is_own_item: mlAccount?.ml_user_id ? String(itemData.seller_id) === String(mlAccount.ml_user_id) : false,
    };

    console.log(`[ad-item-snapshot] Success: ${resolvedItemId}, is_own=${response.is_own_item}, is_catalog=${isCatalogSource}, fetch_method=${fetchMethod}, pictures=${captureLog.pictures_count}, desc=${captureLog.description_captured}, dims=${captureLog.dimensions_captured}`);

    return new Response(JSON.stringify(response), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error: any) {
    console.error(`[ad-item-snapshot] Error:`, error);
    return new Response(JSON.stringify({ 
      success: false, 
      error: error?.message || String(error) 
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
