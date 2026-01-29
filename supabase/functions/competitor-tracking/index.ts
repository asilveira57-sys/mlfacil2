import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface TrackedListing {
  id: string;
  user_id: string;
  seller_id: string;
  competitor_item_id: string;
  marketplace: string;
  competitor_name: string;
  competitor_link: string;
  status: string;
  min_price: number | null;
  max_price: number | null;
  reaction_type: string;
  adjustment_value: number;
  my_item_id: string | null;
  current_price: number | null;
}

// Parse item ID from ML link
function parseMLItemId(link: string): string | null {
  // Handle various ML link formats:
  // https://www.mercadolivre.com.br/produto-xyz/p/MLB12345678
  // https://produto.mercadolivre.com.br/MLB-12345678-...
  // MLB12345678
  const patterns = [
    /\/p\/(MLB\d+)/i,
    /\/(MLB-?\d+)/i,
    /^(MLB-?\d+)$/i,
  ];

  for (const pattern of patterns) {
    const match = link.match(pattern);
    if (match) {
      return match[1].replace('-', '');
    }
  }
  return null;
}

// Fetch public listing data from ML API
async function fetchMLListingData(itemId: string): Promise<any> {
  const response = await fetch(`https://api.mercadolibre.com/items/${itemId}`);
  if (!response.ok) {
    if (response.status === 404) {
      return { is_available: false };
    }
    throw new Error(`ML API error: ${response.status}`);
  }
  return await response.json();
}

