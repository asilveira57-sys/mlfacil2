import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-job-key",
};

const ML_APP_ID = Deno.env.get("ML_APP_ID")!;
const ML_SECRET_KEY = Deno.env.get("ML_SECRET_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const CRON_JOB_SECRET = Deno.env.get("CRON_JOB_SECRET") || "default-cron-secret";

const JOB_NAME = "qa-messages-polling";
const LOCK_TTL_MINUTES = 10;
const MAX_QUESTIONS_PER_ACCOUNT = 50;
const MAX_ORDERS_PER_ACCOUNT = 50;
const DELAY_API_MS = 200;
const DELAY_ACCOUNT_MS = 500;
const MAX_EXECUTION_MS = 50000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ── Token refresh ──────────────────────────────────────────────────
async function refreshMercadoLibreToken(rt: string) {
  try {
    const res = await fetch("https://api.mercadolibre.com/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        client_id: ML_APP_ID,
        client_secret: ML_SECRET_KEY,
        refresh_token: rt,
      }),
    });
    if (!res.ok) return { success: false as const, error: await res.text() };
    const d = await res.json();
    return { success: true as const, access_token: d.access_token, refresh_token: d.refresh_token, expires_in: d.expires_in as number };
  } catch (e) {
    return { success: false as const, error: String(e) };
  }
}

// ── Message text parser (same as ml-sync-messages) ─────────────────
function parseMessageText(text: unknown): string | null {
  if (typeof text === "string") return text;
  if (text && typeof text === "object") {
    const t = text as Record<string, unknown>;
    if (typeof t.plain === "string") return t.plain;
    if (typeof t.text === "string") return t.text;
  }
  return null;
}

function getCreatedAtFromMessage(msg: Record<string, unknown>): string | null {
  const md = msg.message_date;
  if (md && typeof md === "object") {
    const o = md as Record<string, unknown>;
    if (typeof o.created === "string") return o.created;
    if (typeof o.received === "string") return o.received;
  }
  if (typeof msg.date_created === "string") return msg.date_created;
  return null;
}

// ── Risk analysis (same as ml-sync-questions) ──────────────────────
function analyzeRisk(text: string): { level: string; reasons: string[] } {
  const reasons: string[] = [];
  let level = "low";
  const high = [
    { p: /whats|telefone|liga|chama|contato/i, r: "Pedido de contato externo" },
    { p: /reclama|denunci|advogado|procon|processo/i, r: "Possível ameaça legal" },
  ];
  const med = [
    { p: /troca|devolu[çc][aã]o|quebr|defeito|problema/i, r: "Potencial problema" },
    { p: /prazo|demora|atraso|quando.*chega/i, r: "Dúvida sobre prazo" },
  ];
  for (const { p, r } of high) if (p.test(text)) { level = "high"; reasons.push(r); }
  if (level !== "high") for (const { p, r } of med) if (p.test(text)) { level = "medium"; reasons.push(r); }
  return { level, reasons };
}

