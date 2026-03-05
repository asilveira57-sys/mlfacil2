import { createClient } from "npm:@supabase/supabase-js@2";
import { auditLog } from '../_shared/audit-log.ts';

const MP_API_URL = "https://api.mercadopago.com";

Deno.serve(async (req) => {
  // Webhooks don't need CORS but respond to any method
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

    const { type, data, action } = body;

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
        id: preapproval.id,
        status: preapproval.status,
        preapproval_plan_id: preapproval.preapproval_plan_id,
        payer_email: preapproval.payer_email,
        external_reference: preapproval.external_reference,
      });

      // Parse external_reference: "tenant_id:plan_code"
      const extRef = preapproval.external_reference || "";
      const [tenantId, planCode] = extRef.split(":");

      if (!tenantId || !planCode) {
        console.error("[Webhook] Invalid external_reference:", extRef);
        return new Response("OK", { status: 200 });
      }

      if (preapproval.status === "authorized") {
        // Activate subscription
        const { data: result, error } = await supabase.rpc("rpc_activate_subscription", {
          p_tenant_id: tenantId,
          p_plan_code: planCode,
          p_mp_subscription_id: preapprovalId,
        });

        if (error) {
          console.error("[Webhook] rpc_activate_subscription error:", error);
        } else {
          console.log("[Webhook] Subscription activated:", result);
        }
      } else if (preapproval.status === "cancelled") {
        // Cancel subscription
        const { data: result, error } = await supabase.rpc("rpc_cancel_subscription", {
          p_tenant_id: tenantId,
        });
        console.log("[Webhook] Subscription canceled:", result, error);
      } else if (preapproval.status === "paused") {
        // Mark as past_due
        // Update tier entitlement to past_due
        await supabase
          .from("tenant_entitlements")
          .update({ status: "past_due", updated_at: new Date().toISOString() })
          .eq("tenant_id", tenantId)
          .eq("entitlement_type", "tier")
          .in("status", ["active", "trial"]);

        await auditLog(supabase, {
          level: "warn", area: "billing", action: "subscription_paused",
          userId: null, success: true,
          message: `Assinatura pausada para tenant ${tenantId}`,
          meta: { tenant_id: tenantId, preapproval_id: preapprovalId },
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
        id: payment.id,
        status: payment.status,
        external_reference: payment.external_reference,
      });

      // Parse external_reference: "tenant_id:plan_code"
      const extRef = payment.external_reference || "";
      const [tenantId, planCode] = extRef.split(":");

      if (!tenantId || !planCode) {
        console.error("[Webhook] Invalid external_reference:", extRef);
        return new Response("OK", { status: 200 });
      }

      if (payment.status === "approved") {
        const { data: result, error } = await supabase.rpc("rpc_activate_subscription", {
          p_tenant_id: tenantId,
          p_plan_code: planCode,
          p_mp_subscription_id: String(payment.id),
        });

        if (error) {
          console.error("[Webhook] rpc_activate_subscription error:", error);
        } else {
          console.log("[Webhook] Subscription activated via payment:", result);
        }

        // Schedule historical import for all accounts
        try {
          const { data: accounts } = await supabase
            .from("meli_accounts")
            .select("meli_user_id")
            .eq("tenant_id", tenantId)
            .eq("status", "active");

          for (const acc of accounts || []) {
            await supabase.rpc("rpc_create_sync_job", {
              p_tenant_id: tenantId,
              p_module: "costs_orders_import",
              p_scope: "last_12m",
              p_metadata: { seller_id: acc.meli_user_id, trigger: "payment_confirmed" },
            });
          }
        } catch (e) {
          console.error("[Webhook] Error scheduling historical import:", e);
        }
      }

      return new Response("OK", { status: 200 });
    }

    // Acknowledge other types
    return new Response("OK", { status: 200 });
  } catch (err) {
    console.error("[Webhook] Error:", err);
    return new Response("OK", { status: 200 });
  }
});
