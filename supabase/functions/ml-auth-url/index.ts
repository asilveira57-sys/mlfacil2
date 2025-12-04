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
    // Read frontend origin from request body
    let frontendOrigin = 'https://lovable.dev';
    
    console.log('Request method:', req.method);
    console.log('Content-Type:', req.headers.get('content-type'));
    
    try {
      const bodyText = await req.text();
      console.log('Raw body:', bodyText);
      
      if (bodyText) {
        const body = JSON.parse(bodyText);
        frontendOrigin = body.frontendOrigin || frontendOrigin;
      }
    } catch (e) {
      console.log('Body parsing error:', e);
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

    // Construct Mercado Livre authorization URL
    const authUrl = new URL('https://auth.mercadolibre.com.br/authorization');
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
