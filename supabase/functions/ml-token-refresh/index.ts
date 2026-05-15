import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const ML_APP_ID = Deno.env.get('ML_APP_ID') || '';
const ML_SECRET_KEY = Deno.env.get('ML_SECRET_KEY') || '';

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Get user from auth header
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

    const body = await req.json();
    const { accountId } = body;

    if (!accountId) {
      return new Response(
        JSON.stringify({ error: 'Missing accountId' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get account with admin client to access tokens
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Authorize: user must own the account OR be an active member of the
    // company that owns the account (collaborator inheritance).
    const { data: canUse, error: authzError } = await supabaseAdmin
      .rpc('can_user_use_ml_account', { _user_id: user.id, _account_id: accountId });

    if (authzError || !canUse) {
      console.error('[ml-token-refresh] Authorization failed:', authzError);
      return new Response(
        JSON.stringify({ error: 'Account not accessible' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { data: account, error: accountError } = await supabaseAdmin
      .from('ml_accounts')
      .select('id, ml_user_id, refresh_token, user_id')
      .eq('id', accountId)
      .single();

    if (accountError || !account) {
      console.error('[ml-token-refresh] Account not found:', accountError);
      return new Response(
        JSON.stringify({ error: 'Account not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!account.refresh_token) {
      console.error('[ml-token-refresh] No refresh token for account:', accountId);
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'No refresh token', 
          error_code: 'no_refresh_token' 
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Call ML OAuth to refresh token
    console.log('[ml-token-refresh] Refreshing token for seller:', account.ml_user_id);
    
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
      console.error('[ml-token-refresh] ML API error:', tokenResponse.status, errorText);
      
      // Parse error to determine if token was revoked
      let errorCode = 'refresh_failed';
      try {
        const errorJson = JSON.parse(errorText);
        if (errorJson.error === 'invalid_grant') {
          errorCode = 'invalid_grant';
           // Mark account as revoked
          await supabaseAdmin
            .from('ml_accounts')
            .update({
              connection_status: 'revoked',
               is_active: false,
              last_api_error_code: 'invalid_grant',
              last_api_error_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            })
            .eq('id', accountId);
        }
      } catch (_) {
        // Ignore parse errors
      }

      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Token refresh failed', 
          error_code: errorCode 
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const tokenData = await tokenResponse.json();
    const expiresAt = new Date();
    expiresAt.setSeconds(expiresAt.getSeconds() + tokenData.expires_in);
    const now = new Date().toISOString();

    // Update account with new tokens
    const { error: updateError } = await supabaseAdmin
      .from('ml_accounts')
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
      .eq('id', accountId);

    if (updateError) {
      console.error('[ml-token-refresh] Failed to update account:', updateError);
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to save token' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('[ml-token-refresh] Token refreshed successfully for seller:', account.ml_user_id);

    return new Response(
      JSON.stringify({ 
        success: true, 
        accessToken: tokenData.access_token,
        expiresAt: expiresAt.toISOString(),
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[ml-token-refresh] Error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
