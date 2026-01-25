import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
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

    const { plan_price_id, success_url, failure_url } = await req.json();

    if (!plan_price_id) {
      return new Response(JSON.stringify({ error: "plan_price_id is required" }), 
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 });
    }

    // Get user from auth header
    let userId: string | null = null;
    const authHeader = req.headers.get("Authorization");
    if (authHeader) {
      const token = authHeader.replace("Bearer ", "");
      const { data: { user } } = await supabase.auth.getUser(token);
      userId = user?.id || null;
    }

    // Fetch price with plan info
    const { data: priceData, error: priceError } = await supabase
      .from("plan_prices")
      .select(`*, plans (id, slug, name, description)`)
      .eq("id", plan_price_id)
      .single();

    if (priceError || !priceData) {
      return new Response(JSON.stringify({ error: "Price not found" }), 
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 404 });
    }

    if (!priceData.visible) {
      return new Response(JSON.stringify({ error: "Price not available" }), 
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 });
    }

    const plan = priceData.plans;
    const isSubscription = priceData.mode === "assinatura";
    const providerMode = isSubscription ? "preapproval" : "preference";

    if (!mpAccessToken) {
      await supabase.from("checkout_logs").insert({
        user_id: userId, plan_price_id, provider: "mercado_pago",
        provider_mode: providerMode, status: "not_configured",
        error_message: "Mercado Pago not configured",
      });
      return new Response(JSON.stringify({ status: "not_configured", message: "Mercado Pago não configurado", init_point: null }), 
        { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const baseUrl = success_url?.split("/auth")[0] || "https://mlfacil2.lovable.app";
    const amountBRL = priceData.price_cents / 100;

    let mpResponse: Response;
    let mpData: { id?: string; init_point?: string; sandbox_init_point?: string };
    let initPoint: string | null = null;

    if (isSubscription) {
      const preapprovalBody = {
        reason: `${plan.name} - Assinatura`,
        auto_recurring: { frequency: 1, frequency_type: "months", transaction_amount: amountBRL, currency_id: "BRL" },
        back_url: success_url || `${baseUrl}/auth`,
      };
      mpResponse = await fetch("https://api.mercadopago.com/preapproval", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${mpAccessToken}` },
        body: JSON.stringify(preapprovalBody),
      });
      mpData = await mpResponse.json();
      initPoint = mpData.init_point || mpData.sandbox_init_point || null;
    } else {
      const preferenceBody = {
        items: [{ title: plan.name, description: plan.description || `Plano ${plan.name}`, quantity: 1, currency_id: "BRL", unit_price: amountBRL }],
        back_urls: { success: success_url || `${baseUrl}/auth?payment=success`, failure: failure_url || `${baseUrl}/planos?payment=failure`, pending: `${baseUrl}/auth?payment=pending` },
        auto_return: "approved",
        external_reference: `${plan.slug}:${plan_price_id}:${userId || "anonymous"}`,
      };
      mpResponse = await fetch("https://api.mercadopago.com/checkout/preferences", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${mpAccessToken}` },
        body: JSON.stringify(preferenceBody),
      });
      mpData = await mpResponse.json();
      initPoint = mpData.init_point || mpData.sandbox_init_point || null;
    }

    if (!mpResponse.ok || !initPoint) {
      await supabase.from("checkout_logs").insert({
        user_id: userId, plan_price_id, provider: "mercado_pago",
        provider_mode: providerMode, status: "error", response_payload: mpData,
        error_message: "Failed to create checkout",
      });
      return new Response(JSON.stringify({ error: "Falha ao criar checkout", details: mpData }), 
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 });
    }

    await supabase.from("checkout_logs").insert({
      user_id: userId, plan_price_id, provider: "mercado_pago",
      provider_mode: providerMode, provider_id: mpData.id, status: "created",
      response_payload: { id: mpData.id, init_point: initPoint },
    });

    return new Response(JSON.stringify({ status: "created", init_point: initPoint, provider_mode: providerMode, provider_id: mpData.id }), 
      { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("[billing-checkout] Error:", errorMessage);
    return new Response(JSON.stringify({ error: errorMessage }), 
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 });
  }
});
