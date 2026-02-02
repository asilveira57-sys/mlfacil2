import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

// ===== HELPERS =====

function extractItemId(input: string): string | null {
  if (!input?.trim()) return null;
  const trimmed = input.trim();
  
  // Priority patterns for MLB extraction
  const patterns = [
    /item_id[=:]?(MLB\d{8,})/i,
    /pdp_filters=item_id[=:]?(MLB\d{8,})/i,
    /\/(MLB\d{8,})/i,
    /[?&]id=(MLB\d{8,})/i,
    /(?<!MLBU?)(MLB\d{8,})/i,
    // Fallback for other regions
    /(ML[A-Z]{1,2}\d{8,})/i,
  ];
  
  for (const pattern of patterns) {
    const match = trimmed.match(pattern);
    if (match) {
      const id = (match[1] || match[0]).replace(/-/g, '').toUpperCase();
      if (/^ML[A-Z]{0,2}\d+$/.test(id)) {
        return id;
      }
    }
  }
  
  return null;
}

interface MLItem {
  id: string;
  title: string;
  category_id: string;
  price: number;
  original_price?: number;
  currency_id: string;
  available_quantity: number;
  sold_quantity: number;
  condition: string;
  listing_type_id: string;
  permalink: string;
  thumbnail: string;
  pictures: Array<{ id: string; url: string; size: string; max_size: string; quality: string }>;
  attributes: Array<{ id: string; name: string; value_name: string | null; value_id: string | null; value_struct?: any }>;
  variations: Array<{
    id: number;
    price: number;
    available_quantity: number;
    sold_quantity: number;
    attribute_combinations: Array<{ id: string; name: string; value_name: string }>;
    picture_ids: string[];
  }>;
  shipping: {
    mode: string;
    free_shipping: boolean;
    local_pick_up: boolean;
  };
  seller_id: number;
  status: string;
  catalog_product_id?: string;
  catalog_listing?: boolean;
  tags?: string[];
}

interface MLCategory {
  id: string;
  name: string;
  path_from_root: Array<{ id: string; name: string }>;
}

interface MLCategoryAttributes {
  id: string;
  name: string;
  value_type: string;
  values?: Array<{ id: string; name: string }>;
  tags: { required?: boolean; catalog_required?: boolean };
  hierarchy?: string;
  hint?: string;
  allowed_units?: Array<{ id: string; name: string }>;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { url, workspaceId, action = 'import' } = await req.json();

    if (!url && action === 'import') {
      throw new Error('URL do anúncio é obrigatório');
    }

    // Auth
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Não autorizado' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: 'Usuário não autenticado' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate workspace access
    const { data: member } = await supabase
      .from('workspace_members')
      .select('workspace_id')
      .eq('user_id', user.id)
      .eq('workspace_id', workspaceId)
      .single();

