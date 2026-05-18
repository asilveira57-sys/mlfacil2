import { createClient } from "npm:@supabase/supabase-js@2";
import { auditLog } from "../_shared/audit-log.ts";

const MP_API_URL = "https://api.mercadopago.com";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * Tolerant Mercado Pago webhook receiver.
 *
 * Accepts ALL real MP payloads:
 *   - Body { type|topic, data:{ id }, action, resource }
 *   - Querystring ?type=payment&id=xxx or ?topic=preapproval&id=xxx
 * Always responds 200 to avoid breaking MP retries; failures are logged internally.
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const mpAccessToken = Deno.env.get("MERCADOPAGO_ACCESS_TOKEN");
  const supabase = createClient(supabaseUrl, supabaseKey);

  const url = new URL(req.url);
  const qs = Object.fromEntries(url.searchParams.entries());
  let body: any = {};
  try {
    if (req.method !== "GET") body = await req.json();
  } catch {
    body = {};
  }

  console.log("[Webhook] qs:", JSON.stringify(qs), "body:", JSON.stringify(body));

  // Normalize event kind + id from any MP payload variant
  const kind: string =
    body?.type ?? body?.topic ?? qs.type ?? qs.topic ?? "";
  const eventId: string =
    body?.data?.id ?? body?.id ?? qs.id ?? qs["data.id"] ?? "";
  const action: string = body?.action ?? "";

  // Optional: parse resource URL like "/v1/payments/123" to extract id
  let resourceId = "";
  if (!eventId && typeof body?.resource === "string") {
    const m = body.resource.match(/(\d+)$/);
    if (m) resourceId = m[1];
  }
  const finalId = String(eventId || resourceId || "");

  if (!mpAccessToken) {
    console.error("[Webhook] Missing MERCADOPAGO_ACCESS_TOKEN");
    return new Response("OK", { status: 200, headers: corsHeaders });
  }

  if (!finalId) {
    console.warn("[Webhook] No id resolved from payload, ignoring.");
    return new Response("OK", { status: 200, headers: corsHeaders });
  }

  try {
    // ─── PAYMENT (one-time / preference) ────────────────────────────
    if (
      kind === "payment" ||
      action.startsWith("payment.") ||
      kind === "collection" ||
      kind === "merchant_order"
    ) {
      // For merchant_order, fetch the order then process all included payments
      if (kind === "merchant_order") {
        const moRes = await fetch(`${MP_API_URL}/merchant_orders/${finalId}`, {
          headers: { Authorization: `Bearer ${mpAccessToken}` },
        });
        if (!moRes.ok) {
          console.error("[Webhook] merchant_order fetch failed:", await moRes.text());
          return new Response("OK", { status: 200, headers: corsHeaders });
        }
        const mo = await moRes.json();
        for (const p of mo.payments || []) {
          await processPayment(supabase, mpAccessToken, String(p.id));
        }
        return new Response("OK", { status: 200, headers: corsHeaders });
      }

      await processPayment(supabase, mpAccessToken, finalId);
      return new Response("OK", { status: 200, headers: corsHeaders });
    }

    // ─── PREAPPROVAL (subscription created/updated) ─────────────────
    if (kind === "subscription_preapproval" || kind === "preapproval") {
      await processPreapproval(supabase, mpAccessToken, finalId);
      return new Response("OK", { status: 200, headers: corsHeaders });
    }

    // ─── SUBSCRIPTION CHARGE (recurring billing) ────────────────────
    if (
      kind === "subscription_authorized_payment" ||
      kind === "authorized_payment"
    ) {
      await processAuthorizedPayment(supabase, mpAccessToken, finalId);
      return new Response("OK", { status: 200, headers: corsHeaders });
    }

    console.log("[Webhook] Unhandled kind:", kind);
    return new Response("OK", { status: 200, headers: corsHeaders });
  } catch (err) {
    console.error("[Webhook] Unhandled error:", err);
    await auditLog(supabase, {
      level: "error",
      area: "billing",
      action: "webhook_error",
      success: false,
      message: `Webhook error: ${err instanceof Error ? err.message : String(err)}`,
      meta: { kind, finalId, body, qs },
    });
    return new Response("OK", { status: 200, headers: corsHeaders });
  }
});

