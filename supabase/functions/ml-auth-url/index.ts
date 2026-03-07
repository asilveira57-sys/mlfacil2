import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

/**
 * Generate a random code_verifier (43-128 chars, URL-safe)
 * and derive the S256 code_challenge from it.
 */
async function generatePKCE() {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  const codeVerifier = base64UrlEncode(array);

  const encoder = new TextEncoder();
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(codeVerifier));
  const codeChallenge = base64UrlEncode(new Uint8Array(digest));

  return { codeVerifier, codeChallenge };
}

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Get user from authorization header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      console.error('Missing authorization header');
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    );

    // Get current user
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser();
    if (userError || !user) {
      console.error('User not authenticated:', userError?.message);
      return new Response(
        JSON.stringify({ error: 'User not authenticated' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Generating auth URL for user:', user.id);

    // Try to get frontend origin and companyId from request body
    let frontendOrigin = '';
    let companyId = '';
    
    // 1. Try request body first
    try {
      const bodyText = await req.text();
      if (bodyText) {
        const body = JSON.parse(bodyText);
        if (body.frontendOrigin) {
          frontendOrigin = body.frontendOrigin;
        }
        if (body.companyId) {
          companyId = body.companyId;
        }
      }
    } catch (e) {
      console.log('Body parsing skipped');
    }

    // 2. Fallback to Origin header
    if (!frontendOrigin) {
      frontendOrigin = req.headers.get('origin') || '';
    }

    // 3. Fallback to Referer header
    if (!frontendOrigin) {
      const referer = req.headers.get('referer');
      if (referer) {
        const refererUrl = new URL(referer);
        frontendOrigin = refererUrl.origin;
      }
    }

    // 4. Final fallback - use the preview URL pattern
    if (!frontendOrigin || frontendOrigin.includes('lovable.dev')) {
      const previewUrl = Deno.env.get('FRONTEND_URL') || 'https://ddec4858-9aec-466d-afd2-b6bd5577a30c.lovableproject.com';
      frontendOrigin = previewUrl;
    }

    console.log('Frontend origin resolved:', frontendOrigin);

    const appId = Deno.env.get('ML_APP_ID');
    const redirectUri = `${Deno.env.get('SUPABASE_URL')}/functions/v1/ml-oauth-callback`;

    if (!appId) {
      throw new Error('ML_APP_ID not configured');
    }

    // Generate PKCE pair
    const { codeVerifier, codeChallenge } = await generatePKCE();
    console.log('PKCE generated, challenge method: S256');

    // Generate state parameter with frontend origin, user ID, company ID, and code_verifier
    const stateData = {
      nonce: crypto.randomUUID(),
      origin: frontendOrigin,
      userId: user.id,
      companyId: companyId || null,
      cv: codeVerifier, // code_verifier for PKCE
    };
    const state = btoa(JSON.stringify(stateData));

    console.log('State data:', { origin: frontendOrigin, userId: user.id, companyId: companyId || 'none' });

    // Construct Mercado Livre authorization URL (Brazilian domain uses "mercadolivre" with "v")
    const authUrl = new URL('https://auth.mercadolivre.com.br/authorization');
    authUrl.searchParams.append('response_type', 'code');
    authUrl.searchParams.append('client_id', appId);
    authUrl.searchParams.append('redirect_uri', redirectUri);
    authUrl.searchParams.append('state', state);
    authUrl.searchParams.append('code_challenge', codeChallenge);
    authUrl.searchParams.append('code_challenge_method', 'S256');

    console.log('Generated auth URL with PKCE');

    return new Response(
      JSON.stringify({ 
        authUrl: authUrl.toString(),
        state: state
      }),
      { 
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );

  } catch (error) {
    console.error('Auth URL generation error:', error);
    
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    return new Response(
      JSON.stringify({ 
        error: errorMessage
      }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});
