import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface MeliMessage {
  id: string;
  from: {
    user_id: number;
    email?: string;
    name?: string;
  };
  to: {
    user_id: number;
    email?: string;
    name?: string;
  };
  text?: string;
  message_date: {
    received: string;
    available: string;
    notified: string;
    created: string;
    read?: string;
  };
  status: string;
  moderation_status?: string;
  moderation_reason?: string;
  attachments?: Array<{
    filename: string;
    size: string;
    type: string;
    original_filename: string;
  }>;
}

interface MeliConversationResponse {
  paging: {
    limit: number;
    offset: number;
    total: number;
  };
  conversation_status: {
    status: string;
    substatus?: string;
    status_date: string;
    claim_id?: string;
  };
  messages: MeliMessage[];
  seller_max_chars: number;
}

interface OrderInfo {
  order_id: string;
  pack_id: string | null;
  buyer_id: string;
  buyer_name: string | null;
  item_title: string | null;
  item_thumbnail: string | null;
  shipment_id: string | null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const executionLogs: string[] = [];
  const log = (msg: string) => {
    console.log(`[ml-sync-messages] ${msg}`);
    executionLogs.push(msg);
  };

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get authorization header
    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ success: false, error: "Not authenticated" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get user from token
    const { data: { user }, error: userError } = await supabase.auth.getUser(
      authHeader.replace("Bearer ", "")
    );

