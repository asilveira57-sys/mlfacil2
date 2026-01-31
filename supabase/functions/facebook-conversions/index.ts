import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

// SHA256 hash for PII data (Facebook requires lowercase hex)
async function sha256(text: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(text.toLowerCase().trim());
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// Normalize and hash user data according to Facebook SDK format
async function buildUserData(userData: any): Promise<Record<string, any>> {
  const result: Record<string, any> = {};

  // Hashed PII fields (Facebook expects arrays)
  if (userData.email) {
    result.em = [await sha256(userData.email)];
  }
  if (userData.phone) {
    const phone = userData.phone.replace(/\D/g, '');
    result.ph = phone ? [await sha256(phone)] : [];
  }
  if (userData.firstName) {
    result.fn = [await sha256(userData.firstName)];
  }
  if (userData.lastName) {
    result.ln = [await sha256(userData.lastName)];
  }
  if (userData.city) {
    result.ct = [await sha256(userData.city)];
  }
  if (userData.state) {
    result.st = [await sha256(userData.state)];
  }
  if (userData.country) {
    result.country = [await sha256(userData.country)];
  }
  if (userData.zipCode) {
    result.zp = [await sha256(userData.zipCode)];
  }
  if (userData.externalId) {
    result.external_id = [await sha256(userData.externalId)];
  }

  // Non-hashed fields (matching SDK format)
  if (userData.clientIpAddress) {
    result.client_ip_address = userData.clientIpAddress;
  }
  if (userData.clientUserAgent) {
    result.client_user_agent = userData.clientUserAgent;
  }
  if (userData.fbc) {
    result.fbc = userData.fbc;
  }
  if (userData.fbp) {
    result.fbp = userData.fbp;
  }

  return result;
}

// Build custom_data object matching Facebook SDK CustomData format
function buildCustomData(customData: any): Record<string, any> | undefined {
  if (!customData) return undefined;

  const result: Record<string, any> = {};

  // Standard e-commerce fields
  if (customData.value !== undefined) {
    result.value = customData.value;
  }
  if (customData.currency) {
    result.currency = customData.currency;
  }
  if (customData.content_name) {
    result.content_name = customData.content_name;
  }
  if (customData.content_category) {
    result.content_category = customData.content_category;
  }
  if (customData.content_type) {
    result.content_type = customData.content_type;
  }
  if (customData.content_ids && customData.content_ids.length > 0) {
    result.content_ids = customData.content_ids;
  }
  if (customData.contents && customData.contents.length > 0) {
    result.contents = customData.contents;
  }
  if (customData.num_items !== undefined) {
    result.num_items = customData.num_items;
  }
  if (customData.search_string) {
    result.search_string = customData.search_string;
  }
  if (customData.status !== undefined) {
    result.status = customData.status;
  }

  // Page path for PageView
  if (customData.page_path) {
    result.page_path = customData.page_path;
  }

  return Object.keys(result).length > 0 ? result : undefined;
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
        JSON.stringify({ ok: false, error: { code: 'CONFIG_ERROR', message: 'Access token not configured' } }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!pixelId) {
      console.error('[FB CAPI] FACEBOOK_PIXEL_ID not configured');
      return new Response(
        JSON.stringify({ ok: false, error: { code: 'CONFIG_ERROR', message: 'Pixel ID not configured' } }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { event } = await req.json();

    if (!event || !event.eventName) {
      return new Response(
        JSON.stringify({ ok: false, error: { code: 'VALIDATION_ERROR', message: 'Event name is required' } }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('[FB CAPI] Processing event:', event.eventName);

    // Build ServerEvent data structure matching Facebook SDK
    const serverEvent: Record<string, any> = {
      event_name: event.eventName,
      event_time: event.eventTime || Math.floor(Date.now() / 1000),
      action_source: event.actionSource || 'website',
    };

    // Add event_source_url if available
    if (event.eventSourceUrl) {
      serverEvent.event_source_url = event.eventSourceUrl;
    }

    // Add event_id for deduplication (combining with pixel events)
    if (event.eventId) {
      serverEvent.event_id = event.eventId;
    }

    // Build UserData matching SDK format
    if (event.userData) {
      serverEvent.user_data = await buildUserData(event.userData);
    }

    // Build CustomData matching SDK format
    const customData = buildCustomData(event.customData);
    if (customData) {
      serverEvent.custom_data = customData;
    }

    console.log('[FB CAPI] ServerEvent payload:', JSON.stringify(serverEvent, null, 2));

    // Send EventRequest to Facebook Conversions API (matching SDK's execute())
    const fbResponse = await fetch(
      `https://graph.facebook.com/v18.0/${pixelId}/events`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          data: [serverEvent],
          access_token: accessToken,
        }),
      }
    );

    const fbResult = await fbResponse.json();

    if (!fbResponse.ok) {
      console.error('[FB CAPI] Facebook API error:', fbResult);
      return new Response(
        JSON.stringify({ 
          ok: false, 
          error: { 
            code: 'FB_API_ERROR', 
            message: fbResult.error?.message || 'Facebook API error',
            details: fbResult 
          } 
        }),
        { status: fbResponse.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('[FB CAPI] Event sent successfully:', {
      eventName: event.eventName,
      eventsReceived: fbResult.events_received,
      fbtrace: fbResult.fbtrace_id,
    });

    return new Response(
      JSON.stringify({ 
        ok: true,
        data: {
          eventsReceived: fbResult.events_received,
          fbtrace: fbResult.fbtrace_id,
        }
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('[FB CAPI] Error:', error);
    return new Response(
      JSON.stringify({ ok: false, error: { code: 'INTERNAL_ERROR', message: error instanceof Error ? error.message : 'Unknown error' } }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