// ── Fetch item details in batches ──────────────────────────────────
async function fetchItemDetails(accessToken: string, itemIds: string[]) {
  const map = new Map<string, { title?: string; thumbnail?: string; seller_custom_field?: string; variations?: any[] }>();
  for (let i = 0; i < itemIds.length; i += 20) {
    const batch = itemIds.slice(i, i + 20).join(",");
    try {
      const res = await fetch(
        `https://api.mercadolibre.com/items?ids=${batch}&attributes=id,title,thumbnail,seller_custom_field,variations`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      if (res.ok) {
        const data = await res.json();
        for (const item of data) {
          if (item.code === 200 && item.body) map.set(item.body.id, item.body);
        }
      }
    } catch { /* skip */ }
    await sleep(DELAY_API_MS);
  }
  return map;
}

// ── Company name helper ────────────────────────────────────────────
async function getCompanyName(supabase: any, account: any): Promise<string> {
  if (account.company_id) {
    const { data: company } = await supabase
      .from("companies")
      .select("display_name")
      .eq("id", account.company_id)
      .maybeSingle();
    if (company?.display_name) return company.display_name;
  }
  return account.nickname || "sua empresa";
}

// ── Notification upsert (deduplicated by group_key) ────────────────
async function upsertNotification(
  supabase: any,
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
  const actionUrl = type === "question" ? "/perguntas" : "/mensagens";

  const { data: existing } = await supabase
    .from("app_notifications")
    .select("id")
    .eq("group_key", groupKey)
    .eq("is_dismissed", false)
    .maybeSingle();

  if (existing) {
    await supabase.from("app_notifications").update({ body, title }).eq("id", existing.id);
    console.log(`[polling] Updated notification ${existing.id} for ${type}`);
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
    console.log(`[polling] Created notification for ${type} (${companyName})`);
  }
}

// ── Release scheduler lock ─────────────────────────────────────────
async function releaseLock(supabase: any, stats: Record<string, unknown>) {
  await supabase
    .from("sync_scheduler")
    .update({
      status: "idle",
      last_run_at: new Date().toISOString(),
      lock_expires_at: null,
      locked_by: null,
      stats,
      error_message: null,
    })
    .eq("job_name", JOB_NAME);
}

// ── Sync questions for one account ─────────────────────────────────
async function syncQuestions(
  supabase: any,
  account: any,
  accessToken: string,
): Promise<{ total: number; newCount: number; pendingCount: number; reconciledCount: number }> {
  const sellerId = account.ml_user_id;

  // Get existing pending question IDs before sync
  const { data: existing } = await supabase
    .from("qa_questions")
    .select("ml_question_id")
    .eq("seller_id", sellerId)
    .eq("status", "pending");

  const existingIds = new Set((existing || []).map((q: any) => q.ml_question_id));

  // Fetch UNANSWERED from ML
  const url = `https://api.mercadolibre.com/questions/search?seller_id=${sellerId}&status=UNANSWERED&limit=${MAX_QUESTIONS_PER_ACCOUNT}&sort_fields=date_created&sort_types=DESC`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });

  if (!res.ok) {
    console.error(`[polling] Questions API ${res.status} for ${sellerId}`);
    return { total: 0, newCount: 0, pendingCount: 0, reconciledCount: 0 };
  }

  const data = await res.json();
  const questions: any[] = data.questions || [];

  console.log(`[polling] ${sellerId}: ${questions.length} unanswered questions from ML`);

  // ── Reconcile: detect questions answered externally on ML ────
  // Local pending questions NOT in the ML unanswered list were answered outside the system
  const mlUnansweredIds = new Set(questions.map((q: any) => String(q.id)));
  const answeredExternally = [...existingIds].filter((id) => !mlUnansweredIds.has(id));
  let reconciledCount = 0;

  if (answeredExternally.length > 0) {
    console.log(`[polling] ${sellerId}: ${answeredExternally.length} questions may have been answered externally, checking...`);

    // Fetch each question from ML to confirm and get the answer
    const BATCH_SIZE = 10;
    for (let i = 0; i < answeredExternally.length; i += BATCH_SIZE) {
      const batch = answeredExternally.slice(i, i + BATCH_SIZE);

      for (const mlQuestionId of batch) {
        try {
          const qRes = await fetch(`https://api.mercadolibre.com/questions/${mlQuestionId}`, {
            headers: { Authorization: `Bearer ${accessToken}` },
          });

          if (!qRes.ok) {
            if (qRes.status === 404) {
              // Question was deleted on ML
              await supabase
                .from("qa_questions")
                .update({ status: "archived", updated_at: new Date().toISOString() })
                .eq("ml_question_id", mlQuestionId)
                .eq("seller_id", sellerId);
              reconciledCount++;
              console.log(`[polling] Question ${mlQuestionId} deleted on ML, archived locally`);
            }
            continue;
          }

          const q = await qRes.json();

          if (q.answer) {
            // Mark as answered
            await supabase
              .from("qa_questions")
              .update({
                status: "answered",
                answered_at: q.answer.date_created || new Date().toISOString(),
                needs_attention: false,
                updated_at: new Date().toISOString(),
              })
              .eq("ml_question_id", mlQuestionId)
              .eq("seller_id", sellerId);

            // Save the ML response
            const { data: localQ } = await supabase
              .from("qa_questions")
              .select("id")
              .eq("ml_question_id", mlQuestionId)
              .eq("seller_id", sellerId)
              .maybeSingle();

            if (localQ) {
              await supabase
                .from("qa_responses")
                .upsert({
                  user_id: account.user_id,
                  seller_id: sellerId,
                  question_id: localQ.id,
                  response_text: q.answer.text || "",
                  source: "ml_synced",
                  is_draft: false,
                  is_sent: true,
                  sent_at: q.answer.date_created || new Date().toISOString(),
                  ml_response_id: String(q.answer.id || q.id),
                  updated_at: new Date().toISOString(),
                } as never, { onConflict: "question_id,ml_response_id" });
            }

            reconciledCount++;
            console.log(`[polling] Question ${mlQuestionId} answered externally, synced`);
          }

          await sleep(DELAY_API_MS);
        } catch (err) {
          console.error(`[polling] Error reconciling question ${mlQuestionId}:`, err);
        }
      }
    }
  }

  // ── Upsert unanswered questions ─────────────────────────────
  if (questions.length > 0) {
    // Fetch item details
    const itemIds = [...new Set(questions.map((q: any) => q.item_id))];
    const itemsMap = await fetchItemDetails(accessToken, itemIds);

    // Build upsert records
    const records = questions.map((q: any) => {
      const item = itemsMap.get(q.item_id);
      const risk = analyzeRisk(q.text || "");
      const slaDeadline = new Date(q.date_created);
      slaDeadline.setHours(slaDeadline.getHours() + 15);
      const isSlaBreached = slaDeadline < new Date();

      let sku = item?.seller_custom_field || null;
      if (!sku && item?.variations?.[0]?.seller_custom_field) {
        sku = item.variations[0].seller_custom_field;
      }

      return {
        user_id: account.user_id,
        seller_id: sellerId,
        ml_question_id: String(q.id),
        ml_item_id: q.item_id,
        ml_buyer_id: String(q.from?.id),
        question_text: q.text,
        item_title: item?.title || null,
        item_sku: sku,
        item_thumbnail: item?.thumbnail || null,
        status: q.answer ? "answered" : "pending",
        risk_level: risk.level,
        risk_reasons: risk.reasons,
        question_date: q.date_created,
        answered_at: q.answer?.date_created || null,
        sla_deadline: slaDeadline.toISOString(),
        is_sla_breached: isSlaBreached,
        needs_attention: risk.level === "high" || isSlaBreached,
        updated_at: new Date().toISOString(),
      };
    });

    const { error: upsertErr } = await supabase
      .from("qa_questions")
      .upsert(records as never[], { onConflict: "ml_question_id", ignoreDuplicates: false });

    if (upsertErr) console.error(`[polling] Upsert questions error:`, upsertErr.message);
  }

  const newCount = questions.filter((q: any) => !existingIds.has(String(q.id)) && !q.answer).length;
  const pendingCount = questions.filter((q: any) => !q.answer).length;

  console.log(`[polling] ${sellerId}: ${newCount} new pending, ${pendingCount} total pending, ${reconciledCount} reconciled`);
  return { total: questions.length, newCount, pendingCount, reconciledCount };
}

