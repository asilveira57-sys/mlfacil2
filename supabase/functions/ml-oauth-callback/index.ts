import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const code = url.searchParams.get('code');
    const state = url.searchParams.get('state');

    if (!code) {
      throw new Error('Missing authorization code');
    }

    console.log('Processing OAuth callback with code');

    // Parse state to get frontend origin and user_id
    let frontendOrigin = 'https://lovable.dev';
    let userId = '';
    
    try {
      if (state) {
        const stateData = JSON.parse(atob(state));
        frontendOrigin = stateData.origin || frontendOrigin;
        userId = stateData.userId || '';
      }
    } catch (e) {
      console.log('Could not parse state, using default origin');
    }

    console.log('Frontend origin:', frontendOrigin);
    console.log('User ID from state:', userId);

    if (!userId) {
      // Redirect with error - no user ID
      const errorUrl = new URL(`${frontendOrigin}/dashboard`);
      errorUrl.searchParams.set('ml_error', 'missing_user_id');
      return Response.redirect(errorUrl.toString(), 302);
    }

    // Exchange code for access token
    const tokenResponse = await fetch('https://api.mercadolibre.com/oauth/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: Deno.env.get('ML_APP_ID') || '',
        client_secret: Deno.env.get('ML_SECRET_KEY') || '',
        code: code,
        redirect_uri: `${Deno.env.get('SUPABASE_URL')}/functions/v1/ml-oauth-callback`,
      }),
    });

    if (!tokenResponse.ok) {
      const error = await tokenResponse.text();
      console.error('Token exchange failed:', error);
      
      const errorUrl = new URL(`${frontendOrigin}/dashboard`);
      errorUrl.searchParams.set('ml_error', 'token_exchange_failed');
      return Response.redirect(errorUrl.toString(), 302);
    }

    const tokenData = await tokenResponse.json();
    console.log('Token received successfully');

    // Get user info from ML
    const userResponse = await fetch('https://api.mercadolibre.com/users/me', {
      headers: {
        'Authorization': `Bearer ${tokenData.access_token}`,
      },
    });

    if (!userResponse.ok) {
      const errorUrl = new URL(`${frontendOrigin}/dashboard`);
      errorUrl.searchParams.set('ml_error', 'user_fetch_failed');
      return Response.redirect(errorUrl.toString(), 302);
    }

    const userData = await userResponse.json();
    console.log('User data received:', userData.id);

    const expiresAt = new Date();
    expiresAt.setSeconds(expiresAt.getSeconds() + tokenData.expires_in);

    // Initialize Supabase client with service role key to bypass RLS
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Garante somente 1 conta ativa por usuário
    await supabaseAdmin
      .from('ml_accounts')
      .update({ is_active: false })
      .eq('user_id', userId)
      .eq('is_active', true);

    // Save ML account directly to database (secure - no tokens in URL)
    const { error: upsertError } = await supabaseAdmin
      .from('ml_accounts')
      .upsert({
        user_id: userId,
        ml_user_id: userData.id.toString(),
        access_token: tokenData.access_token,
        refresh_token: tokenData.refresh_token,
        token_expires_at: expiresAt.toISOString(),
        nickname: userData.nickname || null,
        email: userData.email || null,
        country_id: userData.site_id || null,
        is_active: true,
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'user_id,ml_user_id'
      });

    if (upsertError) {
      console.error('Error saving ML account:', upsertError);
      const errorUrl = new URL(`${frontendOrigin}/dashboard`);
      errorUrl.searchParams.set('ml_error', 'save_failed');
      return Response.redirect(errorUrl.toString(), 302);
    }

    console.log('ML account saved successfully');
    console.log('ML OAuth completed successfully');

    // Redirect back to frontend dashboard with simple success flag (NO TOKENS!)
    const redirectUrl = new URL(`${frontendOrigin}/dashboard`);
    redirectUrl.searchParams.set('ml_connected', 'true');
    redirectUrl.searchParams.set('nickname', userData.nickname || '');
    
    return Response.redirect(redirectUrl.toString(), 302);

  } catch (error) {
    console.error('OAuth callback error:', error);
    
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    // Redirect to frontend with error
    return new Response(
      JSON.stringify({ 
        error: errorMessage,
        details: 'Failed to process OAuth callback'
      }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});
