import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MP_API_URL = "https://api.mercadopago.com";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const mpAccessToken = Deno.env.get("MERCADOPAGO_ACCESS_TOKEN");
  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    // Auth
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const token = authHeader.replace("Bearer ", "");
    const userSupabase = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } }
    });
    
    const { data: claimsData, error: claimsError } = await userSupabase.auth.getClaims(token);
    if (claimsError || !claimsData?.claims?.sub) {
      return new Response(JSON.stringify({ error: "Invalid token" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    
    const userId = claimsData.claims.sub;
    const userEmail = claimsData.claims.email || "";

    const body = await req.json().catch(() => ({}));
    const { action, plan_price_id, voucher_code, return_url } = body;

    if (!mpAccessToken) {
      return new Response(JSON.stringify({ error: "Mercado Pago not configured" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ========================
    // ACTION: create_preference (single payment)
    // ========================
    if (action === "create_preference") {
      if (!plan_price_id) {
        return new Response(JSON.stringify({ error: "plan_price_id is required" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Get plan and price
      const { data: priceData, error: priceError } = await supabase
        .from("plan_prices")
        .select("*, plans(*)")
        .eq("id", plan_price_id)
        .single();

      if (priceError || !priceData) {
        return new Response(JSON.stringify({ error: "Plan price not found" }), {
          status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const plan = priceData.plans as any;
      let finalPrice = priceData.price_cents;
      let discountCents = 0;
      let voucherId: string | null = null;

      // Apply voucher if provided
      if (voucher_code) {
        const { data: voucher } = await supabase
          .from("vouchers")
          .select("*")
          .eq("code", voucher_code.toUpperCase())
          .eq("is_active", true)
          .single();

        if (voucher) {
          const now = new Date();
          const validFrom = voucher.valid_from ? new Date(voucher.valid_from) : null;
          const validUntil = voucher.valid_until ? new Date(voucher.valid_until) : null;
          
          const isValid = 
            (!validFrom || now >= validFrom) &&
            (!validUntil || now <= validUntil) &&
            (!voucher.max_uses || voucher.current_uses < voucher.max_uses) &&
            (!voucher.plan_ids || voucher.plan_ids.includes(plan.id));

          if (isValid) {
            if (voucher.discount_type === "percent") {
              discountCents = Math.floor(finalPrice * (voucher.discount_value / 100));
            } else {
              discountCents = voucher.discount_value;
            }
            finalPrice = Math.max(0, finalPrice - discountCents);
            voucherId = voucher.id;
          }
        }
      }

      // Create Mercado Pago preference
      const cycleLabels: Record<string, string> = {
        monthly: "Mensal",
        quarterly: "Trimestral",
        semiannual: "Semestral",
        annual: "Anual"
      };

      const preferenceData = {
        items: [{
          id: plan_price_id,
          title: `${plan.name} - ${cycleLabels[priceData.billing_cycle] || priceData.billing_cycle}`,
          description: plan.description || `Plano ${plan.name}`,
          quantity: 1,
          currency_id: "BRL",
          unit_price: finalPrice / 100,
        }],
        payer: {
          email: userEmail,
        },
        back_urls: {
          success: `${return_url || "https://mlfacil2.lovable.app"}/settings?tab=subscription&status=success`,
          failure: `${return_url || "https://mlfacil2.lovable.app"}/settings?tab=subscription&status=failure`,
          pending: `${return_url || "https://mlfacil2.lovable.app"}/settings?tab=subscription&status=pending`,
        },
        auto_return: "approved",
        external_reference: JSON.stringify({
          user_id: userId,
          plan_price_id,
          voucher_id: voucherId,
          discount_cents: discountCents,
        }),
        notification_url: `${supabaseUrl}/functions/v1/mercadopago-webhook`,
      };

      console.log("[MP] Creating preference:", preferenceData.items[0].title);

      const mpResponse = await fetch(`${MP_API_URL}/checkout/preferences`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${mpAccessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(preferenceData),
      });

      if (!mpResponse.ok) {
        const error = await mpResponse.text();
        console.error("[MP] Preference error:", error);
        return new Response(JSON.stringify({ error: "Failed to create payment" }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const preference = await mpResponse.json();
      console.log("[MP] Preference created:", preference.id);

      return new Response(JSON.stringify({
        preference_id: preference.id,
        init_point: preference.init_point,
        sandbox_init_point: preference.sandbox_init_point,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ========================
    // ACTION: validate_voucher
    // ========================
    if (action === "validate_voucher") {
      if (!voucher_code) {
        return new Response(JSON.stringify({ valid: false, error: "Código não informado" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: voucher } = await supabase
        .from("vouchers")
        .select("*")
        .eq("code", voucher_code.toUpperCase())
        .eq("is_active", true)
        .single();

      if (!voucher) {
        return new Response(JSON.stringify({ valid: false, error: "Cupom não encontrado" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const now = new Date();
      const validFrom = voucher.valid_from ? new Date(voucher.valid_from) : null;
      const validUntil = voucher.valid_until ? new Date(voucher.valid_until) : null;

      if (validFrom && now < validFrom) {
        return new Response(JSON.stringify({ valid: false, error: "Cupom ainda não está ativo" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (validUntil && now > validUntil) {
        return new Response(JSON.stringify({ valid: false, error: "Cupom expirado" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (voucher.max_uses && voucher.current_uses >= voucher.max_uses) {
        return new Response(JSON.stringify({ valid: false, error: "Cupom esgotado" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({
        valid: true,
        discount_type: voucher.discount_type,
        discount_value: voucher.discount_value,
        description: voucher.description,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ========================
    // ACTION: get_subscription
    // ========================
    if (action === "get_subscription") {
      const { data } = await supabase.rpc("get_user_subscription", { p_user_id: userId });
      
      return new Response(JSON.stringify({ subscription: data?.[0] || null }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ========================
    // ACTION: start_trial
    // ========================
    if (action === "start_trial") {
      const { data: subscriptionId, error } = await supabase.rpc("start_user_trial", { 
        p_user_id: userId,
        p_plan_code: "volume_300"
      });

      if (error) {
        console.error("[Trial] Error:", error);
        return new Response(JSON.stringify({ error: error.message }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ 
        success: true, 
        subscription_id: subscriptionId,
        message: subscriptionId ? "Trial iniciado com sucesso" : "Você já possui uma assinatura"
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Default: return subscription status
    const { data } = await supabase.rpc("get_user_subscription", { p_user_id: userId });
    
    return new Response(JSON.stringify({ subscription: data?.[0] || null }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err) {
    console.error("[MP] Error:", err);
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});