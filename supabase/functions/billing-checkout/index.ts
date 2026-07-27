import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { auditLog } from '../_shared/audit-log.ts';

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const mpAccessToken = Deno.env.get("MERCADOPAGO_ACCESS_TOKEN");
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Auth
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Invalid token" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { offer_id, success_url, failure_url, payer_email: payerEmailOverride } = await req.json();
    // Allow user to inform a different MP account email (case where login email != MP email)
    const effectivePayerEmail = (typeof payerEmailOverride === 'string' && payerEmailOverride.includes('@'))
      ? payerEmailOverride.trim().toLowerCase()
      : null;

    if (!offer_id) {
      return new Response(JSON.stringify({ error: "offer_id is required" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400,
      });
    }

    // Try to resolve offer from plan_offers first, then plan_addon_offers
    let offer: any = null;
    let tier: any = null;
    let addon: any = null;
    let entitlementType = "tier";

    // Check plan_offers
    const { data: planOffer } = await supabase
      .from("plan_offers")
      .select("*, plan_tiers!inner(*)")
      .eq("id", offer_id)
      .eq("is_active", true)
      .single();

    if (planOffer) {
      offer = planOffer;
      tier = planOffer.plan_tiers;
      entitlementType = "tier";

      if (tier.is_enterprise) {
        return new Response(JSON.stringify({ error: "Plano enterprise requer contato comercial", is_enterprise: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400,
        });
      }
    } else {
      // Check plan_addon_offers
      const { data: addonOffer } = await supabase
        .from("plan_addon_offers")
        .select("*, plan_addons!inner(*)")
        .eq("id", offer_id)
        .eq("is_active", true)
        .single();

      if (addonOffer) {
        offer = addonOffer;
        addon = addonOffer.plan_addons;
        entitlementType = "addon";
      }
    }

    if (!offer) {
      return new Response(JSON.stringify({ error: "Oferta não encontrada ou inativa" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 404,
      });
    }

    if (!mpAccessToken) {
      return new Response(JSON.stringify({ status: "not_configured", message: "Mercado Pago não configurado", init_point: null }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get tenant_id
    const { data: tenantMember } = await supabase
      .from("tenant_members")
      .select("tenant_id")
      .eq("user_id", user.id)
      .limit(1)
      .single();

    const tenantId = tenantMember?.tenant_id || user.id;
    const baseUrl = success_url?.split("/auth")[0] || "https://mlfacil2.lovable.app";

    // Build external_reference: type:tier_or_addon_code:offer_code:tenant_id:user_id
    const entityCode = entitlementType === "tier" ? tier.code : `addon_${addon.code}`;
    const externalRef = `${entityCode}:${offer.offer_code}:${tenantId}:${user.id}`;

    const offerName = entitlementType === "tier"
      ? `${tier.name} - ${offer.offer_code}`
      : `${addon.name} - ${offer.offer_code}`;

    let initPoint: string | null = null;
    let mpData: any;

    await auditLog(supabase, {
      level: "info", area: "billing", action: "checkout_initiated",
      userId: user.id, success: true,
      message: `Checkout iniciado: ${offerName}`,
      meta: {
        offer_id, entitlement_type: entitlementType, entity_code: entityCode,
        offer_code: offer.offer_code, billing_mode: offer.billing_mode,
        payer_email_source: effectivePayerEmail
          ? (effectivePayerEmail === (user.email || '').toLowerCase() ? 'login_match' : 'user_override')
          : 'login_default',
      },
    });

    if (offer.billing_mode === "recurring") {
      // ─── RECURRING: preapproval ───
      if (offer.mp_product_ref) {
        // Use existing MP plan
        // MP requires payer_email on preapproval. Use override if provided, otherwise login email.
        const preapprovalBody = {
          preapproval_plan_id: offer.mp_product_ref,
          payer_email: effectivePayerEmail || user.email,
          external_reference: externalRef,
          back_url: success_url || `${baseUrl}/auth?payment=success`,
          notification_url: `${supabaseUrl}/functions/v1/mercadopago-webhook`,
        };

        const mpRes = await fetch("https://api.mercadopago.com/preapproval", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${mpAccessToken}` },
          body: JSON.stringify(preapprovalBody),
        });

        mpData = await mpRes.json();
        initPoint = mpData.init_point || mpData.sandbox_init_point || null;
      } else {
        // Create ad-hoc preapproval plan
        // IMPORTANT: MP frequency defines the interval between charges.
        // - Trimestral (period_months=3) → charge once every 3 months
        // - Semestral (period_months=6) → charge once every 6 months
        // - Anual (period_months=12) → historically billed monthly ×12 (discounted monthly price)
        // - Mensal (period_months=1) → charge every month
        const periodMonths = Number(offer.period_months) || 1;
        const isYearlyMonthlyBilled = periodMonths === 12;
        const autoRecurring: any = {
          frequency: isYearlyMonthlyBilled ? 1 : periodMonths,
          frequency_type: "months",
          transaction_amount: Number(offer.price_brl),
          currency_id: "BRL",
        };

        if (isYearlyMonthlyBilled) {
          autoRecurring.repetitions = 12;
        }

        const planBody = {
          reason: offerName,
          auto_recurring: autoRecurring,
          external_reference: externalRef,
          back_url: success_url || `${baseUrl}/auth?payment=success`,
          payer_email: effectivePayerEmail || user.email,
          notification_url: `${supabaseUrl}/functions/v1/mercadopago-webhook`,
        };

        const mpRes = await fetch("https://api.mercadopago.com/preapproval", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${mpAccessToken}` },
          body: JSON.stringify(planBody),
        });

        mpData = await mpRes.json();
        initPoint = mpData.init_point || mpData.sandbox_init_point || null;
      }

      if (!initPoint) {
        await auditLog(supabase, {
          level: "error", area: "billing", action: "checkout_recurring_error",
          userId: user.id, success: false,
          message: "Falha ao criar assinatura MP",
          meta: { offer_id, mp_response: mpData },
        });
        return new Response(JSON.stringify({ error: "Falha ao criar checkout", details: mpData }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500,
        });
      }
    } else {
      // ─── ONE-TIME: preference ───
      // IMPORTANT: do NOT send payer.email on preferences. It can lock the buyer
      // to that MP account and block users whose MP login email differs from the
      // app login email. Only include if the user explicitly provided an override.
      const preferenceBody: any = {
        items: [{
          title: offerName,
          description: `${offerName} - ${offer.period_months} mês(es)`,
          quantity: 1,
          currency_id: "BRL",
          unit_price: Number(offer.price_brl),
        }],
        back_urls: {
          success: success_url || `${baseUrl}/auth?payment=success`,
          failure: failure_url || `${baseUrl}/planos?payment=failure`,
          pending: `${baseUrl}/auth?payment=pending`,
        },
        auto_return: "approved",
        external_reference: externalRef,
        notification_url: `${supabaseUrl}/functions/v1/mercadopago-webhook`,
      };
      if (effectivePayerEmail) {
        preferenceBody.payer = { email: effectivePayerEmail };
      }

      const mpRes = await fetch("https://api.mercadopago.com/checkout/preferences", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${mpAccessToken}` },
        body: JSON.stringify(preferenceBody),
      });

      mpData = await mpRes.json();
      initPoint = mpData.init_point || mpData.sandbox_init_point || null;

      if (!initPoint) {
        await auditLog(supabase, {
          level: "error", area: "billing", action: "checkout_preference_error",
          userId: user.id, success: false,
          message: "Falha ao criar preferência MP",
          meta: { offer_id, mp_response: mpData },
        });
        return new Response(JSON.stringify({ error: "Falha ao criar checkout", details: mpData }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500,
        });
      }
    }

    await auditLog(supabase, {
      level: "info", area: "billing", action: "checkout_created",
      userId: user.id, success: true,
      message: `Checkout criado: ${offerName}`,
      meta: { offer_id, mp_id: mpData.id, billing_mode: offer.billing_mode, external_reference: externalRef },
    });

    return new Response(JSON.stringify({
      status: "created",
      init_point: initPoint,
      provider_id: mpData.id,
      offer_id,
      billing_mode: offer.billing_mode,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("[billing-checkout] Error:", errorMessage);
    return new Response(JSON.stringify({ error: errorMessage }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500,
    });
  }
});
