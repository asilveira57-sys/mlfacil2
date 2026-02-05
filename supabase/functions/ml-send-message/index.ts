import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface SendMessageRequest {
  conversation_id: string;
  seller_id?: string;
  account_id?: string; // UUID of ml_accounts - preferred
  text: string;
}

interface BlockedPattern {
  pattern: string;
  pattern_type: string;
  category: string;
  description?: string;
}

interface ValidationViolation {
  category: string;
  pattern: string;
  description: string;
  match: string;
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
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const executionLogs: string[] = [];
  const log = (msg: string) => {
    console.log(`[ml-send-message] ${msg}`);
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
        JSON.stringify({ success: false, error: "Not authenticated", error_code: "AUTH_REQUIRED" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get user from token
    const { data: { user }, error: userError } = await supabase.auth.getUser(
      authHeader.replace("Bearer ", "")
    );

    if (userError || !user) {
      return new Response(
        JSON.stringify({ success: false, error: "Invalid token", error_code: "AUTH_INVALID" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    log(`User authenticated: ${user.id}`);

    const { conversation_id, seller_id, account_id, text }: SendMessageRequest = await req.json();

    if (!conversation_id || !text) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: "Missing required fields: conversation_id, text", 
          error_code: "VALIDATION_ERROR" 
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!seller_id && !account_id) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: "account_id ou seller_id é obrigatório", 
          error_code: "MISSING_IDENTIFIER" 
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check message length (ML limit is 350 chars)
    if (text.length > 350) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Mensagem excede o limite de 350 caracteres",
          error_code: "MESSAGE_TOO_LONG",
          char_count: text.length,
          char_limit: 350,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    log(`Processing message for conversation ${conversation_id}`);

    // Get the conversation
    const { data: conversation, error: convError } = await supabase
      .from("post_sale_conversations")
      .select("*")
      .eq("id", conversation_id)
      .eq("user_id", user.id)
      .single();

    if (convError || !conversation) {
      log(`Conversation not found: ${convError?.message}`);
      return new Response(
        JSON.stringify({ success: false, error: "Conversation not found", error_code: "CONVERSATION_NOT_FOUND" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check conversation status
    if (conversation.conversation_status === "blocked") {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Esta conversa está bloqueada e não permite novas mensagens",
          error_code: "CONVERSATION_BLOCKED",
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate content against blocked patterns
    const { data: patterns, error: patternsError } = await supabase
      .from("post_sale_blocked_patterns")
      .select("*")
      .eq("is_active", true);

    if (patternsError) {
      log(`Error fetching patterns: ${patternsError.message}`);
    }

    const violations: ValidationViolation[] = [];
    
    for (const pattern of (patterns || []) as BlockedPattern[]) {
      try {
        let matches: string[] = [];

        if (pattern.pattern_type === "regex") {
          const regex = new RegExp(pattern.pattern, "gi");
          const found = text.match(regex);
          if (found) matches = found;
        } else if (pattern.pattern_type === "contains") {
          if (text.toLowerCase().includes(pattern.pattern.toLowerCase())) {
            matches = [pattern.pattern];
          }
        }

        for (const match of matches) {
          violations.push({
            category: pattern.category,
            pattern: pattern.pattern,
            description: pattern.description || `Conteúdo bloqueado: ${pattern.category}`,
            match,
          });
        }
      } catch (e) {
        log(`Invalid pattern: ${pattern.pattern}`);
      }
    }

    if (violations.length > 0) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Mensagem contém conteúdo bloqueado pelo Mercado Livre",
          error_code: "CONTENT_BLOCKED",
          violations,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get ML credentials using unified lookup
    const { account: mlAccount, error: credError } = await getMLAccountCredentials(
      supabase, user.id, account_id || null, seller_id || null, log
    );

    if (credError || !mlAccount) {
      log(`ML account error: ${credError}`);
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: credError || "Conta do Mercado Livre não encontrada ou desconectada", 
          error_code: "ML_ACCOUNT_NOT_FOUND" 
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const actualSellerId = mlAccount.ml_user_id as string;
    let accessToken = mlAccount.access_token as string;

    log(`Using account: ${mlAccount.id}, seller_id: ${actualSellerId}`);

    // Check if token is expired and refresh if needed
    const tokenExpiresAt = new Date(mlAccount.token_expires_at as string);
    const now = new Date();
    if (tokenExpiresAt <= now) {
      log("Token expired, attempting refresh...");
      const refreshResponse = await fetch(`${supabaseUrl}/functions/v1/ml-token-refresh`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: authHeader,
        },
        body: JSON.stringify({ account_id: mlAccount.id, seller_id: actualSellerId }),
      });

      if (refreshResponse.ok) {
        const refreshData = await refreshResponse.json();
        if (refreshData.access_token) {
          accessToken = refreshData.access_token;
          log("Token refreshed successfully");
        } else {
          return new Response(
            JSON.stringify({ 
              success: false, 
              error: "Sessão expirada. Reconecte sua conta do Mercado Livre.", 
              error_code: "AUTH_EXPIRED" 
            }),
            { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
      } else {
        return new Response(
          JSON.stringify({ 
            success: false, 
            error: "Sessão expirada. Reconecte sua conta do Mercado Livre.", 
            error_code: "AUTH_EXPIRED" 
          }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // Use pack_id if available, otherwise use order_id
    const packId = conversation.pack_id || conversation.order_id;
    
    // Send message to ML API
    const mlUrl = `https://api.mercadolibre.com/messages/packs/${packId}/sellers/${actualSellerId}?tag=post_sale`;
    log(`Sending message to ML: ${mlUrl}`);

    const mlPayload = {
      from: { user_id: parseInt(actualSellerId, 10) },
      to: { user_id: parseInt(conversation.buyer_id, 10) },
      text: text,
    };

    const mlResponse = await fetch(mlUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(mlPayload),
    });

    const mlResponseText = await mlResponse.text();
    log(`ML API response status: ${mlResponse.status}`);
    log(`ML API response: ${mlResponseText.substring(0, 500)}`);

    if (!mlResponse.ok) {
      let mlError: { message?: string; error?: string; cause?: string[] } = {};
      try {
        mlError = JSON.parse(mlResponseText);
      } catch {
        mlError = { message: mlResponseText };
      }

      const errorMessage = mlError.message || mlError.error || "Erro desconhecido do Mercado Livre";
      let userMessage = errorMessage;
      let errorCode = "ML_API_ERROR";

      if (mlResponse.status === 401) {
        userMessage = "Sessão expirada. Reconecte sua conta do Mercado Livre.";
        errorCode = "AUTH_EXPIRED";
      } else if (mlResponse.status === 403) {
        userMessage = "Você não tem permissão para enviar mensagens nesta conversa.";
        errorCode = "ACCESS_DENIED";
      } else if (mlResponse.status === 404) {
        userMessage = "Conversa não encontrada ou foi encerrada.";
        errorCode = "CONVERSATION_NOT_FOUND";
      } else if (errorMessage.includes("blocked") || errorMessage.includes("bloqueada")) {
        userMessage = "Esta conversa foi bloqueada pelo comprador.";
        errorCode = "CONVERSATION_BLOCKED";
      } else if (mlError.cause?.length) {
        userMessage = mlError.cause.join(". ");
        errorCode = "CONTENT_BLOCKED";
      }

      log(`ML API error: ${errorCode} - ${userMessage}`);

      return new Response(
        JSON.stringify({
          success: false,
          error: userMessage,
          error_code: errorCode,
          api_status: mlResponse.status,
          execution_logs: executionLogs,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Parse successful response
    const mlData = JSON.parse(mlResponseText);
    log(`Message sent successfully! ML Message ID: ${mlData.id}`);

    // Save message to database
    const newMessage = {
      conversation_id: conversation.id,
      ml_message_id: mlData.id,
      from_user_id: actualSellerId,
      from_type: "seller",
      message_text: text,
      message_status: "available",
      moderation_status: "clean",
      has_attachments: false,
      attachments: [],
      message_date: new Date().toISOString(),
    };

    const { error: insertError } = await supabase
      .from("post_sale_conversation_messages")
      .insert([newMessage]);

    if (insertError) {
      log(`Error saving message to DB: ${insertError.message}`);
    }

    // Update conversation with last message info
    await supabase
      .from("post_sale_conversations")
      .update({
        last_message_date: new Date().toISOString(),
        last_message_text: text.substring(0, 200),
        last_message_from: "seller",
        updated_at: new Date().toISOString(),
      })
      .eq("id", conversation.id);

    return new Response(
      JSON.stringify({
        success: true,
        ml_message_id: mlData.id,
        sent_at: new Date().toISOString(),
        execution_logs: executionLogs,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("Error in ml-send-message:", error);
    executionLogs.push(`Fatal error: ${errorMessage}`);

    return new Response(
      JSON.stringify({
        success: false,
        error: "Erro interno ao enviar mensagem",
        error_code: "INTERNAL_ERROR",
        execution_logs: executionLogs,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
