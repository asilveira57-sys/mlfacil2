// @ts-nocheck - Deno types not available in build context
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

// Declare EdgeRuntime for Supabase Edge Functions
declare const EdgeRuntime: { waitUntil: (promise: Promise<unknown>) => void } | undefined;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

// Sleep helper for yielding
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Background processing function
async function processInvoicesInBackground(
  supabaseAdmin: ReturnType<typeof createClient>,
  userId: string,
  sellerId: string,
  accessToken: string,
  orderIds: string[],
  jobId: string
) {
  try {
    console.log(`[Job ${jobId}] Starting background invoices sync: ${orderIds.length} orders`);

    let synced = 0;
    let errors = 0;
    const BATCH_SIZE = 20;

    for (let i = 0; i < orderIds.length; i += BATCH_SIZE) {
      const batch = orderIds.slice(i, i + BATCH_SIZE);
      console.log(`[Job ${jobId}] Processing batch ${Math.floor(i / BATCH_SIZE) + 1}: ${batch.length} orders`);
      
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
              'Authorization': `Bearer ${accessToken}`,
            },
          });

          if (!billingResponse.ok) {
            if (billingResponse.status === 404) {
              // Try fiscal_documents endpoint as fallback
              const fiscalUrl = `https://api.mercadolibre.com/packs/${order_id}/fiscal_documents`;
              const fiscalResponse = await fetch(fiscalUrl, {
                headers: {
                  'Authorization': `Bearer ${accessToken}`,
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
            const additionalInvoice = billingInfo.additional_info?.find((info: { type: string }) => info.type === 'invoice');
            
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
                    'Authorization': `Bearer ${accessToken}`,
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
            user_id: userId,
            seller_id: sellerId,
            order_id: order_id,
            invoice_status: invoiceStatus,
            invoice_number: invoiceNumber,
            invoice_key: invoiceKey,
            issued_at: issuedAt,
            error_message: errorMessage,
            last_sync_at: new Date().toISOString(),
          };

          const { error: upsertError } = await supabaseAdmin
            .from('meli_invoices_cache')
            .upsert(invoiceData, {
              onConflict: 'seller_id,order_id',
              ignoreDuplicates: false,
            });

          if (upsertError) {
            console.error(`[Job ${jobId}] Upsert error for order ${order_id}:`, upsertError);
            errors++;
          } else {
            synced++;
          }
        } catch (err) {
          console.error(`[Job ${jobId}] Error syncing invoice for order ${order_id}:`, err);
          errors++;
        }
      }));

      // Update progress
      await supabaseAdmin.from('sync_jobs').update({
        processed_records: synced + errors,
      }).eq('id', jobId);

      // Small yield between batches
      if (i + BATCH_SIZE < orderIds.length) {
        await sleep(50);
      }
    }

    console.log(`[Job ${jobId}] Invoices sync complete: ${synced} synced, ${errors} errors`);

    // Mark job as done
    await supabaseAdmin.from('sync_jobs').update({
      status: errors > 0 && synced === 0 ? 'error' : 'done',
      processed_records: synced,
      error_message: errors > 0 ? `${errors} invoices failed` : null,
      completed_at: new Date().toISOString(),
    }).eq('id', jobId);

  } catch (error) {
    console.error(`[Job ${jobId}] Background processing error:`, error);
    await supabaseAdmin.from('sync_jobs').update({
      status: 'error',
      error_message: error instanceof Error ? error.message : 'Unknown error',
      completed_at: new Date().toISOString(),
    }).eq('id', jobId);
  }
}

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

    // Use user-scoped client for auth validation (handles token refresh)
    const supabaseAuth = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: claimsData, error: claimsError } = await supabaseAuth.auth.getClaims(token);
    
    let userId: string;
    if (claimsError || !claimsData?.claims?.sub) {
      // Fallback to getUser if getClaims fails
      const { data: { user: fallbackUser }, error: userError } = await supabaseAuth.auth.getUser();
      if (userError || !fallbackUser) {
        console.error('Auth error:', claimsError?.message || userError?.message);
        return new Response(
          JSON.stringify({ error: 'User not authenticated', details: claimsError?.message || userError?.message }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      userId = fallbackUser.id;
    } else {
      userId = claimsData.claims.sub as string;
    }

    const user = { id: userId };

    console.log('Authenticated user:', user.id);

    // ML API Access Gate
    const { assertMlApiAccess } = await import("../_shared/ml-api-gate.ts");
    const gate = await assertMlApiAccess(supabaseAdmin, user.id);
    if (!gate.allowed) {
      console.log(`[ml-sync-invoices] Access denied: ${gate.reason}`);
      return gate.response!;
    }

    const { seller_id, order_ids } = await req.json();
    
    if (!seller_id) {
      return new Response(
        JSON.stringify({ error: 'seller_id is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!order_ids || order_ids.length === 0) {
      return new Response(
        JSON.stringify({ accepted: true, job_id: null, message: 'No orders to sync' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Starting invoice sync for ${order_ids.length} orders, seller: ${seller_id}`);

    // Get ML account with access token
    const { data: mlAccount, error: mlError } = await supabaseAdmin
      .from('ml_accounts')
      .select('access_token, ml_user_id, company_id')
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

    // Resolve tenant_id for sync_jobs
    let tenantId: string | null = null;
    if (mlAccount.company_id) {
      const { data: company } = await supabaseAdmin
        .from('companies')
        .select('tenant_id')
        .eq('id', mlAccount.company_id)
        .maybeSingle();
      tenantId = company?.tenant_id || mlAccount.company_id;
    }
    if (!tenantId) tenantId = mlAccount.company_id || user.id;

    // Create job record (new schema)
    const jobId = crypto.randomUUID();
    await supabaseAdmin.from('sync_jobs').insert({
      id: jobId,
      tenant_id: tenantId,
      module: 'shipping_labels_invoices',
      scope: 'manual',
      status: 'running',
      started_at: new Date().toISOString(),
      created_by_user_id: user.id,
      metadata: {
        seller_id: seller_id,
        total_records: order_ids.length,
        processed_records: 0,
      },
    });

    // Start background processing
    if (typeof EdgeRuntime !== 'undefined' && EdgeRuntime?.waitUntil) {
      EdgeRuntime.waitUntil(
        processInvoicesInBackground(
          supabaseAdmin,
          user.id,
          seller_id,
          mlAccount.access_token,
          order_ids,
          jobId
        )
      );
    } else {
      processInvoicesInBackground(
        supabaseAdmin,
        user.id,
        seller_id,
        mlAccount.access_token,
        order_ids,
        jobId
      ).catch(err => console.error('Background processing failed:', err));
    }

    // Return immediately
    return new Response(
      JSON.stringify({ 
        accepted: true,
        job_id: jobId,
        message: 'Invoices sync started in background',
        total: order_ids.length,
      }),
      { status: 202, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
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