// ── Sync messages for one account ──────────────────────────────────
async function syncMessages(
  supabase: any,
  account: any,
  accessToken: string,
  startTime: number,
): Promise<{ total: number; newUnreadCount: number }> {
  const sellerId = account.ml_user_id;
  const sellerNum = Number(sellerId);

  // Get existing unread counts
  const { data: existingConvs } = await supabase
    .from("post_sale_conversations")
    .select("order_id, unread_count")
    .eq("seller_id", sellerId);

  const prevUnreadMap = new Map<string, number>();
  for (const c of existingConvs || []) prevUnreadMap.set(c.order_id, c.unread_count || 0);

  // Fetch recent orders (60 days)
  const dateFrom = new Date();
  dateFrom.setDate(dateFrom.getDate() - 60);
  const dateFromStr = dateFrom.toISOString().replace("Z", "-03:00");

  const ordersUrl = `https://api.mercadolibre.com/orders/search?seller=${sellerId}&sort=date_desc&limit=${MAX_ORDERS_PER_ACCOUNT}&order.date_created.from=${encodeURIComponent(dateFromStr)}`;
  const ordersRes = await fetch(ordersUrl, { headers: { Authorization: `Bearer ${accessToken}` } });

  if (!ordersRes.ok) {
    console.error(`[polling] Orders API ${ordersRes.status} for ${sellerId}`);
    return { total: 0, newUnreadCount: 0 };
  }

  const ordersData = await ordersRes.json();
  const orders: any[] = ordersData.results || [];
  if (orders.length === 0) return { total: 0, newUnreadCount: 0 };

  console.log(`[polling] ${sellerId}: ${orders.length} recent orders for message sync`);

  const conversationsToUpsert: any[] = [];
  const messagesToUpsert: any[] = [];
  let totalNewUnread = 0;

  for (const order of orders) {
    if (Date.now() - startTime > MAX_EXECUTION_MS - 5000) break;

    const packId = order.pack_id ? String(order.pack_id) : String(order.id);
    const orderId = String(order.id);

    try {
      const msgUrl = `https://api.mercadolibre.com/messages/packs/${packId}/sellers/${sellerId}?tag=post_sale&mark_as_read=false`;
      const msgRes = await fetch(msgUrl, { headers: { Authorization: `Bearer ${accessToken}` } });

      if (!msgRes.ok) {
        const errBody = await msgRes.text().catch(() => "");
        console.log(`[polling] Messages API ${msgRes.status} for pack ${packId} (seller ${sellerId}): ${errBody.substring(0, 200)}`);
        continue;
      }

      const rawConv = (await msgRes.json()) as Record<string, unknown>;
      const rawMsgs = Array.isArray(rawConv.messages) ? (rawConv.messages as Record<string, unknown>[]) : [];
      if (rawMsgs.length === 0) continue;

      // Calculate unread buyer messages
      const unreadCount = rawMsgs.filter((m) => {
        const fromId = (m.from as any)?.user_id;
        const readAt = (m.message_date as any)?.read;
        return fromId && Number(fromId) !== sellerNum && !readAt;
      }).length;

      // Detect new unreads
      const prevUnread = prevUnreadMap.get(orderId) || 0;
      if (unreadCount > prevUnread) totalNewUnread += unreadCount - prevUnread;

      // Build buyer info
      const buyerName = [order.buyer?.first_name, order.buyer?.last_name].filter(Boolean).join(" ") || order.buyer?.nickname || "Comprador";

      // Sort messages for last message info
      const sorted = [...rawMsgs].sort((a, b) => {
        const at = new Date(getCreatedAtFromMessage(a) || "0").getTime();
        const bt = new Date(getCreatedAtFromMessage(b) || "0").getTime();
        return bt - at;
      });
      const last = sorted[0];

      conversationsToUpsert.push({
        user_id: account.user_id,
        seller_id: sellerId,
        order_id: orderId,
        pack_id: order.pack_id ? String(order.pack_id) : null,
        buyer_id: String(order.buyer.id),
        buyer_name: buyerName,
        item_title: order.order_items?.[0]?.item?.title || null,
        item_thumbnail: order.order_items?.[0]?.item?.thumbnail || null,
        shipment_id: order.shipping?.id ? String(order.shipping.id) : null,
        conversation_status: ((rawConv.conversation_status as any)?.status as string) || "active",
        unread_count: unreadCount,
        last_message_date: getCreatedAtFromMessage(last),
        last_message_text: parseMessageText(last?.text)?.substring(0, 200) || null,
        last_message_from: (last?.from as any)?.user_id === sellerNum ? "seller" : "buyer",
        seller_max_chars: (rawConv.seller_max_chars as number) || (rawConv.seller_max_message_length as number) || 350,
        updated_at: new Date().toISOString(),
      });

      for (const msg of rawMsgs) {
        const fromId = (msg.from as any)?.user_id;
        if (!fromId) continue;
        messagesToUpsert.push({
          ml_message_id: typeof msg.id === "string" ? msg.id : null,
          from_user_id: String(fromId),
          from_type: Number(fromId) === sellerNum ? "seller" : "buyer",
          message_text: parseMessageText(msg.text),
          message_status: (msg.status as string) || "available",
          moderation_status: ((msg.message_moderation as any)?.status as string) || (msg.moderation_status as string) || "clean",
          moderation_reason: ((msg.message_moderation as any)?.reason as string) || (msg.moderation_reason as string) || null,
          has_attachments: Array.isArray(msg.message_attachments)
            ? (msg.message_attachments as unknown[]).length > 0
            : Array.isArray(msg.attachments)
              ? (msg.attachments as unknown[]).length > 0
              : false,
          attachments: (Array.isArray(msg.message_attachments) ? msg.message_attachments : Array.isArray(msg.attachments) ? msg.attachments : []) as unknown[],
          message_date: getCreatedAtFromMessage(msg) || new Date().toISOString(),
          read_at: ((msg.message_date as any)?.read as string) || null,
          _order_id: orderId,
        });
      }

      await sleep(DELAY_API_MS);
    } catch (err) {
      console.error(`[polling] Error pack ${packId}:`, err);
    }
  }

  // Upsert conversations
  if (conversationsToUpsert.length > 0) {
    const { error } = await supabase
      .from("post_sale_conversations")
      .upsert(conversationsToUpsert as never[], { onConflict: "seller_id,order_id", ignoreDuplicates: false });
    if (error) console.error(`[polling] Upsert conversations error:`, error.message);
  }

  // Link messages to conversations
  if (messagesToUpsert.length > 0) {
    const orderIds = conversationsToUpsert.map((c: any) => c.order_id);
    const { data: savedConvs } = await supabase
      .from("post_sale_conversations")
      .select("id, order_id")
      .eq("seller_id", sellerId)
      .in("order_id", orderIds);

    const convMap = new Map<string, string>();
    for (const c of savedConvs || []) convMap.set(c.order_id, c.id);

    const linked = messagesToUpsert
      .map((m: any) => {
        const convId = convMap.get(m._order_id);
        if (!convId) return null;
        const { _order_id, ...rest } = m;
        return { ...rest, conversation_id: convId };
      })
      .filter(Boolean);

    if (linked.length > 0) {
      const { error } = await supabase
        .from("post_sale_conversation_messages")
        .upsert(linked as never[], { onConflict: "ml_message_id", ignoreDuplicates: false });
      if (error) console.error(`[polling] Upsert messages error:`, error.message);
    }
  }

  console.log(`[polling] ${sellerId}: ${conversationsToUpsert.length} conversations, ${totalNewUnread} new unreads`);
  return { total: conversationsToUpsert.length, newUnreadCount: totalNewUnread };
}

