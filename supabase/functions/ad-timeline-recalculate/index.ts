import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface RecalculateRequest {
  workspace_id: string;
  ml_account_id?: string;
  item_id?: string; // Optional: recalculate only specific item
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get user from auth header
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing authorization header" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { workspace_id, ml_account_id, item_id } = await req.json() as RecalculateRequest;

    if (!workspace_id) {
      return new Response(JSON.stringify({ error: "workspace_id is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`[ad-timeline-recalculate] Starting for workspace=${workspace_id}, account=${ml_account_id || 'all'}, item=${item_id || 'all'}`);

    // Get settings for thresholds
    const { data: settings } = await supabase
      .from("ad_timeline_settings")
      .select("*")
      .eq("workspace_id", workspace_id)
      .maybeSingle();

    const thresholds = settings?.thresholds_days || [30, 60, 90, 120];

    // Build query for sales data from meli_order_items_cache
    let salesQuery = supabase
      .from("meli_order_items_cache")
      .select("item_id, sale_datetime, seller_id")
      .eq("user_id", workspace_id) // assuming workspace_id maps to user_id context
      .not("sale_datetime", "is", null)
      .order("sale_datetime", { ascending: true });

    if (ml_account_id) {
      salesQuery = salesQuery.eq("seller_id", ml_account_id);
    }
    if (item_id) {
      salesQuery = salesQuery.eq("item_id", item_id);
    }

    const { data: salesData, error: salesError } = await salesQuery;

    if (salesError) {
      console.error(`[ad-timeline-recalculate] Error fetching sales:`, salesError);
      return new Response(JSON.stringify({ error: "Failed to fetch sales data", details: salesError }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!salesData || salesData.length === 0) {
      console.log(`[ad-timeline-recalculate] No sales data found`);
      return new Response(JSON.stringify({ 
        success: true, 
        message: "No sales data found",
        processed: 0 
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Group sales by item_id and seller_id
    const itemSales: Record<string, { seller_id: string; dates: Date[] }> = {};
    
    for (const sale of salesData) {
      const key = `${sale.seller_id}:${sale.item_id}`;
      if (!itemSales[key]) {
        itemSales[key] = { seller_id: sale.seller_id, dates: [] };
      }
      itemSales[key].dates.push(new Date(sale.sale_datetime));
    }

    const now = new Date();
    const statsToUpsert: any[] = [];
    const eventsToInsert: any[] = [];

    for (const [key, data] of Object.entries(itemSales)) {
      const [seller_id, item_id] = key.split(":");
      const dates = data.dates.sort((a, b) => a.getTime() - b.getTime());

      const firstSale = dates[0];
      const lastSale = dates[dates.length - 1];
      const daysSinceLastSale = Math.floor((now.getTime() - lastSale.getTime()) / (1000 * 60 * 60 * 24));

      // Calculate gaps
      const gaps: number[] = [];
      for (let i = 1; i < dates.length; i++) {
        const gapHours = (dates[i].getTime() - dates[i - 1].getTime()) / (1000 * 60 * 60);
        gaps.push(gapHours);
      }

      // Calculate metrics
      const avgGapHours = gaps.length > 0 ? gaps.reduce((a, b) => a + b, 0) / gaps.length : null;
      const sortedGaps = [...gaps].sort((a, b) => a - b);
      const medianGapHours = gaps.length > 0 
        ? gaps.length % 2 === 0
          ? (sortedGaps[gaps.length / 2 - 1] + sortedGaps[gaps.length / 2]) / 2
          : sortedGaps[Math.floor(gaps.length / 2)]
        : null;
      const maxGapHours = gaps.length > 0 ? Math.max(...gaps) : null;

      // Count sales by period
      const salesCount30d = dates.filter(d => (now.getTime() - d.getTime()) <= 30 * 24 * 60 * 60 * 1000).length;
      const salesCount60d = dates.filter(d => (now.getTime() - d.getTime()) <= 60 * 24 * 60 * 60 * 1000).length;
      const salesCount90d = dates.filter(d => (now.getTime() - d.getTime()) <= 90 * 24 * 60 * 60 * 1000).length;
      const salesCount120d = dates.filter(d => (now.getTime() - d.getTime()) <= 120 * 24 * 60 * 60 * 1000).length;

      // Determine status bucket
      let statusBucket = "OK";
      if (daysSinceLastSale >= thresholds[3]) {
        statusBucket = "120D";
      } else if (daysSinceLastSale >= thresholds[2]) {
        statusBucket = "90D";
      } else if (daysSinceLastSale >= thresholds[1]) {
        statusBucket = "60D";
      } else if (daysSinceLastSale >= thresholds[0]) {
        statusBucket = "30D";
      }

      statsToUpsert.push({
        workspace_id,
        ml_account_id: seller_id,
        item_id,
        first_sale_at: firstSale.toISOString(),
        last_sale_at: lastSale.toISOString(),
        days_since_last_sale: daysSinceLastSale,
        sales_count_30d: salesCount30d,
        sales_count_60d: salesCount60d,
        sales_count_90d: salesCount90d,
        sales_count_120d: salesCount120d,
        avg_gap_hours: avgGapHours,
        median_gap_hours: medianGapHours,
        max_gap_hours: maxGapHours,
        status_bucket: statusBucket,
        updated_at: now.toISOString(),
      });

      // Create gap events for significant gaps (> 7 days)
      for (let i = 1; i < dates.length; i++) {
        const gapHours = (dates[i].getTime() - dates[i - 1].getTime()) / (1000 * 60 * 60);
        if (gapHours > 168) { // > 7 days
          eventsToInsert.push({
            workspace_id,
            ml_account_id: seller_id,
            item_id,
            event_type: "GAP",
            occurred_at: dates[i - 1].toISOString(),
            payload: {
              gap_hours: Math.round(gapHours * 100) / 100,
              gap_days: Math.round(gapHours / 24 * 10) / 10,
              from: dates[i - 1].toISOString(),
              to: dates[i].toISOString(),
            },
          });
        }
      }
    }

    // Also handle items with NO sales from listings cache
    if (!item_id) {
      let listingsQuery = supabase
        .from("meli_listings_cache")
        .select("item_id, seller_id")
        .eq("user_id", workspace_id);

      if (ml_account_id) {
        listingsQuery = listingsQuery.eq("seller_id", ml_account_id);
      }

      const { data: listings } = await listingsQuery;

      if (listings) {
        const existingItems = new Set(Object.keys(itemSales));
        for (const listing of listings) {
          const key = `${listing.seller_id}:${listing.item_id}`;
          if (!existingItems.has(key)) {
            statsToUpsert.push({
              workspace_id,
              ml_account_id: listing.seller_id,
              item_id: listing.item_id,
              first_sale_at: null,
              last_sale_at: null,
              days_since_last_sale: null,
              sales_count_30d: 0,
              sales_count_60d: 0,
              sales_count_90d: 0,
              sales_count_120d: 0,
              avg_gap_hours: null,
              median_gap_hours: null,
              max_gap_hours: null,
              status_bucket: "NO_SALES",
              updated_at: now.toISOString(),
            });
          }
        }
      }
    }

    // Upsert stats in batches
    const batchSize = 100;
    let upsertedCount = 0;
    for (let i = 0; i < statsToUpsert.length; i += batchSize) {
      const batch = statsToUpsert.slice(i, i + batchSize);
      const { error: upsertError } = await supabase
        .from("ad_timeline_stats")
        .upsert(batch, {
          onConflict: "workspace_id,ml_account_id,item_id",
          ignoreDuplicates: false,
        });

      if (upsertError) {
        console.error(`[ad-timeline-recalculate] Upsert error batch ${i}:`, upsertError);
      } else {
        upsertedCount += batch.length;
      }
    }

    // Insert events (only new significant gaps)
    if (eventsToInsert.length > 0) {
      for (let i = 0; i < eventsToInsert.length; i += batchSize) {
        const batch = eventsToInsert.slice(i, i + batchSize);
        await supabase.from("ad_timeline_events").insert(batch);
      }
    }

    console.log(`[ad-timeline-recalculate] Completed: ${upsertedCount} stats upserted, ${eventsToInsert.length} events created`);

    return new Response(JSON.stringify({
      success: true,
      processed: upsertedCount,
      events_created: eventsToInsert.length,
      thresholds_used: thresholds,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error: any) {
    console.error(`[ad-timeline-recalculate] Error:`, error);
    return new Response(JSON.stringify({ error: error?.message || String(error) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
