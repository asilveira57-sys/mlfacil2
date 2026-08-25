const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Diagnostic-only: validates the Mercado Pago access token without exposing it.
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const token = Deno.env.get("MERCADOPAGO_ACCESS_TOKEN");
  const out: Record<string, unknown> = {
    token_present: !!token,
    token_prefix: token ? token.slice(0, 8) : null,
  };

  if (token) {
    const me = await fetch("https://api.mercadopago.com/users/me", {
      headers: { Authorization: `Bearer ${token}` },
    });
    out.users_me_status = me.status;
    const meJson = await me.json().catch(() => ({}));
    out.users_me = {
      id: meJson.id,
      nickname: meJson.nickname,
      site_id: meJson.site_id,
      status: meJson.status,
      error: meJson.error,
      message: meJson.message,
    };

    const pref = await fetch("https://api.mercadopago.com/checkout/preferences", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        items: [{ title: "Diag", quantity: 1, currency_id: "BRL", unit_price: 1 }],
      }),
    });
    out.preference_status = pref.status;
    out.preference_body = await pref.json().catch(() => ({}));
  }

  return new Response(JSON.stringify(out), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
