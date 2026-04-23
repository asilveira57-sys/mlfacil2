import { createClient } from "npm:@supabase/supabase-js@2";
import { auditLog } from '../_shared/audit-log.ts';

const MP_API_URL = "https://api.mercadopago.com";

// Parse external_reference: "entity_code:offer_code:tenant_id:user_id"
function parseExternalRef(ref: string) {
  const parts = (ref || "").split(":");
  if (parts.length < 4) return null;

  const entityCode = parts[0];
  const offerCode = parts[1];
  const tenantId = parts[2];
  const userId = parts[3];

  let entitlementType: "tier" | "addon" = "tier";
  let tierCode: string | null = null;
  let addonCode: string | null = null;

  if (entityCode.startsWith("addon_")) {
    entitlementType = "addon";
    addonCode = entityCode.replace("addon_", "");
  } else {
    tierCode = entityCode;
  }

  return { entitlementType, tierCode, addonCode, offerCode, tenantId, userId };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200 });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const mpAccessToken = Deno.env.get("MERCADOPAGO_ACCESS_TOKEN");
  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    const body = await req.json();
    console.log("[Webhook] Received:", JSON.stringify(body));

    const { type, data } = body;

    // ─── PREAPPROVAL (subscription) notifications ───
    if (type === "subscription_preapproval" && data?.id) {
      const preapprovalId = data.id;

      const mpRes = await fetch(`${MP_API_URL}/preapproval/${preapprovalId}`, {
        headers: { Authorization: `Bearer ${mpAccessToken}` },
      });

      if (!mpRes.ok) {
        console.error("[Webhook] Failed to fetch preapproval:", await mpRes.text());
        return new Response("OK", { status: 200 });
      }

      const preapproval = await mpRes.json();
      console.log("[Webhook] Preapproval:", {
        id: preapproval.id, status: preapproval.status,
        external_reference: preapproval.external_reference,
      });

      const parsed = parseExternalRef(preapproval.external_reference);
      if (!parsed) {
        console.error("[Webhook] Invalid external_reference:", preapproval.external_reference);
        return new Response("OK", { status: 200 });
      }

      if (preapproval.status === "authorized") {
        // Activate entitlement
        const { data: result, error } = await supabase.rpc("rpc_activate_entitlement", {
          p_tenant_id: parsed.tenantId,
          p_entitlement_type: parsed.entitlementType,
          p_tier_code: parsed.tierCode,
          p_addon_code: parsed.addonCode,
          p_offer_code: parsed.offerCode,
          p_payment_id: preapprovalId,
          p_external_reference: preapproval.external_reference,
          p_auto_renew: true,
        });

        if (error) {
          console.error("[Webhook] rpc_activate_entitlement error:", error);
        } else {
          console.log("[Webhook] Entitlement activated:", result);
        }

        // Record payment
        await supabase.from("tenant_payments").insert({
          tenant_id: parsed.tenantId,
          provider: "mercadopago",
          payment_id: preapprovalId,
          external_reference: preapproval.external_reference,
          amount_brl: preapproval.auto_recurring?.transaction_amount || 0,
          status: "approved",
          paid_at: new Date().toISOString(),
          raw: preapproval,
        });

      } else if (preapproval.status === "cancelled") {
        await supabase
          .from("tenant_entitlements")
          .update({ status: "canceled", updated_at: new Date().toISOString() })
          .eq("tenant_id", parsed.tenantId)
          .eq("last_payment_id", preapprovalId)
          .in("status", ["active", "past_due"]);

        await auditLog(supabase, {
          level: "warn", area: "billing", action: "subscription_canceled",
          userId: parsed.userId, success: true,
          message: `Assinatura cancelada para tenant ${parsed.tenantId}`,
          meta: { tenant_id: parsed.tenantId, preapproval_id: preapprovalId, type: parsed.entitlementType },
        });

      } else if (preapproval.status === "paused") {
        await supabase
          .from("tenant_entitlements")
          .update({ status: "past_due", updated_at: new Date().toISOString() })
          .eq("tenant_id", parsed.tenantId)
          .eq("entitlement_type", parsed.entitlementType)
          .in("status", ["active"]);

        await auditLog(supabase, {
          level: "warn", area: "billing", action: "subscription_paused",
          userId: parsed.userId, success: true,
          message: `Assinatura pausada para tenant ${parsed.tenantId}`,
          meta: { tenant_id: parsed.tenantId, preapproval_id: preapprovalId },
        });
      }

      return new Response("OK", { status: 200 });
    }

    // ─── SUBSCRIPTION AUTHORIZED PAYMENT (recurring billing) ───
    if (type === "subscription_authorized_payment" && data?.id) {
      const authPaymentId = data.id;

      // Fetch authorized_payment details from MP
      const apRes = await fetch(`${MP_API_URL}/authorized_payments/${authPaymentId}`, {
        headers: { Authorization: `Bearer ${mpAccessToken}` },
      });

      if (!apRes.ok) {
        console.error("[Webhook] Failed to fetch authorized_payment:", await apRes.text());
        return new Response("OK", { status: 200 });
      }

      const authPayment = await apRes.json();
      console.log("[Webhook] AuthorizedPayment:", {
        id: authPayment.id,
        status: authPayment.status,
        preapproval_id: authPayment.preapproval_id,
        payment_id: authPayment.payment?.id,
      });

      // We need the preapproval to get external_reference
      const preapprovalId = authPayment.preapproval_id;
      if (!preapprovalId) {
        console.error("[Webhook] authorized_payment missing preapproval_id");
        return new Response("OK", { status: 200 });
      }

      const paRes = await fetch(`${MP_API_URL}/preapproval/${preapprovalId}`, {
        headers: { Authorization: `Bearer ${mpAccessToken}` },
      });

      if (!paRes.ok) {
        console.error("[Webhook] Failed to fetch preapproval for auth_payment:", await paRes.text());
        return new Response("OK", { status: 200 });
      }

      const preapproval = await paRes.json();
      const parsed = parseExternalRef(preapproval.external_reference);
      if (!parsed) {
        console.error("[Webhook] Invalid external_reference on preapproval:", preapproval.external_reference);
        return new Response("OK", { status: 200 });
      }

      const realPaymentId = String(authPayment.payment?.id || authPaymentId);
      const amount = authPayment.transaction_amount || preapproval.auto_recurring?.transaction_amount || 0;

      // Record payment (idempotent)
      await supabase.from("tenant_payments").upsert({
        tenant_id: parsed.tenantId,
        provider: "mercadopago",
        payment_id: realPaymentId,
        external_reference: preapproval.external_reference,
        amount_brl: amount,
        currency: authPayment.currency_id || "BRL",
        status: authPayment.status,
        paid_at: authPayment.status === "approved" ? new Date().toISOString() : null,
        raw: { authorized_payment: authPayment, preapproval },
      }, { onConflict: "provider,payment_id" });

      if (authPayment.status === "approved") {
        // Check existing entitlement
        const { data: existingEnt } = await supabase
          .from("tenant_entitlements")
          .select("id")
          .eq("tenant_id", parsed.tenantId)
          .eq("entitlement_type", parsed.entitlementType)
          .in("status", ["active", "past_due", "canceled"])
          .limit(1)
          .maybeSingle();

        if (existingEnt) {
          // Renew
          const { data: result, error } = await supabase.rpc("rpc_renew_entitlement", {
            p_tenant_id: parsed.tenantId,
            p_entitlement_type: parsed.entitlementType,
            p_payment_id: realPaymentId,
            p_external_reference: preapproval.external_reference,
          });
          console.log("[Webhook] Recurring renewal:", result, error);
        } else {
          // Activate (first recurring charge without prior preapproval webhook)
          const { data: result, error } = await supabase.rpc("rpc_activate_entitlement", {
            p_tenant_id: parsed.tenantId,
            p_entitlement_type: parsed.entitlementType,
            p_tier_code: parsed.tierCode,
            p_addon_code: parsed.addonCode,
            p_offer_code: parsed.offerCode,
            p_payment_id: realPaymentId,
            p_external_reference: preapproval.external_reference,
            p_auto_renew: true,
          });
          console.log("[Webhook] Recurring activation:", result, error);
        }

        await auditLog(supabase, {
          level: "info", area: "billing", action: "subscription_authorized_payment_approved",
          userId: parsed.userId, success: true,
          message: `Cobrança recorrente aprovada: ${preapproval.external_reference}`,
          meta: {
            authorized_payment_id: authPaymentId,
            payment_id: realPaymentId,
            preapproval_id: preapprovalId,
            amount,
            type: parsed.entitlementType,
          },
        });
      } else if (authPayment.status === "rejected") {
        await auditLog(supabase, {
          level: "warn", area: "billing", action: "subscription_authorized_payment_rejected",
          userId: parsed.userId, success: false,
          message: `Cobrança recorrente rejeitada: ${preapproval.external_reference}`,
          meta: {
            authorized_payment_id: authPaymentId,
            preapproval_id: preapprovalId,
            status_detail: authPayment.status_detail,
          },
        });
      }

      return new Response("OK", { status: 200 });
    }

    // ─── PAYMENT notifications (one-time / preference) ───
    if (type === "payment" && data?.id) {
      const paymentId = data.id;

      const mpRes = await fetch(`${MP_API_URL}/v1/payments/${paymentId}`, {
        headers: { Authorization: `Bearer ${mpAccessToken}` },
      });

      if (!mpRes.ok) {
        console.error("[Webhook] Failed to fetch payment:", await mpRes.text());
        return new Response("OK", { status: 200 });
      }

      const payment = await mpRes.json();
      console.log("[Webhook] Payment:", {
        id: payment.id, status: payment.status,
        external_reference: payment.external_reference,
      });

      const parsed = parseExternalRef(payment.external_reference);
      if (!parsed) {
        console.error("[Webhook] Invalid external_reference:", payment.external_reference);
        return new Response("OK", { status: 200 });
      }

      // Record payment regardless of status
      await supabase.from("tenant_payments").upsert({
        tenant_id: parsed.tenantId,
        provider: "mercadopago",
        payment_id: String(payment.id),
        external_reference: payment.external_reference,
        amount_brl: payment.transaction_amount || 0,
        currency: payment.currency_id || "BRL",
        status: payment.status,
        paid_at: payment.status === "approved" ? new Date().toISOString() : null,
        raw: payment,
      }, { onConflict: "provider,payment_id" });

      if (payment.status === "approved") {
        // Check if this is a renewal (existing active entitlement with same type)
        const { data: existingEnt } = await supabase
          .from("tenant_entitlements")
          .select("id")
          .eq("tenant_id", parsed.tenantId)
          .eq("entitlement_type", parsed.entitlementType)
          .in("status", ["active", "past_due"])
          .limit(1)
          .single();

        if (existingEnt) {
          // Renew existing
          const { data: result, error } = await supabase.rpc("rpc_renew_entitlement", {
            p_tenant_id: parsed.tenantId,
            p_entitlement_type: parsed.entitlementType,
            p_payment_id: String(payment.id),
            p_external_reference: payment.external_reference,
          });
          console.log("[Webhook] Entitlement renewed:", result, error);
        } else {
          // Activate new
          const { data: result, error } = await supabase.rpc("rpc_activate_entitlement", {
            p_tenant_id: parsed.tenantId,
            p_entitlement_type: parsed.entitlementType,
            p_tier_code: parsed.tierCode,
            p_addon_code: parsed.addonCode,
            p_offer_code: parsed.offerCode,
            p_payment_id: String(payment.id),
            p_external_reference: payment.external_reference,
            p_auto_renew: false,
          });
          console.log("[Webhook] Entitlement activated:", result, error);
        }

        await auditLog(supabase, {
          level: "info", area: "billing", action: "payment_approved",
          userId: parsed.userId, success: true,
          message: `Pagamento aprovado: ${payment.external_reference}`,
          meta: { payment_id: payment.id, amount: payment.transaction_amount, type: parsed.entitlementType },
        });

        // Schedule historical import for tier activations
        if (parsed.entitlementType === "tier") {
          try {
            const { data: accounts } = await supabase
              .from("meli_accounts")
              .select("meli_user_id")
              .eq("tenant_id", parsed.tenantId)
              .eq("status", "active");

            for (const acc of accounts || []) {
              await supabase.rpc("rpc_create_sync_job", {
                p_tenant_id: parsed.tenantId,
                p_module: "costs_orders_import",
                p_scope: "last_12m",
                p_metadata: { seller_id: acc.meli_user_id, trigger: "payment_confirmed" },
              });
            }
          } catch (e) {
            console.error("[Webhook] Error scheduling historical import:", e);
          }
        }

      } else if (payment.status === "rejected") {
        await auditLog(supabase, {
          level: "warn", area: "billing", action: "payment_rejected",
          userId: parsed.userId, success: false,
          message: `Pagamento rejeitado: ${payment.external_reference}`,
          meta: { payment_id: payment.id, status_detail: payment.status_detail },
        });
      }

      return new Response("OK", { status: 200 });
    }

    return new Response("OK", { status: 200 });
  } catch (err) {
    console.error("[Webhook] Error:", err);
    return new Response("OK", { status: 200 });
  }
});
