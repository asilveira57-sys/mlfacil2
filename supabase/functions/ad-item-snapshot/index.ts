import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface SnapshotRequest {
  item_id: string;
  ml_account_id: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing authorization header" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { item_id, ml_account_id } = await req.json() as SnapshotRequest;

    if (!item_id || !ml_account_id) {
      return new Response(JSON.stringify({ error: "item_id and ml_account_id are required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`[ad-item-snapshot] Fetching snapshot for item ${item_id}`);

    // Get ML account credentials
    const { data: mlAccount } = await supabase
      .from("ml_accounts")
      .select("access_token, ml_user_id")
      .eq("ml_user_id", ml_account_id)
      .single();

    if (!mlAccount?.access_token) {
      // Try to get from local cache
      const { data: cachedItem } = await supabase
        .from("meli_listings_cache")
        .select("*")
        .eq("item_id", item_id)
        .single();

      if (cachedItem) {
        return new Response(JSON.stringify({
          success: true,
          source: "cache",
          snapshot: {
            id: cachedItem.item_id,
            title: cachedItem.title,
            price: cachedItem.price,
            thumbnail: cachedItem.thumbnail,
            status: cachedItem.status,
            available_quantity: cachedItem.available_quantity,
            sold_quantity: cachedItem.sold_quantity,
            category_id: cachedItem.category_id,
          },
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ 
        error: "No credentials available and item not in cache" 
      }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch from ML API
    const itemResponse = await fetch(`https://api.mercadolibre.com/items/${item_id}`, {
      headers: { "Authorization": `Bearer ${mlAccount.access_token}` },
    });

    if (!itemResponse.ok) {
      const errorData = await itemResponse.json();
      return new Response(JSON.stringify({ 
        error: "Failed to fetch item from API",
        api_error: errorData,
      }), {
        status: itemResponse.status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const itemData = await itemResponse.json();

    // Also fetch description
    let description = null;
    try {
      const descResponse = await fetch(`https://api.mercadolibre.com/items/${item_id}/description`, {
        headers: { "Authorization": `Bearer ${mlAccount.access_token}` },
      });
      if (descResponse.ok) {
        const descData = await descResponse.json();
        description = descData.plain_text || descData.text;
      }
    } catch (e: any) {
      console.log(`[ad-item-snapshot] Could not fetch description: ${e?.message || e}`);
    }

    // Build comprehensive snapshot
    const snapshot = {
      id: itemData.id,
      title: itemData.title,
      subtitle: itemData.subtitle,
      seller_id: itemData.seller_id,
      category_id: itemData.category_id,
      price: itemData.price,
      base_price: itemData.base_price,
      original_price: itemData.original_price,
      currency_id: itemData.currency_id,
      initial_quantity: itemData.initial_quantity,
      available_quantity: itemData.available_quantity,
      sold_quantity: itemData.sold_quantity,
      condition: itemData.condition,
      permalink: itemData.permalink,
      thumbnail: itemData.thumbnail,
      secure_thumbnail: itemData.secure_thumbnail,
      pictures: itemData.pictures,
      video_id: itemData.video_id,
      descriptions: description ? [{ plain_text: description }] : [],
      accepts_mercadopago: itemData.accepts_mercadopago,
      non_mercado_pago_payment_methods: itemData.non_mercado_pago_payment_methods,
      shipping: itemData.shipping,
      international_delivery_mode: itemData.international_delivery_mode,
      seller_address: itemData.seller_address,
      seller_contact: itemData.seller_contact,
      location: itemData.location,
      coverage_areas: itemData.coverage_areas,
      attributes: itemData.attributes,
      listing_type_id: itemData.listing_type_id,
      status: itemData.status,
      sub_status: itemData.sub_status,
      warranty: itemData.warranty,
      catalog_product_id: itemData.catalog_product_id,
      domain_id: itemData.domain_id,
      parent_item_id: itemData.parent_item_id,
      differential_pricing: itemData.differential_pricing,
      deal_ids: itemData.deal_ids,
      automatic_relist: itemData.automatic_relist,
      date_created: itemData.date_created,
      last_updated: itemData.last_updated,
      health: itemData.health,
      catalog_listing: itemData.catalog_listing,
      variations: itemData.variations,
      sale_terms: itemData.sale_terms,
    };

    return new Response(JSON.stringify({
      success: true,
      source: "api",
      snapshot,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error: any) {
    console.error(`[ad-item-snapshot] Error:`, error);
    return new Response(JSON.stringify({ error: error?.message || String(error) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
