import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface SnapshotRequest {
  item_id: string;
  ml_account_id?: string;
  seller_id?: string;
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

    const { item_id, ml_account_id, seller_id } = await req.json() as SnapshotRequest;

    if (!item_id) {
      return new Response(JSON.stringify({ success: false, error: "item_id is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Normalize item_id - ensure MLB format
    const normalizedId = item_id.replace(/-/g, '').toUpperCase();
    
    console.log(`[ad-item-snapshot] Fetching item: ${normalizedId} for user: ${user.id}`);

    // Get ML account credentials - try multiple strategies
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

    if (!mlAccount?.access_token) {
      // Try to get from cache as fallback
      const { data: cachedItem } = await supabase
        .from("meli_listings_cache")
        .select("*")
        .eq("item_id", normalizedId)
        .single();

      if (cachedItem) {
        console.log(`[ad-item-snapshot] Returning cached data for ${normalizedId}`);
        return new Response(JSON.stringify({
          success: true,
          source: "cache",
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

      return new Response(JSON.stringify({ 
        success: false, 
        error: "NO_ML_ACCOUNT",
        message: "Nenhuma conta do Mercado Livre conectada ou token expirado" 
      }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch item from ML API
    const itemResponse = await fetch(`https://api.mercadolibre.com/items/${normalizedId}`, {
      headers: { Authorization: `Bearer ${mlAccount.access_token}` },
    });

    if (!itemResponse.ok) {
      const errorText = await itemResponse.text();
      console.error(`[ad-item-snapshot] ML API error: ${itemResponse.status} - ${errorText}`);
      
      let errorType = "UNKNOWN";
      let userMessage = `Erro ao buscar anúncio ${normalizedId}`;
      
      if (itemResponse.status === 404) {
        errorType = "NOT_FOUND";
        userMessage = `Anúncio ${normalizedId} não encontrado`;
      } else if (itemResponse.status === 403) {
        errorType = "ACCESS_DENIED";
        userMessage = `Sem permissão para acessar ${normalizedId}`;
      } else if (itemResponse.status === 401) {
        errorType = "UNAUTHORIZED";
        userMessage = "Token expirado - reconecte sua conta";
      }
      
      return new Response(JSON.stringify({ 
        success: false, 
        error: errorType,
        message: userMessage,
        api_status: itemResponse.status 
      }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const itemData = await itemResponse.json();

    // Detect catalog status
    const isCatalogSource = !!(
      itemData.catalog_product_id ||
      itemData.catalog_listing === true ||
      itemData.parent_item_id
    );

    // Also fetch description for complete data
    let description = null;
    try {
      const descResponse = await fetch(`https://api.mercadolibre.com/items/${normalizedId}/description`, {
        headers: { Authorization: `Bearer ${mlAccount.access_token}` },
      });
      if (descResponse.ok) {
        const descData = await descResponse.json();
        description = descData.plain_text || descData.text;
      }
    } catch (e: any) {
      console.log(`[ad-item-snapshot] Could not fetch description: ${e?.message || e}`);
    }

    // Build comprehensive response
    const response = {
      success: true,
      source: "api",
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
      user_seller_id: mlAccount.ml_user_id,
      is_own_item: String(itemData.seller_id) === String(mlAccount.ml_user_id),
    };

    console.log(`[ad-item-snapshot] Success: ${normalizedId}, is_own=${response.is_own_item}, is_catalog=${isCatalogSource}`);

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
