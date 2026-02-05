import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface MeliMessage {
  id: string;
  from: { user_id: number; name?: string };
  to: { user_id: number };
  text?: string;
  message_date: { created: string; read?: string };
  status: string;
  moderation_status?: string;
  moderation_reason?: string;
  attachments?: Array<{ filename: string; size: string; type: string; original_filename: string }>;
}

interface MeliConversationResponse {
  paging: { limit: number; offset: number; total: number };
  conversation_status: { status: string; substatus?: string; status_date: string };
  messages: MeliMessage[];
  seller_max_chars: number;
}

interface MeliOrder {
  id: number;
  pack_id?: number;
  status: string;
  buyer: { id: number; nickname?: string; first_name?: string; last_name?: string };
  order_items?: Array<{ item: { id: string; title: string; thumbnail?: string } }>;
  shipping?: { id?: number };
  date_created: string;
}

function parseMessageText(text: unknown): string | null {
  if (typeof text === "string") return text;
  if (text && typeof text === "object") {
    const t = text as Record<string, unknown>;
    const plain = t.plain;
    if (typeof plain === "string") return plain;
    const value = t.text;
    if (typeof value === "string") return value;
  }
  return null;
}

function getCreatedAtFromMessage(msg: Record<string, unknown>): string | null {
  const md = msg.message_date;
  if (md && typeof md === "object") {
    const mdo = md as Record<string, unknown>;
    const created = mdo.created;
    if (typeof created === "string") return created;
    const received = mdo.received;
    if (typeof received === "string") return received;
    const available = mdo.available;
    if (typeof available === "string") return available;
  }
  const dateCreated = msg.date_created;
  if (typeof dateCreated === "string") return dateCreated;
  return null;
}

