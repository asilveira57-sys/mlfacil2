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

    // Auth - get user
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

    const { plan_code, success_url, failure_url } = await req.json();

    if (!plan_code) {
      return new Response(JSON.stringify({ error: "plan_code is required" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400,
      });
    }

    // Get plan from tenant_plans
    const { data: plan, error: planError } = await supabase
      .from("tenant_plans")
      .select("*")
      .eq("code", plan_code)
      .eq("is_active", true)
      .single();

    if (planError || !plan) {
      return new Response(JSON.stringify({ error: "Plano não encontrado" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 404,
      });
    }

    if (plan.is_enterprise) {
      return new Response(JSON.stringify({ error: "Plano enterprise requer contato comercial", is_enterprise: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400,
      });
    }

    if (!mpAccessToken) {
      return new Response(JSON.stringify({ status: "not_configured", message: "Mercado Pago não configurado", init_point: null }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get tenant_id for user
    const { data: tenant } = await supabase
      .from("tenants")
      .select("id")
      .eq("owner_user_id", user.id)
      .single();

    const tenantId = tenant?.id || user.id; // fallback
    const baseUrl = success_url?.split("/auth")[0] || "https://mlfacil2.lovable.app";
    const externalRef = `${tenantId}:${plan_code}`;

    let initPoint: string | null = null;
    let mpData: any;

    if (plan.mercado_pago_plan_id) {
      // ─── SUBSCRIPTION (preapproval with plan) ───
      const preapprovalBody = {
        preapproval_plan_id: plan.mercado_pago_plan_id,
        payer_email: user.email,
        external_reference: externalRef,
        back_url: success_url || `${baseUrl}/auth?payment=success`,
      };

      const mpRes = await fetch("https://api.mercadopago.com/preapproval", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${mpAccessToken}` },
        body: JSON.stringify(preapprovalBody),
      });

      mpData = await mpRes.json();
      initPoint = mpData.init_point || mpData.sandbox_init_point || null;

      if (!mpRes.ok || !initPoint) {
        await auditLog(supabase, {
          level: "error", area: "billing", action: "checkout_preapproval_error",
          userId: user.id, success: false,
          message: "Falha ao criar assinatura MP",
          meta: { plan_code, mp_response: mpData },
        });
        return new Response(JSON.stringify({ error: "Falha ao criar checkout", details: mpData }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500,
        });
      }
    } else {
      // ─── ONE-TIME (preference) - fallback if no MP plan ID ───
      const preferenceBody = {
        items: [{
          title: plan.name,
          description: `Plano ${plan.name}`,
          quantity: 1,
          currency_id: "BRL",
          unit_price: 0.01, // Placeholder - real price from MP
        }],
        payer: { email: user.email },
        back_urls: {
          success: success_url || `${baseUrl}/auth?payment=success`,
          failure: failure_url || `${baseUrl}/planos?payment=failure`,
          pending: `${baseUrl}/auth?payment=pending`,
        },
        auto_return: "approved",
        external_reference: externalRef,
        notification_url: `${supabaseUrl}/functions/v1/mercadopago-webhook`,
      };

      const mpRes = await fetch("https://api.mercadopago.com/checkout/preferences", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${mpAccessToken}` },
        body: JSON.stringify(preferenceBody),
      });

      mpData = await mpRes.json();
      initPoint = mpData.init_point || mpData.sandbox_init_point || null;

      if (!mpRes.ok || !initPoint) {
        await auditLog(supabase, {
          level: "error", area: "billing", action: "checkout_preference_error",
          userId: user.id, success: false,
          message: "Falha ao criar preferência MP",
          meta: { plan_code, mp_response: mpData },
        });
        return new Response(JSON.stringify({ error: "Falha ao criar checkout", details: mpData }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500,
        });
      }
    }

    await auditLog(supabase, {
      level: "info", area: "billing", action: "checkout_created",
      userId: user.id, success: true,
      message: `Checkout criado para plano ${plan_code}`,
      meta: { plan_code, mp_id: mpData.id, has_mp_plan: !!plan.mercado_pago_plan_id },
    });

    return new Response(JSON.stringify({
      status: "created",
      init_point: initPoint,
      provider_id: mpData.id,
      plan_code,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("[billing-checkout] Error:", errorMessage);
    return new Response(JSON.stringify({ error: errorMessage }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500,
    });
  }
});
