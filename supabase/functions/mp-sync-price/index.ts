import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

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

    const { plan_price_id } = await req.json();

    if (!plan_price_id) {
      return new Response(JSON.stringify({ error: "plan_price_id is required" }), 
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 });
    }

    if (!mpAccessToken) {
      return new Response(JSON.stringify({ error: "Mercado Pago não configurado" }), 
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 });
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

    const plan = priceData.plans;
    const amountBRL = priceData.price_cents / 100;
    const isSubscription = priceData.mode === "assinatura";

    let updateData: Record<string, string | null> = {};

    if (isSubscription) {
      // Derive real charge cadence from billing_cycle (monthly | quarterly | semiannual | annual)
      const cycle = String(priceData.billing_cycle || "monthly").toLowerCase();
      const cycleToMonths: Record<string, number> = {
        monthly: 1,
        quarterly: 3,
        semiannual: 6,
        annual: 12,
      };
      const periodMonths = cycleToMonths[cycle] ?? 1;
      const isYearlyMonthlyBilled = periodMonths === 12;

      const autoRecurring: Record<string, unknown> = {
        frequency: isYearlyMonthlyBilled ? 1 : periodMonths,
        frequency_type: "months",
        transaction_amount: amountBRL,
        currency_id: "BRL",
      };
      if (isYearlyMonthlyBilled) autoRecurring.repetitions = 12;

      const body = {
        reason: `${plan.name} - Assinatura`,
        auto_recurring: autoRecurring,
        back_url: "https://mlfacil2.lovable.app/auth",
      };

      const response = await fetch("https://api.mercadopago.com/preapproval_plan", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${mpAccessToken}`,
        },
        body: JSON.stringify(body),
      });

      const data = await response.json();
      console.log("[mp-sync-price] Preapproval plan response:", JSON.stringify(data));

      if (data.id) {
        updateData.mp_preapproval_plan_id = data.id;
      }
    } else {
      // For one-time payments, we don't need to sync - checkout is created on demand
      updateData.mp_checkout_url = null; // Clear any old URL
    }

    // Update the price record
    if (Object.keys(updateData).length > 0) {
      const { error: updateError } = await supabase
        .from("plan_prices")
        .update(updateData)
        .eq("id", plan_price_id);

      if (updateError) {
        throw updateError;
      }
    }

    return new Response(JSON.stringify({ 
      success: true, 
      mode: priceData.mode,
      mp_preapproval_plan_id: updateData.mp_preapproval_plan_id || priceData.mp_preapproval_plan_id,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("[mp-sync-price] Error:", errorMessage);
    return new Response(JSON.stringify({ error: errorMessage }), 
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 });
  }
});