    if (!member) {
      return new Response(
        JSON.stringify({ error: 'Sem acesso ao workspace' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Extract item ID from URL
    const itemId = extractItemId(url);
    if (!itemId) {
      return new Response(
        JSON.stringify({ error: 'Não foi possível extrair o ID do anúncio da URL fornecida' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[learn-listing] Importing item: ${itemId}`);

    // Get ML account with valid token
    const { data: mlAccount, error: accountError } = await supabase
      .from('ml_accounts')
      .select('*')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (accountError || !mlAccount) {
      return new Response(
        JSON.stringify({ error: 'Nenhuma conta Mercado Livre conectada', needsAuth: true }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Refresh token if needed
    let accessToken = mlAccount.access_token;
    const tokenExpiry = new Date(mlAccount.token_expires_at);
    
    if (tokenExpiry <= new Date()) {
      console.log('[learn-listing] Refreshing expired token...');
      const refreshResponse = await fetch('https://api.mercadolibre.com/oauth/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          client_id: Deno.env.get('ML_APP_ID') || '',
          client_secret: Deno.env.get('ML_SECRET_KEY') || '',
          refresh_token: mlAccount.refresh_token,
        }),
      });

      if (!refreshResponse.ok) {
        return new Response(
          JSON.stringify({ error: 'Token expirado. Reconecte sua conta ML.', needsAuth: true }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const refreshData = await refreshResponse.json();
      accessToken = refreshData.access_token;
      
      const newExpiry = new Date();
      newExpiry.setSeconds(newExpiry.getSeconds() + refreshData.expires_in);

      await supabase
        .from('ml_accounts')
        .update({
          access_token: refreshData.access_token,
          refresh_token: refreshData.refresh_token,
          token_expires_at: newExpiry.toISOString(),
        })
        .eq('id', mlAccount.id);
    }

    // Fetch item from ML API
    console.log(`[learn-listing] Fetching item ${itemId} from ML API...`);
    const itemResponse = await fetch(`https://api.mercadolibre.com/items/${itemId}`, {
      headers: { 'Authorization': `Bearer ${accessToken}` },
    });

    if (!itemResponse.ok) {
      const status = itemResponse.status;
      if (status === 404) {
        return new Response(
          JSON.stringify({ error: 'Anúncio não encontrado' }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      throw new Error(`Erro ao buscar anúncio: ${status}`);
    }

    const itemData: MLItem = await itemResponse.json();
    console.log(`[learn-listing] Item fetched: ${itemData.title}`);

    // Fetch category data
    let categoryData: MLCategory | null = null;
    try {
      const catResponse = await fetch(`https://api.mercadolibre.com/categories/${itemData.category_id}`);
      if (catResponse.ok) {
        categoryData = await catResponse.json();
      }
    } catch (e) {
      console.warn('[learn-listing] Could not fetch category:', e);
    }

    // Fetch category attributes/requirements
    let categoryAttributes: MLCategoryAttributes[] = [];
    try {
      const attrResponse = await fetch(`https://api.mercadolibre.com/categories/${itemData.category_id}/attributes`);
      if (attrResponse.ok) {
        categoryAttributes = await attrResponse.json();
      }
    } catch (e) {
      console.warn('[learn-listing] Could not fetch category attributes:', e);
    }

    // Fetch description
    let description = '';
    try {
      const descResponse = await fetch(`https://api.mercadolibre.com/items/${itemId}/description`, {
        headers: { 'Authorization': `Bearer ${accessToken}` },
      });
      if (descResponse.ok) {
        const descData = await descResponse.json();
        description = descData.plain_text || descData.text || '';
      }
    } catch (e) {
      console.warn('[learn-listing] Could not fetch description:', e);
    }

    // Fetch seller info
    let sellerNickname = '';
    try {
      const sellerResponse = await fetch(`https://api.mercadolibre.com/users/${itemData.seller_id}`);
      if (sellerResponse.ok) {
        const sellerData = await sellerResponse.json();
        sellerNickname = sellerData.nickname || '';
      }
    } catch (e) {
      console.warn('[learn-listing] Could not fetch seller:', e);
    }

    // Check if already imported
    const { data: existing } = await supabase
      .from('learned_listings')
      .select('id')
      .eq('workspace_id', workspaceId)
      .eq('source_item_id', itemId)
      .limit(1)
      .single();

    if (existing) {
      // Update existing
      const { data: updated, error: updateError } = await supabase
        .from('learned_listings')
        .update({
          title: itemData.title,
          category_name: categoryData?.name || null,
          price: itemData.price,
          original_price: itemData.original_price || null,
          condition: itemData.condition,
          listing_type_id: itemData.listing_type_id,
          is_catalog_listing: itemData.catalog_listing || false,
          catalog_product_id: itemData.catalog_product_id || null,
          available_quantity: itemData.available_quantity,
          sold_quantity: itemData.sold_quantity,
          shipping_mode: itemData.shipping?.mode || null,
          shipping_free: itemData.shipping?.free_shipping || false,
          permalink: itemData.permalink,
          description: description,
          raw_payload: itemData,
          imported_at: new Date().toISOString(),
        })
        .eq('id', existing.id)
        .select()
        .single();

      if (updateError) throw updateError;

      return new Response(
        JSON.stringify({
          success: true,
          action: 'updated',
          learnedListingId: existing.id,
          message: 'Anúncio atualizado com sucesso',
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Insert new learned_listing
    const { data: newListing, error: insertError } = await supabase
      .from('learned_listings')
      .insert({
        workspace_id: workspaceId,
        source: 'mercadolivre',
        source_item_id: itemId,
        source_url: url,
        title: itemData.title,
        category_id: itemData.category_id,
        category_name: categoryData?.name || null,
        currency_id: itemData.currency_id,
        condition: itemData.condition,
        listing_type_id: itemData.listing_type_id,
        price: itemData.price,
        original_price: itemData.original_price || null,
        is_catalog_listing: itemData.catalog_listing || false,
        catalog_product_id: itemData.catalog_product_id || null,
        seller_id: String(itemData.seller_id),
        seller_nickname: sellerNickname,
        shipping_mode: itemData.shipping?.mode || null,
        shipping_free: itemData.shipping?.free_shipping || false,
        available_quantity: itemData.available_quantity,
        sold_quantity: itemData.sold_quantity,
        permalink: itemData.permalink,
        description: description,
        raw_payload: itemData,
        imported_by: user.id,
      })
      .select()
      .single();

    if (insertError) throw insertError;

    console.log(`[learn-listing] Created learned_listing: ${newListing.id}`);

    // Insert pictures
    if (itemData.pictures?.length > 0) {
      const pictures = itemData.pictures.map((pic, index) => ({
        learned_listing_id: newListing.id,
        source_picture_id: pic.id,
        source_url: pic.url || pic.max_size,
        sort_order: index,
        is_cover: index === 0,
      }));

      await supabase.from('learned_listing_pictures').insert(pictures);
    }

    // Insert attributes
    if (itemData.attributes?.length > 0) {
      // Find required attributes from category
      const requiredIds = new Set(
        categoryAttributes
          .filter(a => a.tags?.required || a.tags?.catalog_required)
          .map(a => a.id)
      );

      const attributes = itemData.attributes.map(attr => ({
        learned_listing_id: newListing.id,
        attribute_id: attr.id,
        name: attr.name,
        value_name: attr.value_name,
        value_id: attr.value_id,
        value_struct: attr.value_struct || null,
        scope: 'item',
        is_required: requiredIds.has(attr.id),
        is_valid: !!attr.value_name || !!attr.value_id,
      }));

      await supabase.from('learned_listing_attributes').insert(attributes);
    }

    // Insert variations
    if (itemData.variations?.length > 0) {
      const variations = itemData.variations.map(v => ({
        learned_listing_id: newListing.id,
        source_variation_id: String(v.id),
        price: v.price,
        available_quantity: v.available_quantity,
        sold_quantity: v.sold_quantity,
        attributes: v.attribute_combinations,
        picture_ids: v.picture_ids,
      }));

      await supabase.from('learned_listing_variations').insert(variations);

      // Insert variation attributes
      for (const v of itemData.variations) {
        if (v.attribute_combinations?.length > 0) {
          const varAttrs = v.attribute_combinations.map(attr => ({
            learned_listing_id: newListing.id,
            attribute_id: attr.id,
            name: attr.name,
            value_name: attr.value_name,
            scope: 'variation',
            variation_id: String(v.id),
            is_required: true,
            is_valid: true,
          }));

          await supabase.from('learned_listing_attributes').insert(varAttrs);
        }
      }
    }

    // Cache category requirements if not exists
    if (categoryAttributes.length > 0) {
      for (const attr of categoryAttributes) {
        await supabase
          .from('category_attribute_requirements')
          .upsert({
            category_id: itemData.category_id,
            site_id: 'MLB',
            attribute_id: attr.id,
            name: attr.name,
            value_type: attr.value_type,
            allowed_units: attr.allowed_units || null,
            allowed_values: attr.values || null,
            required_level: attr.tags?.required ? 'required' : (attr.tags?.catalog_required ? 'required' : 'optional'),
            hierarchy: attr.hierarchy || null,
            tags: attr.tags || null,
            hint: attr.hint || null,
            raw_data: attr,
            fetched_at: new Date().toISOString(),
          }, { onConflict: 'category_id,site_id,attribute_id' });
      }
    }

    // Build summary response
    const summary = {
      id: newListing.id,
      itemId: itemId,
      title: itemData.title,
      category: categoryData?.name || itemData.category_id,
      categoryPath: categoryData?.path_from_root?.map(p => p.name) || [],
      price: itemData.price,
      condition: itemData.condition,
      isCatalog: itemData.catalog_listing || false,
      catalogProductId: itemData.catalog_product_id,
      pictures: itemData.pictures?.length || 0,
      attributes: itemData.attributes?.length || 0,
      variations: itemData.variations?.length || 0,
      seller: sellerNickname,
      status: itemData.status,
      quality: {
        hasDescription: !!description,
        picturesCount: itemData.pictures?.length || 0,
        attributesCount: itemData.attributes?.length || 0,
        hasVariations: (itemData.variations?.length || 0) > 0,
        missingRequired: categoryAttributes
          .filter(a => a.tags?.required)
          .filter(a => !itemData.attributes?.some(ia => ia.id === a.id && ia.value_name))
          .map(a => a.name),
      },
    };

    return new Response(
      JSON.stringify({
        success: true,
        action: 'created',
        learnedListingId: newListing.id,
        summary,
        message: 'Anúncio importado com sucesso',
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[learn-listing] Error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Erro desconhecido' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
