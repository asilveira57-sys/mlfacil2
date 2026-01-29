import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface Tracker {
  id: string;
  user_id: string;
  seller_id: string;
  marketplace: string;
  competitor_label: string;
  competitor_url: string;
  competitor_external_id: string | null;
  status: string;
  min_price: number | null;
  max_price: number | null;
  reaction_mode: string;
  undercut_amount: number;
  check_interval_minutes: number;
  last_known_price: number | null;
  last_known_state: string;
  seller_listing_id: string | null;
  consecutive_failures: number;
}

// Parse item ID from ML link
function parseMLItemId(link: string): string | null {
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
      return { status: 'not_found', is_available: false };
    }
    throw new Error(`ML API error: ${response.status}`);
  }
  return await response.json();
}

// Determine state from ML data
function getState(data: any): string {
  if (!data || data.status === 'not_found') return 'indisponivel';
  if (data.status === 'active') return 'ativo';
  return 'indisponivel';
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

      // Add tracker
      if (action === 'add' || action === 'competitor-tracking') {
        const { 
          competitor_url, 
          competitor_label, 
          marketplace = 'mercadolivre',
          min_price, 
          max_price, 
          reaction_mode = 'monitorar', 
          undercut_amount = 0.10,
          check_interval_minutes = 120,
          seller_listing_id 
        } = body;

        if (!competitor_url || !competitor_label) {
          return new Response(JSON.stringify({ error: 'competitor_url e competitor_label são obrigatórios' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        // Validate check_interval_minutes
        if (check_interval_minutes < 60) {
          return new Response(JSON.stringify({ error: 'Intervalo mínimo de verificação é 60 minutos' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        // Validate min/max price
        if (min_price && max_price && min_price > max_price) {
          return new Response(JSON.stringify({ error: 'Preço mínimo não pode ser maior que o máximo' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        // Parse item ID from link
        const competitorExternalId = parseMLItemId(competitor_url);
        
        // Fetch initial data from ML
        let listingData: any = null;
        if (competitorExternalId) {
          try {
            listingData = await fetchMLListingData(competitorExternalId);
          } catch (e) {
            console.error('Error fetching ML data:', e);
          }
        }

        const now = new Date();
        const nextCheck = new Date(now.getTime() + check_interval_minutes * 60 * 1000);

        // Insert tracker
        const insertData: any = {
          user_id: user.id,
          seller_id: sellerId,
          marketplace,
          competitor_label,
          competitor_url,
          competitor_external_id: competitorExternalId,
          status: 'ativo',
          min_price: min_price || null,
          max_price: max_price || null,
          reaction_mode,
          undercut_amount: undercut_amount || 0.10,
          check_interval_minutes,
          seller_listing_id: seller_listing_id || null,
          next_check_at: nextCheck.toISOString(),
        };

        if (listingData && listingData.id) {
          insertData.competitor_title = listingData.title;
          insertData.competitor_thumbnail = listingData.thumbnail || listingData.pictures?.[0]?.url;
          insertData.last_known_price = listingData.price;
          insertData.last_known_state = getState(listingData);
          insertData.last_checked_at = now.toISOString();
        }

        const { data: inserted, error: insertError } = await supabaseClient
          .from('competitor_trackers')
          .insert(insertData)
          .select()
          .single();

        if (insertError) {
          console.error('Insert error:', insertError);
          return new Response(JSON.stringify({ error: insertError.message }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        // Insert initial snapshot
        if (listingData?.price) {
          await supabaseClient.from('competitor_snapshots').insert({
            tracker_id: inserted.id,
            price: listingData.price,
            state: getState(listingData),
            source: 'api_publica',
          });
        }

        // Insert tracker_created event
        await supabaseClient.from('competitor_events').insert({
          tracker_id: inserted.id,
          user_id: user.id,
          event_type: 'tracker_created',
          message: `Monitoramento iniciado para ${competitor_label}`,
        });

        return new Response(JSON.stringify(inserted), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Force check single tracker
      if (action === 'check') {
        const { tracker_id } = body;

        const { data: tracker, error: fetchError } = await supabaseClient
          .from('competitor_trackers')
          .select('*')
          .eq('id', tracker_id)
          .eq('user_id', user.id)
          .single();

        if (fetchError || !tracker) {
          return new Response(JSON.stringify({ error: 'Tracker não encontrado' }), {
            status: 404,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        if (!tracker.competitor_external_id) {
          return new Response(JSON.stringify({ error: 'ID externo não disponível' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        // Fetch current data from ML
        let currentData: any;
        try {
          currentData = await fetchMLListingData(tracker.competitor_external_id);
        } catch (e) {
          // Register failure event
          await supabaseClient.from('competitor_events').insert({
            tracker_id: tracker.id,
            user_id: user.id,
            event_type: 'check_failed',
            message: `Falha ao verificar: ${e instanceof Error ? e.message : 'Erro desconhecido'}`,
          });

          const failures = (tracker.consecutive_failures || 0) + 1;
          await supabaseClient
            .from('competitor_trackers')
            .update({ 
              consecutive_failures: failures,
              status: failures >= 3 ? 'erro' : tracker.status,
              last_checked_at: new Date().toISOString(),
            })
            .eq('id', tracker.id);

          return new Response(JSON.stringify({ error: 'Falha ao verificar anúncio' }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        const previousPrice = tracker.last_known_price;
        const previousState = tracker.last_known_state;
        const currentPrice = currentData.price || null;
        const currentState = getState(currentData);

        // Calculate price delta
        let priceDelta = null;
        let priceDeltaPercent = null;
        let priceChanged = false;

        if (previousPrice && currentPrice && previousPrice !== currentPrice) {
          priceChanged = true;
          priceDelta = currentPrice - previousPrice;
          priceDeltaPercent = ((currentPrice - previousPrice) / previousPrice) * 100;
        }

        const now = new Date();
        const nextCheck = new Date(now.getTime() + tracker.check_interval_minutes * 60 * 1000);

        // Update tracker
        const updateData: any = {
          last_known_price: currentPrice,
          last_known_state: currentState,
          last_checked_at: now.toISOString(),
          next_check_at: nextCheck.toISOString(),
          consecutive_failures: 0,
        };

        if (currentData.title) updateData.competitor_title = currentData.title;
        if (currentData.thumbnail) updateData.competitor_thumbnail = currentData.thumbnail;

        await supabaseClient
          .from('competitor_trackers')
          .update(updateData)
          .eq('id', tracker.id);

        // Insert snapshot
        await supabaseClient.from('competitor_snapshots').insert({
          tracker_id: tracker.id,
          price: currentPrice,
          state: currentState,
          source: 'api_publica',
        });

        // Generate events and alerts
        const events: any[] = [];
        const alerts: any[] = [];

        if (priceChanged && currentPrice) {
          const eventType = priceDelta! > 0 ? 'price_up' : 'price_down';
          events.push({
            tracker_id: tracker.id,
            user_id: user.id,
            event_type: eventType,
            prev_price: previousPrice,
            new_price: currentPrice,
            message: `Preço ${eventType === 'price_up' ? 'subiu' : 'baixou'}: R$ ${previousPrice?.toFixed(2)} → R$ ${currentPrice.toFixed(2)}`,
          });

          alerts.push({
            user_id: user.id,
            seller_id: sellerId,
            tracker_id: tracker.id,
            severity: eventType === 'price_down' && tracker.reaction_mode !== 'monitorar' ? 'warning' : 'info',
            title: eventType === 'price_up' ? 'Concorrente subiu preço' : 'Concorrente baixou preço',
            body: `${tracker.competitor_label}: R$ ${previousPrice?.toFixed(2)} → R$ ${currentPrice.toFixed(2)} (${priceDelta! > 0 ? '+' : ''}${priceDeltaPercent?.toFixed(1)}%)`,
          });

          // Check min/max limits
          if (tracker.min_price && currentPrice < tracker.min_price) {
            events.push({
              tracker_id: tracker.id,
              user_id: user.id,
              event_type: 'hit_min_limit',
              new_price: currentPrice,
              message: `Preço atingiu limite mínimo configurado (R$ ${tracker.min_price.toFixed(2)})`,
            });

            alerts.push({
              user_id: user.id,
              seller_id: sellerId,
              tracker_id: tracker.id,
              severity: 'critical',
              title: 'Preço abaixo do mínimo',
              body: `${tracker.competitor_label} está com R$ ${currentPrice.toFixed(2)}, abaixo do mínimo (R$ ${tracker.min_price.toFixed(2)})`,
            });
          }

          if (tracker.max_price && currentPrice > tracker.max_price) {
            events.push({
              tracker_id: tracker.id,
              user_id: user.id,
              event_type: 'hit_max_limit',
              new_price: currentPrice,
              message: `Preço atingiu limite máximo configurado (R$ ${tracker.max_price.toFixed(2)})`,
            });
          }

          // Create price action if reaction_mode is sugerir or auto_aplicar
          if (tracker.reaction_mode !== 'monitorar' && priceDelta! < 0) {
            let proposedPrice = currentPrice - (tracker.undercut_amount || 0.10);
            
            if (tracker.min_price && proposedPrice < tracker.min_price) {
              proposedPrice = tracker.min_price;
            }

            await supabaseClient.from('competitor_price_actions').insert({
              tracker_id: tracker.id,
              user_id: user.id,
              seller_listing_id: tracker.seller_listing_id,
              action_type: tracker.reaction_mode === 'auto_aplicar' ? 'suggested' : 'suggested', // auto_aplicar needs integration
              reason: 'Concorrente baixou preço',
              competitor_price: currentPrice,
              proposed_price: proposedPrice,
            });
          }
        }

        // State change events
        if (previousState !== currentState) {
          if (currentState === 'indisponivel' && previousState === 'ativo') {
            events.push({
              tracker_id: tracker.id,
              user_id: user.id,
              event_type: 'became_unavailable',
              message: 'Anúncio ficou indisponível',
            });

            alerts.push({
              user_id: user.id,
              seller_id: sellerId,
              tracker_id: tracker.id,
              severity: 'info',
              title: 'Concorrente indisponível',
              body: `O anúncio "${tracker.competitor_label}" ficou indisponível`,
            });
          } else if (currentState === 'ativo' && previousState === 'indisponivel') {
            events.push({
              tracker_id: tracker.id,
              user_id: user.id,
              event_type: 'became_available',
              message: 'Anúncio voltou a ficar disponível',
            });

            alerts.push({
              user_id: user.id,
              seller_id: sellerId,
              tracker_id: tracker.id,
              severity: 'info',
              title: 'Concorrente voltou',
              body: `O anúncio "${tracker.competitor_label}" voltou a ficar disponível`,
            });
          }
        }

        // Batch insert events and alerts
        if (events.length > 0) {
          await supabaseClient.from('competitor_events').insert(events);
        }
        if (alerts.length > 0) {
          await supabaseClient.from('competitor_alerts').insert(alerts);
        }

        return new Response(JSON.stringify({ 
          success: true, 
          price_changed: priceChanged,
          current_price: currentPrice,
          previous_price: previousPrice,
          state: currentState,
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Delete tracker
      if (action === 'delete') {
        const { tracker_id } = body;
        
        await supabaseClient
          .from('competitor_trackers')
          .delete()
          .eq('id', tracker_id)
          .eq('user_id', user.id);

        return new Response(JSON.stringify({ success: true }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Update tracker config
      if (action === 'update') {
        const { tracker_id, ...updates } = body;
        
        const allowedFields = [
          'status', 'competitor_label', 'min_price', 'max_price', 
          'reaction_mode', 'undercut_amount', 'check_interval_minutes', 
          'seller_listing_id'
        ];
        const filteredUpdates: any = {};
        for (const key of allowedFields) {
          if (updates[key] !== undefined) {
            filteredUpdates[key] = updates[key];
          }
        }

        // Validate check_interval_minutes
        if (filteredUpdates.check_interval_minutes && filteredUpdates.check_interval_minutes < 60) {
          return new Response(JSON.stringify({ error: 'Intervalo mínimo é 60 minutos' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        const { data: updated, error: updateError } = await supabaseClient
          .from('competitor_trackers')
          .update(filteredUpdates)
          .eq('id', tracker_id)
          .eq('user_id', user.id)
          .select()
          .single();

        if (updateError) {
          return new Response(JSON.stringify({ error: updateError.message }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        // Record update event
        await supabaseClient.from('competitor_events').insert({
          tracker_id: tracker_id,
          user_id: user.id,
          event_type: 'tracker_updated',
          message: 'Configurações atualizadas',
        });

        return new Response(JSON.stringify(updated), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Dismiss alert
      if (action === 'dismiss-alert') {
        const { alert_id } = body;
        
        await supabaseClient
          .from('competitor_alerts')
          .update({ is_read: true })
          .eq('id', alert_id)
          .eq('user_id', user.id);

        return new Response(JSON.stringify({ success: true }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Accept/reject price action
      if (action === 'action-response') {
        const { action_id, response_type } = body;
        
        const updateData: any = {
          action_type: response_type === 'accept' ? 'applied' : 'rejected',
        };

        if (response_type === 'accept') {
          // For now, just mark as applied - real integration pending
          updateData.applied_price = null;
        }

        await supabaseClient
          .from('competitor_price_actions')
          .update(updateData)
          .eq('id', action_id)
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

      // List trackers
      if (action === 'list' || action === 'competitor-tracking') {
        const status = url.searchParams.get('status') || 'ativo';
        const page = parseInt(url.searchParams.get('page') || '1');
        const pageSize = parseInt(url.searchParams.get('page_size') || '50');

        let query = supabaseClient
          .from('competitor_trackers')
          .select('*', { count: 'exact' })
          .eq('user_id', user.id)
          .eq('seller_id', sellerId)
          .order('created_at', { ascending: false });

        if (status !== 'all') {
          query = query.eq('status', status);
        }

        query = query.range((page - 1) * pageSize, page * pageSize - 1);

        const { data: trackers, count, error } = await query;

        if (error) {
          return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        return new Response(JSON.stringify({
          trackers,
          total: count,
          page,
          page_size: pageSize,
          total_pages: Math.ceil((count || 0) / pageSize),
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Get snapshots (history)
      if (action === 'history') {
        const trackerId = url.searchParams.get('tracker_id');
        const limit = parseInt(url.searchParams.get('limit') || '100');

        const { data: snapshots, error } = await supabaseClient
          .from('competitor_snapshots')
          .select('*')
          .eq('tracker_id', trackerId)
          .order('captured_at', { ascending: true })
          .limit(limit);

        if (error) {
          return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        return new Response(JSON.stringify({ snapshots }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Get events
      if (action === 'events') {
        const trackerId = url.searchParams.get('tracker_id');
        const limit = parseInt(url.searchParams.get('limit') || '50');

        const { data: events, error } = await supabaseClient
          .from('competitor_events')
          .select('*')
          .eq('tracker_id', trackerId)
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })
          .limit(limit);

        if (error) {
          return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        return new Response(JSON.stringify({ events }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Get price actions
      if (action === 'price-actions') {
        const trackerId = url.searchParams.get('tracker_id');
        const pendingOnly = url.searchParams.get('pending_only') === 'true';

        let query = supabaseClient
          .from('competitor_price_actions')
          .select('*')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false });

        if (trackerId) {
          query = query.eq('tracker_id', trackerId);
        }
        if (pendingOnly) {
          query = query.eq('action_type', 'suggested');
        }

        const { data: actions, error } = await query.limit(50);

        if (error) {
          return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        return new Response(JSON.stringify({ actions }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // List alerts
      if (action === 'alerts') {
        const page = parseInt(url.searchParams.get('page') || '1');
        const pageSize = parseInt(url.searchParams.get('page_size') || '20');
        const unreadOnly = url.searchParams.get('unread_only') !== 'false';

        let query = supabaseClient
          .from('competitor_alerts')
          .select('*', { count: 'exact' })
          .eq('user_id', user.id)
          .eq('seller_id', sellerId)
          .order('created_at', { ascending: false });

        if (unreadOnly) {
          query = query.eq('is_read', false);
        }

        query = query.range((page - 1) * pageSize, page * pageSize - 1);

        const { data: alerts, count, error } = await query;

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
        const { data: trackers } = await supabaseClient
          .from('competitor_trackers')
          .select('id, status, last_known_price, last_known_state')
          .eq('user_id', user.id)
          .eq('seller_id', sellerId);

        const { count: alertsCount } = await supabaseClient
          .from('competitor_alerts')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', user.id)
          .eq('seller_id', sellerId)
          .eq('is_read', false);

        const { count: pendingActionsCount } = await supabaseClient
          .from('competitor_price_actions')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', user.id)
          .eq('action_type', 'suggested');

        const activeCount = trackers?.filter(t => t.status === 'ativo').length || 0;
        const pausedCount = trackers?.filter(t => t.status === 'pausado').length || 0;
        const errorCount = trackers?.filter(t => t.status === 'erro').length || 0;

        return new Response(JSON.stringify({
          total_tracked: trackers?.length || 0,
          active_count: activeCount,
          paused_count: pausedCount,
          error_count: errorCount,
          alerts_count: alertsCount || 0,
          pending_actions: pendingActionsCount || 0,
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