async function processPayment(supabase: any, token: string, paymentId: string) {
  const res = await fetch(`${MP_API_URL}/v1/payments/${paymentId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    console.error(`[Webhook] payment ${paymentId} fetch failed:`, await res.text());
    return;
  }
  const payment = await res.json();
  console.log("[Webhook] payment", payment.id, payment.status, payment.external_reference);

  const result = await supabase.rpc("rpc_process_mp_payment", {
    p_payment_id: String(payment.id),
    p_external_reference: payment.external_reference || null,
    p_amount_brl: payment.transaction_amount ?? 0,
    p_currency: payment.currency_id || "BRL",
    p_status: payment.status || "unknown",
    p_status_detail: payment.status_detail || null,
    p_payer_email: payment.payer?.email || null,
    p_paid_at: payment.date_approved || null,
    p_raw: payment,
    p_auto_renew: false,
  });

  await auditLog(supabase, {
    level: result.error ? "error" : "info",
    area: "billing",
    action: "webhook_payment_processed",
    success: !result.error,
    message: `Payment ${payment.id} ${payment.status}`,
    meta: { payment_id: payment.id, status: payment.status, result: result.data, error: result.error?.message },
  });
}

async function processPreapproval(supabase: any, token: string, preapprovalId: string) {
  const res = await fetch(`${MP_API_URL}/preapproval/${preapprovalId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    console.error(`[Webhook] preapproval ${preapprovalId} fetch failed:`, await res.text());
    return;
  }
  const pa = await res.json();
  console.log("[Webhook] preapproval", pa.id, pa.status, pa.external_reference);

  // Status: pending|authorized|paused|cancelled
  if (pa.status === "cancelled" || pa.status === "paused") {
    await supabase
      .from("tenant_entitlements")
      .update({
        status: pa.status === "cancelled" ? "canceled" : "past_due",
        updated_at: new Date().toISOString(),
      })
      .eq("last_external_reference", pa.external_reference)
      .in("status", ["active", "past_due"]);

    await auditLog(supabase, {
      level: "warn",
      area: "billing",
      action: `subscription_${pa.status}`,
      success: true,
      message: `Subscription ${pa.status}`,
      meta: { preapproval_id: pa.id, external_reference: pa.external_reference },
    });
    return;
  }

  // Status authorized: fetch authorized_payments and process each (recurring activation)
  if (pa.status === "authorized") {
    try {
      const searchUrl = `${MP_API_URL}/authorized_payments/search?preapproval_id=${encodeURIComponent(preapprovalId)}&status=approved&limit=50`;
      const apsRes = await fetch(searchUrl, { headers: { Authorization: `Bearer ${token}` } });
      if (apsRes.ok) {
        const aps = await apsRes.json();
        const results = aps.results || aps.elements || [];
        console.log(`[Webhook] preapproval ${preapprovalId} has ${results.length} authorized payments`);
        for (const ap of results) {
          if (ap?.id) {
            await processAuthorizedPayment(supabase, token, String(ap.id));
          }
        }
      } else {
        console.error("[Webhook] authorized_payments search failed:", await apsRes.text());
      }
    } catch (err) {
      console.error("[Webhook] preapproval authorized fan-out error:", err);
    }

    await auditLog(supabase, {
      level: "info",
      area: "billing",
      action: "subscription_authorized",
      success: true,
      message: `Subscription authorized`,
      meta: { preapproval_id: pa.id, external_reference: pa.external_reference, payer_email: pa.payer_email },
    });
  }
}

async function processAuthorizedPayment(supabase: any, token: string, authPaymentId: string) {
  const res = await fetch(`${MP_API_URL}/authorized_payments/${authPaymentId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    console.error(`[Webhook] auth_payment ${authPaymentId} fetch failed:`, await res.text());
    return;
  }
  const ap = await res.json();
  const realPaymentId = String(ap.payment?.id || authPaymentId);

  // Get external_reference from the parent preapproval
  let externalRef: string | null = null;
  let payerEmail: string | null = null;
  if (ap.preapproval_id) {
    const paRes = await fetch(`${MP_API_URL}/preapproval/${ap.preapproval_id}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (paRes.ok) {
      const pa = await paRes.json();
      externalRef = pa.external_reference || null;
      payerEmail = pa.payer_email || null;
    }
  }

  console.log("[Webhook] authorized_payment", ap.id, ap.status, "->", realPaymentId, "ref:", externalRef);

  const result = await supabase.rpc("rpc_process_mp_payment", {
    p_payment_id: realPaymentId,
    p_external_reference: externalRef,
    p_amount_brl: ap.transaction_amount ?? 0,
    p_currency: ap.currency_id || "BRL",
    p_status: ap.status || "unknown",
    p_status_detail: ap.status_detail || null,
    p_payer_email: payerEmail,
    p_paid_at: ap.payment?.date_approved || null,
    p_raw: { authorized_payment: ap },
    p_auto_renew: true,
  });

  await auditLog(supabase, {
    level: result.error ? "error" : "info",
    area: "billing",
    action: "webhook_subscription_charge",
    success: !result.error,
    message: `Recurring charge ${realPaymentId} ${ap.status}`,
    meta: { authorized_payment_id: ap.id, payment_id: realPaymentId, result: result.data, error: result.error?.message },
  });
}