// Determine listing type from ML data
function getListingType(data: any): string {
  const type = data.listing_type_id || '';
  if (type.includes('gold_pro')) return 'premium';
  if (type.includes('gold')) return 'classico';
  if (type.includes('free')) return 'gratuito';
  return type;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
    );

    const { data: { user }, error: authError } = await supabaseClient.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const url = new URL(req.url);
    const pathParts = url.pathname.split('/').filter(Boolean);
    const action = pathParts[pathParts.length - 1];

    // POST handlers
    if (req.method === 'POST') {
      const body = await req.json();
      const sellerId = body.seller_id;

      if (!sellerId) {
        return new Response(JSON.stringify({ error: 'seller_id required' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Add tracked listing
      if (action === 'add' || action === 'competitor-tracking') {
        const { competitor_link, competitor_name, min_price, max_price, reaction_type, adjustment_value, my_item_id } = body;

        if (!competitor_link || !competitor_name) {
          return new Response(JSON.stringify({ error: 'competitor_link and competitor_name required' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        // Parse item ID from link
        const competitorItemId = parseMLItemId(competitor_link);
        if (!competitorItemId) {
          return new Response(JSON.stringify({ error: 'Invalid ML link format' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        // Fetch initial data from ML
        let listingData: any = null;
        try {
          listingData = await fetchMLListingData(competitorItemId);
        } catch (e) {
          console.error('Error fetching ML data:', e);
        }

        // Insert tracked listing
        const insertData: any = {
          user_id: user.id,
          seller_id: sellerId,
          competitor_item_id: competitorItemId,
          marketplace: 'mercadolivre',
          competitor_name,
          competitor_link,
          status: 'active',
          min_price: min_price || null,
          max_price: max_price || null,
          reaction_type: reaction_type || 'monitor',
          adjustment_value: adjustment_value || 0.10,
          my_item_id: my_item_id || null,
        };

        if (listingData && listingData.id) {
          insertData.title = listingData.title;
          insertData.thumbnail = listingData.thumbnail || listingData.pictures?.[0]?.url;
          insertData.current_price = listingData.price;
          insertData.original_price = listingData.original_price;
          insertData.listing_type = getListingType(listingData);
          insertData.condition = listingData.condition;
          insertData.shipping_free = listingData.shipping?.free_shipping || false;
          insertData.shipping_full = listingData.shipping?.logistic_type === 'fulfillment';
          insertData.is_available = listingData.status === 'active';
          insertData.last_check_at = new Date().toISOString();
          insertData.check_count = 1;
        }

        const { data: inserted, error: insertError } = await supabaseClient
          .from('competitor_tracked_listings')
          .upsert(insertData, { onConflict: 'user_id,seller_id,competitor_item_id' })
          .select()
          .single();

        if (insertError) {
          console.error('Insert error:', insertError);
          return new Response(JSON.stringify({ error: insertError.message }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        // Insert initial price history
        if (listingData?.price) {
          await supabaseClient
            .from('competitor_price_history')
            .insert({
              tracked_listing_id: inserted.id,
              user_id: user.id,
              price: listingData.price,
              original_price: listingData.original_price,
              is_available: listingData.status === 'active',
              listing_type: getListingType(listingData),
            });
        }

        return new Response(JSON.stringify(inserted), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Check/refresh single listing
      if (action === 'check') {
        const { listing_id } = body;

        const { data: listing, error: fetchError } = await supabaseClient
          .from('competitor_tracked_listings')
          .select('*')
          .eq('id', listing_id)
          .eq('user_id', user.id)
          .single();

        if (fetchError || !listing) {
          return new Response(JSON.stringify({ error: 'Listing not found' }), {
            status: 404,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        // Fetch current data from ML
        const currentData = await fetchMLListingData(listing.competitor_item_id);
        const previousPrice = listing.current_price;
        const currentPrice = currentData.price || null;
        const isAvailable = currentData.status === 'active';

        // Calculate price delta
        let priceDelta = null;
        let priceDeltaPercent = null;
        let priceChanged = false;

        if (previousPrice && currentPrice && previousPrice !== currentPrice) {
          priceChanged = true;
          priceDelta = currentPrice - previousPrice;
          priceDeltaPercent = ((currentPrice - previousPrice) / previousPrice) * 100;
        }

        // Update listing
        const updateData: any = {
          current_price: currentPrice,
          original_price: currentData.original_price || null,
          is_available: isAvailable,
          listing_type: getListingType(currentData),
          shipping_free: currentData.shipping?.free_shipping || false,
          shipping_full: currentData.shipping?.logistic_type === 'fulfillment',
          last_check_at: new Date().toISOString(),
          check_count: (listing.check_count || 0) + 1,
          error_message: null,
        };

        if (priceChanged) {
          updateData.last_price_change_at = new Date().toISOString();
          updateData.price_change_count = (listing.price_change_count || 0) + 1;
        }

        if (!isAvailable && listing.is_available) {
          updateData.error_message = 'Anúncio indisponível';
        }

        await supabaseClient
          .from('competitor_tracked_listings')
          .update(updateData)
          .eq('id', listing.id);

        // Insert price history
        if (currentPrice) {
          await supabaseClient
            .from('competitor_price_history')
            .insert({
              tracked_listing_id: listing.id,
              user_id: user.id,
              price: currentPrice,
              original_price: currentData.original_price,
              price_delta: priceDelta,
              price_delta_percent: priceDeltaPercent,
              is_available: isAvailable,
              listing_type: getListingType(currentData),
            });
        }

        // Generate alerts if price changed
        if (priceChanged && currentPrice) {
          let alertType = priceDelta! > 0 ? 'price_rise' : 'price_drop';
          let severity = 'info';
          let title = priceDelta! > 0 ? 'Concorrente subiu preço' : 'Concorrente baixou preço';
          let message = `${listing.competitor_name}: R$ ${previousPrice?.toFixed(2)} → R$ ${currentPrice.toFixed(2)} (${priceDelta! > 0 ? '+' : ''}${priceDeltaPercent?.toFixed(1)}%)`;

          // Check min/max limits
          if (listing.min_price && currentPrice < listing.min_price) {
            alertType = 'min_reached';
            severity = 'warning';
            title = 'Preço abaixo do mínimo';
            message = `${listing.competitor_name} está com preço R$ ${currentPrice.toFixed(2)}, abaixo do seu mínimo (R$ ${listing.min_price.toFixed(2)})`;
          }

          if (priceDelta! < 0 && listing.reaction_type !== 'monitor') {
            severity = 'warning';
          }

          await supabaseClient
            .from('competitor_tracking_alerts')
            .insert({
              user_id: user.id,
              seller_id: sellerId,
              tracked_listing_id: listing.id,
              alert_type: alertType,
              severity,
              title,
              message_pt: message,
              data_json: {
                previous_price: previousPrice,
                current_price: currentPrice,
                delta: priceDelta,
                delta_percent: priceDeltaPercent,
                competitor_name: listing.competitor_name,
              },
            });
        }

        // Generate alert if became unavailable
        if (!isAvailable && listing.is_available) {
          await supabaseClient
            .from('competitor_tracking_alerts')
            .insert({
              user_id: user.id,
              seller_id: sellerId,
              tracked_listing_id: listing.id,
              alert_type: 'unavailable',
              severity: 'warning',
              title: 'Concorrente indisponível',
              message_pt: `O anúncio "${listing.competitor_name}" ficou indisponível`,
              data_json: { competitor_name: listing.competitor_name },
            });
        }

        return new Response(JSON.stringify({ 
          success: true, 
          price_changed: priceChanged,
          current_price: currentPrice,
          previous_price: previousPrice,
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Delete listing
      if (action === 'delete') {
        const { listing_id } = body;
        
        await supabaseClient
          .from('competitor_tracked_listings')
          .delete()
          .eq('id', listing_id)
          .eq('user_id', user.id);

        return new Response(JSON.stringify({ success: true }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Update listing config
      if (action === 'update') {
        const { listing_id, ...updates } = body;
        
        const allowedFields = ['status', 'min_price', 'max_price', 'reaction_type', 'adjustment_value', 'my_item_id', 'competitor_name'];
        const filteredUpdates: any = {};
        for (const key of allowedFields) {
          if (updates[key] !== undefined) {
            filteredUpdates[key] = updates[key];
          }
        }

        const { data: updated, error: updateError } = await supabaseClient
          .from('competitor_tracked_listings')
          .update(filteredUpdates)
          .eq('id', listing_id)
          .eq('user_id', user.id)
          .select()
          .single();

        if (updateError) {
          return new Response(JSON.stringify({ error: updateError.message }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        return new Response(JSON.stringify(updated), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Dismiss alert
      if (action === 'dismiss-alert') {
        const { alert_id, resolve } = body;
        
        const updateData: any = { is_dismissed: true };
        if (resolve) {
          updateData.resolved_at = new Date().toISOString();
        }

        await supabaseClient
          .from('competitor_tracking_alerts')
          .update(updateData)
          .eq('id', alert_id)
          .eq('user_id', user.id);

        return new Response(JSON.stringify({ success: true }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    // GET handlers
    if (req.method === 'GET') {
      const sellerId = url.searchParams.get('seller_id');

      if (!sellerId) {
        return new Response(JSON.stringify({ error: 'seller_id required' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // List tracked listings
      if (action === 'list' || action === 'competitor-tracking') {
        const status = url.searchParams.get('status') || 'active';
        const page = parseInt(url.searchParams.get('page') || '1');
        const pageSize = parseInt(url.searchParams.get('page_size') || '50');

        let query = supabaseClient
          .from('competitor_tracked_listings')
          .select('*', { count: 'exact' })
          .eq('user_id', user.id)
          .eq('seller_id', sellerId)
          .order('created_at', { ascending: false });

        if (status !== 'all') {
          query = query.eq('status', status);
        }

        query = query.range((page - 1) * pageSize, page * pageSize - 1);

        const { data: listings, count, error } = await query;

        if (error) {
          return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        return new Response(JSON.stringify({
          listings,
          total: count,
          page,
          page_size: pageSize,
          total_pages: Math.ceil((count || 0) / pageSize),
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Get price history
      if (action === 'history') {
        const listingId = url.searchParams.get('listing_id');
        const limit = parseInt(url.searchParams.get('limit') || '100');

        const { data: history, error } = await supabaseClient
          .from('competitor_price_history')
          .select('*')
          .eq('tracked_listing_id', listingId)
          .eq('user_id', user.id)
          .order('recorded_at', { ascending: true })
          .limit(limit);

        if (error) {
          return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        return new Response(JSON.stringify({ history }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // List alerts
      if (action === 'alerts') {
        const page = parseInt(url.searchParams.get('page') || '1');
        const pageSize = parseInt(url.searchParams.get('page_size') || '20');

        const { data: alerts, count, error } = await supabaseClient
          .from('competitor_tracking_alerts')
          .select('*', { count: 'exact' })
          .eq('user_id', user.id)
          .eq('seller_id', sellerId)
          .eq('is_dismissed', false)
          .order('created_at', { ascending: false })
          .range((page - 1) * pageSize, page * pageSize - 1);

        if (error) {
          return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        return new Response(JSON.stringify({
          alerts,
          total: count,
          page,
          page_size: pageSize,
          total_pages: Math.ceil((count || 0) / pageSize),
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Get overview stats
      if (action === 'overview') {
        const { data: listings } = await supabaseClient
          .from('competitor_tracked_listings')
          .select('id, status, current_price, last_price_change_at')
          .eq('user_id', user.id)
          .eq('seller_id', sellerId);

        const { count: alertsCount } = await supabaseClient
          .from('competitor_tracking_alerts')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', user.id)
          .eq('seller_id', sellerId)
          .eq('is_dismissed', false);

        const activeCount = listings?.filter(l => l.status === 'active').length || 0;
        const pausedCount = listings?.filter(l => l.status === 'paused').length || 0;
        
        // Count recent price changes (last 7 days)
        const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
        const recentChanges = listings?.filter(l => 
          l.last_price_change_at && l.last_price_change_at > sevenDaysAgo
        ).length || 0;

        return new Response(JSON.stringify({
          total_tracked: listings?.length || 0,
          active_count: activeCount,
          paused_count: pausedCount,
          alerts_count: alertsCount || 0,
          recent_price_changes: recentChanges,
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    return new Response(JSON.stringify({ error: 'Not found' }), {
      status: 404,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error: unknown) {
    console.error('Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
