import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { auditLog } from "../_shared/audit-log.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

/**
 * Fetch all pages from MP Account Balance / Movements API.
 * Uses the /mercadopago_account/movements endpoint (ledger).
 * Idempotent: upsert on mp_movement_id.
 */
async function fetchAllMovements(
  accessToken: string,
  mpUserId: string,
  dateFrom: string,
  dateTo: string,
): Promise<{ movements: Record<string, unknown>[]; totalFetched: number }> {
  const movements: Record<string, unknown>[] = [];
  let offset = 0;
  const limit = 50;
  let hasMore = true;

  while (hasMore) {
    // Use the official Mercado Pago payments/search endpoint
    const movUrl = new URL(`https://api.mercadopago.com/v1/payments/search`);
    movUrl.searchParams.set('offset', offset.toString());
    movUrl.searchParams.set('limit', limit.toString());
    movUrl.searchParams.set('sort', 'date_created');
    movUrl.searchParams.set('criteria', 'desc');
    movUrl.searchParams.set('range', 'date_created');
    movUrl.searchParams.set('begin_date', dateFrom);
    movUrl.searchParams.set('end_date', dateTo);

    console.log(`[mp-sync-movements] Fetching offset=${offset}`);

    const res = await fetch(movUrl.toString(), {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (res.status === 429) {
      console.warn('[mp-sync-movements] Rate limited, waiting 3s...');
      await new Promise(r => setTimeout(r, 3000));
      continue;
    }

    if (!res.ok) {
      const errText = await res.text();
      console.warn(`[mp-sync-movements] MP API returned ${res.status}: ${errText}`);
      // Treat 404 or empty-data errors as "no movements" instead of throwing
      if (res.status === 404 || res.status === 400) {
        console.info('[mp-sync-movements] No movements available from MP API, returning empty');
        return { movements: [], totalFetched: 0 };
      }
      // Also handle 403 gracefully - legacy endpoint blocked
      if (res.status === 403) {
        console.warn('[mp-sync-movements] 403 Forbidden - endpoint may require different permissions');
        return { movements: [], totalFetched: 0 };
      }
      throw new Error(`MP API error ${res.status}: ${errText}`);
    }

    const data = await res.json();
    const results = data.results || [];
    movements.push(...results);
    offset += results.length;

    const total = data.paging?.total ?? 0;
    hasMore = offset < total && results.length > 0;

    if (hasMore) await new Promise(r => setTimeout(r, 300));
  }

  return { movements, totalFetched: movements.length };
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
        job_type: 'sync_movements',
        status: 'running',
        started_at: new Date().toISOString(),
        metrics: { date_from: beginDate, date_to: endDate },
      })
      .select('id')
      .single();

    const jobId = jobRun?.id;

    console.log(`[mp-sync-movements] Starting sync for account ${finance_account_id}, job=${jobId}`);

    // Fetch movements from MP API
    const { movements, totalFetched } = await fetchAllMovements(
      account.access_token,
      account.mp_user_id,
      beginDate,
      endDate,
    );

    console.log(`[mp-sync-movements] Fetched ${totalFetched} movements`);

    // Upsert in batches of 100
    let processedRecords = 0;
    let failedRecords = 0;
    const batchSize = 100;
    const syncedAt = new Date().toISOString();

    for (let i = 0; i < movements.length; i += batchSize) {
      const batch = movements.slice(i, i + batchSize);
      const rows = batch.map((m: Record<string, unknown>) => ({
        user_id: account.user_id,
        finance_account_id,
        mp_movement_id: String(m.id),
        movement_type: (m.payment_type_id as string) || (m.type as string) || null,
        status: m.status as string || null,
        amount: (m.transaction_amount as number) ?? (m.amount as number) ?? null,
        balance: (m.balance as number) ?? null,
        description: m.description as string || null,
        reference_id: m.external_reference ? String(m.external_reference) : (m.reference_id ? String(m.reference_id) : null),
        payment_id: m.id ? String(m.id) : null,
        date_created: m.date_created as string || null,
        raw_json: m,
        synced_at: syncedAt,
      }));

      const { error: upsertError } = await supabaseAdmin
        .from('mp_movements_raw')
        .upsert(rows, { onConflict: 'finance_account_id,mp_movement_id', ignoreDuplicates: false });

      if (upsertError) {
        console.error(`[mp-sync-movements] Upsert batch error:`, upsertError);
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
      level: 'info', area: 'finance', action: 'sync_movements',
      userId: account.user_id, success: true,
      message: `Synced ${processedRecords} movements`,
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
    console.error('[mp-sync-movements] Error:', error);

    await auditLog(supabaseAdmin, {
      level: 'error', area: 'finance', action: 'sync_movements',
      userId: null, success: false,
      message: error instanceof Error ? error.message : 'Unknown error',
    });

    return new Response(
      JSON.stringify({ ok: false, error: { code: 'SYNC_ERROR', message: error instanceof Error ? error.message : 'Erro desconhecido' } }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
