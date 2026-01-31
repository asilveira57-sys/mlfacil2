import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

// SHA256 hash for PII data
async function sha256(text: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(text.toLowerCase().trim());
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// Normalize and hash user data
async function normalizeUserData(userData: any): Promise<any> {
  const normalized: any = {};

  if (userData.email) {
    normalized.em = [await sha256(userData.email)];
  }
  if (userData.phone) {
    // Remove non-digits and hash
    const phone = userData.phone.replace(/\D/g, '');
    normalized.ph = [await sha256(phone)];
  }
  if (userData.firstName) {
    normalized.fn = [await sha256(userData.firstName)];
  }
  if (userData.lastName) {
    normalized.ln = [await sha256(userData.lastName)];
  }
  if (userData.city) {
    normalized.ct = [await sha256(userData.city)];
  }
  if (userData.state) {
    normalized.st = [await sha256(userData.state)];
  }
  if (userData.country) {
    normalized.country = [await sha256(userData.country)];
  }
  if (userData.zipCode) {
    normalized.zp = [await sha256(userData.zipCode)];
  }
  if (userData.externalId) {
    normalized.external_id = [await sha256(userData.externalId)];
  }

  // Non-hashed fields
  if (userData.clientIpAddress) {
    normalized.client_ip_address = userData.clientIpAddress;
  }
  if (userData.clientUserAgent) {
    normalized.client_user_agent = userData.clientUserAgent;
  }
  if (userData.fbc) {
    normalized.fbc = userData.fbc;
  }
  if (userData.fbp) {
    normalized.fbp = userData.fbp;
  }

  return normalized;
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const accessToken = Deno.env.get('FACEBOOK_ACCESS_TOKEN');
    const pixelId = Deno.env.get('FACEBOOK_PIXEL_ID');

    if (!accessToken) {
      console.error('[FB CAPI] FACEBOOK_ACCESS_TOKEN not configured');
      return new Response(
        JSON.stringify({ error: 'Access token not configured' }),
        { 
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    if (!pixelId) {
      console.error('[FB CAPI] FACEBOOK_PIXEL_ID not configured');
      return new Response(
        JSON.stringify({ error: 'Pixel ID not configured' }),
        { 
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    const { event } = await req.json();

    if (!event || !event.eventName) {
      return new Response(
        JSON.stringify({ error: 'Event name is required' }),
        { 
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    console.log('[FB CAPI] Processing event:', event.eventName);

    // Build event data for Facebook
    const eventData: any = {
      event_name: event.eventName,
      event_time: event.eventTime || Math.floor(Date.now() / 1000),
      action_source: event.actionSource || 'website',
    };

    if (event.eventSourceUrl) {
      eventData.event_source_url = event.eventSourceUrl;
    }

    // Add user data with proper hashing
    if (event.userData) {
      eventData.user_data = await normalizeUserData(event.userData);
    }

    // Add custom data
    if (event.customData) {
      eventData.custom_data = event.customData;
    }

    // Send to Facebook Conversions API
    const fbResponse = await fetch(
      `https://graph.facebook.com/v18.0/${pixelId}/events`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          data: [eventData],
          access_token: accessToken,
        }),
      }
    );

    const fbResult = await fbResponse.json();

    if (!fbResponse.ok) {
      console.error('[FB CAPI] Facebook API error:', fbResult);
      return new Response(
        JSON.stringify({ 
          error: 'Facebook API error', 
          details: fbResult 
        }),
        { 
          status: fbResponse.status,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    console.log('[FB CAPI] Event sent successfully:', {
      eventName: event.eventName,
      eventsReceived: fbResult.events_received,
      fbtrace: fbResult.fbtrace_id,
    });

    return new Response(
      JSON.stringify({ 
        success: true,
        eventsReceived: fbResult.events_received,
        fbtrace: fbResult.fbtrace_id,
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  } catch (error) {
    console.error('[FB CAPI] Error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});
