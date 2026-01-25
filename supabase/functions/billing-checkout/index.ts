import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface CheckoutRequest {
  plan_price_id: string;
  account_id?: string;
  success_url?: string;
  failure_url?: string;
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "Method not allowed" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 405 }
    );
  }

  try {
    console.log("[billing-checkout] Starting checkout request");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const mpAccessToken = Deno.env.get("MERCADOPAGO_ACCESS_TOKEN");

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Parse request body
    const body: CheckoutRequest = await req.json();
    const { plan_price_id, account_id, success_url, failure_url } = body;

    if (!plan_price_id) {
      return new Response(
        JSON.stringify({ error: "plan_price_id is required" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
      );
    }

    console.log(`[billing-checkout] Processing price_id: ${plan_price_id}`);

    // Get user from auth header (optional)
    let userId: string | null = null;
    const authHeader = req.headers.get("Authorization");
    if (authHeader) {
      const token = authHeader.replace("Bearer ", "");
      const { data: { user } } = await supabase.auth.getUser(token);
      userId = user?.id || null;
    }

    // Fetch the price with plan info
    const { data: priceData, error: priceError } = await supabase
      .from("billing_plan_prices")
      .select(`
        id,
        mode,
        period,
        amount_cents,
        currency,
        plan_id,
        published_at,
        is_visible,
        billing_plans (
          id,
          slug,
          name,
          description
        )
      `)
      .eq("id", plan_price_id)
      .single();

    if (priceError || !priceData) {
      console.error("[billing-checkout] Price not found:", priceError);
      return new Response(
        JSON.stringify({ error: "Price not found" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 404 }
      );
    }

    // Validate price is published and visible
    if (!priceData.published_at || !priceData.is_visible) {
      console.error("[billing-checkout] Price not available for purchase");
      return new Response(
        JSON.stringify({ error: "Price not available for purchase" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
      );
    }

    const planData = priceData.billing_plans as unknown as { id: string; slug: string; name: string; description: string };
    const plan = planData;
    const isSubscription = priceData.mode === "subscription";
    const providerMode = isSubscription ? "preapproval_plan" : "preference";

    console.log(`[billing-checkout] Mode: ${priceData.mode}, Provider mode: ${providerMode}`);

    // Check if Mercado Pago is configured
    if (!mpAccessToken) {
      console.warn("[billing-checkout] Mercado Pago not configured");
      
      // Log the attempt
      await supabase.from("checkout_logs").insert({
        user_id: userId,
        plan_price_id,
        provider: "mercado_pago",
        provider_mode: providerMode,
        status: "not_configured",
        request_payload: { plan_price_id, account_id },
        error_message: "Mercado Pago access token not configured",
      });

      return new Response(
        JSON.stringify({
          status: "not_configured",
          message: "Mercado Pago não está configurado. Entre em contato com o suporte.",
          init_point: null,
          provider_mode: providerMode,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
      );
    }

    // Build Mercado Pago request
    const baseUrl = success_url?.split("/auth")[0] || "https://mlfacil2.lovable.app";
    const amountBRL = priceData.amount_cents / 100;

    let mpResponse: Response;
    let mpData: { id?: string; init_point?: string; sandbox_init_point?: string };
    let initPoint: string | null = null;
    let providerId: string | null = null;

    if (isSubscription) {
      // Create preapproval (subscription)
      const preapprovalBody = {
        reason: `${plan.name} - Assinatura`,
        auto_recurring: {
          frequency: 1,
          frequency_type: "months",
          transaction_amount: amountBRL,
          currency_id: priceData.currency,
        },
        back_url: success_url || `${baseUrl}/auth`,
        payer_email: "", // Will be filled by MP
      };

      console.log("[billing-checkout] Creating preapproval:", JSON.stringify(preapprovalBody));

      mpResponse = await fetch("https://api.mercadopago.com/preapproval", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${mpAccessToken}`,
        },
        body: JSON.stringify(preapprovalBody),
      });

      mpData = await mpResponse.json();
      console.log("[billing-checkout] Preapproval response:", JSON.stringify(mpData));

      initPoint = mpData.init_point || mpData.sandbox_init_point || null;
      providerId = mpData.id || null;
    } else {
      // Create preference (one-time payment)
      const preferenceBody = {
        items: [
          {
            title: plan.name,
            description: plan.description || `Plano ${plan.name}`,
            quantity: 1,
            currency_id: priceData.currency,
            unit_price: amountBRL,
          },
        ],
        back_urls: {
          success: success_url || `${baseUrl}/auth?payment=success`,
          failure: failure_url || `${baseUrl}/planos?payment=failure`,
          pending: `${baseUrl}/auth?payment=pending`,
        },
        auto_return: "approved",
        external_reference: `${plan.slug}:${plan_price_id}:${userId || "anonymous"}`,
      };

      console.log("[billing-checkout] Creating preference:", JSON.stringify(preferenceBody));

      mpResponse = await fetch("https://api.mercadopago.com/checkout/preferences", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${mpAccessToken}`,
        },
        body: JSON.stringify(preferenceBody),
      });

      mpData = await mpResponse.json();
      console.log("[billing-checkout] Preference response:", JSON.stringify(mpData));

      initPoint = mpData.init_point || mpData.sandbox_init_point || null;
      providerId = mpData.id || null;
    }

    // Check for errors
    if (!mpResponse.ok || !initPoint) {
      console.error("[billing-checkout] Mercado Pago error:", mpData);
      
      await supabase.from("checkout_logs").insert({
        user_id: userId,
        plan_price_id,
        provider: "mercado_pago",
        provider_mode: providerMode,
        status: "error",
        request_payload: { plan_price_id, account_id },
        response_payload: mpData,
        error_message: "Failed to create checkout",
      });

      return new Response(
        JSON.stringify({
          error: "Falha ao criar checkout no Mercado Pago",
          details: mpData,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
      );
    }

    // Log success
    await supabase.from("checkout_logs").insert({
      user_id: userId,
      plan_price_id,
      provider: "mercado_pago",
      provider_mode: providerMode,
      provider_id: providerId,
      status: "created",
      request_payload: { plan_price_id, account_id },
      response_payload: { id: providerId, init_point: initPoint },
    });

    console.log(`[billing-checkout] Success! Init point: ${initPoint}`);

    return new Response(
      JSON.stringify({
        status: "created",
        init_point: initPoint,
        provider_mode: providerMode,
        provider_id: providerId,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
    );
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("[billing-checkout] Error:", errorMessage);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});
