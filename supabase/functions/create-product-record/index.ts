import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { learnedListingId, workspaceId, nameInternal } = await req.json();

    if (!learnedListingId) {
      throw new Error('learnedListingId é obrigatório');
    }

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

    // Get learned listing
    const { data: listing, error: listingError } = await supabase
      .from('learned_listings')
      .select(`
        *,
        pictures:learned_listing_pictures(*),
        attributes:learned_listing_attributes(*),
        variations:learned_listing_variations(*)
      `)
      .eq('id', learnedListingId)
      .single();

    if (listingError || !listing) {
      return new Response(
        JSON.stringify({ error: 'Anúncio aprendido não encontrado' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate workspace access
    const { data: member } = await supabase
      .from('workspace_members')
      .select('workspace_id')
      .eq('user_id', user.id)
      .eq('workspace_id', listing.workspace_id)
      .single();

    if (!member) {
      return new Response(
        JSON.stringify({ error: 'Sem acesso ao workspace' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[create-product-record] Creating from listing: ${learnedListingId}`);

    // Extract brand from attributes
    const brandAttr = listing.attributes?.find((a: any) => a.attribute_id === 'BRAND' || a.name?.toLowerCase() === 'marca');
    const brand = brandAttr?.value_name || null;

    // Extract model from attributes
    const modelAttr = listing.attributes?.find((a: any) => a.attribute_id === 'MODEL' || a.name?.toLowerCase() === 'modelo');
    const model = modelAttr?.value_name || null;

    // Create product record
    const { data: productRecord, error: createError } = await supabase
      .from('product_records')
      .insert({
        workspace_id: listing.workspace_id,
        name_internal: nameInternal || listing.title,
        source_learned_listing_id: learnedListingId,
        target_site: 'MLB',
        target_category_id: listing.category_id,
        target_category_name: listing.category_name,
        brand: brand,
        model: model,
        status: 'draft',
        default_currency: listing.currency_id || 'BRL',
        default_condition: listing.condition || 'new',
        default_listing_type: listing.listing_type_id || 'gold_special',
        created_by: user.id,
      })
      .select()
      .single();

    if (createError) throw createError;

    console.log(`[create-product-record] Created product record: ${productRecord.id}`);

    // Copy pictures to product_assets
    if (listing.pictures?.length > 0) {
      const assets = listing.pictures.map((pic: any) => ({
        product_record_id: productRecord.id,
        variant_id: null,
        asset_type: 'image',
        source: 'imported',
        source_url: pic.source_url,
        storage_url: pic.storage_url,
        sort_order: pic.sort_order,
        is_cover: pic.is_cover,
        file_hash: pic.file_hash,
      }));

      await supabase.from('product_assets').insert(assets);
    }

    // Get category requirements
    const { data: requirements } = await supabase
      .from('category_attribute_requirements')
      .select('*')
      .eq('category_id', listing.category_id)
      .eq('site_id', 'MLB');

    // Map attributes
    const itemAttributes = listing.attributes?.filter((a: any) => a.scope === 'item') || [];
    const requirementMap = new Map((requirements || []).map((r: any) => [r.attribute_id, r]));

    // Create attribute map entries
    const attributeMapEntries: any[] = [];

    // Add imported attributes
    for (const attr of itemAttributes) {
      const req = requirementMap.get(attr.attribute_id);
      attributeMapEntries.push({
        product_record_id: productRecord.id,
        attribute_id: attr.attribute_id,
        name: attr.name,
        value_id: attr.value_id,
        value_name: attr.value_name,
        value_struct: attr.value_struct,
        unit: attr.unit,
        scope: 'item',
        required_level: req?.required_level || 'optional',
        filled_by: 'import',
        validation_status: attr.value_name || attr.value_id ? 'ok' : 'missing',
        allowed_values: req?.allowed_values || null,
      });
    }

    // Add missing required attributes
    for (const [attrId, req] of requirementMap) {
      if (req.required_level === 'required') {
        const exists = attributeMapEntries.some((a: any) => a.attribute_id === attrId);
        if (!exists) {
          attributeMapEntries.push({
            product_record_id: productRecord.id,
            attribute_id: attrId,
            name: req.name,
            value_id: null,
            value_name: null,
            value_struct: null,
            unit: null,
            scope: 'item',
            required_level: 'required',
            filled_by: 'import',
            validation_status: 'missing',
            validation_message: 'Atributo obrigatório não preenchido',
            allowed_values: req.allowed_values || null,
          });
        }
      }
    }

    if (attributeMapEntries.length > 0) {
      await supabase.from('product_attribute_map').insert(attributeMapEntries);
    }

    // Create variants from variations
    if (listing.variations?.length > 0) {
      const variants = listing.variations.map((v: any, index: number) => ({
        product_record_id: productRecord.id,
        sku_internal: v.sku || `VAR-${index + 1}`,
        price: v.price || listing.price,
        available_quantity: v.available_quantity || 0,
        gtin: v.gtin,
        variant_attributes: v.attributes,
        status: 'active',
        sort_order: index,
      }));

      await supabase.from('product_variants').insert(variants);
    } else {
      // Create single variant for non-variation product
      await supabase.from('product_variants').insert({
        product_record_id: productRecord.id,
        sku_internal: 'MAIN',
        price: listing.price,
        available_quantity: listing.available_quantity || 0,
        status: 'active',
        sort_order: 0,
      });
    }

    // Calculate completeness score
    const totalRequired = attributeMapEntries.filter((a: any) => a.required_level === 'required').length;
    const filledRequired = attributeMapEntries.filter((a: any) => a.required_level === 'required' && a.validation_status === 'ok').length;
    const hasPictures = (listing.pictures?.length || 0) > 0;
    const hasPrice = !!listing.price;
    
    let completenessScore = 0;
    if (totalRequired > 0) {
      completenessScore += Math.round((filledRequired / totalRequired) * 60);
    } else {
      completenessScore += 60;
    }
    if (hasPictures) completenessScore += 20;
    if (hasPrice) completenessScore += 20;

    // Update product record with completeness
    const missingRequired = attributeMapEntries
      .filter((a: any) => a.required_level === 'required' && a.validation_status !== 'ok')
      .map((a: any) => ({ id: a.attribute_id, name: a.name }));

    await supabase
      .from('product_records')
      .update({
        completeness_score: completenessScore,
        validation_errors: missingRequired.length > 0 ? { missingRequired } : null,
        status: completenessScore >= 80 ? 'ready' : 'draft',
      })
      .eq('id', productRecord.id);

    return new Response(
      JSON.stringify({
        success: true,
        productRecordId: productRecord.id,
        completenessScore,
        missingRequired,
        message: 'Registro de produto criado com sucesso',
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[create-product-record] Error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Erro desconhecido' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
