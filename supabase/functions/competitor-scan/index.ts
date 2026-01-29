import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const BATCH_SIZE = 50;
const MAX_FAILURES_BEFORE_ERROR = 3;

interface Tracker {
  id: string;
  user_id: string;
  seller_id: string;
  competitor_external_id: string | null;
  competitor_label: string;
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

// Fetch public listing data from ML API with timeout
async function fetchMLListingData(itemId: string, timeoutMs: number = 5000): Promise<any> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  
  try {
    const response = await fetch(`https://api.mercadolibre.com/items/${itemId}`, {
      signal: controller.signal,
    });
    
    if (!response.ok) {
      if (response.status === 404) {
        return { status: 'not_found', is_available: false };
      }
      throw new Error(`ML API error: ${response.status}`);
    }
    return await response.json();
  } finally {
    clearTimeout(timeoutId);
  }
}

function getState(data: any): string {
  if (!data || data.status === 'not_found') return 'indisponivel';
  if (data.status === 'active') return 'ativo';
  return 'indisponivel';
}

async function processTracker(
  supabaseAdmin: any,
  tracker: Tracker
): Promise<{ success: boolean; priceChanged: boolean }> {
  if (!tracker.competitor_external_id) {
    return { success: false, priceChanged: false };
  }

  let currentData: any;
  try {
    currentData = await fetchMLListingData(tracker.competitor_external_id);
  } catch (e) {
    // Register failure
    await supabaseAdmin.from('competitor_events').insert({
      tracker_id: tracker.id,
      user_id: tracker.user_id,
      event_type: 'check_failed',
      message: `Falha ao verificar: ${e instanceof Error ? e.message : 'Erro desconhecido'}`,
    });

    const failures = (tracker.consecutive_failures || 0) + 1;
    await supabaseAdmin
      .from('competitor_trackers')
      .update({ 
        consecutive_failures: failures,
        status: failures >= MAX_FAILURES_BEFORE_ERROR ? 'erro' : tracker.status,
        last_checked_at: new Date().toISOString(),
        next_check_at: new Date(Date.now() + tracker.check_interval_minutes * 60 * 1000).toISOString(),
      })
      .eq('id', tracker.id);

    return { success: false, priceChanged: false };
  }

  const previousPrice = tracker.last_known_price;
  const previousState = tracker.last_known_state;
  const currentPrice = currentData.price || null;
  const currentState = getState(currentData);

  // Check for price change
  let priceChanged = false;
  let priceDelta = null;
  let priceDeltaPercent = null;

  if (previousPrice && currentPrice && previousPrice !== currentPrice) {
    priceChanged = true;
    priceDelta = currentPrice - previousPrice;
    priceDeltaPercent = ((currentPrice - previousPrice) / previousPrice) * 100;
  }

  const now = new Date();
  const nextCheck = new Date(now.getTime() + tracker.check_interval_minutes * 60 * 1000);

  // Update tracker
  await supabaseAdmin
    .from('competitor_trackers')
    .update({
      last_known_price: currentPrice,
      last_known_state: currentState,
      last_checked_at: now.toISOString(),
      next_check_at: nextCheck.toISOString(),
      consecutive_failures: 0,
      competitor_title: currentData.title || undefined,
      competitor_thumbnail: currentData.thumbnail || undefined,
    })
    .eq('id', tracker.id);

  // Insert snapshot
  await supabaseAdmin.from('competitor_snapshots').insert({
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
      user_id: tracker.user_id,
      event_type: eventType,
      prev_price: previousPrice,
      new_price: currentPrice,
      message: `Preço ${eventType === 'price_up' ? 'subiu' : 'baixou'}: R$ ${previousPrice?.toFixed(2)} → R$ ${currentPrice.toFixed(2)}`,
    });

    alerts.push({
      user_id: tracker.user_id,
      seller_id: tracker.seller_id,
      tracker_id: tracker.id,
      severity: eventType === 'price_down' && tracker.reaction_mode !== 'monitorar' ? 'warning' : 'info',
      title: eventType === 'price_up' ? 'Concorrente subiu preço' : 'Concorrente baixou preço',
      body: `${tracker.competitor_label}: R$ ${previousPrice?.toFixed(2)} → R$ ${currentPrice.toFixed(2)} (${priceDelta! > 0 ? '+' : ''}${priceDeltaPercent?.toFixed(1)}%)`,
    });

    // Check min/max limits
    if (tracker.min_price && currentPrice < tracker.min_price) {
      events.push({
        tracker_id: tracker.id,
        user_id: tracker.user_id,
        event_type: 'hit_min_limit',
        new_price: currentPrice,
        message: `Preço atingiu limite mínimo (R$ ${tracker.min_price.toFixed(2)})`,
      });

      alerts.push({
        user_id: tracker.user_id,
        seller_id: tracker.seller_id,
        tracker_id: tracker.id,
        severity: 'critical',
        title: 'Preço abaixo do mínimo',
        body: `${tracker.competitor_label} está com R$ ${currentPrice.toFixed(2)}, abaixo do mínimo (R$ ${tracker.min_price.toFixed(2)})`,
      });
    }

    // Create price action suggestion
    if (tracker.reaction_mode !== 'monitorar' && priceDelta! < 0) {
      let proposedPrice = currentPrice - (tracker.undercut_amount || 0.10);
      
      if (tracker.min_price && proposedPrice < tracker.min_price) {
        proposedPrice = tracker.min_price;
      }

      await supabaseAdmin.from('competitor_price_actions').insert({
        tracker_id: tracker.id,
        user_id: tracker.user_id,
        seller_listing_id: tracker.seller_listing_id,
        action_type: 'suggested',
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
        user_id: tracker.user_id,
        event_type: 'became_unavailable',
        message: 'Anúncio ficou indisponível',
      });

      alerts.push({
        user_id: tracker.user_id,
        seller_id: tracker.seller_id,
        tracker_id: tracker.id,
        severity: 'info',
        title: 'Concorrente indisponível',
        body: `O anúncio "${tracker.competitor_label}" ficou indisponível`,
      });
    } else if (currentState === 'ativo' && previousState === 'indisponivel') {
      events.push({
        tracker_id: tracker.id,
        user_id: tracker.user_id,
        event_type: 'became_available',
        message: 'Anúncio voltou a ficar disponível',
      });

      alerts.push({
        user_id: tracker.user_id,
        seller_id: tracker.seller_id,
        tracker_id: tracker.id,
        severity: 'info',
        title: 'Concorrente voltou',
        body: `O anúncio "${tracker.competitor_label}" voltou a ficar disponível`,
      });
    }
  }

  // Batch insert events and alerts
  if (events.length > 0) {
    await supabaseAdmin.from('competitor_events').insert(events);
  }
  if (alerts.length > 0) {
    await supabaseAdmin.from('competitor_alerts').insert(alerts);
  }

  return { success: true, priceChanged };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Use service role for batch processing
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const now = new Date();

    // Fetch trackers due for checking
    const { data: trackers, error: fetchError } = await supabaseAdmin
      .from('competitor_trackers')
      .select('*')
      .eq('status', 'ativo')
      .lte('next_check_at', now.toISOString())
      .order('next_check_at', { ascending: true })
      .limit(BATCH_SIZE);

    if (fetchError) {
      console.error('Error fetching trackers:', fetchError);
      return new Response(JSON.stringify({ error: fetchError.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!trackers || trackers.length === 0) {
      return new Response(JSON.stringify({ 
        message: 'No trackers due for checking',
        processed: 0,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`Processing ${trackers.length} trackers`);

    let processed = 0;
    let successful = 0;
    let priceChanges = 0;

    // Process trackers sequentially to avoid rate limits
    for (const tracker of trackers) {
      try {
        const result = await processTracker(supabaseAdmin, tracker);
        processed++;
        if (result.success) successful++;
        if (result.priceChanged) priceChanges++;
        
        // Small delay between requests to avoid ML rate limits
        await new Promise(resolve => setTimeout(resolve, 200));
      } catch (e) {
        console.error(`Error processing tracker ${tracker.id}:`, e);
        processed++;
      }
    }

    return new Response(JSON.stringify({
      message: 'Scan complete',
      processed,
      successful,
      price_changes: priceChanges,
      timestamp: now.toISOString(),
    }), {
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
