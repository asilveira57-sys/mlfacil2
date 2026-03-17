import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
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
        JSON.stringify({ error: 'User not authenticated' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('[mp-auth-url] Generating MP auth URL for user:', user.id);

    // Parse body for frontendOrigin and optional ml_account_id
    let frontendOrigin = '';
    let mlAccountId = '';
    let companyId = '';

    try {
      const bodyText = await req.text();
      if (bodyText) {
        const body = JSON.parse(bodyText);
        frontendOrigin = body.frontendOrigin || '';
        mlAccountId = body.ml_account_id || '';
        companyId = body.companyId || '';
      }
    } catch (_) {
      console.log('[mp-auth-url] Body parsing skipped');
    }

    if (!frontendOrigin) {
      frontendOrigin = req.headers.get('origin') || '';
    }
    if (!frontendOrigin) {
      const referer = req.headers.get('referer');
      if (referer) frontendOrigin = new URL(referer).origin;
    }
    if (!frontendOrigin || frontendOrigin.includes('lovable.dev')) {
      frontendOrigin = Deno.env.get('FRONTEND_URL') || 'https://mlfacil2.lovable.app';
    }

    const appId = Deno.env.get('ML_APP_ID');
    // Use ml-oauth-callback (already registered in ML app) — flow:'finance' in state differentiates
    const redirectUri = `${Deno.env.get('SUPABASE_URL')}/functions/v1/ml-oauth-callback`;

    if (!appId) {
      throw new Error('ML_APP_ID not configured');
    }

    // Generate PKCE pair (required by Mercado Livre)
    const { codeVerifier, codeChallenge } = await generatePKCE();
    console.log('[mp-auth-url] PKCE generated, challenge method: S256');

    // State includes context for secure server-side processing
    const stateData = {
      nonce: crypto.randomUUID(),
      origin: frontendOrigin,
      userId: user.id,
      companyId: companyId || null,
      mlAccountId: mlAccountId || null,
      flow: 'finance', // Distinguishes from ML OAuth
      cv: codeVerifier, // code_verifier for PKCE
    };
    const state = btoa(JSON.stringify(stateData));

    console.log('[mp-auth-url] State:', { origin: frontendOrigin, userId: user.id, flow: 'finance' });

    // OAuth endpoint with PKCE
    const authUrl = new URL('https://auth.mercadolivre.com.br/authorization');
    authUrl.searchParams.append('response_type', 'code');
    authUrl.searchParams.append('client_id', appId);
    authUrl.searchParams.append('redirect_uri', redirectUri);
    authUrl.searchParams.append('state', state);
    authUrl.searchParams.append('code_challenge', codeChallenge);
    authUrl.searchParams.append('code_challenge_method', 'S256');

    console.log('[mp-auth-url] Generated auth URL with PKCE');

    return new Response(
      JSON.stringify({ authUrl: authUrl.toString(), state }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('[mp-auth-url] Error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
