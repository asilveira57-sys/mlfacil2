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

    // Get authenticated user from Supabase
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('Missing authorization header');
    }

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: authHeader },
        },
      }
    );

    const { data: { user }, error: userError } = await supabaseClient.auth.getUser();
    
    if (userError || !user) {
      throw new Error('Failed to get authenticated user');
    }

    // Store ML account info
    const expiresAt = new Date();
    expiresAt.setSeconds(expiresAt.getSeconds() + tokenData.expires_in);

    const { error: insertError } = await supabaseClient
      .from('ml_accounts')
      .upsert({
        user_id: user.id,
        ml_user_id: userData.id.toString(),
        access_token: tokenData.access_token,
        refresh_token: tokenData.refresh_token,
        token_expires_at: expiresAt.toISOString(),
        nickname: userData.nickname,
        email: userData.email,
        country_id: userData.site_id,
        is_active: true,
      }, {
        onConflict: 'user_id,ml_user_id'
      });

    if (insertError) {
      console.error('Database insert error:', insertError);
      throw new Error('Failed to store account info');
    }

    console.log('ML account stored successfully');

    // Redirect back to dashboard with success
    return Response.redirect(
      `${url.origin}/dashboard?ml_connected=true`,
      302
    );

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
