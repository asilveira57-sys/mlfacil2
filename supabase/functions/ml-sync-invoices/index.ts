import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

// Sleep helper for yielding
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

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

    const token = authHeader.replace('Bearer ', '');
    
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser(token);
    
    if (userError || !user) {
      console.error('Auth error:', userError?.message);
      return new Response(
        JSON.stringify({ error: 'User not authenticated', details: userError?.message }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Authenticated user:', user.id);

    const { seller_id, order_ids } = await req.json();
    
    if (!seller_id) {
      return new Response(
        JSON.stringify({ error: 'seller_id is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!order_ids || order_ids.length === 0) {
      return new Response(
        JSON.stringify({ success: true, synced: 0, errors: 0, message: 'No orders to sync' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Syncing invoices for ${order_ids.length} orders, seller: ${seller_id}`);

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

    // Process in internal batches
    const INTERNAL_BATCH = 10;
    for (let i = 0; i < order_ids.length; i += INTERNAL_BATCH) {
      const batch = order_ids.slice(i, i + INTERNAL_BATCH);
      
      await Promise.all(batch.map(async (order_id: string) => {
        try {
          let invoiceStatus = 'pendente';
          let invoiceNumber: string | null = null;
          let invoiceKey: string | null = null;
          let issuedAt: string | null = null;
          let errorMessage: string | null = null;

          // Try billing_info endpoint first
          const billingUrl = `https://api.mercadolibre.com/orders/${order_id}/billing_info`;
          const billingResponse = await fetch(billingUrl, {
            headers: {
              'Authorization': `Bearer ${mlAccount.access_token}`,
            },
          });

          if (!billingResponse.ok) {
            if (billingResponse.status === 404) {
              // Try fiscal_documents endpoint as fallback
              const fiscalUrl = `https://api.mercadolibre.com/packs/${order_id}/fiscal_documents`;
              const fiscalResponse = await fetch(fiscalUrl, {
                headers: {
                  'Authorization': `Bearer ${mlAccount.access_token}`,
                },
              });

              if (fiscalResponse.ok) {
                const fiscalDocs = await fiscalResponse.json();
                if (Array.isArray(fiscalDocs) && fiscalDocs.length > 0) {
                  const nfe = fiscalDocs[0];
                  invoiceStatus = 'emitida';
                  invoiceNumber = nfe.fiscal_document_number || null;
                  invoiceKey = nfe.access_key || null;
                  issuedAt = nfe.issue_date || null;
                }
              }
            } else if (billingResponse.status !== 401) {
              invoiceStatus = 'erro';
              errorMessage = `HTTP ${billingResponse.status}`;
            }
          } else {
            const billingInfo = await billingResponse.json();
            
            // Check for fiscal documents
            const docNumber = billingInfo.billing_info?.doc_number;
            const additionalInvoice = billingInfo.additional_info?.find((info: any) => info.type === 'invoice');
            
            if (docNumber || additionalInvoice || billingInfo.status === 'invoiced') {
              invoiceStatus = 'emitida';
              invoiceNumber = docNumber || additionalInvoice?.doc_number || null;
              invoiceKey = billingInfo.billing_info?.access_key || additionalInvoice?.access_key || null;
              issuedAt = additionalInvoice?.issue_date || billingInfo.date_created || null;
            } else {
              // Try fiscal_documents as secondary check
              try {
                const fiscalUrl = `https://api.mercadolibre.com/packs/${order_id}/fiscal_documents`;
                const fiscalResponse = await fetch(fiscalUrl, {
                  headers: {
                    'Authorization': `Bearer ${mlAccount.access_token}`,
                  },
                });

                if (fiscalResponse.ok) {
                  const fiscalDocs = await fiscalResponse.json();
                  if (Array.isArray(fiscalDocs) && fiscalDocs.length > 0) {
                    const nfe = fiscalDocs[0];
                    invoiceStatus = 'emitida';
                    invoiceNumber = nfe.fiscal_document_number || null;
                    invoiceKey = nfe.access_key || null;
                    issuedAt = nfe.issue_date || null;
                  }
                }
              } catch {
                // Ignore secondary endpoint errors
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

          // Upsert
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

      // Yield between internal batches
      if (i + INTERNAL_BATCH < order_ids.length) {
        await sleep(100);
      }
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
