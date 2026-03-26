import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

/**
 * Periodic snapshot scheduler.
 * Checks all users who have an 'initial' snapshot and creates
 * periodic snapshots at 15, 30 and 90 days.
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const now = new Date();
    const periods = [15, 30, 90];
    let created = 0;

    // Get all initial snapshots
    const { data: initials } = await supabase
      .from("seller_journey_snapshots")
      .select("user_id, company_id, seller_id, created_at")
      .eq("snapshot_type", "initial");

    if (!initials || initials.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: "No initial snapshots found", created: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    for (const initial of initials) {
      const initialDate = new Date(initial.created_at);
      const daysSinceInitial = Math.floor((now.getTime() - initialDate.getTime()) / (1000 * 60 * 60 * 24));

      for (const period of periods) {
        if (daysSinceInitial < period) continue;

        // Check if this periodic snapshot already exists
        const { count } = await supabase
          .from("seller_journey_snapshots")
          .select("*", { count: "exact", head: true })
          .eq("user_id", initial.user_id)
          .eq("snapshot_type", "periodic")
          .eq("period_days", period);

        if ((count ?? 0) > 0) continue;

        // Create periodic snapshot by calling the snapshot function internally
        const snapshotUrl = `${supabaseUrl}/functions/v1/seller-journey-snapshot`;
        await fetch(snapshotUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${serviceKey}`,
          },
          body: JSON.stringify({
            user_id: initial.user_id,
            company_id: initial.company_id,
            seller_id: initial.seller_id,
            snapshot_type: "periodic",
            period_days: period,
          }),
        });

        created++;
        console.log(`[periodic-snapshots] Created ${period}d snapshot for user ${initial.user_id}`);
      }
    }

    // Log
    await supabase.from("seller_journey_logs").insert({
      user_id: "00000000-0000-0000-0000-000000000000",
      event_type: "periodic_snapshots_run",
      event_data: { created, checked: initials.length, timestamp: now.toISOString() },
    });

    return new Response(
      JSON.stringify({ success: true, created, checked: initials.length }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("[periodic-snapshots] Error:", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
