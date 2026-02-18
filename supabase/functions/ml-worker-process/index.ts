import { createClient, SupabaseClient } from "npm:@supabase/supabase-js@2";

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
    can_sync_shipments?: boolean;
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

  // Validate internal key for security (supports x-internal-key for webhooks, x-cron-key for cron jobs)
  const internalKey = req.headers.get("x-internal-key");
  const cronKey = req.headers.get("x-cron-key");
  const CRON_SECRET = Deno.env.get("CRON_JOB_SECRET") || "default-cron-secret";
  if (internalKey !== INTERNAL_KEY && cronKey !== CRON_SECRET) {
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
                can_sync_shipments: true,
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
          "shipments": "can_sync_shipments",
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
          case "shipments":
            processResult = await processShipmentEvent(supabase, event, integration);
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

// Helper: Get company name for notifications
async function getCompanyNameForAccount(supabase: SupabaseAny, mlUserId: string): Promise<{ userId: string; companyName: string } | null> {
  const { data: account } = await supabase
    .from("ml_accounts")
    .select("user_id, nickname, company_id")
    .eq("ml_user_id", mlUserId)
    .maybeSingle();

  if (!account) return null;

  let companyName = account.nickname || "sua empresa";
  if (account.company_id) {
    const { data: company } = await supabase
      .from("companies")
      .select("display_name")
      .eq("id", account.company_id)
      .maybeSingle();
    if (company?.display_name) companyName = company.display_name;
  }
  return { userId: account.user_id, companyName };
}

// Helper: Create or update notification (deduplicated by group_key)
async function upsertNotification(
  supabase: SupabaseAny,
  userId: string,
  sellerId: string,
  companyName: string,
  type: "question" | "message",
  count: number,
) {
  const today = new Date().toISOString().split("T")[0];
  const groupKey = type === "question"
    ? `qa_pending_${sellerId}_${today}`
    : `post_sale_new_${sellerId}_${today}`;

  const title = type === "question"
    ? `Verifique a caixa de perguntas, tem algo a responder na ${companyName}`
    : `Opa, chegou mensagem para você na empresa ${companyName}`;

  const body = type === "question"
    ? `${count} pergunta(s) pendente(s)`
    : `${count} mensagem(ns) não lida(s)`;

  const category = type === "question" ? "qa_pending" : "post_sale_blocked";
  const priority = type === "question" ? "high" : "normal";
  const actionUrl = type === "question" ? "/perguntas" : "/mensagens-pos-venda";

  const { data: existing } = await supabase
    .from("app_notifications")
    .select("id")
    .eq("group_key", groupKey)
    .eq("is_dismissed", false)
    .maybeSingle();

  if (existing) {
    await supabase.from("app_notifications").update({ body, title }).eq("id", existing.id);
    console.log(`[ml-worker] Updated notification ${existing.id} for ${type}`);
  } else {
    await supabase.from("app_notifications").insert({
      user_id: userId,
      seller_id: sellerId,
      title,
      body,
      category,
      priority,
      action_url: actionUrl,
      group_key: groupKey,
      origin_module: type === "question" ? "qa" : "post_sale",
    });
    console.log(`[ml-worker] Created notification for ${type}`);
  }
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
  integration: MlIntegration
): Promise<ProcessResult> {
  const resource = event.resource; // e.g., "/orders/12345"
  const orderIdMatch = resource.match(/\/orders\/(\d+)/);

  if (!orderIdMatch) {
    console.log(`[ml-worker] Order event received but could not parse order ID from: ${resource}`);
    await logEvent(supabase, event.id, "info", "Order event received, no order ID extracted");
    return { success: true };
  }

  const orderId = orderIdMatch[1];
  console.log(`[ml-worker] Processing order event for order ${orderId} (seller ${event.ml_user_id})`);

  // Get access token
  const { data: mlAccount } = await supabase
    .from("ml_accounts")
    .select("id, access_token, refresh_token, ml_user_id")
    .eq("ml_user_id", event.ml_user_id)
    .eq("is_active", true)
    .maybeSingle();

  if (!mlAccount?.access_token) {
    await logEvent(supabase, event.id, "warn", "No active ML account for order processing");
    return { success: true }; // Don't retry - account issue
  }

  // Fetch order details from ML API
  let orderData: Record<string, unknown>;
  try {
    const orderResponse = await fetch(`https://api.mercadolibre.com/orders/${orderId}`, {
      headers: { Authorization: `Bearer ${mlAccount.access_token}` },
    });

    if (!orderResponse.ok) {
      if (orderResponse.status === 401) return { success: false, error: "TOKEN_EXPIRED" };
      if (orderResponse.status === 404) {
        await logEvent(supabase, event.id, "warn", `Order ${orderId} not found`);
        return { success: true };
      }
      return { success: false, error: `ML_API_${orderResponse.status}` };
    }

    orderData = await orderResponse.json();
  } catch (err) {
    return { success: false, error: `Fetch order failed: ${String(err)}` };
  }

  const orderStatus = orderData.status as string;
  const shipping = orderData.shipping as Record<string, unknown> | undefined;
  const shippingId = shipping?.id ? String(shipping.id) : null;
  const buyer = orderData.buyer as Record<string, unknown> | undefined;
  const orderItems = orderData.order_items as Array<{ item: { id: string; title: string; variation_id?: number }; quantity: number; unit_price: number; full_unit_price?: number; currency_id?: string }> | undefined;

  // ===== PART 1: Upsert order into meli_orders_cache (ALL statuses) =====
  try {
    const totalAmount = (orderData.total_amount as number) || 0;
    const itemsCount = orderItems?.length || 0;

    const { error: orderCacheError } = await supabase
      .from("meli_orders_cache")
      .upsert({
        user_id: integration.user_id,
        seller_id: event.ml_user_id,
        order_id: orderId,
        created_at_meli: orderData.date_created || new Date().toISOString(),
        order_status: orderStatus,
        shipment_id: shippingId,
        buyer_nickname: (buyer?.nickname as string) || null,
        buyer_name: [buyer?.first_name, buyer?.last_name].filter(Boolean).join(" ") || null,
        total_amount: totalAmount,
        items_count: itemsCount,
        last_sync_at: new Date().toISOString(),
      }, { onConflict: "seller_id,order_id" });

    if (orderCacheError) {
      console.error(`[ml-worker] Order cache upsert error for ${orderId}:`, orderCacheError.message);
    } else {
      console.log(`[ml-worker] Order ${orderId} cached (status: ${orderStatus})`);
    }
  } catch (cacheErr) {
    console.error(`[ml-worker] Order cache error:`, cacheErr);
  }

  // ===== PART 2: Upsert order items into meli_order_items_cache =====
  if (orderItems && orderItems.length > 0) {
    try {
      const itemRows = orderItems.map((oi) => ({
        seller_id: event.ml_user_id,
        order_id: orderId,
        item_id: oi.item?.id || "",
        variation_id: oi.item?.variation_id ? String(oi.item.variation_id) : null,
        title: oi.item?.title || "",
        quantity: oi.quantity || 1,
        unit_price: oi.unit_price || 0,
        full_unit_price: oi.full_unit_price || oi.unit_price || 0,
        currency_id: oi.currency_id || "BRL",
        last_sync_at: new Date().toISOString(),
      }));

      const { error: itemsCacheError } = await supabase
        .from("meli_order_items_cache")
        .upsert(itemRows, { onConflict: "seller_id,order_id,item_id" });

      if (itemsCacheError) {
        console.error(`[ml-worker] Order items cache error for ${orderId}:`, itemsCacheError.message);
      } else {
        console.log(`[ml-worker] ${itemRows.length} item(s) cached for order ${orderId}`);
      }
    } catch (itemsErr) {
      console.error(`[ml-worker] Order items cache error:`, itemsErr);
    }
  }

  // ===== PART 3: Fetch and upsert shipment into meli_shipments_cache =====
  if (shippingId) {
    try {
      const shipResponse = await fetch(`https://api.mercadolibre.com/shipments/${shippingId}`, {
        headers: { Authorization: `Bearer ${mlAccount.access_token}` },
      });

      if (shipResponse.ok) {
        const shipData = await shipResponse.json();
        const receiverAddress = shipData.receiver_address || {};
        const labelAvailable = shipData.substatus === "ready_to_print" || shipData.substatus === "printed";

        const { error: shipCacheError } = await supabase
          .from("meli_shipments_cache")
          .upsert({
            user_id: integration.user_id,
            seller_id: event.ml_user_id,
            shipment_id: shippingId,
            shipment_status: shipData.status,
            shipment_substatus: shipData.substatus || null,
            tracking_number: shipData.tracking_number || null,
            receiver_name: receiverAddress.receiver_name || null,
            logistic_type: shipData.logistic_type || null,
            label_available: labelAvailable,
            last_sync_at: new Date().toISOString(),
          }, { onConflict: "seller_id,shipment_id" });

        if (shipCacheError) {
          console.error(`[ml-worker] Shipment cache error for ${shippingId}:`, shipCacheError.message);
        } else {
          console.log(`[ml-worker] Shipment ${shippingId} cached (${shipData.status}/${shipData.substatus})`);
        }
      } else if (shipResponse.status !== 404) {
        console.warn(`[ml-worker] Shipment ${shippingId} fetch failed: ${shipResponse.status}`);
      }
    } catch (shipErr) {
      console.error(`[ml-worker] Shipment sync error:`, shipErr);
    }
  }

  // ===== PART 4: Automation (welcome messages) — only for paid orders =====
  if (orderStatus !== "paid") {
    await logEvent(supabase, event.id, "info", `Order ${orderId} cached (status: ${orderStatus}), skipping automation`);
    return { success: true };
  }

  // Check shipping status — only create drafts for orders not yet shipped
  const shippingStatus = (shipping?.status as string) || null;
  const allowedShippingStatuses = [null, "pending", "to_be_agreed"];
  
  if (shippingStatus && !allowedShippingStatuses.includes(shippingStatus)) {
    console.log(`[ml-worker] Order ${orderId} has shipping status "${shippingStatus}", skipping welcome message`);
    await logEvent(supabase, event.id, "info", `Order ${orderId} shipping status is "${shippingStatus}" (already in transit/delivered), skipping automation`);
    return { success: true };
  }

  console.log(`[ml-worker] Order ${orderId} shipping status: ${shippingStatus || "none"} — eligible for automation`);

  // Check for active automation rules for "venda_confirmada"
  const { data: rules, error: rulesError } = await supabase
    .from("post_sale_automation_rules")
    .select("id, template_id, require_approval, wait_for_buyer_response, seller_id")
    .eq("seller_id", event.ml_user_id)
    .eq("is_active", true);

  if (rulesError) {
    console.error(`[ml-worker] Error fetching automation rules:`, rulesError.message);
    return { success: true }; // Don't block on rule fetch failure
  }

  if (!rules || rules.length === 0) {
    await logEvent(supabase, event.id, "info", `No active automation rules for seller ${event.ml_user_id}`);
    return { success: true };
  }

  console.log(`[ml-worker] Found ${rules.length} automation rule(s) for seller ${event.ml_user_id}`);

  // Check if we already processed this order (prevent duplicates)
  const { data: existingMessage } = await supabase
    .from("post_sale_messages")
    .select("id")
    .eq("order_id", orderId)
    .eq("seller_id", event.ml_user_id)
    .eq("trigger_event", "venda_confirmada")
    .maybeSingle();

  if (existingMessage) {
    await logEvent(supabase, event.id, "info", `Order ${orderId} already has a welcome message, skipping`);
    return { success: true };
  }

  // Process each rule
  for (const rule of rules as { id: string; template_id: string; require_approval: boolean; wait_for_buyer_response: boolean; seller_id: string }[]) {
    // Fetch the template
    const { data: template, error: templateError } = await supabase
      .from("post_sale_templates")
      .select("id, name, trigger_event, content, message_type, is_active")
      .eq("id", rule.template_id)
      .eq("is_active", true)
      .maybeSingle();

    if (templateError || !template) {
      console.log(`[ml-worker] Template ${rule.template_id} not found or inactive`);
      continue;
    }

    // Only process templates for "venda_confirmada"
    if (template.trigger_event !== "venda_confirmada") {
      continue;
    }

    // Interpolate variables in template content (buyer/orderItems already in scope)
    const buyerFirstName = (buyer?.first_name as string) || (buyer?.nickname as string) || "Comprador";
    const buyerName = [buyer?.first_name, buyer?.last_name].filter(Boolean).join(" ") || (buyer?.nickname as string) || "Comprador";
    const itemTitle = orderItems?.[0]?.item?.title || "seu produto";

    let messageContent = template.content
      .replace(/\{\{nome_comprador\}\}/gi, buyerName)
      .replace(/\{\{primeiro_nome\}\}/gi, buyerFirstName)
      .replace(/\{\{produto\}\}/gi, itemTitle)
      .replace(/\{\{numero_pedido\}\}/gi, orderId);

    // Validate content against blocked patterns
    const { data: patterns } = await supabase
      .from("post_sale_blocked_patterns")
      .select("pattern, pattern_type, category, description")
      .eq("is_active", true);

    let isBlocked = false;
    let blockReason = "";
    const blockDetails: { category: string; match: string }[] = [];

    for (const pattern of (patterns || []) as { pattern: string; pattern_type: string; category: string; description?: string }[]) {
      try {
        let matches = false;
        if (pattern.pattern_type === "regex") {
          matches = new RegExp(pattern.pattern, "gi").test(messageContent);
        } else if (pattern.pattern_type === "contains") {
          matches = messageContent.toLowerCase().includes(pattern.pattern.toLowerCase());
        }
        if (matches) {
          isBlocked = true;
          blockReason = pattern.description || `Conteúdo bloqueado: ${pattern.category}`;
          blockDetails.push({ category: pattern.category, match: pattern.pattern });
        }
      } catch { /* invalid pattern */ }
    }

    // Truncate to ML character limit
    if (messageContent.length > 350) {
      messageContent = messageContent.substring(0, 347) + "...";
    }

    // Determine pack_id and buyer_id
    const packId = orderData.pack_id ? String(orderData.pack_id) : orderId;
    const buyerId = buyer?.id ? String(buyer.id) : null;

    if (isBlocked) {
      // Save as blocked draft
      await supabase.from("post_sale_messages").insert({
        user_id: integration.user_id,
        seller_id: event.ml_user_id,
        order_id: orderId,
        pack_id: orderData.pack_id ? String(orderData.pack_id) : null,
        buyer_id: buyerId,
        buyer_name: buyerName,
        listing_id: orderItems?.[0]?.item?.id || null,
        listing_title: itemTitle,
        template_id: template.id,
        trigger_event: "venda_confirmada",
        message_type: template.message_type,
        content_sent: messageContent,
        status: "bloqueada",
        block_reason: blockReason,
        block_details: blockDetails,
      } as never);

      console.log(`[ml-worker] Welcome message BLOCKED for order ${orderId}: ${blockReason}`);
      await logEvent(supabase, event.id, "warn", `Welcome message blocked: ${blockReason}`);
      continue;
    }

    if (rule.require_approval) {
      // Save as pending draft for manual approval
      await supabase.from("post_sale_messages").insert({
        user_id: integration.user_id,
        seller_id: event.ml_user_id,
        order_id: orderId,
        pack_id: orderData.pack_id ? String(orderData.pack_id) : null,
        buyer_id: buyerId,
        buyer_name: buyerName,
        listing_id: orderItems?.[0]?.item?.id || null,
        listing_title: itemTitle,
        template_id: template.id,
        trigger_event: "venda_confirmada",
        message_type: template.message_type,
        content_sent: messageContent,
        status: "pendente",
      } as never);

      console.log(`[ml-worker] Welcome message saved as PENDING for order ${orderId} (requires approval)`);
      await logEvent(supabase, event.id, "info", `Welcome message queued for approval (order ${orderId})`);

      // Create notification about pending approval
      const accountInfo = await getCompanyNameForAccount(supabase, event.ml_user_id);
      if (accountInfo) {
        const { count } = await supabase
          .from("post_sale_messages")
          .select("id", { count: "exact", head: true })
          .eq("seller_id", event.ml_user_id)
          .eq("status", "pendente");

        const today = new Date().toISOString().split("T")[0];
        const groupKey = `post_sale_pending_${event.ml_user_id}_${today}`;

        const { data: existing } = await supabase
          .from("app_notifications")
          .select("id")
          .eq("group_key", groupKey)
          .eq("is_dismissed", false)
          .maybeSingle();

        const notifTitle = `Mensagem de boas-vindas pendente na ${accountInfo.companyName}`;
        const notifBody = `${count || 1} mensagem(ns) aguardando aprovação`;

        if (existing) {
          await supabase.from("app_notifications").update({ body: notifBody, title: notifTitle }).eq("id", existing.id);
        } else {
          await supabase.from("app_notifications").insert({
            user_id: accountInfo.userId,
            seller_id: event.ml_user_id,
            title: notifTitle,
            body: notifBody,
            category: "post_sale_blocked",
            priority: "normal",
            action_url: "/mensagens-pos-venda",
            group_key: groupKey,
            origin_module: "post_sale",
          });
        }
      }
    } else {
      // Auto-send via Action Guide API
      console.log(`[ml-worker] Auto-sending welcome message for order ${orderId} via Action Guide`);

      try {
        // First, ensure conversation exists in our DB
        await supabase.from("post_sale_conversations").upsert({
          user_id: integration.user_id,
          seller_id: event.ml_user_id,
          order_id: orderId,
          pack_id: orderData.pack_id ? String(orderData.pack_id) : null,
          buyer_id: buyerId,
          buyer_name: buyerName,
          item_title: itemTitle,
          conversation_status: "active",
          unread_count: 0,
          updated_at: new Date().toISOString(),
        } as never, { onConflict: "seller_id,order_id" });

        // Send via Action Guide API directly
        const actionGuideUrl = `https://api.mercadolibre.com/messages/action_guide/packs/${packId}/sellers/${event.ml_user_id}`;
        const actionGuidePayload = {
          from: { user_id: parseInt(event.ml_user_id, 10) },
          to: { user_id: buyerId ? parseInt(buyerId, 10) : 0 },
          text: messageContent,
          reason: "DELIVERY_PROMISE",
        };

        const sendResponse = await fetch(actionGuideUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${mlAccount.access_token}`,
          },
          body: JSON.stringify(actionGuidePayload),
        });

        const sendResponseText = await sendResponse.text();

        if (sendResponse.ok) {
          const sendData = JSON.parse(sendResponseText);
          
          // Save as sent
          await supabase.from("post_sale_messages").insert({
            user_id: integration.user_id,
            seller_id: event.ml_user_id,
            order_id: orderId,
            pack_id: orderData.pack_id ? String(orderData.pack_id) : null,
            buyer_id: buyerId,
            buyer_name: buyerName,
            listing_id: orderItems?.[0]?.item?.id || null,
            listing_title: itemTitle,
            template_id: template.id,
            trigger_event: "venda_confirmada",
            message_type: template.message_type,
            content_sent: messageContent,
            status: "enviada",
            ml_message_id: sendData.id || null,
            sent_at: new Date().toISOString(),
          } as never);

          console.log(`[ml-worker] Welcome message SENT for order ${orderId}, ML message ID: ${sendData.id}`);
          await logEvent(supabase, event.id, "info", `Welcome message sent for order ${orderId}`);

          // Auto-resolve post_sale_blocked notifications if no more pending drafts
          const { count: pendingCount } = await supabase
            .from("post_sale_messages")
            .select("*", { count: "exact", head: true })
            .eq("seller_id", event.ml_user_id)
            .eq("is_visible", true)
            .in("status", ["pendente", "rascunho"]);
          if (pendingCount === 0) {
            await supabase
              .from("app_notifications")
              .update({ is_actioned: true, read_at: new Date().toISOString() })
              .eq("seller_id", event.ml_user_id)
              .eq("category", "post_sale_blocked")
              .eq("is_actioned", false);
            console.log(`[ml-worker] Auto-resolved post_sale_blocked notifications for seller ${event.ml_user_id}`);
          }
        } else {
          console.error(`[ml-worker] Action Guide API failed ${sendResponse.status}: ${sendResponseText.substring(0, 300)}`);
          
          // Save as pending for manual review
          await supabase.from("post_sale_messages").insert({
            user_id: integration.user_id,
            seller_id: event.ml_user_id,
            order_id: orderId,
            pack_id: orderData.pack_id ? String(orderData.pack_id) : null,
            buyer_id: buyerId,
            buyer_name: buyerName,
            listing_id: orderItems?.[0]?.item?.id || null,
            listing_title: itemTitle,
            template_id: template.id,
            trigger_event: "venda_confirmada",
            message_type: template.message_type,
            content_sent: messageContent,
            status: "pendente",
            block_reason: `Erro API ML: ${sendResponse.status}`,
            block_details: { api_status: sendResponse.status, response: sendResponseText.substring(0, 500) },
          } as never);

          await logEvent(supabase, event.id, "warn", `Action Guide failed for order ${orderId}: ${sendResponse.status}`);
        }
      } catch (sendErr) {
        console.error(`[ml-worker] Error sending welcome message:`, sendErr);
        await logEvent(supabase, event.id, "error", `Send error for order ${orderId}: ${String(sendErr)}`);
      }
    }
  }

  return { success: true };
}

async function processMessageEvent(
  supabase: SupabaseAny,
  event: WebhookEvent,
  integration: MlIntegration
): Promise<ProcessResult> {
  console.log(`[ml-worker] Processing message event: ${event.resource}`);

  // Get access token
  const { data: mlAccount } = await supabase
    .from("ml_accounts")
    .select("access_token, ml_user_id")
    .eq("ml_user_id", event.ml_user_id)
    .eq("is_active", true)
    .maybeSingle();

  if (!mlAccount?.access_token) {
    return { success: false, error: "No active ML account or token" };
  }

  // Try to fetch the resource from ML
  try {
    const resourceUrl = `https://api.mercadolibre.com${event.resource}`;
    const response = await fetch(resourceUrl, {
      headers: { Authorization: `Bearer ${mlAccount.access_token}` },
    });

    if (!response.ok) {
      if (response.status === 401) return { success: false, error: "TOKEN_EXPIRED" };
      if (response.status === 404) {
        await logEvent(supabase, event.id, "warn", `Message resource not found: ${event.resource}`);
        return { success: true };
      }
      await logEvent(supabase, event.id, "warn", `Message API error: ${response.status}`);
      return { success: true }; // Don't retry – polling will catch it
    }

    // Create notification about potential new message
    const accountInfo = await getCompanyNameForAccount(supabase, event.ml_user_id);
    if (accountInfo) {
      const { data: convs } = await supabase
        .from("post_sale_conversations")
        .select("unread_count")
        .eq("seller_id", event.ml_user_id)
        .gt("unread_count", 0);

      const totalUnread = ((convs || []) as any[]).reduce((s: number, c: any) => s + (c.unread_count || 0), 0) + 1;

      await upsertNotification(supabase, accountInfo.userId, event.ml_user_id, accountInfo.companyName, "message", totalUnread);
    }
  } catch (err) {
    console.error(`[ml-worker] Error processing message event:`, err);
  }

  await logEvent(supabase, event.id, "info", `Message event processed: ${event.resource}`);
  return { success: true };
}

async function processQuestionEvent(
  supabase: SupabaseAny,
  event: WebhookEvent,
  integration: MlIntegration
): Promise<ProcessResult> {
  const match = event.resource.match(/\/questions\/(\d+)/);
  if (!match) {
    return { success: false, error: "Invalid resource format for question" };
  }

  const questionId = match[1];
  console.log(`[ml-worker] Processing question ${questionId}`);

  // Get access token
  const { data: mlAccount } = await supabase
    .from("ml_accounts")
    .select("access_token, refresh_token, ml_user_id")
    .eq("ml_user_id", event.ml_user_id)
    .eq("is_active", true)
    .maybeSingle();

  if (!mlAccount?.access_token) {
    return { success: false, error: "No active ML account or token" };
  }

  // Fetch question from ML API
  const response = await fetch(`https://api.mercadolibre.com/questions/${questionId}`, {
    headers: { Authorization: `Bearer ${mlAccount.access_token}` },
  });

  if (!response.ok) {
    if (response.status === 401) return { success: false, error: "TOKEN_EXPIRED" };
    if (response.status === 404) {
      await logEvent(supabase, event.id, "warn", `Question ${questionId} not found (deleted)`);
      return { success: true };
    }
    return { success: false, error: `ML_API_${response.status}` };
  }

  const q = await response.json();

  // Risk analysis
  const analyzeRisk = (text: string) => {
    const reasons: string[] = [];
    let level = "low";
    const highP = [
      { p: /whats|telefone|liga|chama|contato/i, r: "Pedido de contato externo" },
      { p: /reclama|denunci|advogado|procon|processo/i, r: "Possível ameaça legal" },
    ];
    const medP = [
      { p: /troca|devolu[çc][aã]o|quebr|defeito|problema/i, r: "Potencial problema" },
      { p: /prazo|demora|atraso|quando.*chega/i, r: "Dúvida sobre prazo" },
    ];
    for (const { p, r } of highP) if (p.test(text)) { level = "high"; reasons.push(r); }
    if (level !== "high") for (const { p, r } of medP) if (p.test(text)) { level = "medium"; reasons.push(r); }
    return { level, reasons };
  };

  const risk = analyzeRisk(q.text || "");
  const slaDeadline = new Date(q.date_created);
  slaDeadline.setHours(slaDeadline.getHours() + 15);
  const isSlaBreached = slaDeadline < new Date() && !q.answer;
  const status = q.answer ? "answered" : q.status === "DELETED" ? "deleted" : "pending";

  // Upsert question
  const { error: upsertError } = await supabase
    .from("qa_questions")
    .upsert({
      user_id: integration.user_id,
      seller_id: event.ml_user_id,
      ml_question_id: String(q.id),
      ml_item_id: q.item_id,
      ml_buyer_id: String(q.from?.id),
      question_text: q.text,
      status,
      risk_level: risk.level,
      risk_reasons: risk.reasons,
      question_date: q.date_created,
      answered_at: q.answer?.date_created || null,
      sla_deadline: slaDeadline.toISOString(),
      is_sla_breached: isSlaBreached,
      needs_attention: risk.level === "high" || isSlaBreached,
      updated_at: new Date().toISOString(),
    } as never, { onConflict: "ml_question_id" });

  if (upsertError) {
    return { success: false, error: `DB_UPSERT: ${upsertError.message}` };
  }

  // Create notification if UNANSWERED
  if (status === "pending") {
    try {
      const accountInfo = await getCompanyNameForAccount(supabase, event.ml_user_id);
      if (accountInfo) {
        const { count } = await supabase
          .from("qa_questions")
          .select("id", { count: "exact", head: true })
          .eq("seller_id", event.ml_user_id)
          .eq("status", "pending");

        await upsertNotification(supabase, accountInfo.userId, event.ml_user_id, accountInfo.companyName, "question", count || 1);
      }
    } catch (notifErr) {
      console.error(`[ml-worker] Notification error:`, notifErr);
    }
  }

  await logEvent(supabase, event.id, "info", `Question ${questionId} synced (${status})`);
  return { success: true };
}

async function processShipmentEvent(
  supabase: SupabaseAny,
  event: WebhookEvent,
  integration: MlIntegration
): Promise<ProcessResult> {
  const shipmentIdMatch = event.resource.match(/\/shipments\/(\d+)/);

  if (!shipmentIdMatch) {
    await logEvent(supabase, event.id, "warn", `Could not parse shipment ID from: ${event.resource}`);
    return { success: true };
  }

  const shipmentId = shipmentIdMatch[1];
  console.log(`[ml-worker] Processing shipment event for ${shipmentId}`);

  // Get access token
  const { data: mlAccount } = await supabase
    .from("ml_accounts")
    .select("id, user_id, access_token, ml_user_id")
    .eq("ml_user_id", event.ml_user_id)
    .eq("is_active", true)
    .maybeSingle();

  if (!mlAccount?.access_token) {
    await logEvent(supabase, event.id, "warn", "No active ML account for shipment processing");
    return { success: true };
  }

  // Fetch shipment from ML API
  const response = await fetch(`https://api.mercadolibre.com/shipments/${shipmentId}`, {
    headers: { Authorization: `Bearer ${mlAccount.access_token}` },
  });

  if (!response.ok) {
    if (response.status === 401) return { success: false, error: "TOKEN_EXPIRED" };
    if (response.status === 404) {
      await logEvent(supabase, event.id, "warn", `Shipment ${shipmentId} not found`);
      return { success: true };
    }
    if (response.status === 429) return { success: false, error: "RATE_LIMITED" };
    return { success: false, error: `ML_API_${response.status}` };
  }

  const shipmentData = await response.json();

  // Extract relevant fields
  const receiverAddress = shipmentData.receiver_address || {};
  const receiverName = receiverAddress.receiver_name || shipmentData.receiver_id || null;
  const trackingNumber = shipmentData.tracking_number || null;
  const logisticType = shipmentData.logistic_type || null;
  const labelAvailable = shipmentData.substatus === "ready_to_print" || shipmentData.substatus === "printed";

  // Upsert to meli_shipments_cache
  const { error: upsertError } = await supabase
    .from("meli_shipments_cache")
    .upsert({
      user_id: integration.user_id,
      seller_id: event.ml_user_id,
      shipment_id: shipmentId,
      shipment_status: shipmentData.status,
      shipment_substatus: shipmentData.substatus || null,
      tracking_number: trackingNumber,
      receiver_name: receiverName,
      logistic_type: logisticType,
      label_available: labelAvailable,
      last_sync_at: new Date().toISOString(),
    }, {
      onConflict: "seller_id,shipment_id",
    });

  if (upsertError) {
    return { success: false, error: `DB_UPSERT: ${upsertError.message}` };
  }

  await logEvent(supabase, event.id, "info", `Shipment ${shipmentId} synced: ${shipmentData.status}/${shipmentData.substatus}`);
  return { success: true };
}
