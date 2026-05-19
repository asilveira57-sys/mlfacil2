import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const ML_APP_ID = Deno.env.get("ML_APP_ID") || "";
const ML_SECRET_KEY = Deno.env.get("ML_SECRET_KEY") || "";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const authHeader = req.headers.get("Authorization") || "";
    const anonClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user: caller } } = await anonClient.auth.getUser();
    if (!caller) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: isAdmin } = await anonClient.rpc("has_role", {
      _user_id: caller.id,
      _role: "admin",
    });
    if (!isAdmin) {
      return new Response(JSON.stringify({ error: "Admin only" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const accountId = body?.accountId as string | undefined;
    if (!accountId) {
      return new Response(JSON.stringify({ error: "accountId is required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(supabaseUrl, serviceKey);

    const { data: account, error: accErr } = await admin
      .from("ml_accounts")
      .select("id, ml_user_id, refresh_token, nickname")
      .eq("id", accountId)
      .single();

    if (accErr || !account) {
      return new Response(JSON.stringify({ error: "Account not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!account.refresh_token) {
      return new Response(JSON.stringify({
        success: false, error: "No refresh token", error_code: "no_refresh_token",
      }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    console.log(`[admin-ml-token-refresh] admin=${caller.email} refreshing seller=${account.ml_user_id} (${account.nickname})`);

    const tokenResponse = await fetch("https://api.mercadolibre.com/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        client_id: ML_APP_ID,
        client_secret: ML_SECRET_KEY,
        refresh_token: account.refresh_token,
      }),
    });

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      console.error("[admin-ml-token-refresh] ML error:", tokenResponse.status, errorText);

      let errorCode = "refresh_failed";
      try {
        const j = JSON.parse(errorText);
        if (j.error === "invalid_grant") {
          errorCode = "invalid_grant";
          await admin.from("ml_accounts").update({
            connection_status: "revoked",
            is_active: false,
            last_api_error_code: "invalid_grant",
            last_api_error_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          }).eq("id", accountId);
        }
      } catch (_) { /* noop */ }

      return new Response(JSON.stringify({
        success: false, error: "Token refresh failed", error_code: errorCode, details: errorText,
      }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const tokenData = await tokenResponse.json();
    const expiresAt = new Date();
    expiresAt.setSeconds(expiresAt.getSeconds() + tokenData.expires_in);
    const now = new Date().toISOString();

    const { error: updErr } = await admin.from("ml_accounts").update({
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token,
      token_expires_at: expiresAt.toISOString(),
      connection_status: "connected",
      is_active: true,
      last_token_refresh_at: now,
      last_api_ok_at: now,
      last_api_error_code: null,
      last_api_error_at: null,
      consecutive_failures: 0,
      updated_at: now,
    }).eq("id", accountId);

    if (updErr) {
      return new Response(JSON.stringify({ success: false, error: "Failed to save token" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({
      success: true,
      seller: account.ml_user_id,
      nickname: account.nickname,
      expiresAt: expiresAt.toISOString(),
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (error) {
    console.error("[admin-ml-token-refresh] Error:", error);
    return new Response(JSON.stringify({
      error: error instanceof Error ? error.message : "Unknown error",
    }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
