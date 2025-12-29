import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { itemId } = await req.json();

    if (!itemId) {
      throw new Error('Missing itemId parameter');
    }

    console.log('Fetching item data for:', itemId);

    // Get authenticated user
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
      {
        global: {
          headers: { Authorization: authHeader },
        },
      }
    );

    const { data: { user }, error: userError } = await supabaseClient.auth.getUser();
    
    if (userError || !user) {
      console.error('User not authenticated:', userError?.message);
      return new Response(
        JSON.stringify({ error: 'User not authenticated' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get user's ML account (with valid token)
    const { data: mlAccount, error: accountError } = await supabaseClient
      .from('ml_accounts')
      .select('*')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .single();

    if (accountError || !mlAccount) {
      return new Response(
        JSON.stringify({ 
          error: 'No Mercado Livre account connected',
          needsAuth: true 
        }),
        { 
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    // Check if token needs refresh
    const tokenExpiry = new Date(mlAccount.token_expires_at);
    const now = new Date();
    
    let accessToken = mlAccount.access_token;

    if (tokenExpiry <= now) {
      console.log('Token expired, refreshing...');
      
      const refreshResponse = await fetch('https://api.mercadolibre.com/oauth/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          client_id: Deno.env.get('ML_APP_ID') || '',
          client_secret: Deno.env.get('ML_SECRET_KEY') || '',
          refresh_token: mlAccount.refresh_token,
        }),
      });

      if (!refreshResponse.ok) {
        throw new Error('Failed to refresh token');
      }

      const refreshData = await refreshResponse.json();
      accessToken = refreshData.access_token;

      // Update token in database
      const newExpiry = new Date();
      newExpiry.setSeconds(newExpiry.getSeconds() + refreshData.expires_in);

      await supabaseClient
        .from('ml_accounts')
        .update({
          access_token: refreshData.access_token,
          refresh_token: refreshData.refresh_token,
          token_expires_at: newExpiry.toISOString(),
        })
        .eq('id', mlAccount.id);

      console.log('Token refreshed successfully');
    }

    // Fetch item data from ML API
    const itemResponse = await fetch(
      `https://api.mercadolibre.com/items/${itemId}`,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
        },
      }
    );

    if (!itemResponse.ok) {
      if (itemResponse.status === 404) {
        throw new Error('Item not found');
      }
      throw new Error('Failed to fetch item data');
    }

    const itemData = await itemResponse.json();

    // Fetch visits data if available
    let visitsData = null;
    try {
      const visitsResponse = await fetch(
        `https://api.mercadolibre.com/items/${itemId}/visits?date_from=${new Date(Date.now() - 90*24*60*60*1000).toISOString().split('T')[0]}`,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
          },
        }
      );
      
      if (visitsResponse.ok) {
        visitsData = await visitsResponse.json();
      }
    } catch (error) {
      console.log('Could not fetch visits data:', error);
    }

    // Store analysis in database
    const { data: analyzedItem, error: insertError } = await supabaseClient
      .from('analyzed_items')
      .insert({
        user_id: user.id,
        ml_account_id: mlAccount.id,
        item_id: itemId,
        title: itemData.title,
        category_id: itemData.category_id,
        price: itemData.price,
        available_quantity: itemData.available_quantity,
        sold_quantity: itemData.sold_quantity,
        status: itemData.status,
        permalink: itemData.permalink,
        thumbnail: itemData.thumbnail,
        raw_data: itemData,
      })
      .select()
      .single();

    if (insertError) {
      console.error('Failed to store analysis:', insertError);
    }

    // Calculate and store metrics
    if (analyzedItem) {
      const metrics = {
        analyzed_item_id: analyzedItem.id,
        visits_total: visitsData?.total_visits || 0,
        visits_7d: visitsData?.visits_7d || 0,
        visits_30d: visitsData?.visits_30d || 0,
        sold_quantity_7d: 0, // Would need historical data
        sold_quantity_30d: 0, // Would need historical data
        conversion_rate: visitsData?.total_visits > 0 
          ? (itemData.sold_quantity / visitsData.total_visits * 100) 
          : 0,
        photo_count: itemData.pictures?.length || 0,
        has_video: !!itemData.video_id,
        has_clips: false, // ML Clips detection would need additional logic
        title_length: itemData.title?.length || 0,
        description_length: 0, // Would need to fetch description separately
        listing_type: itemData.listing_type_id,
        shipping_type: itemData.shipping?.mode || 'unknown',
      };

      await supabaseClient
        .from('item_metrics')
        .insert(metrics);
    }

    // Return comprehensive analysis
    return new Response(
      JSON.stringify({
        success: true,
        item: itemData,
        visits: visitsData,
        analyzedItemId: analyzedItem?.id,
      }),
      { 
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );

  } catch (error) {
    console.error('Get item error:', error);
    
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    return new Response(
      JSON.stringify({ 
        error: errorMessage,
        details: 'Failed to fetch item data'
      }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});
