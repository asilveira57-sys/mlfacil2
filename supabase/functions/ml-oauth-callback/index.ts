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

    console.log('Processing OAuth callback with code:', code);

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
      throw new Error('Failed to exchange authorization code');
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
      throw new Error('Failed to fetch user info');
    }

    const userData = await userResponse.json();
    console.log('User data received:', userData.id);

    // Create Supabase client with service role to store tokens
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Store ML account info with state as temporary user identifier
    // In production, you should validate state against stored session
    
    // For now, we'll store with a placeholder and the user will need to link manually
    // This is a simplified flow - in production you'd store state with user_id in a session table
    const expiresAt = new Date();
    expiresAt.setSeconds(expiresAt.getSeconds() + tokenData.expires_in);

    // Store in a temporary table or return to frontend with token for manual linking
    // For MVP, we'll redirect with the token data and let frontend handle storage
    
    console.log('ML OAuth completed successfully');

    // Redirect back to dashboard with token data in URL (will be handled by frontend)
    const redirectUrl = new URL(`${url.origin}/dashboard`);
    redirectUrl.searchParams.set('ml_connected', 'true');
    redirectUrl.searchParams.set('ml_user_id', userData.id.toString());
    redirectUrl.searchParams.set('access_token', tokenData.access_token);
    redirectUrl.searchParams.set('refresh_token', tokenData.refresh_token);
    redirectUrl.searchParams.set('expires_at', expiresAt.toISOString());
    redirectUrl.searchParams.set('nickname', userData.nickname || '');
    redirectUrl.searchParams.set('email', userData.email || '');
    redirectUrl.searchParams.set('country_id', userData.site_id || '');
    
    return Response.redirect(redirectUrl.toString(), 302);

  } catch (error) {
    console.error('OAuth callback error:', error);
    
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
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
