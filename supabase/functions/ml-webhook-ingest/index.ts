import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Allowed application IDs (your ML app)
const ALLOWED_APP_IDS = (Deno.env.get("ML_APP_ID") || "").split(",").filter(Boolean);

/**
 * Generate a SHA-256 hash for deduplication
 */
async function generateDedupeKey(input: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(input);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  const startTime = Date.now();

  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Only accept POST
  if (req.method !== "POST") {
    console.warn("[ml-webhook-ingest] Method not allowed:", req.method);
    return new Response("Method not allowed", { status: 405 });
  }

  // Validate Content-Type
  const contentType = req.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) {
    console.warn("[ml-webhook-ingest] Invalid content type:", contentType);
    return new Response("Invalid content type", { status: 400 });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    // Parse body with size limit (100KB)
    const bodyText = await req.text();
    if (bodyText.length > 102400) {
      console.error("[ml-webhook-ingest] Payload too large:", bodyText.length);
      return new Response("Payload too large", { status: 413 });
    }

    const payload = JSON.parse(bodyText);
    console.log("[ml-webhook-ingest] Received:", JSON.stringify(payload).substring(0, 500));

    // Validate minimum fields from ML webhook
    const { topic, resource, user_id, application_id, _id, sent, attempts } = payload;

    if (!topic || !resource || !user_id) {
      console.error("[ml-webhook-ingest] Missing required fields:", { topic, resource, user_id });
      return new Response(JSON.stringify({ error: "Missing required fields" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Validate application_id if configured
    if (ALLOWED_APP_IDS.length > 0 && application_id) {
      if (!ALLOWED_APP_IDS.includes(String(application_id))) {
        console.warn("[ml-webhook-ingest] Unknown application_id:", application_id);
        // Still accept but log - ML might send for valid reasons
      }
    }

    // Generate dedupe_key
    // Format: provider:user_id:topic:resource:event_id_or_timestamp
    const eventId = _id || sent || Date.now().toString();
    const dedupeRaw = `mercadolibre:${user_id}:${topic}:${resource}:${eventId}`;
    const dedupeKey = await generateDedupeKey(dedupeRaw);

    console.log("[ml-webhook-ingest] Dedupe key:", dedupeKey.substring(0, 16) + "...");

    // Check for duplicate
    const { data: existing } = await supabase
      .from("webhook_events")
      .select("id, status")
      .eq("dedupe_key", dedupeKey)
      .maybeSingle();

    if (existing) {
      console.log("[ml-webhook-ingest] Duplicate event, already exists:", existing.id);
      // Return 200 to prevent ML from retrying
      return new Response(JSON.stringify({
        status: "duplicate",
        event_id: existing.id,
      }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Insert into queue
    const { data: inserted, error: insertError } = await supabase
      .from("webhook_events")
      .insert({
        provider: "mercadolibre",
        ml_user_id: String(user_id),
        application_id: application_id ? String(application_id) : null,
        topic,
        resource,
        payload_raw: payload,
        dedupe_key: dedupeKey,
        status: "pending",
        received_at: new Date().toISOString(),
      })
      .select("id")
      .single();

    if (insertError) {
      // If duplicate key error (race condition), still return 200
      if (insertError.code === "23505") {
        console.log("[ml-webhook-ingest] Race condition duplicate, ignoring");
        return new Response(JSON.stringify({ status: "duplicate" }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      console.error("[ml-webhook-ingest] Insert error:", insertError);
      // Return 200 anyway to prevent infinite retries from ML
      return new Response(JSON.stringify({
        status: "error",
        error: "queue_failed",
      }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const duration = Date.now() - startTime;
    console.log(`[ml-webhook-ingest] Queued event ${inserted.id} in ${duration}ms`);

    return new Response(JSON.stringify({
      status: "queued",
      event_id: inserted.id,
      topic,
      duration_ms: duration,
    }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err) {
    console.error("[ml-webhook-ingest] Error:", err);
    // Always return 200 to prevent ML from hammering us
    return new Response(JSON.stringify({
      status: "error",
      message: "Internal error, event logged",
    }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
