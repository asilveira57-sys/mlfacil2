import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-internal-key",
};

const INTERNAL_KEY = Deno.env.get("WEBHOOK_WORKER_SECRET") || "change-me-in-production";

const BATCH_SIZE = 25;
const MAX_ATTEMPTS = 5;

// Backoff delays in minutes: 2min, 10min, 30min, 2h, 6h
const RETRY_DELAYS = [2, 10, 30, 120, 360];

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

interface WebhookEvent {
  id: string;
  provider: string;
  ml_user_id: string;
  application_id: string | null;
  topic: string;
  resource: string;
  payload_raw: Record<string, unknown>;
  status: string;
  attempts: number;
  max_attempts: number;
  next_retry_at: string | null;
  last_error: string | null;
  error_code: string | null;
  received_at: string;
}

interface MlIntegration {
  id: string;
  user_id: string;
  ml_user_id: string;
  status: string;
  feature_flags: {
    can_sync_items?: boolean;
    can_sync_orders?: boolean;
    can_sync_messages?: boolean;
    can_sync_questions?: boolean;
    daily_event_limit?: number;
    worker_frequency_seconds?: number;
  };
  daily_events_count: number;
  daily_events_reset_at: string | null;
}

interface ProcessResult {
  success: boolean;
  error?: string;
}

