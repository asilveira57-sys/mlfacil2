import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

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
  pictures?: Array<{ id: string; url: string; max_size?: string }>;
  attributes?: Array<{ id: string; name: string; value_name: string | null; value_id: string | null; value_struct?: any }>;
  variations?: Array<{
    id: number;
    price: number;
    available_quantity: number;
    sold_quantity: number;
    attribute_combinations: Array<{ id: string; name: string; value_name: string }>;
    picture_ids: string[];
  }>;
  shipping?: {
    mode: string;
    free_shipping: boolean;
    local_pick_up: boolean;
  };
  seller_id: number;
  status: string;
  catalog_product_id?: string;
  catalog_listing?: boolean;
}

interface MLCategory {
  id: string;
  name: string;
  path_from_root?: Array<{ id: string; name: string }>;
}

interface MLCategoryAttributes {
  id: string;
  name: string;
  value_type: string;
  values?: Array<{ id: string; name: string }>;
  tags?: { required?: boolean; catalog_required?: boolean };
  hierarchy?: string;
  hint?: string;
  allowed_units?: Array<{ id: string; name: string }>;
}

function ok(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const {
      workspaceId,
      url,
      itemId,
      itemData,
      categoryData,
      categoryAttributes,
      description,
      sellerNickname,
    } = await req.json();

    if (!workspaceId) return ok({ success: false, error: 'workspaceId é obrigatório' });
    if (!url) return ok({ success: false, error: 'url é obrigatório' });
    if (!itemId) return ok({ success: false, error: 'itemId é obrigatório' });
    if (!itemData) return ok({ success: false, error: 'itemData é obrigatório' });

    // Auth
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return ok({ success: false, api_status: 401, error: 'Não autorizado' });

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) return ok({ success: false, api_status: 401, error: 'Usuário não autenticado' });

    // Validate workspace access
    const { data: member } = await supabase
      .from('workspace_members')
      .select('workspace_id')
      .eq('user_id', user.id)
      .eq('workspace_id', workspaceId)
      .maybeSingle();

    if (!member) return ok({ success: false, api_status: 403, error: 'Sem acesso ao workspace' });

    const normalizedItemId = String(itemData.id || '').toUpperCase();
    if (normalizedItemId !== String(itemId).toUpperCase()) {
      return ok({
        success: false,
        api_status: 400,
        error: 'itemData.id não confere com itemId',
        itemId,
        providedId: normalizedItemId,
      });
    }

    const mlItem = itemData as MLItem;
    const mlCategory = (categoryData || null) as MLCategory | null;
    const mlCategoryAttributes = (categoryAttributes || []) as MLCategoryAttributes[];

    // Check if already imported
    const { data: existing } = await supabase
      .from('learned_listings')
      .select('id')
      .eq('workspace_id', workspaceId)
      .eq('source_item_id', mlItem.id)
      .maybeSingle();

    if (existing?.id) {
      const { error: updateError } = await supabase
        .from('learned_listings')
        .update({
          title: mlItem.title,
          category_id: mlItem.category_id,
          category_name: mlCategory?.name || null,
          price: mlItem.price,
          original_price: mlItem.original_price || null,
          currency_id: mlItem.currency_id,
          condition: mlItem.condition,
          listing_type_id: mlItem.listing_type_id,
          is_catalog_listing: mlItem.catalog_listing || false,
          catalog_product_id: mlItem.catalog_product_id || null,
          available_quantity: mlItem.available_quantity,
          sold_quantity: mlItem.sold_quantity,
          shipping_mode: mlItem.shipping?.mode || null,
          shipping_free: mlItem.shipping?.free_shipping || false,
          permalink: mlItem.permalink,
          description: typeof description === 'string' ? description : '',
          raw_payload: mlItem as unknown as Json,
          imported_at: new Date().toISOString(),
        })
        .eq('id', existing.id);

      if (updateError) return ok({ success: false, error: updateError.message });

      return ok({
        success: true,
        action: 'updated',
        learnedListingId: existing.id,
        message: 'Anúncio atualizado com sucesso (modo direto)',
      });
    }

    const { data: newListing, error: insertError } = await supabase
      .from('learned_listings')
      .insert({
        workspace_id: workspaceId,
        source: 'mercadolivre',
        source_item_id: mlItem.id,
        source_url: url,
        title: mlItem.title,
        category_id: mlItem.category_id,
        category_name: mlCategory?.name || null,
        currency_id: mlItem.currency_id,
        condition: mlItem.condition,
        listing_type_id: mlItem.listing_type_id,
        price: mlItem.price,
        original_price: mlItem.original_price || null,
        is_catalog_listing: mlItem.catalog_listing || false,
        catalog_product_id: mlItem.catalog_product_id || null,
        seller_id: String(mlItem.seller_id),
        seller_nickname: typeof sellerNickname === 'string' ? sellerNickname : '',
        shipping_mode: mlItem.shipping?.mode || null,
        shipping_free: mlItem.shipping?.free_shipping || false,
        available_quantity: mlItem.available_quantity,
        sold_quantity: mlItem.sold_quantity,
        permalink: mlItem.permalink,
        description: typeof description === 'string' ? description : '',
        raw_payload: mlItem as unknown as Json,
        imported_by: user.id,
      })
      .select()
      .single();

    if (insertError || !newListing) return ok({ success: false, error: insertError?.message || 'Falha ao criar learned_listing' });

    // Insert pictures
    if (mlItem.pictures?.length) {
      const pictures = mlItem.pictures.map((pic, index) => ({
        learned_listing_id: newListing.id,
        source_picture_id: pic.id,
        source_url: pic.url || pic.max_size,
        sort_order: index,
        is_cover: index === 0,
      }));
      await supabase.from('learned_listing_pictures').insert(pictures);
    }

    // Insert attributes
    if (mlItem.attributes?.length) {
      const requiredIds = new Set(
        mlCategoryAttributes
          .filter((a) => a.tags?.required || a.tags?.catalog_required)
          .map((a) => a.id)
      );

      const attributes = mlItem.attributes.map((attr) => ({
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
    if (mlItem.variations?.length) {
      const variations = mlItem.variations.map((v) => ({
        learned_listing_id: newListing.id,
        source_variation_id: String(v.id),
        price: v.price,
        available_quantity: v.available_quantity,
        sold_quantity: v.sold_quantity,
        attributes: v.attribute_combinations,
        picture_ids: v.picture_ids,
      }));
      await supabase.from('learned_listing_variations').insert(variations);

      for (const v of mlItem.variations) {
        if (v.attribute_combinations?.length) {
          const varAttrs = v.attribute_combinations.map((attr) => ({
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

    // Cache category requirements
    if (mlCategoryAttributes.length) {
      for (const attr of mlCategoryAttributes) {
        await supabase
          .from('category_attribute_requirements')
          .upsert(
            {
              category_id: mlItem.category_id,
              site_id: 'MLB',
              attribute_id: attr.id,
              name: attr.name,
              value_type: attr.value_type,
              allowed_units: attr.allowed_units || null,
              allowed_values: attr.values || null,
              required_level: attr.tags?.required ? 'required' : (attr.tags?.catalog_required ? 'required' : 'optional'),
              hierarchy: attr.hierarchy || null,
              tags: (attr.tags || null) as any,
              hint: attr.hint || null,
              raw_data: attr as unknown as Json,
              fetched_at: new Date().toISOString(),
            },
            { onConflict: 'category_id,site_id,attribute_id' }
          );
      }
    }

    return ok({
      success: true,
      action: 'created',
      learnedListingId: newListing.id,
      message: 'Anúncio importado com sucesso (modo direto)',
    });
  } catch (error) {
    console.error('[learn-listing-save] Error:', error);
    return ok({ success: false, error: error instanceof Error ? error.message : 'Erro desconhecido' });
  }
});
