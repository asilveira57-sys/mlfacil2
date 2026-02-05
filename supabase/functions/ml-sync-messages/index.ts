import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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

    const { seller_id, days_back = 30, batch_size = 30 } = await req.json();
    if (!seller_id) return errorResponse("seller_id is required", "MISSING_SELLER_ID", executionLogs, 400);

    log(`Starting sync for seller ${seller_id}, last ${days_back} days, batch_size ${batch_size}`);

    // Get ML credentials
    const { data: mlAccount, error: accountError } = await supabase
      .from("ml_accounts")
      .select("access_token, refresh_token, ml_user_id, token_expires_at")
      .eq("ml_user_id", seller_id)
      .eq("is_active", true)
      .maybeSingle();

    if (accountError || !mlAccount?.access_token) {
      return errorResponse("ML account not found or token missing", "NO_ML_ACCOUNT", executionLogs);
    }

    let accessToken = mlAccount.access_token;
    const sellerUserId = Number(seller_id);

    // Check if token is expired
    if (new Date(mlAccount.token_expires_at) <= new Date()) {
      log("Token expired, refreshing...");
      const refreshResponse = await fetch(`${supabaseUrl}/functions/v1/ml-token-refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: authHeader },
        body: JSON.stringify({ seller_id }),
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

    // Get or create sync state
    const { data: syncState } = await supabase
      .from("post_sale_messages_sync_state")
      .select("*")
      .eq("seller_id", seller_id)
      .eq("user_id", user.id)
      .maybeSingle();

    let cursorOffset = syncState?.cursor_offset || 0;
    const isResume = syncState?.status === "running" || syncState?.status === "paused";
    
    if (isResume) {
      log(`Resuming from offset ${cursorOffset}`);
    }

    // Upsert sync state as running
    await supabase.from("post_sale_messages_sync_state").upsert({
      seller_id,
      user_id: user.id,
      status: "running",
      cursor_offset: cursorOffset,
      last_heartbeat_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }, { onConflict: "seller_id,user_id" });

    // Fetch orders from ML API with offset
    const dateThreshold = new Date();
    dateThreshold.setDate(dateThreshold.getDate() - days_back);
    const dateFrom = dateThreshold.toISOString().split("T")[0];
    
    const ordersUrl = `https://api.mercadolibre.com/orders/search?seller=${seller_id}&order.date_created.from=${dateFrom}T00:00:00.000-00:00&sort=date_desc&limit=${batch_size}&offset=${cursorOffset}`;
    
    log(`Fetching orders from offset ${cursorOffset}...`);
    const ordersResponse = await fetchWithRetry(ordersUrl, { headers: mlHeaders }, log);
    
    if (!ordersResponse.ok) {
      const errorText = await ordersResponse.text();
      log(`ML Orders API error: ${ordersResponse.status}`);
      await supabase.from("post_sale_messages_sync_state").update({ 
        status: "error", 
        error_message: `API ${ordersResponse.status}: ${errorText.substring(0, 200)}`,
        updated_at: new Date().toISOString() 
      }).eq("seller_id", seller_id).eq("user_id", user.id);
      return errorResponse(`ML API error: ${ordersResponse.status}`, "ML_API_ERROR", executionLogs);
    }

    const ordersData = await ordersResponse.json();
    const orders: MeliOrder[] = ordersData.results || [];
    const totalOrders = ordersData.paging?.total || 0;
    
    log(`Fetched ${orders.length} orders (offset ${cursorOffset}, total ${totalOrders})`);

    if (orders.length === 0) {
      await supabase.from("post_sale_messages_sync_state").update({ 
        status: "done", 
        cursor_offset: 0,
        updated_at: new Date().toISOString() 
      }).eq("seller_id", seller_id).eq("user_id", user.id);
      
      return new Response(JSON.stringify({ 
        success: true, synced: 0, 
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

    for (const order of orders) {
      const packId = order.pack_id ? String(order.pack_id) : String(order.id);
      if (!packOrderMap.has(packId)) {
        const buyerName = [order.buyer.first_name, order.buyer.last_name].filter(Boolean).join(" ") || order.buyer.nickname || "Comprador";
        const firstItem = order.order_items?.[0]?.item;
        packOrderMap.set(packId, {
          order_id: String(order.id),
          pack_id: order.pack_id ? String(order.pack_id) : null,
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
    const conversationsToUpsert: unknown[] = [];
    const messagesToUpsert: unknown[] = [];

    for (const [packId, orderInfo] of packOrderMap.entries()) {
      // Check time limit
      if (Date.now() - startTime > MAX_EXECUTION_MS) {
        log(`Time limit approaching, pausing sync`);
        break;
      }

      try {
        const messagesUrl = `https://api.mercadolibre.com/messages/packs/${packId}/sellers/${seller_id}?tag=post_sale&mark_as_read=false`;
        const response = await fetchWithRetry(messagesUrl, { headers: mlHeaders }, log);

        if (!response.ok) {
          if (response.status === 404) continue;
          log(`Error for pack ${packId}: ${response.status}`);
          totalErrors++;
          continue;
        }

        const conversationData: MeliConversationResponse = await response.json();
        if (!conversationData.messages?.length) continue;

        // Extract buyer info
        let buyerId = orderInfo.buyer_id;
        let buyerName = orderInfo.buyer_name;
        for (const msg of conversationData.messages) {
          if (msg.from.user_id !== sellerUserId) {
            if (!buyerId) buyerId = String(msg.from.user_id);
            if (buyerName === "Comprador" && msg.from.name) buyerName = msg.from.name;
            break;
          }
        }
        if (!buyerId) continue;

        const unreadCount = conversationData.messages.filter(m => m.from.user_id !== sellerUserId && !m.message_date.read).length;
        const sortedMessages = [...conversationData.messages].sort((a, b) => 
          new Date(b.message_date.created).getTime() - new Date(a.message_date.created).getTime()
        );
        const lastMessage = sortedMessages[0];

        conversationsToUpsert.push({
          user_id: user.id,
          seller_id,
          order_id: orderInfo.order_id,
          pack_id: orderInfo.pack_id,
          buyer_id: buyerId,
          buyer_name: buyerName,
          item_title: orderInfo.item_title,
          item_thumbnail: orderInfo.item_thumbnail,
          shipment_id: orderInfo.shipment_id,
          conversation_status: conversationData.conversation_status?.status || "active",
          unread_count: unreadCount,
          last_message_date: lastMessage?.message_date?.created,
          last_message_text: lastMessage?.text?.substring(0, 200) || null,
          last_message_from: lastMessage?.from.user_id === sellerUserId ? "seller" : "buyer",
          seller_max_chars: conversationData.seller_max_chars || 350,
          updated_at: new Date().toISOString(),
        });

        for (const msg of conversationData.messages) {
          messagesToUpsert.push({
            ml_message_id: msg.id,
            from_user_id: String(msg.from.user_id),
            from_type: msg.from.user_id === sellerUserId ? "seller" : "buyer",
            message_text: msg.text,
            message_status: msg.status,
            moderation_status: msg.moderation_status || "clean",
            moderation_reason: msg.moderation_reason,
            has_attachments: (msg.attachments?.length || 0) > 0,
            attachments: msg.attachments || [],
            message_date: msg.message_date.created,
            read_at: msg.message_date.read,
            _order_id: orderInfo.order_id,
          });
        }

        totalSynced++;
        totalMessages += conversationData.messages.length;
        
        // Small delay to avoid rate limits
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
        .eq("seller_id", seller_id)
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
    
    await supabase.from("post_sale_messages_sync_state").update({ 
      status: hasMore ? "paused" : "done",
      cursor_offset: hasMore ? newOffset : 0,
      last_heartbeat_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq("seller_id", seller_id).eq("user_id", user.id);

    log(`Sync batch complete: ${totalSynced} conversations, ${totalMessages} messages, ${totalErrors} errors`);

    return new Response(JSON.stringify({
      success: true,
      synced: totalSynced,
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
