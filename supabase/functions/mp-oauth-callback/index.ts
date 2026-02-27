import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { auditLog } from "../_shared/audit-log.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseAdmin = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  );

  try {
    const url = new URL(req.url);
    const code = url.searchParams.get('code');
    const state = url.searchParams.get('state');

    if (!code) {
      throw new Error('Missing authorization code');
    }

    console.log('[mp-oauth-callback] Processing callback');

    // Parse state
    let frontendOrigin = 'https://mlfacil2.lovable.app';
    let userId = '';
    let companyId: string | null = null;
    let mlAccountId: string | null = null;

    try {
      if (state) {
        const stateData = JSON.parse(atob(state));
        frontendOrigin = stateData.origin || frontendOrigin;
        userId = stateData.userId || '';
        companyId = stateData.companyId || null;
        mlAccountId = stateData.mlAccountId || null;
      }
    } catch (_) {
      console.log('[mp-oauth-callback] Could not parse state');
    }

    if (!userId) {
      const errorUrl = new URL(`${frontendOrigin}/financeiro/integracoes`);
      errorUrl.searchParams.set('mp_error', 'missing_user_id');
      return Response.redirect(errorUrl.toString(), 302);
    }

    // Exchange code for token (same endpoint as ML - it's the same OAuth system)
    const redirectUri = `${Deno.env.get('SUPABASE_URL')}/functions/v1/mp-oauth-callback`;
    
    const tokenResponse = await fetch('https://api.mercadolibre.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: Deno.env.get('ML_APP_ID') || '',
        client_secret: Deno.env.get('ML_SECRET_KEY') || '',
        code,
        redirect_uri: redirectUri,
      }),
    });

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      console.error('[mp-oauth-callback] Token exchange failed:', errorText);
      
      await auditLog(supabaseAdmin, {
        level: 'error', area: 'finance', action: 'mp_oauth_callback',
        userId, success: false, message: 'Token exchange failed',
        meta: { error: errorText },
      });

      const errorUrl = new URL(`${frontendOrigin}/financeiro/integracoes`);
      errorUrl.searchParams.set('mp_error', 'token_exchange_failed');
      return Response.redirect(errorUrl.toString(), 302);
    }

    const tokenData = await tokenResponse.json();
    console.log('[mp-oauth-callback] Token received');

    // Get user info from MP/ML API
    const userResponse = await fetch('https://api.mercadolibre.com/users/me', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });

    if (!userResponse.ok) {
      const errorUrl = new URL(`${frontendOrigin}/financeiro/integracoes`);
      errorUrl.searchParams.set('mp_error', 'user_fetch_failed');
      return Response.redirect(errorUrl.toString(), 302);
    }

    const userData = await userResponse.json();
    const mpUserIdStr = userData.id.toString();
    const expiresAt = new Date();
    expiresAt.setSeconds(expiresAt.getSeconds() + tokenData.expires_in);
    const now = new Date().toISOString();

    console.log('[mp-oauth-callback] MP user:', mpUserIdStr, userData.nickname);

    // Check if finance_account already exists
    const { data: existing } = await supabaseAdmin
      .from('finance_accounts')
      .select('id')
      .eq('user_id', userId)
      .eq('mp_user_id', mpUserIdStr)
      .maybeSingle();

    if (existing) {
      // Update existing
      const { error: updateError } = await supabaseAdmin
        .from('finance_accounts')
        .update({
          access_token: tokenData.access_token,
          refresh_token: tokenData.refresh_token,
          token_expires_at: expiresAt.toISOString(),
          nickname: userData.nickname || null,
          email: userData.email || null,
          connection_status: 'connected',
          is_active: true,
          last_token_refresh_at: now,
          last_api_ok_at: now,
          last_api_error_code: null,
          last_api_error_at: null,
          consecutive_failures: 0,
          ml_account_id: mlAccountId || existing.id ? undefined : null,
          company_id: companyId || undefined,
          updated_at: now,
        })
        .eq('id', existing.id);

      if (updateError) {
        console.error('[mp-oauth-callback] Update error:', updateError);
        const errorUrl = new URL(`${frontendOrigin}/financeiro/integracoes`);
        errorUrl.searchParams.set('mp_error', 'save_failed');
        return Response.redirect(errorUrl.toString(), 302);
      }

      console.log('[mp-oauth-callback] Updated existing finance account:', existing.id);
    } else {
      // Create new
      const insertData: Record<string, unknown> = {
        user_id: userId,
        mp_user_id: mpUserIdStr,
        access_token: tokenData.access_token,
        refresh_token: tokenData.refresh_token,
        token_expires_at: expiresAt.toISOString(),
        nickname: userData.nickname || null,
        email: userData.email || null,
        connection_status: 'connected',
        is_active: true,
        last_token_refresh_at: now,
        last_api_ok_at: now,
        consecutive_failures: 0,
      };

      if (mlAccountId) insertData.ml_account_id = mlAccountId;
      if (companyId) insertData.company_id = companyId;

      // Try to auto-link to ml_account if not explicitly provided
      if (!mlAccountId) {
        const { data: mlAcc } = await supabaseAdmin
          .from('ml_accounts')
          .select('id')
          .eq('user_id', userId)
          .eq('ml_user_id', mpUserIdStr)
          .eq('is_active', true)
          .maybeSingle();
        
        if (mlAcc) {
          insertData.ml_account_id = mlAcc.id;
          console.log('[mp-oauth-callback] Auto-linked to ml_account:', mlAcc.id);
        }
      }

      const { error: insertError } = await supabaseAdmin
        .from('finance_accounts')
        .insert(insertData);

      if (insertError) {
        console.error('[mp-oauth-callback] Insert error:', insertError);
        const errorUrl = new URL(`${frontendOrigin}/financeiro/integracoes`);
        errorUrl.searchParams.set('mp_error', 'save_failed');
        return Response.redirect(errorUrl.toString(), 302);
      }

      console.log('[mp-oauth-callback] Created new finance account for MP user:', mpUserIdStr);
    }

    await auditLog(supabaseAdmin, {
      level: 'info', area: 'finance', action: 'mp_oauth_callback',
      userId, success: true,
      message: `MP OAuth completed for ${userData.nickname || mpUserIdStr}`,
      meta: { mp_user_id: mpUserIdStr, nickname: userData.nickname },
    });

    // Redirect to Integrações page with success flag
    const redirectUrl = new URL(`${frontendOrigin}/financeiro/integracoes`);
    redirectUrl.searchParams.set('mp_connected', 'true');
    redirectUrl.searchParams.set('nickname', userData.nickname || '');

    return Response.redirect(redirectUrl.toString(), 302);
  } catch (error) {
    console.error('[mp-oauth-callback] Error:', error);

    await auditLog(supabaseAdmin, {
      level: 'error', area: 'finance', action: 'mp_oauth_callback',
      userId: null, success: false,
      message: error instanceof Error ? error.message : 'Unknown error',
    });

    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
