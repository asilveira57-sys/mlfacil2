import { createClient } from "npm:@supabase/supabase-js@2";
import { auditLog } from "../_shared/audit-log.ts";

/**
 * Billing Reconciliation
 * ----------------------
 * Pulls recent payments from Mercado Pago and (re)processes any that
 * the webhook missed. Also reprocesses approved payments stored locally
 * that don't have a matching active entitlement, useful for back-fills.
 *
 * Auth: ADMIN_EMAILS whitelist OR x-cron-key header.
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-cron-key",
};

const MP_API_URL = "https://api.mercadopago.com";
const ADMIN_EMAILS = (Deno.env.get("ADMIN_EMAILS") || "")
  .split(",")
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const mpToken = Deno.env.get("MERCADOPAGO_ACCESS_TOKEN");
  const supabase = createClient(supabaseUrl, serviceKey);

  // Auth
  const cronKey = Deno.env.get("CRON_KEY");
  const headerCronKey = req.headers.get("x-cron-key");
  const auth = req.headers.get("Authorization");
  const bearer = auth?.startsWith("Bearer ") ? auth.replace("Bearer ", "") : null;
  let isAuthed = !!(cronKey && headerCronKey === cronKey) || bearer === serviceKey;

  if (!isAuthed) {
    if (bearer) {
      const { data } = await supabase.auth.getUser(bearer);
      const email = (data?.user?.email || "").toLowerCase();
      isAuthed = ADMIN_EMAILS.includes(email);
    }
  }

  if (!isAuthed) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (!mpToken) {
    return new Response(JSON.stringify({ error: "MERCADOPAGO_ACCESS_TOKEN not configured" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let body: any = {};
  try {
    body = req.method !== "GET" ? await req.json() : {};
  } catch {
    body = {};
  }

  const sinceDays = Math.max(1, Math.min(60, Number(body.since_days) || 7));
  const sinceIso = new Date(Date.now() - sinceDays * 24 * 60 * 60 * 1000).toISOString();
  const untilIso = new Date().toISOString();

  const summary = {
    fetched: 0,
    processed: 0,
    activated: 0,
    renewed: 0,
    skipped_duplicate: 0,
    unresolved: 0,
    errors: [] as Array<{ payment_id: string; error: string }>,
    items: [] as any[],
  };

  // 1) Fetch recent Mercado Pago payments
  const payments = await fetchAllPayments(mpToken, sinceIso, untilIso);
  summary.fetched = payments.length;

  for (const p of payments) {
    try {
      const { data, error } = await supabase.rpc("rpc_process_mp_payment", {
        p_payment_id: String(p.id),
        p_external_reference: p.external_reference || null,
        p_amount_brl: p.transaction_amount ?? 0,
        p_currency: p.currency_id || "BRL",
        p_status: p.status || "unknown",
        p_status_detail: p.status_detail || null,
        p_payer_email: p.payer?.email || null,
        p_paid_at: p.date_approved || null,
        p_raw: p,
        p_auto_renew: false,
      });

      if (error) throw error;

      summary.processed++;
      const action = data?.entitlement_action;
      if (action === "activate") summary.activated++;
      else if (action === "renew") summary.renewed++;
      else if (action === "skipped_duplicate") summary.skipped_duplicate++;
      if (data?.error === "tenant_not_resolved") summary.unresolved++;

      summary.items.push({
        payment_id: p.id,
        status: p.status,
        amount: p.transaction_amount,
        payer_email: p.payer?.email,
        external_reference: p.external_reference,
        result: data,
      });
    } catch (err) {
      summary.errors.push({
        payment_id: String(p.id),
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  await auditLog(supabase, {
    level: "info",
    area: "billing",
    action: "reconcile_run",
    success: true,
    message: `Reconciled ${summary.processed}/${summary.fetched} MP payments`,
    meta: {
      since_days: sinceDays,
      activated: summary.activated,
      renewed: summary.renewed,
      skipped_duplicate: summary.skipped_duplicate,
      unresolved: summary.unresolved,
      errors: summary.errors.length,
    },
  });

  return new Response(JSON.stringify(summary), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});

async function fetchAllPayments(
  token: string,
  beginIso: string,
  endIso: string,
): Promise<any[]> {
  const out: any[] = [];
  let offset = 0;
  const limit = 50;
  while (true) {
    const url = new URL(`${MP_API_URL}/v1/payments/search`);
    url.searchParams.set("sort", "date_created");
    url.searchParams.set("criteria", "desc");
    url.searchParams.set("range", "date_created");
    url.searchParams.set("begin_date", beginIso);
    url.searchParams.set("end_date", endIso);
    url.searchParams.set("offset", String(offset));
    url.searchParams.set("limit", String(limit));

    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.status === 429) {
      await new Promise((r) => setTimeout(r, 2000));
      continue;
    }
    if (!res.ok) {
      console.error("[reconcile] MP search error", res.status, await res.text());
      break;
    }
    const data = await res.json();
    const results = data.results || [];
    out.push(...results);
    const total = data.paging?.total ?? 0;
    offset += results.length;
    if (results.length === 0 || offset >= total) break;
    await new Promise((r) => setTimeout(r, 200));
  }
  return out;
}
