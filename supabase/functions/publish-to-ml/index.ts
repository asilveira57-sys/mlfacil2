import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { auditLog } from '../_shared/audit-log.ts';

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
    const { productRecordId, mlAccountId, listingType = 'gold_special' } = await req.json();

    if (!productRecordId || !mlAccountId) {
      throw new Error('productRecordId e mlAccountId são obrigatórios');
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

    // ML API Access Gate
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );
    const { assertMlApiAccess } = await import("../_shared/ml-api-gate.ts");
    const gate = await assertMlApiAccess(supabaseAdmin, user.id);
    if (!gate.allowed) {
      console.log(`[publish-to-ml] Access denied: ${gate.reason}`);
      return gate.response!;
    }

    // Get product record
    const { data: record, error: recordError } = await supabase
      .from('product_records')
      .select(`
        *,
        variants:product_variants(*),
        assets:product_assets(*),
        attributes:product_attribute_map(*)
      `)
      .eq('id', productRecordId)
      .single();

    if (recordError || !record) {
      return new Response(
        JSON.stringify({ error: 'Registro de produto não encontrado' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check workspace access
    const { data: member } = await supabase
      .from('workspace_members')
      .select('workspace_id')
      .eq('user_id', user.id)
      .eq('workspace_id', record.workspace_id)
      .single();

    if (!member) {
      return new Response(
        JSON.stringify({ error: 'Sem acesso ao workspace' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get ML account
    const { data: mlAccount, error: accountError } = await supabase
      .from('ml_accounts')
      .select('*')
      .eq('id', mlAccountId)
      .eq('user_id', user.id)
      .eq('is_active', true)
      .single();

    if (accountError || !mlAccount) {
      return new Response(
        JSON.stringify({ error: 'Conta ML não encontrada ou inativa', needsAuth: true }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Refresh token if needed
    let accessToken = mlAccount.access_token;
    const tokenExpiry = new Date(mlAccount.token_expires_at);
    
    if (tokenExpiry <= new Date()) {
      console.log('[publish-to-ml] Refreshing token...');
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

    // Create publication job
    const { data: job, error: jobError } = await supabase
      .from('ml_publication_jobs')
      .insert({
        workspace_id: record.workspace_id,
        ml_account_id: mlAccountId,
        product_record_id: productRecordId,
        action: 'create_item',
        status: 'running',
        created_by: user.id,
        started_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (jobError) throw jobError;

    console.log(`[publish-to-ml] Job created: ${job.id}`);

    try {
      // Build ML item payload
      const images = record.assets
        ?.filter((a: any) => a.asset_type === 'image')
        .sort((a: any, b: any) => a.sort_order - b.sort_order)
        .map((a: any) => ({ source: a.source_url || a.storage_url })) || [];

      const attributes = record.attributes
        ?.filter((a: any) => a.scope === 'item' && (a.value_name || a.value_id))
        .map((a: any) => ({
          id: a.attribute_id,
          value_name: a.value_name,
          value_id: a.value_id,
        })) || [];

      // Get main variant for price/stock
      const mainVariant = record.variants?.find((v: any) => v.sort_order === 0) || record.variants?.[0];

      if (!mainVariant) {
        throw new Error('Nenhuma variação encontrada para publicar');
      }

      // Build base payload
      const payload: any = {
        title: record.name_internal,
        category_id: record.target_category_id,
        price: mainVariant.price,
        currency_id: record.default_currency || 'BRL',
        available_quantity: mainVariant.available_quantity,
        buying_mode: 'buy_it_now',
        condition: record.default_condition || 'new',
        listing_type_id: listingType,
        pictures: images,
        attributes: attributes,
      };

      // Add variations if multiple
      if (record.variants?.length > 1) {
        payload.variations = record.variants.map((v: any) => {
          const varPayload: any = {
            price: v.price,
            available_quantity: v.available_quantity,
            attribute_combinations: v.variant_attributes || [],
          };

          if (v.gtin) {
            varPayload.attributes = [{ id: 'GTIN', value_name: v.gtin }];
          }

          // Add pictures for variation if any linked
          const varAssets = record.assets?.filter((a: any) => a.variant_id === v.id);
          if (varAssets?.length > 0) {
            varPayload.picture_ids = varAssets.map((a: any) => a.source_picture_id).filter(Boolean);
          }

          return varPayload;
        });

        delete payload.price;
        delete payload.available_quantity;
      }

      console.log('[publish-to-ml] Payload:', JSON.stringify(payload, null, 2));

      // Save request summary
      await supabase
        .from('ml_publication_jobs')
        .update({ request_summary: payload })
        .eq('id', job.id);

      // Make API call to ML
      const mlResponse = await fetch('https://api.mercadolibre.com/items', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const mlResult = await mlResponse.json();

      if (!mlResponse.ok) {
        console.error('[publish-to-ml] ML API Error:', mlResult);

        const errorMessage = mlResult.message || mlResult.error || 'Erro ao publicar no Mercado Livre';
        const errorCause = mlResult.cause?.[0]?.message || mlResult.cause?.[0]?.code || '';

        await supabase
          .from('ml_publication_jobs')
          .update({
            status: 'failed',
            response_summary: mlResult,
            error_code: mlResult.error || String(mlResponse.status),
            error_message: `${errorMessage}${errorCause ? ': ' + errorCause : ''}`,
            finished_at: new Date().toISOString(),
          })
          .eq('id', job.id);

        await supabase
          .from('product_records')
          .update({ status: 'error' })
          .eq('id', productRecordId);

        await auditLog(supabase, { level: 'error', area: 'publish', action: 'publish_ml_api_error', userId: user.id, success: false, message: `ML API ${mlResponse.status}: ${errorMessage}`, meta: { product_record_id: productRecordId, ml_account_id: mlAccountId, ml_status: mlResponse.status, error_cause: errorCause } });

        return new Response(
          JSON.stringify({
            success: false,
            jobId: job.id,
            error: errorMessage,
            details: mlResult,
          }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Success!
      console.log('[publish-to-ml] Published successfully:', mlResult.id);
      await auditLog(supabase, { level: 'info', area: 'publish', action: 'publish_success', userId: user.id, success: true, message: `Anúncio publicado: ${mlResult.id}`, meta: { product_record_id: productRecordId, ml_account_id: mlAccountId, published_item_id: mlResult.id } });

      await supabase
        .from('ml_publication_jobs')
        .update({
          status: 'success',
          response_summary: mlResult,
          published_item_id: mlResult.id,
          finished_at: new Date().toISOString(),
        })
        .eq('id', job.id);

      await supabase
        .from('product_records')
        .update({
          status: 'published',
          published_item_id: mlResult.id,
          published_at: new Date().toISOString(),
        })
        .eq('id', productRecordId);

      return new Response(
        JSON.stringify({
          success: true,
          jobId: job.id,
          itemId: mlResult.id,
          permalink: mlResult.permalink,
          message: 'Anúncio publicado com sucesso!',
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );

    } catch (publishError: any) {
      console.error('[publish-to-ml] Publish error:', publishError);

      await supabase
        .from('ml_publication_jobs')
        .update({
          status: 'failed',
          error_message: publishError.message || 'Erro interno',
          finished_at: new Date().toISOString(),
        })
        .eq('id', job.id);

      throw publishError;
    }

  } catch (error) {
    console.error('[publish-to-ml] Error:', error);
    try {
      const svc = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');
      await auditLog(svc, { level: 'error', area: 'publish', action: 'publish_unhandled_error', userId: null, success: false, message: error instanceof Error ? error.message : 'Erro desconhecido', meta: {} });
    } catch (_) { /* fail-safe */ }
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Erro desconhecido' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