// Use any for supabase client to avoid complex generic typing issues in Deno
type SupabaseAny = SupabaseClient<any, any, any>;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Validate internal key for security
  const internalKey = req.headers.get("x-internal-key");
  if (internalKey !== INTERNAL_KEY) {
    console.error("[ml-worker] Unauthorized request");
    return new Response("Unauthorized", { status: 401 });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase: SupabaseAny = createClient(supabaseUrl, supabaseServiceKey);

  const startTime = Date.now();
  const stats = {
    processed: 0,
    success: 0,
    errors: 0,
    skipped: 0,
    rate_limited: 0,
  };

  try {
    console.log("[ml-worker] Starting batch processing");

    // Fetch pending events
    const now = new Date().toISOString();
    const { data: events, error: fetchError } = await supabase
      .from("webhook_events")
      .select("*")
      .eq("status", "pending")
      .or(`next_retry_at.is.null,next_retry_at.lte.${now}`)
      .order("received_at", { ascending: true })
      .limit(BATCH_SIZE);

    if (fetchError) {
      throw new Error(`Failed to fetch events: ${fetchError.message}`);
    }

    if (!events || events.length === 0) {
      console.log("[ml-worker] No pending events");
      return new Response(JSON.stringify({ status: "idle", message: "No pending events" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`[ml-worker] Found ${events.length} events to process`);

    // Mark as processing
    const eventIds = events.map((e: WebhookEvent) => e.id);
    await supabase
      .from("webhook_events")
      .update({ status: "processing" })
      .in("id", eventIds);

    // Process each event
    for (const event of events as WebhookEvent[]) {
      stats.processed++;

      try {
        // Get integration settings for this ML user
        let integration: MlIntegration | null = null;
        
        const { data: existingIntegration } = await supabase
          .from("ml_integrations")
          .select("*")
          .eq("ml_user_id", event.ml_user_id)
          .maybeSingle();

        if (!existingIntegration) {
          // Check if we have an ml_account
          const { data: mlAccount } = await supabase
            .from("ml_accounts")
            .select("id, user_id, access_token")
            .eq("ml_user_id", event.ml_user_id)
            .eq("is_active", true)
            .maybeSingle();

          if (!mlAccount) {
            // Unknown seller, mark as error
            await markEventError(supabase, event.id, "UNKNOWN_SELLER", "No active account found");
            stats.errors++;
            continue;
          }

          // Auto-create integration with default settings
          const { data: newIntegration } = await supabase
            .from("ml_integrations")
            .insert({
              user_id: mlAccount.user_id,
              ml_user_id: event.ml_user_id,
              status: "active",
              feature_flags: {
                can_sync_items: true,
                can_sync_orders: false,
                can_sync_messages: false,
                can_sync_questions: false,
                daily_event_limit: 500,
              },
            })
            .select()
            .single();

          integration = newIntegration as MlIntegration;
          console.log(`[ml-worker] Auto-created integration for ${event.ml_user_id}`);
        } else {
          integration = existingIntegration as MlIntegration;
        }

        if (!integration) {
          await markEventError(supabase, event.id, "NO_INTEGRATION", "Could not find or create integration");
          stats.errors++;
          continue;
        }

        // Check if integration is active
        if (integration.status !== "active") {
          await markEventError(supabase, event.id, "INTEGRATION_INACTIVE", `Status: ${integration.status}`);
          stats.skipped++;
          continue;
        }

        // Check daily limit
        const featureFlags = integration.feature_flags || {};
        const dailyLimit = featureFlags.daily_event_limit || 500;

        // Reset counter if needed
        const resetAt = integration.daily_events_reset_at
          ? new Date(integration.daily_events_reset_at)
          : null;
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        let currentCount = integration.daily_events_count || 0;
        if (!resetAt || resetAt < today) {
          // Reset counter
          currentCount = 0;
          await supabase
            .from("ml_integrations")
            .update({
              daily_events_count: 0,
              daily_events_reset_at: today.toISOString(),
            })
            .eq("id", integration.id);
        }

        if (currentCount >= dailyLimit) {
          // Over limit - reschedule for tomorrow
          const tomorrow = new Date(today);
          tomorrow.setDate(tomorrow.getDate() + 1);
          tomorrow.setHours(6, 0, 0, 0); // 6am next day

          await supabase
            .from("webhook_events")
            .update({
              status: "pending",
              next_retry_at: tomorrow.toISOString(),
              last_error: "daily_limit_exceeded",
            })
            .eq("id", event.id);

          console.log(`[ml-worker] Daily limit exceeded for ${event.ml_user_id}, rescheduled to ${tomorrow.toISOString()}`);
          stats.rate_limited++;
          continue;
        }

        // Check if feature is enabled for this topic
        const topicFeatureMap: Record<string, keyof typeof featureFlags> = {
          "items": "can_sync_items",
          "orders_v2": "can_sync_orders",
          "orders": "can_sync_orders",
          "messages": "can_sync_messages",
          "questions": "can_sync_questions",
        };

        const featureKey = topicFeatureMap[event.topic];
        if (featureKey && !featureFlags[featureKey]) {
          // Feature not enabled, mark as skipped
          await supabase
            .from("webhook_events")
            .update({
              status: "skipped",
              last_error: "feature_not_enabled",
              processed_at: new Date().toISOString(),
            })
            .eq("id", event.id);

          await logEvent(supabase, event.id, "info", `Feature ${String(featureKey)} not enabled, skipping`);
          stats.skipped++;
          continue;
        }

        // Process based on topic
        let processResult: ProcessResult;

        switch (event.topic) {
          case "items":
            processResult = await processItemEvent(supabase, event, integration);
            break;
          case "orders_v2":
          case "orders":
            processResult = await processOrderEvent(supabase, event, integration);
            break;
          case "messages":
            processResult = await processMessageEvent(supabase, event, integration);
            break;
          case "questions":
            processResult = await processQuestionEvent(supabase, event, integration);
            break;
          default:
            processResult = { success: true }; // Unknown topic, mark as done
            await logEvent(supabase, event.id, "warn", `Unknown topic: ${event.topic}, marking as done`);
        }

        if (processResult.success) {
          await supabase
            .from("webhook_events")
            .update({
              status: "done",
              processed_at: new Date().toISOString(),
            })
            .eq("id", event.id);

          // Increment daily counter
          await supabase
            .from("ml_integrations")
            .update({ daily_events_count: currentCount + 1 })
            .eq("id", integration.id);

          stats.success++;
        } else {
          await handleEventRetry(supabase, event, processResult.error || "Unknown error");
          stats.errors++;
        }

      } catch (eventError) {
        console.error(`[ml-worker] Error processing event ${event.id}:`, eventError);
        await handleEventRetry(supabase, event, String(eventError));
        stats.errors++;
      }

      // Small delay between events to avoid overwhelming the ML API
      await sleep(100);
    }

    const duration = Date.now() - startTime;
    console.log(`[ml-worker] Completed in ${duration}ms:`, stats);

    return new Response(JSON.stringify({
      status: "completed",
      stats,
      duration_ms: duration,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("[ml-worker] Fatal error:", error);
    return new Response(JSON.stringify({ error: String(error) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

// Helper functions
async function markEventError(supabase: SupabaseAny, eventId: string, code: string, message: string) {
  await supabase
    .from("webhook_events")
    .update({
      status: "error",
      error_code: code,
      last_error: message,
      processed_at: new Date().toISOString(),
    })
    .eq("id", eventId);

  await logEvent(supabase, eventId, "error", message);
}

async function handleEventRetry(supabase: SupabaseAny, event: WebhookEvent, error: string) {
  const newAttempts = (event.attempts || 0) + 1;

  if (newAttempts >= MAX_ATTEMPTS) {
    await markEventError(supabase, event.id, "MAX_RETRIES", error);
    return;
  }

  const delayMinutes = RETRY_DELAYS[newAttempts - 1] || 360;
  const nextRetry = new Date(Date.now() + delayMinutes * 60 * 1000);

  await supabase
    .from("webhook_events")
    .update({
      status: "pending",
      attempts: newAttempts,
      next_retry_at: nextRetry.toISOString(),
      last_error: error,
    })
    .eq("id", event.id);

  console.log(`[ml-worker] Event ${event.id} scheduled for retry at ${nextRetry.toISOString()} (attempt ${newAttempts})`);
}

async function logEvent(supabase: SupabaseAny, eventId: string, level: string, message: string, details?: unknown) {
  await supabase.from("webhook_event_logs").insert({
    event_id: eventId,
    level,
    message,
    details: details || null,
  });
}

// Topic processors
async function processItemEvent(
  supabase: SupabaseAny,
  event: WebhookEvent,
  integration: MlIntegration
): Promise<ProcessResult> {
  const resource = event.resource; // e.g., "/items/MLB12345"
  const itemIdMatch = resource.match(/\/items\/(MLB\d+)/);

  if (!itemIdMatch) {
    return { success: false, error: "Invalid resource format" };
  }

  const itemId = itemIdMatch[1];
  console.log(`[ml-worker] Processing item event for ${itemId}`);

  // Get access token
  const { data: mlAccount } = await supabase
    .from("ml_accounts")
    .select("access_token, refresh_token")
    .eq("ml_user_id", event.ml_user_id)
    .eq("is_active", true)
    .single();

  if (!mlAccount) {
    return { success: false, error: "No active ML account" };
  }

  // Fetch item from ML API
  const itemResponse = await fetch(`https://api.mercadolibre.com/items/${itemId}`, {
    headers: { "Authorization": `Bearer ${mlAccount.access_token}` },
  });

  if (!itemResponse.ok) {
    if (itemResponse.status === 401) {
      return { success: false, error: "TOKEN_EXPIRED" };
    }
    if (itemResponse.status === 429) {
      return { success: false, error: "RATE_LIMITED" };
    }
    const errorText = await itemResponse.text();
    return { success: false, error: `ML_API_${itemResponse.status}: ${errorText.substring(0, 200)}` };
  }

  const itemData = await itemResponse.json();

  // Upsert to meli_listings_cache
  const { error: upsertError } = await supabase
    .from("meli_listings_cache")
    .upsert({
      user_id: integration.user_id,
      seller_id: event.ml_user_id,
      item_id: itemId,
      variation_id: "",
      title: itemData.title,
      category_id: itemData.category_id,
      price: itemData.price,
      currency_id: itemData.currency_id,
      available_quantity: itemData.available_quantity,
      status: itemData.status,
      listing_type_id: itemData.listing_type_id,
      permalink: itemData.permalink,
      thumbnail: itemData.thumbnail,
      condition: itemData.condition,
      catalog_product_id: itemData.catalog_product_id,
      last_sync_at: new Date().toISOString(),
      raw_attributes: itemData.attributes,
      raw_pictures: itemData.pictures,
    }, {
      onConflict: "seller_id,item_id,variation_id",
    });

  if (upsertError) {
    return { success: false, error: `DB_UPSERT: ${upsertError.message}` };
  }

  await logEvent(supabase, event.id, "info", `Item ${itemId} synced successfully`);
  return { success: true };
}

async function processOrderEvent(
  supabase: SupabaseAny,
  event: WebhookEvent,
  _integration: MlIntegration
): Promise<ProcessResult> {
  // Orders processing - log and mark for manual sync
  // Full implementation would fetch order details and update meli_orders_cache
  console.log(`[ml-worker] Order event received: ${event.resource}`);
  await logEvent(supabase, event.id, "info", "Order event received, triggering background sync");
  
  // Mark as success - the nightly/hourly sync will pick up the actual data
  return { success: true };
}

async function processMessageEvent(
  supabase: SupabaseAny,
  event: WebhookEvent,
  _integration: MlIntegration
): Promise<ProcessResult> {
  console.log(`[ml-worker] Message event received: ${event.resource}`);
  await logEvent(supabase, event.id, "info", "Message event received");
  return { success: true };
}

async function processQuestionEvent(
  supabase: SupabaseAny,
  event: WebhookEvent,
  _integration: MlIntegration
): Promise<ProcessResult> {
  console.log(`[ml-worker] Question event received: ${event.resource}`);
  await logEvent(supabase, event.id, "info", "Question event received");
  return { success: true };
}
