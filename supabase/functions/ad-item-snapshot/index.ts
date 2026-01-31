import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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
  
  // Tentar buscar o produto do catálogo via API pública
  const headers: Record<string, string> = {};
  if (accessToken) {
    headers["Authorization"] = `Bearer ${accessToken}`;
  }
  
  // A API de produtos aceita MLBU diretamente
  const productResponse = await fetch(`https://api.mercadolibre.com/products/${mlbuId}`, {
    headers,
  });
  
  if (!productResponse.ok) {
    // Tentar com prefixo MLB no mesmo ID numérico
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
  
  // Extrair o item_id do buy_box_winner
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
// REGRA: Para itens externos, SEMPRE usar endpoint público para evitar ACCESS_DENIED
// ============================================================================
async function fetchItemPublic(itemId: string): Promise<{
  ok: boolean;
  data?: any;
  error?: string;
  status?: number;
}> {
  console.log(`[ad-item-snapshot] Fetching item PUBLIC (no auth): ${itemId}`);
  
  // Endpoint público de item (não requer autenticação para dados básicos)
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
  console.log(`[ad-item-snapshot] Public fetch SUCCESS: ${itemId}, seller_id=${data.seller_id}`);
  return { ok: true, data };
}

// Extrair atributos de dimensões do item
function extractPackageDimensions(attributes: any[]): {
  height?: number;
  width?: number;
  length?: number;
  weight?: number;
} {
  const result: { height?: number; width?: number; length?: number; weight?: number } = {};
  
  if (!attributes || !Array.isArray(attributes)) return result;
  
  for (const attr of attributes) {
    const id = attr.id?.toUpperCase();
    const value = attr.value_name ? parseFloat(attr.value_name) : attr.value_struct?.number;
    
    if (id === 'SELLER_PACKAGE_HEIGHT' || id === 'PACKAGE_HEIGHT') {
      result.height = value;
    } else if (id === 'SELLER_PACKAGE_WIDTH' || id === 'PACKAGE_WIDTH') {
      result.width = value;
    } else if (id === 'SELLER_PACKAGE_LENGTH' || id === 'PACKAGE_LENGTH') {
      result.length = value;
    } else if (id === 'SELLER_PACKAGE_WEIGHT' || id === 'PACKAGE_WEIGHT') {
      result.weight = value;
    }
  }
  
  return result;
}

// Buscar descrição pública (sem autenticação)
async function fetchDescriptionPublic(itemId: string): Promise<string | undefined> {
  try {
    const response = await fetch(`https://api.mercadolibre.com/items/${itemId}/description`);
    if (response.ok) {
      const descData = await response.json();
      return descData.plain_text || descData.text;
    }
  } catch (e) {
    console.log(`[ad-item-snapshot] Could not fetch public description: ${e}`);
  }
  return undefined;
}

// ============================================================================
// BUSCA AUTENTICADA DE ITEM (para clone interno - com descrição completa)
// ============================================================================
async function fetchItemAuthenticated(itemId: string, accessToken: string): Promise<{
  ok: boolean;
  data?: any;
  description?: string;
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
  
  // Também buscar descrição
  let description: string | undefined;
  try {
    const descResponse = await fetch(`https://api.mercadolibre.com/items/${itemId}/description`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (descResponse.ok) {
      const descData = await descResponse.json();
      description = descData.plain_text || descData.text;
    }
  } catch (e) {
    console.log(`[ad-item-snapshot] Could not fetch description: ${e}`);
  }
  
  return { ok: true, data, description };
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

    // Normalize item_id
    let normalizedId = item_id.replace(/-/g, '').toUpperCase();
    let resolvedItemId = normalizedId;
    let catalogResolution: any = null;
    
    console.log(`[ad-item-snapshot] Processing: ${normalizedId}, type: ${id_type || 'auto'}`);

    // =========================================================================
    // ETAPA 1: Resolver MLBU para MLB se necessário
    // =========================================================================
    if (id_type === 'MLBU' || /^MLBU/i.test(normalizedId)) {
      // Tentar obter token para resolução (opcional)
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
    
    // Strategy 1: By ml_account_id (UUID)
    if (ml_account_id) {
      const { data } = await supabase
        .from("ml_accounts")
        .select("access_token, ml_user_id")
        .eq("ml_user_id", ml_account_id)
        .maybeSingle();
      mlAccount = data;
    }
    
    // Strategy 2: By seller_id
    if (!mlAccount?.access_token && seller_id) {
      const { data } = await supabase
        .from("ml_accounts")
        .select("access_token, ml_user_id")
        .eq("ml_user_id", String(seller_id))
        .eq("user_id", user.id)
        .maybeSingle();
      mlAccount = data;
    }
    
    // Strategy 3: Get any connected account for this user
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
    // ETAPA 3: Buscar dados do item
    // REGRA: Para clone externo, usar endpoint PÚBLICO (não requer token do dono)
    // IMPORTANTE: SEMPRE priorizar busca pública para evitar ACCESS_DENIED
    // =========================================================================
    let itemData: any = null;
    let description: string | undefined;
    let fetchMethod: 'public' | 'authenticated' | 'cache' = 'public';
    
    // Primeiro, tentar busca pública (funciona para qualquer item - interno ou externo)
    const publicResult = await fetchItemPublic(resolvedItemId);
    
    if (publicResult.ok) {
      itemData = publicResult.data;
      fetchMethod = 'public';
      
      // Determinar se o item é do usuário logado (interno) ou de outro vendedor (externo)
      const isOwnItem = mlAccount?.ml_user_id && String(itemData.seller_id) === String(mlAccount.ml_user_id);
      
      if (isOwnItem && mlAccount?.access_token) {
        // Item INTERNO: buscar dados extras com autenticação (descrição completa)
        console.log(`[ad-item-snapshot] Item is INTERNAL - fetching with auth for extra data`);
        const authResult = await fetchItemAuthenticated(resolvedItemId, mlAccount.access_token);
        if (authResult.ok) {
          itemData = authResult.data;
          description = authResult.description;
          fetchMethod = 'authenticated';
        }
      } else {
        // Item EXTERNO: buscar descrição publicamente
        console.log(`[ad-item-snapshot] Item is EXTERNAL - fetching public description`);
        description = await fetchDescriptionPublic(resolvedItemId);
      }
    } else {
      // Se busca pública falhou, tentar cache local
      console.log(`[ad-item-snapshot] Public fetch failed - trying cache`);
      
      const { data: cachedItem } = await supabase
        .from("meli_listings_cache")
        .select("*")
        .eq("item_id", resolvedItemId)
        .single();

      if (cachedItem) {
        console.log(`[ad-item-snapshot] Found cached data for ${resolvedItemId}, fetching complementary public data`);
        
        // Cache encontrado mas incompleto - buscar dados complementares via API pública
        // Isso garante que descrição, fotos e atributos estejam disponíveis
        let publicData: any = null;
        let publicDescription: string | undefined = undefined;
        
        try {
          // Buscar dados completos do item e descrição em paralelo
          const [publicResult, descResult] = await Promise.all([
            fetchItemPublic(resolvedItemId),
            fetchDescriptionPublic(resolvedItemId)
          ]);
          
          if (publicResult.ok) {
            publicData = publicResult.data;
            console.log(`[ad-item-snapshot] Complementary public data fetched successfully`);
          }
          publicDescription = descResult;
        } catch (e) {
          console.log(`[ad-item-snapshot] Failed to fetch complementary data, using cache only: ${e}`);
        }
        
        // Se conseguiu dados públicos, usar eles (mais completos)
        // Senão, usar cache como fallback
        if (publicData) {
          // Extrair dimensões dos atributos
          const dimensions = extractPackageDimensions(publicData.attributes);
          
          // Detectar se é catálogo
          const isCatalogSource = !!(
            publicData.catalog_product_id ||
            publicData.catalog_listing === true ||
            publicData.parent_item_id
          );
          
          return new Response(JSON.stringify({
            success: true,
            source: "cache+public",
            resolved_item_id: resolvedItemId,
            catalog_resolution: catalogResolution,
            item: {
              id: publicData.id,
              title: publicData.title,
              price: publicData.price,
              thumbnail: publicData.thumbnail || publicData.pictures?.[0]?.url,
              pictures: publicData.pictures,
              status: publicData.status,
              available_quantity: publicData.available_quantity,
              sold_quantity: publicData.sold_quantity,
              category_id: publicData.category_id,
              seller_id: publicData.seller_id,
              description: publicDescription,
              attributes: publicData.attributes,
              listing_type_id: publicData.listing_type_id,
              catalog_product_id: publicData.catalog_product_id,
              catalog_listing: publicData.catalog_listing,
              parent_item_id: publicData.parent_item_id,
              is_catalog_source: isCatalogSource,
              // Dimensões extraídas
              seller_package_height: dimensions.height,
              seller_package_width: dimensions.width,
              seller_package_length: dimensions.length,
              seller_package_weight: dimensions.weight,
            },
          }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        
        // Fallback para cache puro (sem dados complementares)
        return new Response(JSON.stringify({
          success: true,
          source: "cache",
          resolved_item_id: resolvedItemId,
          catalog_resolution: catalogResolution,
          item: {
            id: cachedItem.item_id,
            title: cachedItem.title,
            price: cachedItem.price,
            thumbnail: cachedItem.thumbnail,
            status: cachedItem.status,
            available_quantity: cachedItem.available_quantity,
            sold_quantity: cachedItem.sold_quantity,
            category_id: cachedItem.category_id,
            seller_id: cachedItem.seller_id,
            is_catalog_source: false,
          },
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Nem público nem cache - retornar erro
      return new Response(JSON.stringify({ 
        success: false, 
        error: "ITEM_NOT_FOUND",
        message: `Não foi possível obter dados do anúncio ${resolvedItemId}`,
        user_guidance: "Verifique se o ID está correto e tente novamente.",
        api_status: publicResult.status,
      }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // =========================================================================
    // ETAPA 4: Processar dados e retornar
    // =========================================================================
    
    // Detect catalog status
    const isCatalogSource = !!(
      itemData.catalog_product_id ||
      itemData.catalog_listing === true ||
      itemData.parent_item_id
    );

    // Build comprehensive response
    const response = {
      success: true,
      source: fetchMethod,
      resolved_item_id: resolvedItemId,
      catalog_resolution: catalogResolution,
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
        pictures: itemData.pictures,
        attributes: itemData.attributes,
        seller_id: itemData.seller_id,
        status: itemData.status,
        permalink: itemData.permalink,
        description: description,
        // Catalog info
        catalog_product_id: itemData.catalog_product_id,
        catalog_listing: itemData.catalog_listing,
        parent_item_id: itemData.parent_item_id,
        is_catalog_source: isCatalogSource,
        // Additional fields for cloning
        shipping: itemData.shipping,
        sale_terms: itemData.sale_terms,
        variations: itemData.variations,
      },
      user_seller_id: mlAccount?.ml_user_id,
      is_own_item: mlAccount?.ml_user_id ? String(itemData.seller_id) === String(mlAccount.ml_user_id) : false,
    };

    console.log(`[ad-item-snapshot] Success: ${resolvedItemId}, is_own=${response.is_own_item}, is_catalog=${isCatalogSource}, fetch_method=${fetchMethod}`);

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
