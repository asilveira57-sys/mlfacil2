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

    // Parse state to get frontend origin
    let frontendOrigin = 'https://lovable.dev';
    try {
      if (state) {
        const stateData = JSON.parse(atob(state));
        frontendOrigin = stateData.origin || frontendOrigin;
      }
    } catch (e) {
      console.log('Could not parse state, using default origin');
    }

    console.log('Frontend origin:', frontendOrigin);

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
      throw new Error(`Failed to exchange authorization code: ${error}`);
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

    const expiresAt = new Date();
    expiresAt.setSeconds(expiresAt.getSeconds() + tokenData.expires_in);
    
    console.log('ML OAuth completed successfully');

    // Redirect back to frontend dashboard with token data
    const redirectUrl = new URL(`${frontendOrigin}/dashboard`);
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
