import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Try to get frontend origin from multiple sources
    let frontendOrigin = '';
    
    // 1. Try request body first
    try {
      const bodyText = await req.text();
      if (bodyText) {
        const body = JSON.parse(bodyText);
        if (body.frontendOrigin) {
          frontendOrigin = body.frontendOrigin;
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
      // Get preview URL from environment or construct it
      const previewUrl = Deno.env.get('FRONTEND_URL') || 'https://ddec4858-9aec-466d-afd2-b6bd5577a30c.lovableproject.com';
      frontendOrigin = previewUrl;
    }

    console.log('Frontend origin resolved:', frontendOrigin);

    const appId = Deno.env.get('ML_APP_ID');
    const redirectUri = `${Deno.env.get('SUPABASE_URL')}/functions/v1/ml-oauth-callback`;

    if (!appId) {
      throw new Error('ML_APP_ID not configured');
    }

    // Generate state parameter with frontend origin encoded
    const stateData = {
      nonce: crypto.randomUUID(),
      origin: frontendOrigin,
    };
    const state = btoa(JSON.stringify(stateData));

    // Construct Mercado Livre authorization URL (Brazilian domain uses "mercadolivre" with "v")
    const authUrl = new URL('https://auth.mercadolivre.com.br/authorization');
    authUrl.searchParams.append('response_type', 'code');
    authUrl.searchParams.append('client_id', appId);
    authUrl.searchParams.append('redirect_uri', redirectUri);
    authUrl.searchParams.append('state', state);

    console.log('Generated auth URL:', authUrl.toString());

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