// ── Main handler ───────────────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  // Validate job key
  const jobKey = req.headers.get("x-job-key");
  if (jobKey !== CRON_JOB_SECRET) {
    console.error("[polling] Unauthorized: invalid x-job-key");
    return new Response("Unauthorized", { status: 401 });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const startTime = Date.now();

  try {
    console.log(`[polling] Starting at ${new Date().toISOString()}`);

    // ── Acquire lock ────────────────────────────────────────────
    const { data: scheduler, error: fetchErr } = await supabase
      .from("sync_scheduler")
      .select("*")
      .eq("job_name", JOB_NAME)
      .single();

    if (fetchErr || !scheduler) {
      console.error("[polling] Scheduler not found:", fetchErr?.message);
      return new Response(JSON.stringify({ error: "Scheduler not found" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check existing lock
    if (scheduler.status === "running" && scheduler.lock_expires_at) {
      if (new Date(scheduler.lock_expires_at) > new Date()) {
        console.log("[polling] Already running, skipping");
        return new Response(JSON.stringify({ status: "skipped", reason: "Already running" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // Acquire lock
    await supabase
      .from("sync_scheduler")
      .update({
        status: "running",
        lock_expires_at: new Date(Date.now() + LOCK_TTL_MINUTES * 60 * 1000).toISOString(),
        locked_by: "qa-messages-polling",
        error_message: null,
      })
      .eq("job_name", JOB_NAME);

    // ── Get active accounts ─────────────────────────────────────
    const { data: accounts, error: accErr } = await supabase
      .from("ml_accounts")
      .select("id, user_id, ml_user_id, access_token, refresh_token, token_expires_at, nickname, company_id, connection_status")
      .in("connection_status", ["connected", "attention"]);

    if (accErr || !accounts || accounts.length === 0) {
      console.log(`[polling] No active accounts found`);
      await releaseLock(supabase, { accounts_found: 0 });
      return new Response(JSON.stringify({ status: "idle", message: "No active accounts" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`[polling] Processing ${accounts.length} active accounts`);

    const stats = {
      accounts_processed: 0,
      accounts_failed: 0,
      questions_synced: 0,
      questions_new: 0,
      questions_reconciled: 0,
      messages_synced: 0,
      messages_new_unread: 0,
      notifications_created: 0,
      started_at: new Date().toISOString(),
    };

    // ── Process each account ────────────────────────────────────
    for (const account of accounts) {
      if (Date.now() - startTime > MAX_EXECUTION_MS) {
        console.log("[polling] Time limit reached, stopping");
        break;
      }

      try {
        // Get company name for notifications
        const companyName = await getCompanyName(supabase, account);

        // Refresh token if expired
        let accessToken = account.access_token;
        const tokenExpires = account.token_expires_at ? new Date(account.token_expires_at) : null;

        if (!tokenExpires || tokenExpires < new Date()) {
          console.log(`[polling] Refreshing token for ${account.ml_user_id}`);
          const result = await refreshMercadoLibreToken(account.refresh_token);
          if (result.success && result.access_token) {
            accessToken = result.access_token;
            await supabase
              .from("ml_accounts")
              .update({
                access_token: result.access_token,
                refresh_token: result.refresh_token,
                token_expires_at: new Date(Date.now() + (result.expires_in || 21600) * 1000).toISOString(),
              })
              .eq("id", account.id);
          } else {
            console.error(`[polling] Token refresh failed for ${account.ml_user_id}: ${result.error}`);
            await supabase.from("ml_accounts").update({ connection_status: "attention" }).eq("id", account.id);
            stats.accounts_failed++;
            continue;
          }
        }

        // ── Sync questions ──────────────────────────────────────
        const qResult = await syncQuestions(supabase, account, accessToken);
        stats.questions_synced += qResult.total;
        stats.questions_new += qResult.newCount;
        stats.questions_reconciled += qResult.reconciledCount;

        if (qResult.newCount > 0) {
          await upsertNotification(supabase, account.user_id, account.ml_user_id, companyName, "question", qResult.pendingCount);
          stats.notifications_created++;
        }

        // Auto-resolve qa_pending notifications when no pending questions remain
        if (qResult.pendingCount === 0) {
          const { data: resolvedNotifs } = await supabase
            .from("app_notifications")
            .update({ is_actioned: true, read_at: new Date().toISOString() })
            .eq("seller_id", account.ml_user_id)
            .eq("category", "qa_pending")
            .eq("is_actioned", false)
            .select("id");
          if (resolvedNotifs && resolvedNotifs.length > 0) {
            console.log(`[polling] Auto-resolved ${resolvedNotifs.length} qa_pending notifications for seller ${account.ml_user_id}`);
          }
        }

        await sleep(DELAY_API_MS);

        // ── Sync messages ───────────────────────────────────────
        if (Date.now() - startTime < MAX_EXECUTION_MS - 10000) {
          const mResult = await syncMessages(supabase, account, accessToken, startTime);
          stats.messages_synced += mResult.total;
          stats.messages_new_unread += mResult.newUnreadCount;

          if (mResult.newUnreadCount > 0) {
            await upsertNotification(supabase, account.user_id, account.ml_user_id, companyName, "message", mResult.newUnreadCount);
            stats.notifications_created++;
          }
        }

        stats.accounts_processed++;
        await sleep(DELAY_ACCOUNT_MS);
      } catch (err) {
        console.error(`[polling] Error for ${account.ml_user_id}:`, err);
        stats.accounts_failed++;
      }
    }

    // ── Release lock ────────────────────────────────────────────
    const duration = Date.now() - startTime;
    await releaseLock(supabase, { ...stats, duration_ms: duration, finished_at: new Date().toISOString() });

    console.log(`[polling] Done in ${duration}ms:`, JSON.stringify(stats));

    return new Response(JSON.stringify({ success: true, stats, duration_ms: duration }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[polling] Fatal error:", error);
    await supabase
      .from("sync_scheduler")
      .update({ status: "error", lock_expires_at: null, locked_by: null, error_message: String(error) })
      .eq("job_name", JOB_NAME);

    return new Response(JSON.stringify({ error: String(error) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
