// @ts-nocheck - Deno types not available in build context
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Score calculation weights
const SCORE_WEIGHTS = {
  semantica: { title_length: 20, description_length: 30, attributes: 50 },
  visual: { photos: 60, video: 25, cover_quality: 15 },
  clip: { has_clip: 100 },
  competitividade: { catalog: 30, price_position: 40, listing_type: 30 },
  logistica: { full: 50, flex: 30, standard: 20 },
  performance: { conversion: 40, visits_trend: 30, sales_trend: 30 },
};

// Event types and their affected blocks
const EVENT_CONFIG: Record<string, { category: string; blocks: string[]; severity: string }> = {
  title_changed: { category: "content", blocks: ["semantica"], severity: "info" },
  description_changed: { category: "content", blocks: ["semantica"], severity: "info" },
  description_threshold: { category: "content", blocks: ["semantica"], severity: "info" },
  attributes_changed: { category: "content", blocks: ["semantica", "competitividade"], severity: "info" },
  images_changed: { category: "content", blocks: ["visual"], severity: "info" },
  cover_changed: { category: "content", blocks: ["visual", "performance"], severity: "warning" },
  clip_added: { category: "content", blocks: ["clip", "performance"], severity: "info" },
  clip_removed: { category: "content", blocks: ["clip", "performance"], severity: "warning" },
  price_changed: { category: "commercial", blocks: ["competitividade"], severity: "info" },
  visits_spike: { category: "traffic", blocks: ["performance"], severity: "info" },
  visits_drop: { category: "traffic", blocks: ["performance"], severity: "warning" },
  conversion_up: { category: "traffic", blocks: ["performance"], severity: "info" },
  conversion_down: { category: "traffic", blocks: ["performance"], severity: "warning" },
  stockout: { category: "stock", blocks: ["performance", "logistica"], severity: "critical" },
  stockout_full: { category: "stock", blocks: ["performance", "logistica"], severity: "critical" },
  stock_recovered: { category: "stock", blocks: ["performance", "logistica"], severity: "info" },
  campaign_entered: { category: "campaign", blocks: ["competitividade", "performance"], severity: "info" },
  campaign_exited: { category: "campaign", blocks: ["competitividade", "performance"], severity: "info" },
  ads_activated: { category: "ads", blocks: ["competitividade"], severity: "info" },
  ads_paused: { category: "ads", blocks: ["competitividade"], severity: "warning" },
  logistic_upgraded: { category: "logistics", blocks: ["logistica", "performance"], severity: "info" },
  logistic_downgraded: { category: "logistics", blocks: ["logistica", "performance"], severity: "warning" },
  catalog_entered: { category: "catalog", blocks: ["competitividade"], severity: "info" },
  catalog_exited: { category: "catalog", blocks: ["competitividade"], severity: "critical" },
  buybox_lost: { category: "catalog", blocks: ["competitividade", "performance"], severity: "critical" },
  status_paused: { category: "status", blocks: ["performance"], severity: "critical" },
  status_activated: { category: "status", blocks: ["performance"], severity: "info" },
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "No authorization header" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Invalid token" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const { seller_id, action, item_id } = body;

    if (!seller_id) {
      return new Response(JSON.stringify({ error: "seller_id is required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`[Radiography] Action: ${action}, Seller: ${seller_id}, Item: ${item_id || 'all'}`);

    switch (action) {
      case "snapshot":
        return await handleSnapshot(supabase, user.id, seller_id, corsHeaders);
      case "analyze":
        if (!item_id) {
          return new Response(JSON.stringify({ error: "item_id required for analyze" }), {
            status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        return await handleDeepAnalysis(supabase, user.id, seller_id, item_id, corsHeaders);
      case "status":
        return await handleStatus(supabase, user.id, seller_id, corsHeaders);
      case "list":
        return await handleListItems(supabase, user.id, seller_id, body, corsHeaders);
      case "events":
        return await handleGetEvents(supabase, user.id, seller_id, item_id, corsHeaders);
      case "visit-history":
        if (!item_id) {
          return new Response(JSON.stringify({ error: "item_id required for visit-history" }), {
            status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        return await handleVisitHistory(supabase, user.id, seller_id, item_id, body.days || 30, corsHeaders);
      default:
        return await handleStatus(supabase, user.id, seller_id, corsHeaders);
    }
  } catch (err: unknown) {
    console.error("[Radiography] Error:", err);
    const message = err instanceof Error ? err.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

// ============================================================================
// SNAPSHOT: Passive monitoring - create daily snapshots and detect events
// ============================================================================
async function handleSnapshot(supabase: any, userId: string, sellerId: string, corsHeaders: any) {
  const today = new Date().toISOString().split('T')[0];
  console.log(`[Radiography] Creating snapshots for ${sellerId} on ${today}`);

  // Get all active listings
  const { data: listings, error: listingsErr } = await supabase
    .from("meli_listings_cache")
    .select("*")
    .eq("seller_id", sellerId)
    .eq("status", "active");

  if (listingsErr || !listings?.length) {
    return new Response(JSON.stringify({ 
      success: true, 
      message: "No active listings found",
      items_processed: 0 
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  console.log(`[Radiography] Found ${listings.length} active listings`);

  // Get recent sales and visits for performance metrics
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const sevenDaysAgoStr = sevenDaysAgo.toISOString().split('T')[0];

  const { data: recentSales } = await supabase
    .from("meli_order_items_cache")
    .select("item_id, quantity")
    .eq("seller_id", sellerId)
    .gte("created_at_meli", sevenDaysAgoStr);

  const salesByItem = new Map<string, number>();
  for (const sale of recentSales || []) {
    salesByItem.set(sale.item_id, (salesByItem.get(sale.item_id) || 0) + sale.quantity);
  }

  const { data: recentVisits } = await supabase
    .from("seller_item_visits")
    .select("item_id, visits_count")
    .eq("seller_id", sellerId)
    .gte("visit_date", sevenDaysAgoStr);

  const visitsByItem = new Map<string, number>();
  for (const visit of recentVisits || []) {
    visitsByItem.set(visit.item_id, (visitsByItem.get(visit.item_id) || 0) + visit.visits_count);
  }

  // Get previous snapshots for comparison
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = yesterday.toISOString().split('T')[0];

  const { data: previousSnapshots } = await supabase
    .from("listing_snapshots")
    .select("*")
    .eq("seller_id", sellerId)
    .eq("snapshot_date", yesterdayStr);

  const prevByItem = new Map<string, any>();
  for (const snap of previousSnapshots || []) {
    prevByItem.set(snap.item_id, snap);
  }

  const snapshots: any[] = [];
  const events: any[] = [];
  const processedItemIds = new Set<string>();

  for (const listing of listings) {
    // Skip duplicates - only process each item_id once
    if (processedItemIds.has(listing.item_id)) {
      continue;
    }
    processedItemIds.add(listing.item_id);

    const visits7d = visitsByItem.get(listing.item_id) || 0;
    const sales7d = salesByItem.get(listing.item_id) || 0;
    const conversion7d = visits7d > 0 ? (sales7d / visits7d) * 100 : 0;

    // Calculate scores for each block
    const scores = calculateScores(listing, visits7d, sales7d, conversion7d);

    const snapshot = {
      seller_id: sellerId,
      item_id: listing.item_id,
      snapshot_date: today,
      title: listing.title,
      title_length: listing.title?.length || 0,
      description_length: 0, // Would need API call to get
      price: listing.price,
      original_price: listing.original_price,
      available_quantity: listing.available_quantity,
      sold_quantity: listing.sold_quantity,
      status: listing.status,
      photo_count: 0, // Would need API call
      has_video: false,
      has_clip: false,
      attributes_count: 0,
      listing_type_id: listing.listing_type_id,
      logistic_type: listing.logistic_type,
      catalog_product_id: listing.catalog_product_id,
      health: listing.health ? Math.round(listing.health * 100) : null,
      visits_7d: visits7d,
      sales_7d: sales7d,
      conversion_rate_7d: Math.round(conversion7d * 100) / 100,
      ...scores,
      raw_data: { listing_type: listing.listing_type_id, logistic: listing.logistic_type },
    };

    snapshots.push(snapshot);

    // Detect events by comparing with previous snapshot
    const prevSnap = prevByItem.get(listing.item_id);
    if (prevSnap) {
      const detectedEvents = detectEvents(listing, prevSnap, snapshot, scores, sellerId);
      events.push(...detectedEvents);
    }
  }

  console.log(`[Radiography] Unique items to process: ${processedItemIds.size} (from ${listings.length} total)`)

  // Upsert snapshots
  if (snapshots.length > 0) {
    const { error: upsertErr } = await supabase
      .from("listing_snapshots")
      .upsert(snapshots, { onConflict: "seller_id,item_id,snapshot_date" });

    if (upsertErr) {
      console.error("[Radiography] Snapshot upsert error:", upsertErr);
    }
  }

  // Insert events (immutable)
  if (events.length > 0) {
    const { error: eventsErr } = await supabase
      .from("listing_events")
      .insert(events);

    if (eventsErr) {
      console.error("[Radiography] Events insert error:", eventsErr);
    }
  }

  // Update monitor config
  await supabase
    .from("listing_monitor_config")
    .upsert({
      seller_id: sellerId,
      user_id: userId,
      last_snapshot_at: new Date().toISOString(),
      total_items_monitored: listings.length,
    }, { onConflict: "seller_id" });

  console.log(`[Radiography] Created ${snapshots.length} snapshots, ${events.length} events`);

  return new Response(JSON.stringify({
    success: true,
    items_processed: snapshots.length,
    events_detected: events.length,
    snapshot_date: today,
  }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

// ============================================================================
// DEEP ANALYSIS: On-demand detailed analysis for a specific item
// ============================================================================
async function handleDeepAnalysis(supabase: any, userId: string, sellerId: string, itemId: string, corsHeaders: any) {
  console.log(`[Radiography] Deep analysis for ${itemId}`);

  // Get all snapshots for this item
  const { data: snapshots, error: snapErr } = await supabase
    .from("listing_snapshots")
    .select("*")
    .eq("seller_id", sellerId)
    .eq("item_id", itemId)
    .order("snapshot_date", { ascending: false });

  if (snapErr || !snapshots?.length) {
    return new Response(JSON.stringify({ 
      error: "No snapshots found for this item. Run monitoring first." 
    }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  // Get all events for this item
  const { data: events } = await supabase
    .from("listing_events")
    .select("*")
    .eq("seller_id", sellerId)
    .eq("item_id", itemId)
    .order("detected_at", { ascending: false });

  // Get current listing data (handle duplicates by getting most recent)
  const { data: listingRows } = await supabase
    .from("meli_listings_cache")
    .select("*")
    .eq("seller_id", sellerId)
    .eq("item_id", itemId)
    .order("last_sync_at", { ascending: false })
    .limit(1);
  
  const listing = listingRows?.[0] || null;

  // Calculate detailed score breakdown
  const latestSnapshot = snapshots[0];
  const scoreBreakdown = calculateDetailedScoreBreakdown(listing, latestSnapshot, snapshots);

  // Generate narrative
  const narrative = generateNarrative(snapshots, events || []);

  // Determine period summary
  const periodSummary = determinePeriodSummary(snapshots);

  // Generate suggested actions
  const suggestedActions = generateSuggestedActions(listing, latestSnapshot, scoreBreakdown, events || []);

  // Group events by period for timeline
  const eventTimeline = groupEventsByPeriod(events || []);

  // Identify cause-effect relationships
  const causeEffectInsights = identifyCauseEffect(events || [], snapshots);

  // Mark previous radiography as not current
  await supabase
    .from("listing_radiography")
    .update({ is_current: false })
    .eq("seller_id", sellerId)
    .eq("item_id", itemId);

  // Create new radiography
  const radiography = {
    seller_id: sellerId,
    item_id: itemId,
    analysis_date: new Date().toISOString(),
    period_analyzed_days: snapshots.length,
    score_breakdown: scoreBreakdown,
    narrative_pt: narrative,
    period_summary: periodSummary,
    suggested_actions: suggestedActions,
    event_timeline: eventTimeline,
    cause_effect_insights: causeEffectInsights,
    is_current: true,
  };

  const { data: newRadio, error: radioErr } = await supabase
    .from("listing_radiography")
    .insert(radiography)
    .select()
    .single();

  if (radioErr) {
    console.error("[Radiography] Insert error:", radioErr);
    return new Response(JSON.stringify({ error: "Failed to save radiography" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({
    success: true,
    radiography: newRadio,
    listing,
    snapshots_count: snapshots.length,
    events_count: events?.length || 0,
  }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

// ============================================================================
// STATUS: Get monitoring status
// ============================================================================
async function handleStatus(supabase: any, userId: string, sellerId: string, corsHeaders: any) {
  const { data: config } = await supabase
    .from("listing_monitor_config")
    .select("*")
    .eq("seller_id", sellerId)
    .maybeSingle();

  const { count: snapshotCount } = await supabase
    .from("listing_snapshots")
    .select("*", { count: "exact", head: true })
    .eq("seller_id", sellerId);

  const { count: eventCount } = await supabase
    .from("listing_events")
    .select("*", { count: "exact", head: true })
    .eq("seller_id", sellerId);

  const { count: radiographyCount } = await supabase
    .from("listing_radiography")
    .select("*", { count: "exact", head: true })
    .eq("seller_id", sellerId)
    .eq("is_current", true);

  // Get critical events from last 7 days
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const { data: criticalEvents } = await supabase
    .from("listing_events")
    .select("*")
    .eq("seller_id", sellerId)
    .eq("severity", "critical")
    .gte("detected_at", sevenDaysAgo.toISOString())
    .order("detected_at", { ascending: false });

  return new Response(JSON.stringify({
    config: config || { auto_monitor_enabled: false },
    stats: {
      total_snapshots: snapshotCount || 0,
      total_events: eventCount || 0,
      items_with_radiography: radiographyCount || 0,
    },
    critical_events: criticalEvents || [],
  }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

// ============================================================================
// LIST: List items with their latest scores
// ============================================================================
async function handleListItems(supabase: any, userId: string, sellerId: string, params: any, corsHeaders: any) {
  const { sort_by = "score_total", order = "desc" } = params;
  
  const today = new Date().toISOString().split('T')[0];

  // Get latest snapshots
  const { data: snapshots, error } = await supabase
    .from("listing_snapshots")
    .select(`
      item_id,
      title,
      price,
      status,
      score_total,
      score_semantica,
      score_visual,
      score_clip,
      score_competitividade,
      score_logistica,
      score_performance,
      visits_7d,
      sales_7d,
      conversion_rate_7d,
      available_quantity,
      logistic_type,
      catalog_product_id,
      snapshot_date
    `)
    .eq("seller_id", sellerId)
    .eq("snapshot_date", today)
    .order(sort_by, { ascending: order === "asc" })
    .range(offset, offset + limit - 1);

  if (error) {
    console.error("[Radiography] List error:", error);
  }

  // Get thumbnails from listings cache
  const itemIds = (snapshots || []).map((s: any) => s.item_id);
  const { data: listings } = await supabase
    .from("meli_listings_cache")
    .select("item_id, thumbnail, permalink")
    .eq("seller_id", sellerId)
    .in("item_id", itemIds);

  const thumbMap = new Map<string, any>();
  for (const l of listings || []) {
    thumbMap.set(l.item_id, l);
  }

  const enriched = (snapshots || []).map((s: any) => ({
    ...s,
    thumbnail: thumbMap.get(s.item_id)?.thumbnail,
    permalink: thumbMap.get(s.item_id)?.permalink,
  }));

  return new Response(JSON.stringify({
    items: enriched,
    total: enriched.length,
  }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

// ============================================================================
// EVENTS: Get events for an item
// ============================================================================
async function handleGetEvents(supabase: any, userId: string, sellerId: string, itemId: string | null, corsHeaders: any) {
  let query = supabase
    .from("listing_events")
    .select("*")
    .eq("seller_id", sellerId)
    .order("detected_at", { ascending: false });

  if (itemId) {
    query = query.eq("item_id", itemId);
  }

  const { data: events, error } = await query;

  if (error) {
    console.error("[Radiography] Events error:", error);
  }

  return new Response(JSON.stringify({
    events: events || [],
  }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

// ============================================================================
// VISIT-HISTORY: Get daily visits with events overlay for correlation analysis
// ============================================================================
async function handleVisitHistory(
  supabase: any,
  userId: string,
  sellerId: string,
  itemId: string,
  days: number,
  corsHeaders: any
) {
  const daysToFetch = Math.min(Math.max(days, 7), 90);
  const fromDate = new Date();
  fromDate.setDate(fromDate.getDate() - daysToFetch);
  const fromDateStr = fromDate.toISOString().split('T')[0];

  console.log(`[Radiography] Fetching visit history for ${itemId}, last ${daysToFetch} days`);

  // Fetch daily visits
  const { data: visits, error: visitsErr } = await supabase
    .from("seller_item_visits")
    .select("visit_date, visits_count")
    .eq("seller_id", sellerId)
    .eq("item_id", itemId)
    .gte("visit_date", fromDateStr)
    .order("visit_date", { ascending: true });

  if (visitsErr) {
    console.error("[Radiography] Visits fetch error:", visitsErr);
  }

  // Fetch events in the same period
  const { data: events, error: eventsErr } = await supabase
    .from("listing_events")
    .select("id, event_type, event_category, severity, impact_direction, observation_pt, detected_at, score_delta")
    .eq("seller_id", sellerId)
    .eq("item_id", itemId)
    .gte("detected_at", fromDate.toISOString())
    .order("detected_at", { ascending: true });

  if (eventsErr) {
    console.error("[Radiography] Events fetch error:", eventsErr);
  }

  // Fetch daily snapshots for sales/conversion overlay
  const { data: snapshots, error: snapErr } = await supabase
    .from("listing_snapshots")
    .select("snapshot_date, sales_7d, conversion_rate_7d, score_total, visits_7d")
    .eq("seller_id", sellerId)
    .eq("item_id", itemId)
    .gte("snapshot_date", fromDateStr)
    .order("snapshot_date", { ascending: true });

  if (snapErr) {
    console.error("[Radiography] Snapshots fetch error:", snapErr);
  }

  // Create a map of date -> visits
  const visitsByDate = new Map<string, number>();
  for (const v of visits || []) {
    visitsByDate.set(v.visit_date, v.visits_count);
  }

  // Create a map of date -> snapshot data
  const snapshotsByDate = new Map<string, any>();
  for (const s of snapshots || []) {
    snapshotsByDate.set(s.snapshot_date, s);
  }

  // Build timeline with all dates
  const timeline: any[] = [];
  const currentDate = new Date(fromDateStr);
  const today = new Date();

  while (currentDate <= today) {
    const dateStr = currentDate.toISOString().split('T')[0];
    const snapshot = snapshotsByDate.get(dateStr);
    
    timeline.push({
      date: dateStr,
      visits: visitsByDate.get(dateStr) || 0,
      sales_7d: snapshot?.sales_7d || null,
      conversion_7d: snapshot?.conversion_rate_7d || null,
      score_total: snapshot?.score_total || null,
    });
    
    currentDate.setDate(currentDate.getDate() + 1);
  }

  // Map events to their dates
  const eventsByDate = new Map<string, any[]>();
  for (const event of events || []) {
    const eventDate = new Date(event.detected_at).toISOString().split('T')[0];
    if (!eventsByDate.has(eventDate)) {
      eventsByDate.set(eventDate, []);
    }
    eventsByDate.get(eventDate)!.push(event);
  }

  // Add events to timeline
  for (const day of timeline) {
    day.events = eventsByDate.get(day.date) || [];
  }

  // Calculate summary stats
  const totalVisits = timeline.reduce((sum, d) => sum + d.visits, 0);
  const avgVisits = timeline.length > 0 ? Math.round(totalVisits / timeline.length) : 0;
  
  // Calculate trend (last 7 days vs previous 7 days)
  const last7 = timeline.slice(-7);
  const prev7 = timeline.slice(-14, -7);
  const last7Visits = last7.reduce((sum, d) => sum + d.visits, 0);
  const prev7Visits = prev7.reduce((sum, d) => sum + d.visits, 0);
  const trend = prev7Visits > 0 ? Math.round(((last7Visits / prev7Visits) - 1) * 100) : 0;

  return new Response(JSON.stringify({
    timeline,
    events: events || [],
    summary: {
      total_visits: totalVisits,
      avg_daily_visits: avgVisits,
      trend_7d: trend,
      total_events: events?.length || 0,
      days_analyzed: daysToFetch,
    },
  }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function calculateScores(listing: any, visits: number, sales: number, conversion: number) {
  // Semantic score (based on title and listing type)
  let semantica = 50;
  if (listing.title?.length >= 50) semantica += 20;
  if (listing.title?.length >= 80) semantica += 10;
  if (listing.listing_type_id === "gold_pro") semantica += 20;

  // Visual score (placeholder - would need API data)
  let visual = 60;

  // Clip score
  let clip = 0; // Default no clip

  // Competitiveness score
  let competitividade = 50;
  if (listing.catalog_product_id) competitividade += 30;
  if (listing.listing_type_id === "gold_pro") competitividade += 20;

  // Logistics score
  let logistica = 50;
  if (listing.logistic_type === "fulfillment") logistica = 100;
  else if (listing.logistic_type === "cross_docking") logistica = 80;
  else if (listing.logistic_type === "drop_off") logistica = 60;

  // Performance score
  let performance = 50;
  if (conversion >= 5) performance += 30;
  else if (conversion >= 2) performance += 15;
  if (visits >= 100) performance += 10;
  if (sales >= 10) performance += 10;

  // Total (weighted average)
  const total = Math.round(
    (semantica * 0.15 + visual * 0.15 + clip * 0.10 + 
     competitividade * 0.25 + logistica * 0.20 + performance * 0.15)
  );

  return {
    score_semantica: Math.min(100, semantica),
    score_visual: Math.min(100, visual),
    score_clip: Math.min(100, clip),
    score_competitividade: Math.min(100, competitividade),
    score_logistica: Math.min(100, logistica),
    score_performance: Math.min(100, performance),
    score_total: Math.min(100, total),
  };
}

function detectEvents(listing: any, prevSnap: any, currentSnap: any, scores: any, sellerId: string): any[] {
  const events: any[] = [];
  const now = new Date().toISOString();

  // Title changed
  if (prevSnap.title !== currentSnap.title) {
    events.push(createEvent(sellerId, listing.item_id, "title_changed", {
      before: { title: prevSnap.title },
      after: { title: currentSnap.title },
      observation: "Mudança de título pode impactar relevância e CTR nos próximos dias.",
    }, prevSnap, scores));
  }

  // Price changed
  if (prevSnap.price !== currentSnap.price) {
    const direction = currentSnap.price > prevSnap.price ? "aumento" : "redução";
    events.push(createEvent(sellerId, listing.item_id, "price_changed", {
      before: { price: prevSnap.price },
      after: { price: currentSnap.price },
      observation: `${direction} de preço de R$ ${prevSnap.price} para R$ ${currentSnap.price}.`,
    }, prevSnap, scores));
  }

  // Stockout
  if (prevSnap.available_quantity > 0 && currentSnap.available_quantity === 0) {
    events.push(createEvent(sellerId, listing.item_id, "stockout", {
      before: { available_quantity: prevSnap.available_quantity },
      after: { available_quantity: 0 },
      observation: "Ruptura de estoque detectada. Anúncio pausado por falta de produtos.",
    }, prevSnap, scores, "critical"));
  }

  // Stock recovered
  if (prevSnap.available_quantity === 0 && currentSnap.available_quantity > 0) {
    events.push(createEvent(sellerId, listing.item_id, "stock_recovered", {
      before: { available_quantity: 0 },
      after: { available_quantity: currentSnap.available_quantity },
      observation: "Estoque reposto. Anúncio voltou a ficar disponível.",
    }, prevSnap, scores));
  }

  // Logistics changed
  if (prevSnap.logistic_type !== currentSnap.logistic_type) {
    const eventType = getLogisticsLevel(currentSnap.logistic_type) > getLogisticsLevel(prevSnap.logistic_type)
      ? "logistic_upgraded" : "logistic_downgraded";
    events.push(createEvent(sellerId, listing.item_id, eventType, {
      before: { logistic_type: prevSnap.logistic_type },
      after: { logistic_type: currentSnap.logistic_type },
      observation: eventType === "logistic_upgraded" 
        ? "Melhoria logística detectada. Pode aumentar visibilidade e conversão."
        : "Downgrade logístico. Pode impactar negativamente a competitividade.",
    }, prevSnap, scores));
  }

  // Catalog entry/exit
  if (!prevSnap.catalog_product_id && currentSnap.catalog_product_id) {
    events.push(createEvent(sellerId, listing.item_id, "catalog_entered", {
      before: { catalog: false },
      after: { catalog: true, catalog_product_id: currentSnap.catalog_product_id },
      observation: "Entrada no catálogo. Concorre por buy box com outros vendedores.",
    }, prevSnap, scores));
  }
  if (prevSnap.catalog_product_id && !currentSnap.catalog_product_id) {
    events.push(createEvent(sellerId, listing.item_id, "catalog_exited", {
      before: { catalog: true },
      after: { catalog: false },
      observation: "Saída do catálogo. Impacto significativo na visibilidade.",
    }, prevSnap, scores, "critical"));
  }

  // Visits spike/drop (>50% variation)
  if (prevSnap.visits_7d > 0) {
    const variation = ((currentSnap.visits_7d - prevSnap.visits_7d) / prevSnap.visits_7d) * 100;
    if (variation >= 50) {
      events.push(createEvent(sellerId, listing.item_id, "visits_spike", {
        before: { visits_7d: prevSnap.visits_7d },
        after: { visits_7d: currentSnap.visits_7d },
        observation: `Pico de visitas: +${Math.round(variation)}%. Avaliar conversão.`,
      }, prevSnap, scores));
    } else if (variation <= -50) {
      events.push(createEvent(sellerId, listing.item_id, "visits_drop", {
        before: { visits_7d: prevSnap.visits_7d },
        after: { visits_7d: currentSnap.visits_7d },
        observation: `Queda de visitas: ${Math.round(variation)}%. Verificar posicionamento.`,
      }, prevSnap, scores, "warning"));
    }
  }

  return events;
}

function createEvent(sellerId: string, itemId: string, eventType: string, data: any, prevSnap: any, scores: any, overrideSeverity?: string): any {
  const config = EVENT_CONFIG[eventType] || { category: "other", blocks: [], severity: "info" };
  
  return {
    seller_id: sellerId,
    item_id: itemId,
    event_type: eventType,
    event_category: config.category,
    origin: "snapshot",
    severity: overrideSeverity || config.severity,
    state_before: data.before,
    state_after: data.after,
    blocks_affected: config.blocks,
    score_before: {
      semantica: prevSnap.score_semantica,
      visual: prevSnap.score_visual,
      clip: prevSnap.score_clip,
      competitividade: prevSnap.score_competitividade,
      logistica: prevSnap.score_logistica,
      performance: prevSnap.score_performance,
    },
    score_after: scores,
    score_delta: {
      semantica: scores.score_semantica - prevSnap.score_semantica,
      visual: scores.score_visual - prevSnap.score_visual,
      clip: scores.score_clip - prevSnap.score_clip,
      competitividade: scores.score_competitividade - prevSnap.score_competitividade,
      logistica: scores.score_logistica - prevSnap.score_logistica,
      performance: scores.score_performance - prevSnap.score_performance,
    },
    impact_direction: calculateImpactDirection(scores, prevSnap),
    observation_pt: data.observation,
  };
}

function getLogisticsLevel(logisticType: string): number {
  switch (logisticType) {
    case "fulfillment": return 3;
    case "cross_docking": return 2;
    case "drop_off": return 1;
    default: return 0;
  }
}

function calculateImpactDirection(scores: any, prevSnap: any): string {
  const delta = scores.score_total - (prevSnap.score_total || 0);
  if (delta > 5) return "positive";
  if (delta < -5) return "negative";
  return "neutral";
}

function calculateDetailedScoreBreakdown(listing: any, latestSnap: any, snapshots: any[]) {
  return {
    semantica: {
      score: latestSnap.score_semantica,
      details: {
        title_length: latestSnap.title_length,
        title_quality: latestSnap.title_length >= 60 ? "good" : "needs_improvement",
        description_length: latestSnap.description_length,
      }
    },
    visual: {
      score: latestSnap.score_visual,
      details: {
        photo_count: latestSnap.photo_count,
        has_video: latestSnap.has_video,
      }
    },
    clip: {
      score: latestSnap.score_clip,
      details: { has_clip: latestSnap.has_clip }
    },
    competitividade: {
      score: latestSnap.score_competitividade,
      details: {
        in_catalog: !!latestSnap.catalog_product_id,
        listing_type: latestSnap.listing_type_id,
      }
    },
    logistica: {
      score: latestSnap.score_logistica,
      details: {
        logistic_type: latestSnap.logistic_type,
        is_full: latestSnap.logistic_type === "fulfillment",
      }
    },
    performance: {
      score: latestSnap.score_performance,
      details: {
        visits_7d: latestSnap.visits_7d,
        sales_7d: latestSnap.sales_7d,
        conversion_rate: latestSnap.conversion_rate_7d,
      }
    },
    total: latestSnap.score_total,
  };
}

function generateNarrative(snapshots: any[], events: any[]): string {
  if (!snapshots.length) return "Dados insuficientes para gerar narrativa.";

  const latest = snapshots[0];
  const oldest = snapshots[snapshots.length - 1];
  
  let narrative = "";

  // Performance trend
  if (latest.score_total > oldest.score_total + 10) {
    narrative = "O anúncio apresentou melhoria de performance no período analisado. ";
  } else if (latest.score_total < oldest.score_total - 10) {
    narrative = "O anúncio apresentou queda de performance no período. ";
  } else {
    narrative = "O desempenho do anúncio manteve-se estável no período. ";
  }

  // Key events
  const criticalEvents = events.filter(e => e.severity === "critical");
  if (criticalEvents.length > 0) {
    narrative += `Foram detectados ${criticalEvents.length} eventos críticos que merecem atenção. `;
  }

  // Logistics
  if (latest.logistic_type === "fulfillment") {
    narrative += "O anúncio opera com logística Full, o que é positivo para competitividade. ";
  }

  // Catalog
  if (latest.catalog_product_id) {
    narrative += "Participa do catálogo, competindo por buy box. ";
  }

  return narrative;
}

function determinePeriodSummary(snapshots: any[]): string {
  if (snapshots.length < 2) return "indefinido";
  
  const latest = snapshots[0];
  const oldest = snapshots[snapshots.length - 1];
  const mid = snapshots[Math.floor(snapshots.length / 2)];

  const trend1 = latest.score_total - mid.score_total;
  const trend2 = mid.score_total - oldest.score_total;

  if (trend1 > 5 && trend2 > 5) return "crescimento";
  if (trend1 < -5 && trend2 < -5) return "queda";
  if (trend1 > 5 && trend2 < -5) return "recuperação";
  if (trend1 < -5 && trend2 > 5) return "declínio recente";
  return "estagnação";
}

function generateSuggestedActions(listing: any, snapshot: any, breakdown: any, events: any[]): any[] {
  const actions: any[] = [];
  let priority = 1;

  // Check each block for improvement opportunities
  if (breakdown.semantica?.score < 70) {
    actions.push({
      priority: priority++,
      action: "Melhorar título com palavras-chave relevantes",
      block: "semantica",
      impact: "alto",
      reason: "Títulos otimizados aumentam visibilidade nas buscas.",
    });
  }

  if (breakdown.visual?.score < 70) {
    actions.push({
      priority: priority++,
      action: "Adicionar mais fotos de qualidade",
      block: "visual",
      impact: "médio",
      reason: "Fotos de qualidade aumentam conversão.",
    });
  }

  if (breakdown.clip?.score === 0) {
    actions.push({
      priority: priority++,
      action: "Criar um Clip do produto",
      block: "clip",
      impact: "médio",
      reason: "Clips aumentam engajamento e podem melhorar posicionamento.",
    });
  }

  if (snapshot.logistic_type !== "fulfillment") {
    actions.push({
      priority: priority++,
      action: "Considerar envio para Full",
      block: "logistica",
      impact: "alto",
      reason: "Logística Full melhora competitividade e filtros de busca.",
    });
  }

  if (!snapshot.catalog_product_id && listing?.category_id) {
    actions.push({
      priority: priority++,
      action: "Verificar elegibilidade para catálogo",
      block: "competitividade",
      impact: "alto",
      reason: "Produtos em catálogo têm maior visibilidade.",
    });
  }

  // Check for recent critical events
  const recentCritical = events.filter(e => e.severity === "critical").slice(0, 3);
  for (const event of recentCritical) {
    if (event.event_type === "stockout") {
      actions.unshift({
        priority: 1,
        action: "Repor estoque urgentemente",
        block: "performance",
        impact: "crítico",
        reason: "Ruptura de estoque impacta fortemente vendas e ranqueamento.",
      });
    }
  }

  return actions.slice(0, 5); // Max 5 actions
}

function groupEventsByPeriod(events: any[]): any[] {
  const byMonth = new Map<string, any[]>();

  for (const event of events) {
    const date = new Date(event.detected_at);
    const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    
    if (!byMonth.has(monthKey)) {
      byMonth.set(monthKey, []);
    }
    byMonth.get(monthKey)!.push(event);
  }

  const timeline: any[] = [];
  for (const [period, periodEvents] of byMonth) {
    const positive = periodEvents.filter(e => e.impact_direction === "positive").length;
    const negative = periodEvents.filter(e => e.impact_direction === "negative").length;
    
    timeline.push({
      period,
      events_count: periodEvents.length,
      events: periodEvents.slice(0, 5), // Sample
      trend: positive > negative ? "up" : negative > positive ? "down" : "stable",
    });
  }

  return timeline.sort((a, b) => b.period.localeCompare(a.period));
}

function identifyCauseEffect(events: any[], snapshots: any[]): any[] {
  const insights: any[] = [];

  // Look for patterns
  for (let i = 0; i < events.length - 1; i++) {
    const current = events[i];
    const next = events[i + 1];

    // Stockout followed by sales drop
    if (current.event_type === "stockout" && next.event_type === "visits_drop") {
      insights.push({
        cause: "Ruptura de estoque",
        effect: "Queda de visitas",
        period: current.detected_at,
        explanation: "A ruptura causou pausamento do anúncio, reduzindo visibilidade.",
      });
    }

    // Logistic upgrade followed by performance improvement
    if (current.event_type === "logistic_upgraded" && 
        next.event_type === "visits_spike") {
      insights.push({
        cause: "Melhoria logística",
        effect: "Aumento de visitas",
        period: current.detected_at,
        explanation: "A melhoria logística aumentou competitividade nos filtros.",
      });
    }
  }

  return insights;
}
