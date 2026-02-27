import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { auditLog } from "../_shared/audit-log.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

/**
 * Fetch all pages from MP Payments Search API.
 * Idempotent: uses upsert on mp_payment_id to avoid duplicates.
 */
async function fetchAllPayments(
  accessToken: string,
  mpUserId: string,
  dateFrom: string,
  dateTo: string,
): Promise<{ payments: Record<string, unknown>[]; totalFetched: number }> {
  const payments: Record<string, unknown>[] = [];
  let offset = 0;
  const limit = 50; // MP API max per page
  let hasMore = true;

  while (hasMore) {
    const url = new URL('https://api.mercadopago.com/v1/payments/search');
    url.searchParams.set('sort', 'date_created');
    url.searchParams.set('criteria', 'desc');
    url.searchParams.set('range', 'date_created');
    url.searchParams.set('begin_date', dateFrom);
    url.searchParams.set('end_date', dateTo);
    url.searchParams.set('offset', offset.toString());
    url.searchParams.set('limit', limit.toString());

    console.log(`[mp-sync-payments] Fetching offset=${offset}`);

    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (res.status === 429) {
      console.warn('[mp-sync-payments] Rate limited, waiting 3s...');
      await new Promise(r => setTimeout(r, 3000));
      continue; // retry same offset
    }

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`MP API error ${res.status}: ${errText}`);
    }

    const data = await res.json();
    const results = data.results || [];
    payments.push(...results);
    offset += results.length;

    const total = data.paging?.total ?? 0;
    hasMore = offset < total && results.length > 0;

    // Small delay to respect rate limits
    if (hasMore) await new Promise(r => setTimeout(r, 300));
  }

  return { payments, totalFetched: payments.length };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseAdmin = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  );

  try {
    const { finance_account_id, date_from, date_to } = await req.json();

    if (!finance_account_id) {
      return new Response(
        JSON.stringify({ ok: false, error: { code: 'MISSING_PARAMS', message: 'finance_account_id obrigatório' } }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Fetch finance account with token
    const { data: account, error: accError } = await supabaseAdmin
      .from('finance_accounts')
      .select('*')
      .eq('id', finance_account_id)
      .single();

    if (accError || !account) {
      return new Response(
        JSON.stringify({ ok: false, error: { code: 'ACCOUNT_NOT_FOUND', message: 'Conta financeira não encontrada' } }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!account.access_token) {
      return new Response(
        JSON.stringify({ ok: false, error: { code: 'NO_TOKEN', message: 'Conta sem token de acesso. Reconecte.' } }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Default: last 30 days
    const now = new Date();
    const defaultFrom = new Date(now);
    defaultFrom.setDate(defaultFrom.getDate() - 30);

    const beginDate = date_from || defaultFrom.toISOString();
    const endDate = date_to || now.toISOString();

    // Create job run
    const { data: jobRun } = await supabaseAdmin
      .from('finance_job_runs')
      .insert({
        finance_account_id,
        user_id: account.user_id,
        job_type: 'sync_payments',
        status: 'running',
        started_at: new Date().toISOString(),
        metrics: { date_from: beginDate, date_to: endDate },
      })
      .select('id')
      .single();

    const jobId = jobRun?.id;

    console.log(`[mp-sync-payments] Starting sync for account ${finance_account_id}, job=${jobId}`);

    // Fetch payments from MP API
    const { payments, totalFetched } = await fetchAllPayments(
      account.access_token,
      account.mp_user_id,
      beginDate,
      endDate,
    );

    console.log(`[mp-sync-payments] Fetched ${totalFetched} payments`);

    // Upsert in batches of 100
    let processedRecords = 0;
    let failedRecords = 0;
    const batchSize = 100;
    const syncedAt = new Date().toISOString();

    for (let i = 0; i < payments.length; i += batchSize) {
      const batch = payments.slice(i, i + batchSize);
      const rows = batch.map((p: Record<string, unknown>) => ({
        user_id: account.user_id,
        finance_account_id,
        mp_payment_id: String(p.id),
        status: p.status as string || null,
        status_detail: p.status_detail as string || null,
        transaction_amount: p.transaction_amount as number || null,
        total_paid_amount: p.total_paid_amount as number || null,
        fee_amount: p.fee_amount as number || null,
        net_received_amount: p.net_received_amount as number || null,
        payment_type: p.payment_type_id as string || null,
        payment_method_id: p.payment_method_id as string || null,
        installments: p.installments as number || null,
        description: p.description as string || null,
        external_reference: p.external_reference as string || null,
        mp_order_id: p.order?.id ? String((p.order as Record<string, unknown>).id) : null,
        payer_email: (p.payer as Record<string, unknown>)?.email as string || null,
        date_created: p.date_created as string || null,
        date_approved: p.date_approved as string || null,
        money_release_date: p.money_release_date as string || null,
        raw_json: p,
        synced_at: syncedAt,
      }));

      const { error: upsertError } = await supabaseAdmin
        .from('mp_payments_raw')
        .upsert(rows, { onConflict: 'finance_account_id,mp_payment_id', ignoreDuplicates: false });

      if (upsertError) {
        console.error(`[mp-sync-payments] Upsert batch error:`, upsertError);
        failedRecords += batch.length;
      } else {
        processedRecords += batch.length;
      }
    }

    // Update job run
    if (jobId) {
      await supabaseAdmin
        .from('finance_job_runs')
        .update({
          status: failedRecords > 0 ? 'partial' : 'completed',
          completed_at: new Date().toISOString(),
          total_records: totalFetched,
          processed_records: processedRecords,
          failed_records: failedRecords,
        })
        .eq('id', jobId);
    }

    // Update account last_api_ok_at
    await supabaseAdmin
      .from('finance_accounts')
      .update({ last_api_ok_at: new Date().toISOString(), last_api_error_code: null, consecutive_failures: 0 })
      .eq('id', finance_account_id);

    await auditLog(supabaseAdmin, {
      level: 'info', area: 'finance', action: 'sync_payments',
      userId: account.user_id, success: true,
      message: `Synced ${processedRecords} payments`,
      meta: { finance_account_id, totalFetched, processedRecords, failedRecords },
    });

    return new Response(
      JSON.stringify({
        ok: true,
        data: { totalFetched, processedRecords, failedRecords, jobId },
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('[mp-sync-payments] Error:', error);

    await auditLog(supabaseAdmin, {
      level: 'error', area: 'finance', action: 'sync_payments',
      userId: null, success: false,
      message: error instanceof Error ? error.message : 'Unknown error',
    });

    return new Response(
      JSON.stringify({ ok: false, error: { code: 'SYNC_ERROR', message: error instanceof Error ? error.message : 'Erro desconhecido' } }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
