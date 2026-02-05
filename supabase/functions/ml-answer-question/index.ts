import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface AnswerRequest {
  question_id: string; // Internal UUID from qa_questions
  response_text: string;
  seller_id: string;
}

interface MlAnswerResponse {
  id: number;
  question_id: number;
  text: string;
  status: string;
  date_created: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const executionLogs: string[] = [];
  const log = (msg: string) => {
    console.log(`[ml-answer-question] ${msg}`);
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

    const { question_id, response_text, seller_id, account_id }: AnswerRequest & { account_id?: string } = await req.json();

    if (!question_id || !response_text || !seller_id) {
      return new Response(
        JSON.stringify({ success: false, error: "Missing required fields: question_id, response_text, seller_id", error_code: "VALIDATION_ERROR" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    log(`Answering question ${question_id} for seller ${seller_id}, account ${account_id}`);

    // Get the question from DB
    const { data: question, error: questionError } = await supabase
      .from("qa_questions")
      .select("*")
      .eq("id", question_id)
      .maybeSingle();

    if (questionError || !question) {
      log(`Question not found: ${questionError?.message}`);
      return new Response(
        JSON.stringify({ success: false, error: "Question not found", error_code: "QUESTION_NOT_FOUND" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const mlQuestionId = parseInt(question.ml_question_id, 10);
    log(`ML Question ID: ${mlQuestionId}, current status: ${question.status}`);

    // Note: We no longer block on "answered" status locally because it might be stale.
    // The ML API is the source of truth and will return an error if already answered.

    // Get ML credentials - prioritize account_id (UUID), fallback to seller_id
    let mlAccount = null;
    
    if (account_id) {
      const { data: accountById } = await supabase
        .from("ml_accounts")
        .select("access_token, refresh_token, ml_user_id, token_expires_at")
        .eq("id", account_id)
        .eq("user_id", user.id)
        .in("connection_status", ["connected", "attention"])
        .maybeSingle();
      mlAccount = accountById;
      log(`Account lookup by UUID: ${account_id} -> found: ${!!mlAccount}`);
    }
    
    if (!mlAccount) {
      const { data: accountBySeller } = await supabase
        .from("ml_accounts")
        .select("access_token, refresh_token, ml_user_id, token_expires_at")
        .eq("ml_user_id", seller_id)
        .eq("user_id", user.id)
        .in("connection_status", ["connected", "attention"])
        .maybeSingle();
      mlAccount = accountBySeller;
      log(`Account lookup by seller_id: ${seller_id} -> found: ${!!mlAccount}`);
    }

    if (!mlAccount?.access_token) {
      log("ML account not found");
      return new Response(
        JSON.stringify({ success: false, error: "Conta do Mercado Livre não encontrada ou desconectada", error_code: "ML_ACCOUNT_NOT_FOUND" }),
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
          log("Token refresh failed - no access_token returned");
          return new Response(
            JSON.stringify({ success: false, error: "Sessão expirada. Reconecte sua conta do Mercado Livre.", error_code: "AUTH_EXPIRED" }),
            { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
      } else {
        log(`Token refresh failed with status ${refreshResponse.status}`);
        return new Response(
          JSON.stringify({ success: false, error: "Sessão expirada. Reconecte sua conta do Mercado Livre.", error_code: "AUTH_EXPIRED" }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // Send answer to Mercado Libre API
    log(`Sending answer to ML API: POST /answers for question ${mlQuestionId}`);
    const mlPayload = {
      question_id: mlQuestionId,
      text: response_text,
    };

    const mlResponse = await fetch("https://api.mercadolibre.com/answers", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(mlPayload),
    });

    const mlResponseText = await mlResponse.text();
    log(`ML API response status: ${mlResponse.status}`);
    log(`ML API response body: ${mlResponseText.substring(0, 500)}`);

    if (!mlResponse.ok) {
      // Parse ML error response
      let mlError: { message?: string; error?: string; cause?: string[] } = {};
      try {
        mlError = JSON.parse(mlResponseText);
      } catch {
        mlError = { message: mlResponseText };
      }

      // Handle specific ML error codes
      const errorMessage = mlError.message || mlError.error || "Erro desconhecido do Mercado Livre";
      const causes = mlError.cause || [];

      // Map common ML errors to user-friendly messages
      let userMessage = errorMessage;
      let errorCode = "ML_API_ERROR";

      if (mlResponse.status === 401) {
        userMessage = "Sessão expirada. Reconecte sua conta do Mercado Livre.";
        errorCode = "AUTH_EXPIRED";
      } else if (mlResponse.status === 403) {
        userMessage = "Você não tem permissão para responder esta pergunta.";
        errorCode = "ACCESS_DENIED";
      } else if (mlResponse.status === 404) {
        userMessage = "Pergunta não encontrada ou foi deletada pelo comprador.";
        errorCode = "QUESTION_DELETED";
      } else if (errorMessage.includes("already answered") || errorMessage.includes("já respondida")) {
        userMessage = "Esta pergunta já foi respondida no Mercado Livre.";
        errorCode = "ALREADY_ANSWERED_ML";
      } else if (causes.length > 0) {
        // ML often returns detailed causes for content violations
        userMessage = causes.join(". ");
        errorCode = "CONTENT_BLOCKED";
      }

      log(`ML API error: ${errorCode} - ${userMessage}`);

      return new Response(
        JSON.stringify({
          success: false,
          error: userMessage,
          error_code: errorCode,
          api_status: mlResponse.status,
          api_error: mlError,
          execution_logs: executionLogs,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Parse successful response
    const mlAnswerData: MlAnswerResponse = JSON.parse(mlResponseText);
    log(`Answer posted successfully! ML Response ID: ${mlAnswerData.id}`);

    // Return success with the ML response data
    return new Response(
      JSON.stringify({
        success: true,
        ml_response_id: String(mlAnswerData.id),
        ml_question_id: mlAnswerData.question_id,
        sent_at: mlAnswerData.date_created || new Date().toISOString(),
        execution_logs: executionLogs,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("Error in ml-answer-question:", error);
    executionLogs.push(`Fatal error: ${errorMessage}`);

    return new Response(
      JSON.stringify({
        success: false,
        error: "Erro interno ao processar resposta",
        error_code: "INTERNAL_ERROR",
        execution_logs: executionLogs,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
