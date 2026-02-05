import { createClient } from "npm:@supabase/supabase-js@2";

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
    const body = await req.json();
    console.log("[Webhook] Received:", JSON.stringify(body));

    // Mercado Pago sends different types of notifications
    const { type, data, action } = body;

    // Payment notification
    if (type === "payment" && data?.id) {
      const paymentId = data.id;
      
      // Fetch payment details from MP API
      const mpResponse = await fetch(`${MP_API_URL}/v1/payments/${paymentId}`, {
        headers: {
          "Authorization": `Bearer ${mpAccessToken}`,
        },
      });

      if (!mpResponse.ok) {
        console.error("[Webhook] Failed to fetch payment:", await mpResponse.text());
        return new Response("OK", { status: 200 });
      }

      const payment = await mpResponse.json();
      console.log("[Webhook] Payment details:", {
        id: payment.id,
        status: payment.status,
        external_reference: payment.external_reference,
      });

      // Parse external_reference
      let refData: {
        user_id: string;
        plan_price_id: string;
        voucher_id?: string;
        discount_cents?: number;
      };

      try {
        refData = JSON.parse(payment.external_reference || "{}");
      } catch {
        console.error("[Webhook] Invalid external_reference");
        return new Response("OK", { status: 200 });
      }

      if (!refData.user_id || !refData.plan_price_id) {
        console.error("[Webhook] Missing user_id or plan_price_id");
        return new Response("OK", { status: 200 });
      }

      // Get plan price details
      const { data: priceData } = await supabase
        .from("plan_prices")
        .select("*, plans(*)")
        .eq("id", refData.plan_price_id)
        .single();

      if (!priceData) {
        console.error("[Webhook] Plan price not found");
        return new Response("OK", { status: 200 });
      }

      const plan = priceData.plans as any;

      // Only process approved payments
      if (payment.status === "approved") {
        const now = new Date();
        const periodEnd = new Date(now);
        periodEnd.setDate(periodEnd.getDate() + priceData.duration_days);

        // Create or update subscription
        const { data: existingSub } = await supabase
          .from("subscriptions")
          .select("id")
          .eq("user_id", refData.user_id)
          .single();

        if (existingSub) {
          // Update existing subscription
          await supabase
            .from("subscriptions")
            .update({
              plan_id: plan.id,
              plan_price_id: priceData.id,
              plan_type: plan.plan_type,
              plan_name: plan.name,
              plan_price_cents: priceData.price_cents,
              status: "active",
              billing_cycle: priceData.billing_cycle,
              current_period_start: now.toISOString(),
              current_period_end: periodEnd.toISOString(),
              gateway: "mercadopago",
              updated_at: now.toISOString(),
            })
            .eq("id", existingSub.id);
          
          console.log("[Webhook] Subscription updated:", existingSub.id);
        } else {
          // Create new subscription
          const { data: newSub } = await supabase
            .from("subscriptions")
            .insert({
              user_id: refData.user_id,
              plan_id: plan.id,
              plan_price_id: priceData.id,
              plan_type: plan.plan_type,
              plan_name: plan.name,
              plan_price_cents: priceData.price_cents,
              status: "active",
              billing_cycle: priceData.billing_cycle,
              current_period_start: now.toISOString(),
              current_period_end: periodEnd.toISOString(),
              gateway: "mercadopago",
            })
            .select()
            .single();
          
          console.log("[Webhook] Subscription created:", newSub?.id);
        }

        // Record payment
        await supabase.from("payments").insert({
          user_id: refData.user_id,
          voucher_id: refData.voucher_id || null,
          amount_cents: priceData.price_cents,
          discount_cents: refData.discount_cents || 0,
          final_amount_cents: Math.round(payment.transaction_amount * 100),
          mercadopago_payment_id: String(payment.id),
          mercadopago_status: payment.status,
          payment_method: payment.payment_type_id,
          paid_at: now.toISOString(),
        });

        // Update voucher usage if used
        if (refData.voucher_id) {
          await supabase.rpc("increment_voucher_usage", { voucher_id: refData.voucher_id });
        }

        console.log("[Webhook] Payment recorded successfully");
      }

      return new Response("OK", { status: 200 });
    }

    // Just acknowledge other notification types
    return new Response("OK", { status: 200 });

  } catch (err) {
    console.error("[Webhook] Error:", err);
    // Always return 200 to prevent MP from retrying
    return new Response("OK", { status: 200 });
  }
});