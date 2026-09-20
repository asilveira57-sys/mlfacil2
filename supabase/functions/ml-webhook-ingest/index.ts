import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Allowed application IDs (your ML app)
const ALLOWED_APP_IDS = (Deno.env.get("ML_APP_ID") || "").split(",").filter(Boolean);

// ---------------------------------------------------------------------------
// Cost-containment policy (Phase 1)
// ---------------------------------------------------------------------------
// 1) DISCARD list: topics that are stored at high volume but NOT processed
//    operationally right now. They are answered 200 OK and dropped immediately.
//    No SELECT, no INSERT, no dedupe. Configurable via env to roll back fast.
// 2) ACCEPT list: topics that the system actually uses (shipments, orders,
//    orders_v2). They are inserted, BUT we skip the costly SELECT-before-INSERT
//    dedupe — the unique index on dedupe_key already prevents duplicates.
// Any topic outside both lists is dropped silently (legacy behavior).
// ---------------------------------------------------------------------------

// V7 cost-containment whitelist: only the 4 operationally critical topics.
// Everything else is dropped at the door (200 OK, no DB work).
const DEFAULT_DISCARD_TOPICS = ["items", "invoices", "claims", "stock-locations", "fbm_stock_operations"];
const DEFAULT_ACCEPT_TOPICS = ["messages", "questions", "orders_v2"];

// Topics for which we store only a SLIM payload (id + topic + received) to
// avoid bloating webhook_events. Full details are fetched on demand by the
// worker / sync flows when a user session is active.
const SLIM_PAYLOAD_TOPICS = new Set(["orders_v2"]);

const DISCARD_TOPICS = new Set(
  (Deno.env.get("WEBHOOK_DISCARD_TOPICS") ?? DEFAULT_DISCARD_TOPICS.join(","))
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
);

const ACCEPT_TOPICS = new Set(
  (Deno.env.get("WEBHOOK_ACCEPT_TOPICS") ?? DEFAULT_ACCEPT_TOPICS.join(","))
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
);

// Kill-switch: when set to "1" the function reverts to legacy "accept everything"
// behavior (still skipping the redundant SELECT). Use only if something breaks.
const COST_GUARD_DISABLED = Deno.env.get("WEBHOOK_COST_GUARD_DISABLED") === "1";

// `shipments` é redundante com o cron `shipping-status-sync`, que já mantém
// `meli_shipments_cache`. Descartado na porta para não gravar ~30 mil linhas/dia.
// Kill-switch: defina WEBHOOK_ALLOW_SHIPMENTS=1 para voltar a aceitar.
const ALLOW_SHIPMENTS = Deno.env.get("WEBHOOK_ALLOW_SHIPMENTS") === "1";

/**
 * SHA-256 dedupe key (kept for the unique index)
 */
async function generateDedupeKey(input: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(input);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  const startTime = Date.now();

  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  const contentType = req.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) {
    return new Response("Invalid content type", { status: 400 });
  }

  try {
    // Parse body with size limit (100KB)
    const bodyText = await req.text();
    if (bodyText.length > 102400) {
      return new Response("Payload too large", { status: 413 });
    }

    const payload = JSON.parse(bodyText);
    const { topic, resource, user_id, application_id, _id, sent } = payload;

    if (!topic || !resource || !user_id) {
      return new Response(JSON.stringify({ error: "Missing required fields" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const topicStr = String(topic);

    // ─── shipments: descartado incondicionalmente (redundante com o cron) ────
    if (!ALLOW_SHIPMENTS && topicStr === "shipments") {
      return new Response(
        JSON.stringify({ status: "discarded_topic", topic: topicStr, reason: "redundant_with_cron" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ─── Cost guard: discard topics we don't operationally process ──────────
    if (!COST_GUARD_DISABLED && DISCARD_TOPICS.has(topicStr)) {
      // 200 OK, no DB work. ML won't retry.
      return new Response(
        JSON.stringify({ status: "discarded_topic", topic: topicStr }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ─── Cost guard: anything outside the accept list is also dropped ───────
    if (!COST_GUARD_DISABLED && !ACCEPT_TOPICS.has(topicStr)) {
      return new Response(
        JSON.stringify({ status: "ignored_topic", topic: topicStr }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Optional app id check
    if (ALLOWED_APP_IDS.length > 0 && application_id) {
      if (!ALLOWED_APP_IDS.includes(String(application_id))) {
        console.warn("[ml-webhook-ingest] Unknown application_id:", application_id);
      }
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Generate dedupe_key (still used by the unique index)
    const eventId = _id || sent || Date.now().toString();
    const dedupeRaw = `mercadolibre:${user_id}:${topicStr}:${resource}:${eventId}`;
    const dedupeKey = await generateDedupeKey(dedupeRaw);

    // Slim payload for orders_v2: only the minimum needed to fetch on demand.
    // Drastically reduces row size (full payload was ~1-3KB per event).
    const storedPayload = SLIM_PAYLOAD_TOPICS.has(topicStr)
      ? {
          topic: topicStr,
          resource,
          user_id: String(user_id),
          received_at: new Date().toISOString(),
          _id: _id ?? null,
          sent: sent ?? null,
        }
      : payload;

    // Direct INSERT — rely on the unique index instead of a separate SELECT.
    // This removes one round-trip per webhook (we used to do ~1.8M reads/day).
    const { data: inserted, error: insertError } = await supabase
      .from("webhook_events")
      .insert({
        provider: "mercadolibre",
        ml_user_id: String(user_id),
        application_id: application_id ? String(application_id) : null,
        topic: topicStr,
        resource,
        payload_raw: storedPayload,
        dedupe_key: dedupeKey,
        status: "pending",
        received_at: new Date().toISOString(),
      })
      .select("id")
      .single();

    if (insertError) {
      // 23505 = unique_violation → duplicate, fine
      if (insertError.code === "23505") {
        return new Response(JSON.stringify({ status: "duplicate" }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      console.error("[ml-webhook-ingest] Insert error:", insertError);
      return new Response(JSON.stringify({ status: "error", error: "queue_failed" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(
      JSON.stringify({
        status: "queued",
        event_id: inserted.id,
        topic: topicStr,
        duration_ms: Date.now() - startTime,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("[ml-webhook-ingest] Error:", err);
    // Always return 200 to prevent ML from hammering us
    return new Response(JSON.stringify({ status: "error" }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
