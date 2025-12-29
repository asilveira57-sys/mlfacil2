import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      console.error('Missing or invalid authorization header');
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Extract JWT token
    const token = authHeader.replace('Bearer ', '');
    
    // Create admin client with service role for ALL operations
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Validate JWT and get user
    const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser(token);
    
    if (userError) {
      console.error('Auth error:', userError.message);
      return new Response(
        JSON.stringify({ error: 'User not authenticated', details: userError.message }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    if (!user) {
      console.error('No user found for token');
      return new Response(
        JSON.stringify({ error: 'User not authenticated' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Authenticated user:', user.id);

    const { seller_id, order_ids } = await req.json();
    
    if (!seller_id || !order_ids || order_ids.length === 0) {
      return new Response(
        JSON.stringify({ error: 'seller_id and order_ids are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Syncing invoices for seller: ${seller_id}, orders: ${order_ids.length}`);

    // Get ML account with access token
    const { data: mlAccount, error: mlError } = await supabaseAdmin
      .from('ml_accounts')
      .select('access_token, ml_user_id')
      .eq('user_id', user.id)
      .eq('ml_user_id', seller_id)
      .eq('is_active', true)
      .maybeSingle();

    if (mlError || !mlAccount) {
      console.error('ML account not found:', mlError?.message);
      return new Response(
        JSON.stringify({ error: 'ML account not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    let synced = 0;
    let errors = 0;

    // Process in batches
    const batchSize = 10;
    for (let i = 0; i < order_ids.length; i += batchSize) {
      const batch = order_ids.slice(i, i + batchSize);
      
      await Promise.all(batch.map(async (order_id: string) => {
        try {
          // Try to get billing info / fiscal documents
          const mlUrl = `https://api.mercadolibre.com/orders/${order_id}/billing_info`;
          const response = await fetch(mlUrl, {
            headers: {
              'Authorization': `Bearer ${mlAccount.access_token}`,
            },
          });

          let invoiceStatus = 'pendente';
          let invoiceNumber: string | null = null;
          let invoiceKey: string | null = null;
          let issuedAt: string | null = null;
          let errorMessage: string | null = null;

          if (!response.ok) {
            if (response.status === 404) {
              invoiceStatus = 'nao_localizada';
            } else {
              invoiceStatus = 'erro';
              errorMessage = `HTTP ${response.status}: ${await response.text()}`;
            }
          } else {
            const billingInfo = await response.json();
            
            // Check for fiscal documents
            const fiscalDocs = billingInfo.billing_info?.doc_number 
              || billingInfo.additional_info?.find((info: any) => info.type === 'invoice');
            
            // Also check specific invoice endpoints
            if (fiscalDocs || billingInfo.status === 'invoiced') {
              invoiceStatus = 'emitida';
              invoiceNumber = billingInfo.billing_info?.doc_number || fiscalDocs?.doc_number || null;
              invoiceKey = fiscalDocs?.access_key || billingInfo.billing_info?.access_key || null;
              issuedAt = fiscalDocs?.issue_date || billingInfo.date_created || null;
            } else {
              // Try alternative endpoint for NF-e
              try {
                const nfeUrl = `https://api.mercadolibre.com/packs/${order_id}/fiscal_documents`;
                const nfeResponse = await fetch(nfeUrl, {
                  headers: {
                    'Authorization': `Bearer ${mlAccount.access_token}`,
                  },
                });

                if (nfeResponse.ok) {
                  const nfeDocs = await nfeResponse.json();
                  if (nfeDocs && nfeDocs.length > 0) {
                    const nfe = nfeDocs[0];
                    invoiceStatus = 'emitida';
                    invoiceNumber = nfe.fiscal_document_number || null;
                    invoiceKey = nfe.access_key || null;
                    issuedAt = nfe.issue_date || null;
                  }
                }
              } catch {
                // Ignore alternative endpoint errors
              }
            }
          }

          const invoiceData = {
            user_id: user.id,
            seller_id: seller_id,
            order_id: order_id,
            invoice_status: invoiceStatus,
            invoice_number: invoiceNumber,
            invoice_key: invoiceKey,
            issued_at: issuedAt,
            error_message: errorMessage,
            last_sync_at: new Date().toISOString(),
          };

          // Upsert using admin client
          const { data: existing } = await supabaseAdmin
            .from('meli_invoices_cache')
            .select('id')
            .eq('seller_id', seller_id)
            .eq('order_id', order_id)
            .maybeSingle();

          if (existing) {
            await supabaseAdmin
              .from('meli_invoices_cache')
              .update(invoiceData)
              .eq('id', existing.id);
          } else {
            await supabaseAdmin
              .from('meli_invoices_cache')
              .insert(invoiceData);
          }

          synced++;
        } catch (err) {
          console.error(`Error syncing invoice for order ${order_id}:`, err);
          errors++;
        }
      }));
    }

    console.log(`Sync complete: ${synced} synced, ${errors} errors`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        synced,
        errors,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in ml-sync-invoices:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
