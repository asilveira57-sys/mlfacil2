import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const ML_APP_ID = Deno.env.get('ML_APP_ID') || '';
const ML_SECRET_KEY = Deno.env.get('ML_SECRET_KEY') || '';

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { financeAccountId } = await req.json();
    if (!financeAccountId) {
      return new Response(
        JSON.stringify({ error: 'Missing financeAccountId' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { data: account, error: accErr } = await supabaseAdmin
      .from('finance_accounts')
      .select('id, mp_user_id, refresh_token')
      .eq('id', financeAccountId)
      .eq('user_id', user.id)
      .single();

    if (accErr || !account) {
      return new Response(
        JSON.stringify({ error: 'Finance account not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!account.refresh_token) {
      return new Response(
        JSON.stringify({ success: false, error: 'No refresh token', error_code: 'no_refresh_token' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('[mp-token-refresh] Refreshing for MP user:', account.mp_user_id);

    const tokenResponse = await fetch('https://api.mercadolibre.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: ML_APP_ID,
        client_secret: ML_SECRET_KEY,
        refresh_token: account.refresh_token,
      }),
    });

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      console.error('[mp-token-refresh] Refresh failed:', tokenResponse.status, errorText);

      let errorCode = 'refresh_failed';
      try {
        const errorJson = JSON.parse(errorText);
        if (errorJson.error === 'invalid_grant') {
          errorCode = 'invalid_grant';
          await supabaseAdmin
            .from('finance_accounts')
            .update({
              connection_status: 'revoked',
              is_active: false,
              last_api_error_code: 'invalid_grant',
              last_api_error_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            })
            .eq('id', financeAccountId);
        }
      } catch (_) {}

      return new Response(
        JSON.stringify({ success: false, error: 'Token refresh failed', error_code: errorCode }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const tokenData = await tokenResponse.json();
    const expiresAt = new Date();
    expiresAt.setSeconds(expiresAt.getSeconds() + tokenData.expires_in);
    const now = new Date().toISOString();

    await supabaseAdmin
      .from('finance_accounts')
      .update({
        access_token: tokenData.access_token,
        refresh_token: tokenData.refresh_token,
        token_expires_at: expiresAt.toISOString(),
        connection_status: 'connected',
        is_active: true,
        last_token_refresh_at: now,
        last_api_ok_at: now,
        last_api_error_code: null,
        last_api_error_at: null,
        consecutive_failures: 0,
        updated_at: now,
      })
      .eq('id', financeAccountId);

    console.log('[mp-token-refresh] Token refreshed for:', account.mp_user_id);

    return new Response(
      JSON.stringify({ success: true, expiresAt: expiresAt.toISOString() }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('[mp-token-refresh] Error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