    if (userError || !user) {
      return new Response(
        JSON.stringify({ success: false, error: "Invalid token" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    log(`User authenticated: ${user.id}`);

    const { seller_id, days_back = 15, force_full_sync = false } = await req.json();

    if (!seller_id) {
      return new Response(
        JSON.stringify({ success: false, error: "seller_id is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    log(`Starting sync for seller ${seller_id}, last ${days_back} days`);

    // Get ML credentials
    const { data: mlAccount, error: accountError } = await supabase
      .from("ml_accounts")
      .select("access_token, refresh_token, ml_user_id, token_expires_at")
      .eq("ml_user_id", seller_id)
      .eq("is_active", true)
      .maybeSingle();

    if (accountError || !mlAccount?.access_token) {
      log(`ML account not found: ${accountError?.message}`);
      return new Response(
        JSON.stringify({ success: false, error: "ML account not found or token missing" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let accessToken = mlAccount.access_token;

    // Check if token is expired and refresh if needed
    const tokenExpiresAt = new Date(mlAccount.token_expires_at);
    const now = new Date();
    if (tokenExpiresAt <= now) {
      log("Token expired, attempting refresh...");
      const refreshResponse = await fetch(`${supabaseUrl}/functions/v1/ml-token-refresh`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: authHeader,
        },
        body: JSON.stringify({ seller_id }),
      });

      if (refreshResponse.ok) {
        const refreshData = await refreshResponse.json();
        if (refreshData.access_token) {
          accessToken = refreshData.access_token;
          log("Token refreshed successfully");
        } else {
          return new Response(
            JSON.stringify({ success: false, error: "Token refresh failed" }),
            { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
      } else {
        return new Response(
          JSON.stringify({ success: false, error: "Token refresh failed" }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // Get recent orders from cache to find conversations
    const dateThreshold = new Date();
    dateThreshold.setDate(dateThreshold.getDate() - days_back);

    const { data: recentOrders, error: ordersError } = await supabase
      .from("meli_orders_cache")
      .select(`
        order_id,
        buyer_id,
        buyer_name,
        shipment_id,
        item_title,
        item_thumbnail
      `)
      .eq("seller_id", seller_id)
      .gte("created_at_meli", dateThreshold.toISOString())
      .order("created_at_meli", { ascending: false })
      .limit(200);

    if (ordersError) {
      log(`Error fetching orders: ${ordersError.message}`);
      return new Response(
        JSON.stringify({ success: false, error: "Failed to fetch orders" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    log(`Found ${recentOrders?.length || 0} recent orders`);

    if (!recentOrders || recentOrders.length === 0) {
      return new Response(
        JSON.stringify({ success: true, synced: 0, message: "No recent orders found" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Dedupe by order_id (pack_id not available in cache)
    const ordersMap = new Map<string, OrderInfo>();
    for (const order of recentOrders) {
      const key = order.order_id;
      if (!ordersMap.has(key)) {
        ordersMap.set(key, {
          order_id: order.order_id,
          pack_id: null,
          buyer_id: order.buyer_id,
          buyer_name: order.buyer_name,
          item_title: order.item_title,
          item_thumbnail: order.item_thumbnail,
          shipment_id: order.shipment_id,
        });
      }
    }

    log(`Processing ${ordersMap.size} unique orders/packs`);

    let totalSynced = 0;
    let totalUnread = 0;
    let totalErrors = 0;
    const conversationsToUpsert: unknown[] = [];
    const messagesToUpsert: unknown[] = [];

    // Process each order/pack
    for (const [packOrOrderId, orderInfo] of ordersMap.entries()) {
      try {
        // Use pack_id if available, otherwise use order_id
        const packId = orderInfo.pack_id || orderInfo.order_id;
        
        // Fetch messages from ML API
        const messagesUrl = `https://api.mercadolibre.com/messages/packs/${packId}/sellers/${seller_id}?tag=post_sale`;
        log(`Fetching messages: ${messagesUrl}`);

        const response = await fetch(messagesUrl, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });

        if (!response.ok) {
          const errorText = await response.text();
          log(`ML API error for pack ${packId}: ${response.status} - ${errorText}`);
          
          // Skip 404 errors (no conversation exists)
          if (response.status === 404) {
            continue;
          }
          
          totalErrors++;
          continue;
        }

        const conversationData: MeliConversationResponse = await response.json();
        
        if (!conversationData.messages || conversationData.messages.length === 0) {
          log(`No messages found for pack ${packId}`);
          continue;
        }

        log(`Found ${conversationData.messages.length} messages for pack ${packId}`);

        // Count unread messages (from buyer, no read date)
        const unreadCount = conversationData.messages.filter(m => 
          String(m.from.user_id) === orderInfo.buyer_id && 
          !m.message_date.read
        ).length;

        // Get the last message
        const sortedMessages = [...conversationData.messages].sort(
          (a, b) => new Date(b.message_date.created).getTime() - new Date(a.message_date.created).getTime()
        );
        const lastMessage = sortedMessages[0];

        // Prepare conversation record
        const conversationRecord = {
          user_id: user.id,
          seller_id: seller_id,
          order_id: orderInfo.order_id,
          pack_id: orderInfo.pack_id,
          buyer_id: orderInfo.buyer_id,
          buyer_name: orderInfo.buyer_name || lastMessage?.from?.name || "Comprador",
          item_title: orderInfo.item_title,
          item_thumbnail: orderInfo.item_thumbnail,
          shipment_id: orderInfo.shipment_id,
          conversation_status: conversationData.conversation_status?.status || "active",
          unread_count: unreadCount,
          last_message_date: lastMessage?.message_date?.created,
          last_message_text: lastMessage?.text?.substring(0, 200) || null,
          last_message_from: String(lastMessage?.from?.user_id) === orderInfo.buyer_id ? "buyer" : "seller",
          seller_max_chars: conversationData.seller_max_chars || 350,
          updated_at: new Date().toISOString(),
        };

        conversationsToUpsert.push(conversationRecord);

        // Prepare message records
        for (const msg of conversationData.messages) {
          messagesToUpsert.push({
            ml_message_id: msg.id,
            from_user_id: String(msg.from.user_id),
            from_type: String(msg.from.user_id) === orderInfo.buyer_id ? "buyer" : "seller",
            message_text: msg.text,
            message_status: msg.status,
            moderation_status: msg.moderation_status || "clean",
            moderation_reason: msg.moderation_reason,
            has_attachments: (msg.attachments?.length || 0) > 0,
            attachments: msg.attachments || [],
            message_date: msg.message_date.created,
            read_at: msg.message_date.read,
            // conversation_id will be set after upserting conversations
            _order_id: orderInfo.order_id, // temp field for linking
          });
        }

        totalSynced++;
        totalUnread += unreadCount;

        // Add small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 100));

      } catch (err) {
        log(`Error processing pack ${packOrOrderId}: ${err instanceof Error ? err.message : 'Unknown error'}`);
        totalErrors++;
      }
    }

    // Upsert conversations
    if (conversationsToUpsert.length > 0) {
      log(`Upserting ${conversationsToUpsert.length} conversations`);
      
      const { error: convError } = await supabase
        .from("post_sale_conversations")
        .upsert(conversationsToUpsert as never[], {
          onConflict: "seller_id,order_id",
          ignoreDuplicates: false,
        });

      if (convError) {
        log(`Error upserting conversations: ${convError.message}`);
      }
    }

    // Get conversation IDs for message linking
    const orderIds = [...ordersMap.keys()].map(k => ordersMap.get(k)!.order_id);
    const { data: savedConversations } = await supabase
      .from("post_sale_conversations")
      .select("id, order_id")
      .eq("seller_id", seller_id)
      .in("order_id", orderIds);

    const conversationIdMap = new Map<string, string>();
    for (const conv of savedConversations || []) {
      conversationIdMap.set(conv.order_id, conv.id);
    }

    // Link messages to conversations and upsert
    const linkedMessages = messagesToUpsert
      .map((msg: any) => {
        const convId = conversationIdMap.get(msg._order_id);
        if (!convId) return null;
        
        const { _order_id, ...messageData } = msg;
        return {
          ...messageData,
          conversation_id: convId,
        };
      })
      .filter(Boolean);

    if (linkedMessages.length > 0) {
      log(`Upserting ${linkedMessages.length} messages`);
      
      const { error: msgError } = await supabase
        .from("post_sale_conversation_messages")
        .upsert(linkedMessages as never[], {
          onConflict: "ml_message_id",
          ignoreDuplicates: false,
        });

      if (msgError) {
        log(`Error upserting messages: ${msgError.message}`);
      }
    }

    log(`Sync completed: ${totalSynced} conversations, ${totalUnread} unread, ${totalErrors} errors`);

    return new Response(
      JSON.stringify({
        success: true,
        synced: totalSynced,
        unread: totalUnread,
        errors: totalErrors,
        execution_logs: executionLogs,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("Error in ml-sync-messages:", error);
    executionLogs.push(`Fatal error: ${errorMessage}`);

    return new Response(
      JSON.stringify({
        success: false,
        error: errorMessage,
        execution_logs: executionLogs,
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