function errorResponse(error: string, errorCode: string, executionLogs: string[], statusCode = 200) {
  return new Response(JSON.stringify({ success: false, error, error_code: errorCode, execution_logs: executionLogs }), {
    status: statusCode,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function fetchWithRetry(url: string, options: RequestInit, log: (msg: string) => void, maxRetries = 2): Promise<Response> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const response = await fetch(url, options);
    if (response.status === 429) {
      const waitTime = Math.min(1000 * Math.pow(2, attempt), 5000);
      log(`Rate limit (429), waiting ${waitTime}ms, attempt ${attempt}/${maxRetries}`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
      continue;
    }
    return response;
  }
  throw new Error("Max retries exceeded");
}

/**
 * Get ML account credentials with proper ownership validation.
 * Prioritizes account_id (UUID) lookup, falls back to seller_id (ml_user_id).
 * Does NOT filter by is_active - uses connection_status instead.
 */
async function getMLAccountCredentials(
  supabase: any, // Use any to avoid Supabase client type issues
  userId: string,
  accountId: string | null,
  sellerId: string | null,
  log: (msg: string) => void
): Promise<{ account: Record<string, unknown> | null; error: string | null }> {
  // Prefer account_id lookup (UUID from ml_accounts)
  if (accountId) {
    log(`Looking up credentials by account_id: ${accountId}`);
    const { data, error } = await supabase
      .from("ml_accounts")
      .select("id, access_token, refresh_token, ml_user_id, token_expires_at, connection_status, user_id")
      .eq("id", accountId)
      .eq("user_id", userId) // Ownership validation
      .maybeSingle();

    if (error) {
      log(`Account lookup error: ${error.message}`);
      return { account: null, error: `Database error: ${error.message}` };
    }

    if (!data) {
      log(`Account not found or does not belong to user`);
      return { account: null, error: "Conta não encontrada ou não pertence a este usuário" };
    }

    const accountData = data as Record<string, unknown>;

    if (!accountData.access_token) {
      log(`Account has no access token`);
      return { account: null, error: "Conta sem token de acesso. Reconecte a conta." };
    }

    // Check connection status (not is_active)
    if (accountData.connection_status === 'disconnected' || accountData.connection_status === 'revoked') {
      log(`Account is disconnected: ${accountData.connection_status}`);
      return { account: null, error: "Conta desconectada. Reconecte no Mercado Livre." };
    }

    return { account: accountData, error: null };
  }

  // Fallback: lookup by seller_id (ml_user_id)
  if (sellerId) {
    log(`Looking up credentials by seller_id: ${sellerId}`);
    const { data, error } = await supabase
      .from("ml_accounts")
      .select("id, access_token, refresh_token, ml_user_id, token_expires_at, connection_status, user_id")
      .eq("ml_user_id", sellerId)
      .eq("user_id", userId) // Ownership validation
      .in("connection_status", ["connected", "attention"]) // Only valid connections
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      log(`Seller lookup error: ${error.message}`);
      return { account: null, error: `Database error: ${error.message}` };
    }

    if (!data) {
      log(`No valid account found for seller_id ${sellerId}`);
      return { account: null, error: "Conta do Mercado Livre não encontrada ou desconectada" };
    }

    const accountData = data as Record<string, unknown>;

    if (!accountData.access_token) {
      log(`Account has no access token`);
      return { account: null, error: "Conta sem token de acesso. Reconecte a conta." };
    }

    return { account: accountData, error: null };
  }

  return { account: null, error: "account_id ou seller_id é obrigatório" };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const executionLogs: string[] = [];
  const log = (msg: string) => { console.log(`[ml-sync-messages] ${msg}`); executionLogs.push(msg); };
  const startTime = Date.now();
  const MAX_EXECUTION_MS = 45000; // 45 seconds max

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const authHeader = req.headers.get("authorization");
    if (!authHeader) return errorResponse("Not authenticated", "AUTH_REQUIRED", executionLogs, 401);

    const { data: { user }, error: userError } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));
    if (userError || !user) return errorResponse("Invalid token", "INVALID_TOKEN", executionLogs, 401);

    log(`User authenticated: ${user.id}`);

    const { seller_id, account_id, days_back = 30, batch_size: rawBatchSize = 30 } = await req.json();
    const batch_size = Math.min(rawBatchSize, 50); // ML API limit is 50

    // Validate input - require at least one identifier
    if (!seller_id && !account_id) {
      return errorResponse("account_id ou seller_id é obrigatório", "MISSING_IDENTIFIER", executionLogs, 400);
    }

    log(`Starting sync with account_id=${account_id || 'N/A'}, seller_id=${seller_id || 'N/A'}, days_back=${days_back}, batch_size=${batch_size}`);

    // Get ML credentials using unified lookup
    const { account: mlAccount, error: credError } = await getMLAccountCredentials(
      supabase, user.id, account_id || null, seller_id || null, log
    );

    if (credError || !mlAccount) {
      return errorResponse(credError || "Conta não encontrada", "NO_ML_ACCOUNT", executionLogs);
    }

    // Extract seller_id from account (source of truth)
    const actualSellerId = mlAccount.ml_user_id as string;
    const sellerUserId = Number(actualSellerId);
    let accessToken = mlAccount.access_token as string;

    log(`Using account: ${mlAccount.id}, seller_id: ${actualSellerId}`);

    // Check if token is expired
    if (new Date(mlAccount.token_expires_at as string) <= new Date()) {
      log("Token expired, refreshing...");
      const refreshResponse = await fetch(`${supabaseUrl}/functions/v1/ml-token-refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: authHeader },
        body: JSON.stringify({ account_id: mlAccount.id, seller_id: actualSellerId }),
      });
      if (refreshResponse.ok) {
        const refreshData = await refreshResponse.json();
        if (refreshData.access_token) {
          accessToken = refreshData.access_token;
          log("Token refreshed");
        } else {
          return errorResponse("Token refresh failed", "TOKEN_REFRESH_FAILED", executionLogs);
        }
      } else {
        return errorResponse("Token refresh failed", "TOKEN_REFRESH_FAILED", executionLogs);
      }
    }

    const mlHeaders = { Authorization: `Bearer ${accessToken}` };

    // Sanity check: token must match seller_id
    try {
      const meResp = await fetchWithRetry("https://api.mercadolibre.com/users/me", { headers: mlHeaders }, log);
      if (meResp.ok) {
        const me = (await meResp.json()) as Record<string, unknown>;
        const meId = typeof me.id === "number" ? me.id : typeof me.id === "string" ? Number(me.id) : null;
        if (meId && meId !== sellerUserId) {
          log(`Token user mismatch: token belongs to ${meId} but account seller_id is ${sellerUserId}`);
          await supabase.from("post_sale_messages_sync_state").upsert({
            seller_id: actualSellerId,
            user_id: user.id,
            status: "error",
            cursor_offset: 0,
            last_error_code: "SELLER_TOKEN_MISMATCH",
            last_error_message: `A conta conectada não corresponde ao seller_id selecionado (token=${meId}, seller_id=${sellerUserId}). Refaça a conexão da conta correta.`,
            last_heartbeat_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          }, { onConflict: "seller_id,user_id" });

          return errorResponse(
            `Conta conectada não corresponde ao seller_id selecionado (token=${meId}, seller_id=${sellerUserId}). Refaça a conexão da conta correta.`,
            "SELLER_TOKEN_MISMATCH",
            executionLogs
          );
        }
      }
    } catch {
      // ignore sanity check failures
    }

    // Get or create sync state
    const { data: syncState } = await supabase
      .from("post_sale_messages_sync_state")
      .select("*")
      .eq("seller_id", actualSellerId)
      .eq("user_id", user.id)
      .maybeSingle();

    let cursorOffset = syncState?.cursor_offset || 0;
    const isResume = syncState?.status === "running" || syncState?.status === "paused";
    
    if (isResume) {
      log(`Resuming from offset ${cursorOffset}`);
    }

    // Upsert sync state as running
    await supabase.from("post_sale_messages_sync_state").upsert({
      seller_id: actualSellerId,
      user_id: user.id,
      status: "running",
      cursor_offset: cursorOffset,
      last_heartbeat_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }, { onConflict: "seller_id,user_id" });

    // Fetch orders from ML API with offset
    const messageThreshold = new Date();
    messageThreshold.setDate(messageThreshold.getDate() - days_back);

    const buildOrdersUrl = (dateFromISO: string | null) => {
      const base = `https://api.mercadolibre.com/orders/search?seller=${actualSellerId}&sort=date_desc&limit=${batch_size}&offset=${cursorOffset}`;
      if (!dateFromISO) return base;
      const dateFrom = dateFromISO.split("T")[0];
      return `${base}&order.date_created.from=${dateFrom}T00:00:00.000-00:00`;
    };

    const initialDateFrom = new Date(messageThreshold);
    const initialOrdersUrl = buildOrdersUrl(initialDateFrom.toISOString());

    log(`Fetching orders from offset ${cursorOffset}...`);
    let ordersResponse = await fetchWithRetry(initialOrdersUrl, { headers: mlHeaders }, log);
    
    if (!ordersResponse.ok) {
      const errorText = await ordersResponse.text();
      log(`ML Orders API error: ${ordersResponse.status}`);
      await supabase.from("post_sale_messages_sync_state").update({ 
        status: "error", 
        last_error_code: `ML_ORDERS_${ordersResponse.status}`,
        last_error_message: `API ${ordersResponse.status}: ${errorText.substring(0, 200)}`,
        updated_at: new Date().toISOString() 
      }).eq("seller_id", actualSellerId).eq("user_id", user.id);
      return errorResponse(`ML API error: ${ordersResponse.status}`, "ML_API_ERROR", executionLogs);
    }

    let ordersData = await ordersResponse.json();
    let orders: MeliOrder[] = ordersData.results || [];
    let totalOrders = ordersData.paging?.total || 0;

    // Fallback: widen search window if no recent sales
    if (cursorOffset === 0 && totalOrders === 0 && days_back < 365) {
      const fallbackFrom = new Date();
      fallbackFrom.setDate(fallbackFrom.getDate() - 365);
      const fallbackUrl = buildOrdersUrl(fallbackFrom.toISOString());
      log(`No orders found in last ${days_back} days. Retrying with a wider window (365 days)...`);
      ordersResponse = await fetchWithRetry(fallbackUrl, { headers: mlHeaders }, log);

      if (!ordersResponse.ok) {
        const errorText = await ordersResponse.text();
        log(`ML Orders API error (fallback): ${ordersResponse.status}`);
        await supabase.from("post_sale_messages_sync_state").update({ 
          status: "error", 
          last_error_code: `ML_ORDERS_FALLBACK_${ordersResponse.status}`,
          last_error_message: `Fallback API ${ordersResponse.status}: ${errorText.substring(0, 200)}`,
          updated_at: new Date().toISOString() 
        }).eq("seller_id", actualSellerId).eq("user_id", user.id);
        return errorResponse(`ML API error: ${ordersResponse.status}`, "ML_API_ERROR", executionLogs);
      }

      ordersData = await ordersResponse.json();
      orders = ordersData.results || [];
      totalOrders = ordersData.paging?.total || 0;
    }
    
    log(`Fetched ${orders.length} orders (offset ${cursorOffset}, total ${totalOrders})`);

    if (orders.length === 0) {
      const prevProcessed = (syncState?.processed_orders as number | undefined) || 0;
      const prevSyncedConversations = (syncState?.synced_conversations as number | undefined) || 0;
      await supabase.from("post_sale_messages_sync_state").update({ 
        status: "done", 
        cursor_offset: 0,
        processed_orders: prevProcessed,
        synced_conversations: prevSyncedConversations,
        last_success_at: new Date().toISOString(),
        updated_at: new Date().toISOString() 
      }).eq("seller_id", actualSellerId).eq("user_id", user.id);
      
      return new Response(JSON.stringify({ 
        success: true, synced: 0, 
        unread: 0,
        message: "Sync complete - no more orders to process", 
        execution_logs: executionLogs 
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Build pack map
    const packOrderMap = new Map<string, {
      order_id: string; pack_id: string | null; buyer_id: string;
      buyer_name: string; buyer_nickname: string;
      item_title: string | null; item_thumbnail: string | null; shipment_id: string | null;
    }>();

    let orderDetailsFetches = 0;
    const MAX_ORDER_DETAILS_FETCHES = 12;

    for (const order of orders) {
      if (Date.now() - startTime > MAX_EXECUTION_MS) {
        log(`Time limit approaching while building pack map, pausing sync`);
        break;
      }

      const packId = order.pack_id ? String(order.pack_id) : String(order.id);
      let resolvedPackId = packId;
      let resolvedPackIdField: string | null = order.pack_id ? String(order.pack_id) : null;

      const hasPackIdField = Object.prototype.hasOwnProperty.call(order as unknown as Record<string, unknown>, "pack_id");
      if (!hasPackIdField && orderDetailsFetches < MAX_ORDER_DETAILS_FETCHES) {
        orderDetailsFetches++;
        try {
          const detailsUrl = `https://api.mercadolibre.com/orders/${order.id}`;
          const detailsResp = await fetchWithRetry(detailsUrl, { headers: mlHeaders }, log);
          if (detailsResp.ok) {
            const details = (await detailsResp.json()) as Record<string, unknown>;
            const detailsPack = details.pack_id;
            if (typeof detailsPack === "number") {
              resolvedPackId = String(detailsPack);
              resolvedPackIdField = String(detailsPack);
            } else {
              resolvedPackId = String(order.id);
              resolvedPackIdField = null;
            }

            const detailsShipping = details.shipping as Record<string, unknown> | undefined;
            const detailsShippingId = detailsShipping?.id;
            if (!order.shipping?.id && (typeof detailsShippingId === "number" || typeof detailsShippingId === "string")) {
              order.shipping = { id: Number(detailsShippingId) };
            }
          }
        } catch (e) {
          // Keep fallback behavior
        }
      } else if (hasPackIdField && (order.pack_id === null || order.pack_id === undefined)) {
        resolvedPackId = String(order.id);
        resolvedPackIdField = null;
      }

      if (!packOrderMap.has(resolvedPackId)) {
        const buyerName = [order.buyer.first_name, order.buyer.last_name].filter(Boolean).join(" ") || order.buyer.nickname || "Comprador";
        const firstItem = order.order_items?.[0]?.item;
        packOrderMap.set(resolvedPackId, {
          order_id: String(order.id),
          pack_id: resolvedPackIdField,
          buyer_id: String(order.buyer.id),
          buyer_name: buyerName,
          buyer_nickname: order.buyer.nickname || "",
          item_title: firstItem?.title || null,
          item_thumbnail: firstItem?.thumbnail || null,
          shipment_id: order.shipping?.id ? String(order.shipping.id) : null,
        });
      }
    }

    log(`Processing ${packOrderMap.size} unique packs`);

    let totalSynced = 0;
    let totalMessages = 0;
    let totalErrors = 0;
    let totalUnread = 0;
    const conversationsToUpsert: unknown[] = [];
    const messagesToUpsert: unknown[] = [];

    for (const [packId, orderInfo] of packOrderMap.entries()) {
      if (Date.now() - startTime > MAX_EXECUTION_MS) {
        log(`Time limit approaching, pausing sync`);
        break;
      }

      try {
        const messagesUrl = `https://api.mercadolibre.com/messages/packs/${packId}/sellers/${actualSellerId}?tag=post_sale&mark_as_read=false`;
        const response = await fetchWithRetry(messagesUrl, { headers: mlHeaders }, log);

        if (!response.ok) {
          if (response.status === 404) continue;
          log(`Error for pack ${packId}: ${response.status}`);
          totalErrors++;
          continue;
        }

        const rawConversation = (await response.json()) as Record<string, unknown>;
        const rawMessages = Array.isArray(rawConversation.messages) ? (rawConversation.messages as Array<Record<string, unknown>>) : [];
        if (rawMessages.length === 0) continue;

        let buyerId = orderInfo.buyer_id;
        let buyerName = orderInfo.buyer_name;
        for (const msg of rawMessages) {
          const from = (msg.from as Record<string, unknown> | undefined) || undefined;
          const fromUserId = typeof from?.user_id === "number" ? from.user_id : typeof from?.user_id === "string" ? Number(from.user_id) : null;
          const fromName = typeof from?.name === "string" ? from.name : null;
          if (fromUserId && fromUserId !== sellerUserId) {
            if (!buyerId) buyerId = String(fromUserId);
            if (buyerName === "Comprador" && fromName) buyerName = fromName;
            break;
          }
        }
        if (!buyerId) continue;

        const unreadCount = rawMessages.filter((m) => {
          const from = (m.from as Record<string, unknown> | undefined) || undefined;
          const fromUserId = typeof from?.user_id === "number" ? from.user_id : typeof from?.user_id === "string" ? Number(from.user_id) : null;
          const md = (m.message_date as Record<string, unknown> | undefined) || undefined;
          const read = md?.read;
          return fromUserId && fromUserId !== sellerUserId && !read;
        }).length;

        const sortedMessages = [...rawMessages].sort((a, b) => {
          const aCreated = getCreatedAtFromMessage(a) || "";
          const bCreated = getCreatedAtFromMessage(b) || "";
          return new Date(bCreated).getTime() - new Date(aCreated).getTime();
        });
        const lastMessage = sortedMessages[0];

        const lastMessageCreated = getCreatedAtFromMessage(lastMessage);
        if (lastMessageCreated) {
          const lastTs = new Date(lastMessageCreated).getTime();
          if (Number.isFinite(lastTs) && lastTs < messageThreshold.getTime() && unreadCount === 0) {
            continue;
          }
        }

        conversationsToUpsert.push({
          user_id: user.id,
          seller_id: actualSellerId,
          order_id: orderInfo.order_id,
          pack_id: orderInfo.pack_id,
          buyer_id: buyerId,
          buyer_name: buyerName,
          item_title: orderInfo.item_title,
          item_thumbnail: orderInfo.item_thumbnail,
          shipment_id: orderInfo.shipment_id,
          conversation_status: ((rawConversation.conversation_status as Record<string, unknown> | undefined)?.status as string) || "active",
          unread_count: unreadCount,
          last_message_date: getCreatedAtFromMessage(lastMessage),
          last_message_text: (parseMessageText(lastMessage?.text)?.substring(0, 200)) || null,
          last_message_from: (() => {
            const from = (lastMessage?.from as Record<string, unknown> | undefined) || undefined;
            const fromUserId = typeof from?.user_id === "number" ? from.user_id : typeof from?.user_id === "string" ? Number(from.user_id) : null;
            return fromUserId === sellerUserId ? "seller" : "buyer";
          })(),
          seller_max_chars: (rawConversation.seller_max_chars as number) || (rawConversation.seller_max_message_length as number) || 350,
          updated_at: new Date().toISOString(),
        });

        for (const msg of rawMessages) {
          const from = (msg.from as Record<string, unknown> | undefined) || undefined;
          const fromUserId = typeof from?.user_id === "number" ? from.user_id : typeof from?.user_id === "string" ? Number(from.user_id) : null;
          if (!fromUserId) continue;
          messagesToUpsert.push({
            ml_message_id: typeof msg.id === "string" ? msg.id : null,
            from_user_id: String(fromUserId),
            from_type: fromUserId === sellerUserId ? "seller" : "buyer",
            message_text: parseMessageText(msg.text),
            message_status: (msg.status as string) || "available",
            moderation_status:
              ((msg.message_moderation as Record<string, unknown> | undefined)?.status as string) ||
              (msg.moderation_status as string) ||
              "clean",
            moderation_reason:
              ((msg.message_moderation as Record<string, unknown> | undefined)?.reason as string) ||
              (msg.moderation_reason as string) ||
              null,
            has_attachments: Array.isArray(msg.message_attachments) ? (msg.message_attachments as unknown[]).length > 0 : Array.isArray(msg.attachments) ? (msg.attachments as unknown[]).length > 0 : false,
            attachments: (Array.isArray(msg.message_attachments) ? msg.message_attachments : Array.isArray(msg.attachments) ? msg.attachments : []) as unknown[],
            message_date: getCreatedAtFromMessage(msg) || new Date().toISOString(),
            read_at: ((msg.message_date as Record<string, unknown> | undefined)?.read as string) || null,
            _order_id: orderInfo.order_id,
          });
        }

        totalSynced++;
        totalUnread += unreadCount;
        totalMessages += rawMessages.length;
        
        await new Promise(r => setTimeout(r, 100));
      } catch (err) {
        log(`Error pack ${packId}: ${err instanceof Error ? err.message : "Unknown"}`);
        totalErrors++;
      }
    }

    // Upsert conversations
    if (conversationsToUpsert.length > 0) {
      log(`Upserting ${conversationsToUpsert.length} conversations`);
      const { error: convError } = await supabase
        .from("post_sale_conversations")
        .upsert(conversationsToUpsert as never[], { onConflict: "seller_id,order_id", ignoreDuplicates: false });
      if (convError) log(`Error upserting conversations: ${convError.message}`);
    }

    // Link messages to conversations
    if (messagesToUpsert.length > 0) {
      const orderIds = [...packOrderMap.values()].map(o => o.order_id);
      const { data: savedConversations } = await supabase
        .from("post_sale_conversations")
        .select("id, order_id")
        .eq("seller_id", actualSellerId)
        .in("order_id", orderIds);

      const conversationIdMap = new Map<string, string>();
      for (const conv of savedConversations || []) {
        conversationIdMap.set(conv.order_id, conv.id);
      }

      const linkedMessages = messagesToUpsert
        .map((msg: unknown) => {
          const m = msg as { _order_id: string; [key: string]: unknown };
          const convId = conversationIdMap.get(m._order_id);
          if (!convId) return null;
          const { _order_id, ...data } = m;
          return { ...data, conversation_id: convId };
        })
        .filter(Boolean);

      if (linkedMessages.length > 0) {
        log(`Upserting ${linkedMessages.length} messages`);
        const { error: msgError } = await supabase
          .from("post_sale_conversation_messages")
          .upsert(linkedMessages as never[], { onConflict: "ml_message_id", ignoreDuplicates: false });
        if (msgError) log(`Error upserting messages: ${msgError.message}`);
      }
    }

    // Update sync state
    const newOffset = cursorOffset + orders.length;
    const hasMore = newOffset < totalOrders;
    const prevProcessed = (syncState?.processed_orders as number | undefined) || 0;
    const prevSyncedConversations = (syncState?.synced_conversations as number | undefined) || 0;
    
    await supabase.from("post_sale_messages_sync_state").update({ 
      status: hasMore ? "paused" : "done",
      cursor_offset: hasMore ? newOffset : 0,
      last_heartbeat_at: new Date().toISOString(),
      processed_orders: prevProcessed + orders.length,
      synced_conversations: prevSyncedConversations + totalSynced,
      last_success_at: new Date().toISOString(),
      last_error_code: null,
      last_error_message: null,
      updated_at: new Date().toISOString(),
    }).eq("seller_id", actualSellerId).eq("user_id", user.id);

    log(`Sync batch complete: ${totalSynced} conversations, ${totalMessages} messages, ${totalErrors} errors`);

    return new Response(JSON.stringify({
      success: true,
      synced: totalSynced,
      unread: totalUnread,
      messages_synced: totalMessages,
      errors: totalErrors,
      has_more: hasMore,
      next_offset: hasMore ? newOffset : null,
      total_orders: totalOrders,
      execution_logs: executionLogs,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("Error in ml-sync-messages:", error);
    executionLogs.push(`Fatal error: ${errorMessage}`);
    return new Response(JSON.stringify({ 
      success: false, error: errorMessage, error_code: "INTERNAL_ERROR", execution_logs: executionLogs 
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
