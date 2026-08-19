import { createClient } from "npm:@supabase/supabase-js@2";
import { logSyncEvent, syncStartTimer, syncDuration } from "../_shared/sync-audit.ts";
import { resolveAccessibleMlAccount } from "../_shared/ml-account-access.ts";
import { ensureFreshToken } from "../_shared/ml-token.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") || "";
const CRON_SECRET = Deno.env.get("CRON_JOB_SECRET") || "default-cron-secret";

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

// Substatus that indicate seller can/should print the label
const SELLER_PRINTABLE_SUBSTATUSES = ["ready_to_print", "printed"];
const FULL_LOGISTIC_TYPES = ["fulfillment"];
const ACTIVE_SHIPMENT_STATUSES = ["ready_to_ship", "handling", "pending"];

const STATE_TO_UF: Record<string, string> = {
  'Acre': 'AC', 'Alagoas': 'AL', 'Amapá': 'AP', 'Amazonas': 'AM',
  'Bahia': 'BA', 'Ceará': 'CE', 'Distrito Federal': 'DF', 'Espírito Santo': 'ES',
  'Goiás': 'GO', 'Maranhão': 'MA', 'Mato Grosso': 'MT', 'Mato Grosso do Sul': 'MS',
  'Minas Gerais': 'MG', 'Pará': 'PA', 'Paraíba': 'PB', 'Paraná': 'PR',
  'Pernambuco': 'PE', 'Piauí': 'PI', 'Rio de Janeiro': 'RJ', 'Rio Grande do Norte': 'RN',
  'Rio Grande do Sul': 'RS', 'Rondônia': 'RO', 'Roraima': 'RR', 'Santa Catarina': 'SC',
  'São Paulo': 'SP', 'Sergipe': 'SE', 'Tocantins': 'TO',
  'Amapa': 'AP', 'Ceara': 'CE', 'Espirito Santo': 'ES', 'Goias': 'GO',
  'Maranhao': 'MA', 'Para': 'PA', 'Paraiba': 'PB', 'Parana': 'PR',
  'Piaui': 'PI', 'Rio Grande Do Norte': 'RN', 'Rondonia': 'RO', 'Sao Paulo': 'SP',
};

function isAuthorized(req: Request): boolean {
  const cronKey = req.headers.get("x-cron-key");
  if (cronKey && cronKey === CRON_SECRET) return true;
  const authHeader = req.headers.get("authorization") || "";
  const token = authHeader.replace("Bearer ", "").trim();
  if (token && SUPABASE_ANON_KEY && token === SUPABASE_ANON_KEY) return true;
  // Allow service role key (internal calls)
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (token && serviceKey && token === serviceKey) return true;
  console.warn(
    `[shipping-labels-sync] Unauthorized: cronKeyPresent=${!!cronKey} tokenLen=${token.length} anonLen=${SUPABASE_ANON_KEY.length} svcLen=${serviceKey.length}`
  );
  return false;
}

interface SyncStats {
  accounts: number;
  shipments_synced: number;
  shipments_updated: number;
  invoices_synced: number;
  errors: number;
  skipped: number;
}

/**
 * Fetch shipment details from ML API and upsert into cache
 */
async function syncShipmentBatch(
  supabase: any,
  accessToken: string,
  sellerId: string,
  userId: string,
  shipmentIds: string[],
  shipmentToOrderMap: Map<string, string>,
  stats: SyncStats
): Promise<void> {
  const BATCH_SIZE = 20;

  for (let i = 0; i < shipmentIds.length; i += BATCH_SIZE) {
    const batch = shipmentIds.slice(i, i + BATCH_SIZE);

    await Promise.all(batch.map(async (shipmentId) => {
      try {
        const orderId = shipmentToOrderMap.get(shipmentId);
        if (!orderId) { stats.errors++; return; }

        const resp = await fetch(
          `https://api.mercadolibre.com/shipments/${shipmentId}`,
          { headers: { Authorization: `Bearer ${accessToken}` } }
        );

        if (resp.status === 401 || resp.status === 403) {
          console.warn(`[shipping-labels-sync] Token issue for ${sellerId}, status ${resp.status}`);
          stats.errors++;
          return;
        }
        if (resp.status === 429) {
          await sleep(5000);
          stats.errors++;
          return;
        }
        if (!resp.ok) { stats.errors++; return; }

        const shipment = await resp.json();
        const isFullLogistic = FULL_LOGISTIC_TYPES.includes(shipment.logistic_type);
        const isPrintable = SELLER_PRINTABLE_SUBSTATUSES.includes(shipment.substatus || "");
        const labelAvailable = isPrintable && !isFullLogistic;

        const addr = shipment.receiver_address || {};
        const addressParts = [addr.address_line, addr.city?.name, addr.state?.name, addr.zip_code].filter(Boolean);
        const rawState = addr.state?.name || null;
        const stateUf = rawState ? (STATE_TO_UF[rawState] || addr.state?.id || rawState) : null;

        // Extract estimated_handling_limit
        let estimatedHandlingLimit: string | null = null;
        if (shipment.shipping_option?.estimated_handling_limit?.date) {
          estimatedHandlingLimit = shipment.shipping_option.estimated_handling_limit.date;
        } else if (shipment.lead_time?.estimated_handling_limit?.date) {
          estimatedHandlingLimit = shipment.lead_time.estimated_handling_limit.date;
        } else if (shipment.estimated_handling_limit?.date) {
          estimatedHandlingLimit = shipment.estimated_handling_limit.date;
        } else if (shipment.shipping_option?.estimated_delivery_time?.handling && shipment.date_created) {
          const created = new Date(shipment.date_created);
          const hours = shipment.shipping_option.estimated_delivery_time.handling;
          estimatedHandlingLimit = new Date(created.getTime() + hours * 3600000).toISOString();
        }

        // Extract estimated_schedule_limit (real ML agency/drop-off cutoff time)
        let estimatedScheduleLimit: string | null = null;
        if (shipment.shipping_option?.estimated_schedule_limit?.date) {
          estimatedScheduleLimit = shipment.shipping_option.estimated_schedule_limit.date;
        } else if (shipment.lead_time?.estimated_schedule_limit?.date) {
          estimatedScheduleLimit = shipment.lead_time.estimated_schedule_limit.date;
        } else if (shipment.estimated_schedule_limit?.date) {
          estimatedScheduleLimit = shipment.estimated_schedule_limit.date;
        }

        const data: Record<string, any> = {
          user_id: userId,
          seller_id: sellerId,
          order_id: orderId,
          shipment_id: shipmentId,
          shipment_status: shipment.status,
          shipment_substatus: shipment.substatus || null,
          tracking_number: shipment.tracking_number || null,
          label_available: labelAvailable,
          logistic_type: shipment.logistic_type || null,
          receiver_name: addr.receiver_name || null,
          receiver_address: addressParts.join(", ") || null,
          shipping_city: addr.city?.name || null,
          shipping_state_uf: stateUf,
          shipping_zipcode: addr.zip_code?.replace(/\D/g, "") || null,
          shipping_neighborhood: addr.neighborhood?.name || null,
          last_sync_at: new Date().toISOString(),
        };
        if (estimatedHandlingLimit) data.estimated_handling_limit = estimatedHandlingLimit;
        if (estimatedScheduleLimit) data.estimated_schedule_limit = estimatedScheduleLimit;

        await supabase.from("meli_shipments_cache").upsert(data, {
          onConflict: "seller_id,shipment_id",
          ignoreDuplicates: false,
        });

        stats.shipments_synced++;
      } catch (err) {
        console.error(`[shipping-labels-sync] Error syncing shipment ${shipmentId}:`, err);
        stats.errors++;
      }
    }));

    if (i + BATCH_SIZE < shipmentIds.length) await sleep(100);
  }
}

/**
 * Sync invoices for orders
 */
async function syncInvoiceBatch(
  supabase: any,
  accessToken: string,
  sellerId: string,
  userId: string,
  orderIds: string[],
  stats: SyncStats
): Promise<void> {
  const BATCH_SIZE = 20;

  for (let i = 0; i < orderIds.length; i += BATCH_SIZE) {
    const batch = orderIds.slice(i, i + BATCH_SIZE);

    await Promise.all(batch.map(async (orderId) => {
      try {
        let invoiceStatus = "pendente";
        let invoiceNumber: string | null = null;
        let invoiceKey: string | null = null;
        let issuedAt: string | null = null;

        const billingResp = await fetch(
          `https://api.mercadolibre.com/orders/${orderId}/billing_info`,
          { headers: { Authorization: `Bearer ${accessToken}` } }
        );

        if (billingResp.ok) {
          const billingInfo = await billingResp.json();
          const docNumber = billingInfo.billing_info?.doc_number;
          const additionalInvoice = billingInfo.additional_info?.find((i: any) => i.type === "invoice");

          if (docNumber || additionalInvoice || billingInfo.status === "invoiced") {
            invoiceStatus = "emitida";
            invoiceNumber = docNumber || additionalInvoice?.doc_number || null;
            invoiceKey = billingInfo.billing_info?.access_key || additionalInvoice?.access_key || null;
            issuedAt = additionalInvoice?.issue_date || billingInfo.date_created || null;
          }
        } else if (billingResp.status === 404) {
          // Try fiscal_documents fallback
          try {
            const fiscalResp = await fetch(
              `https://api.mercadolibre.com/packs/${orderId}/fiscal_documents`,
              { headers: { Authorization: `Bearer ${accessToken}` } }
            );
            if (fiscalResp.ok) {
              const docs = await fiscalResp.json();
              if (Array.isArray(docs) && docs.length > 0) {
                invoiceStatus = "emitida";
                invoiceNumber = docs[0].fiscal_document_number || null;
                invoiceKey = docs[0].access_key || null;
                issuedAt = docs[0].issue_date || null;
              }
            }
          } catch { /* ignore */ }
        }

        await supabase.from("meli_invoices_cache").upsert({
          user_id: userId,
          seller_id: sellerId,
          order_id: orderId,
          invoice_status: invoiceStatus,
          invoice_number: invoiceNumber,
          invoice_key: invoiceKey,
          issued_at: issuedAt,
          last_sync_at: new Date().toISOString(),
        }, { onConflict: "seller_id,order_id", ignoreDuplicates: false });

        stats.invoices_synced++;
      } catch (err) {
        stats.errors++;
      }
    }));

    if (i + BATCH_SIZE < orderIds.length) await sleep(100);
  }
}

/**
 * Pass 0 — puxa os pedidos recentes direto da API do ML e alimenta o
 * meli_orders_cache.
 *
 * Antes, o cache de pedidos só era preenchido pelo ml-sync-orders, que roda
 * apenas para a conta ML ativa na tela. Contas secundárias do mesmo titular
 * (ex.: UPMARKET/DBE/VITRINE do maistech) nunca recebiam pedidos e, por
 * consequência, nunca tinham etiquetas — o módulo mostrava "sem vendas".
 */
async function seedRecentOrders(
  supabase: any,
  accessToken: string,
  sellerId: string,
  userId: string,
  cutoff: string,
  stats: SyncStats
): Promise<void> {
  const rows: any[] = [];
  let offset = 0;
  const LIMIT = 50;

  while (offset < 1000) {
    const url = `https://api.mercadolibre.com/orders/search?seller=${sellerId}` +
      `&order.date_created.from=${encodeURIComponent(cutoff)}` +
      `&sort=date_desc&limit=${LIMIT}&offset=${offset}`;
    const resp = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!resp.ok) {
      console.error(`[shipping-labels-sync] orders/search ${sellerId} -> ${resp.status}`);
      stats.errors++;
      break;
    }
    const json = await resp.json();
    const results: any[] = json?.results || [];
    if (results.length === 0) break;

    for (const o of results) {
      rows.push({
        user_id: userId,
        seller_id: sellerId,
        order_id: String(o.id),
        created_at_meli: o.date_created,
        order_status: o.status,
        shipment_id: o.shipping?.id ? String(o.shipping.id) : null,
        pack_id: o.pack_id ? String(o.pack_id) : null,
        buyer_nickname: o.buyer?.nickname ?? null,
        total_amount: o.total_amount ?? null,
        items_count: Array.isArray(o.order_items) ? o.order_items.length : 0,
        last_sync_at: new Date().toISOString(),
      });
    }

    const total = json?.paging?.total ?? results.length;
    offset += LIMIT;
    if (offset >= total) break;
    await sleep(120);
  }

  if (rows.length === 0) return;

  for (let i = 0; i < rows.length; i += 200) {
    const { error } = await supabase
      .from("meli_orders_cache")
      .upsert(rows.slice(i, i + 200), { onConflict: "seller_id,order_id", ignoreDuplicates: false });
    if (error) {
      console.error(`[shipping-labels-sync] orders upsert error ${sellerId}:`, error.message);
      stats.errors++;
    }
  }
  console.log(`[shipping-labels-sync] ${sellerId}: seeded ${rows.length} orders from ML`);
}

/**
 * Process one account: find missing shipments, sync them, update active statuses, sync invoices
 */
async function processAccount(
  supabase: any,
  account: { id: string; ml_user_id: string; user_id: string; access_token: string },
  lookbackHours: number,
  stats: SyncStats
): Promise<void> {
  const sellerId = account.ml_user_id;
  const userId = account.user_id;
  const accessToken = account.access_token;
  const cutoff = new Date(Date.now() - lookbackHours * 3600000).toISOString();

  // 0. Garante que os pedidos recentes existam no cache (contas secundárias inclusive)
  await seedRecentOrders(supabase, accessToken, sellerId, userId, cutoff, stats);

  // 1. Get recent orders with shipment_id — paginação completa (sem limite artificial)

  const orders: { order_id: string; shipment_id: string | null }[] = [];
  const PAGE = 1000;
  let from = 0;
  while (true) {
    const { data, error } = await supabase
      .from("meli_orders_cache")
      .select("order_id, shipment_id")
      .eq("seller_id", sellerId)
      .not("order_status", "in", "(cancelled)")
      .not("shipment_id", "is", null)
      .gte("created_at_meli", cutoff)
      .order("created_at_meli", { ascending: false })
      .range(from, from + PAGE - 1);

    if (error) {
      console.error(`[shipping-labels-sync] orders fetch error for ${sellerId}:`, error);
      stats.errors++;
      break;
    }
    if (!data || data.length === 0) break;
    orders.push(...(data as any));
    if (data.length < PAGE) break;
    from += PAGE;
  }

  if (orders.length === 0) {
    stats.skipped++;
    return;
  }

  const shipmentToOrderMap = new Map<string, string>();
  const allShipmentIds = new Set<string>();
  for (const o of orders) {
    if (o.shipment_id) {
      shipmentToOrderMap.set(o.shipment_id, o.order_id);
      allShipmentIds.add(o.shipment_id);
    }
  }

  // 2. Find missing shipments (not in cache)
  const shipmentIdsArr = [...allShipmentIds];
  const existingSet = new Set<string>();
  const VERIFY_BATCH = 200;
  for (let i = 0; i < shipmentIdsArr.length; i += VERIFY_BATCH) {
    const batch = shipmentIdsArr.slice(i, i + VERIFY_BATCH);
    const { data: existing } = await supabase
      .from("meli_shipments_cache")
      .select("shipment_id")
      .eq("seller_id", sellerId)
      .in("shipment_id", batch);
    (existing || []).forEach((s: any) => existingSet.add(s.shipment_id));
  }

  const missingIds = shipmentIdsArr.filter(id => !existingSet.has(id));
  console.log(`[shipping-labels-sync] ${sellerId}: ${missingIds.length} missing, ${existingSet.size} cached`);

  // 3. Sync missing shipments
  if (missingIds.length > 0) {
    await syncShipmentBatch(supabase, accessToken, sellerId, userId, missingIds, shipmentToOrderMap, stats);
  }

  // 4. Update active shipments (statuses that may change)
  const { data: activeShipments } = await supabase
    .from("meli_shipments_cache")
    .select("shipment_id")
    .eq("seller_id", sellerId)
    .in("shipment_status", ACTIVE_SHIPMENT_STATUSES)
    .order("last_sync_at", { ascending: true })
    .limit(150);

  if (activeShipments && activeShipments.length > 0) {
    const activeIds = activeShipments.map((s: any) => s.shipment_id);
    console.log(`[shipping-labels-sync] ${sellerId}: updating ${activeIds.length} active shipments`);

    for (const sid of activeIds) {
      try {
        const resp = await fetch(
          `https://api.mercadolibre.com/shipments/${sid}`,
          { headers: { Authorization: `Bearer ${accessToken}` } }
        );
        if (resp.status === 429) { await sleep(5000); break; }
        if (resp.status === 401) break;
        if (!resp.ok) { stats.errors++; await sleep(200); continue; }

        const data = await resp.json();
        const statusChanged = data.status !== undefined;

        if (statusChanged) {
          const isFullLogistic = FULL_LOGISTIC_TYPES.includes(data.logistic_type);
          const isPrintable = SELLER_PRINTABLE_SUBSTATUSES.includes(data.substatus || "");

          const updateData: Record<string, any> = {
            shipment_status: data.status,
            shipment_substatus: data.substatus || null,
            tracking_number: data.tracking_number || null,
            logistic_type: data.logistic_type || null,
            label_available: isPrintable && !isFullLogistic,
            last_sync_at: new Date().toISOString(),
          };

          // Extract handling limit
          if (data.shipping_option?.estimated_handling_limit?.date) {
            updateData.estimated_handling_limit = data.shipping_option.estimated_handling_limit.date;
          }

          // Extract schedule limit (real ML cutoff)
          if (data.shipping_option?.estimated_schedule_limit?.date) {
            updateData.estimated_schedule_limit = data.shipping_option.estimated_schedule_limit.date;
          } else if (data.lead_time?.estimated_schedule_limit?.date) {
            updateData.estimated_schedule_limit = data.lead_time.estimated_schedule_limit.date;
          }

          await supabase
            .from("meli_shipments_cache")
            .update(updateData)
            .eq("seller_id", sellerId)
            .eq("shipment_id", sid);

          stats.shipments_updated++;
        }

        await sleep(200);
      } catch (err) {
        stats.errors++;
      }
    }
  }

  // 5. Sync invoices for orders without invoice
  const { data: ordersWithoutInvoice } = await supabase
    .from("meli_orders_cache")
    .select("order_id")
    .eq("seller_id", sellerId)
    .not("order_status", "in", "(cancelled)")
    .gte("created_at_meli", cutoff)
    .not("order_id", "in", `(${
      (await supabase
        .from("meli_invoices_cache")
        .select("order_id")
        .eq("seller_id", sellerId)
        .eq("invoice_status", "emitida")
      ).data?.map((i: any) => i.order_id).join(",") || "___none___"
    })`)
    .limit(500);

  // Simpler approach: get orders that don't have 'emitida' status
  const { data: invoicedOrders } = await supabase
    .from("meli_invoices_cache")
    .select("order_id")
    .eq("seller_id", sellerId)
    .eq("invoice_status", "emitida");

  const invoicedSet = new Set((invoicedOrders || []).map((i: any) => i.order_id));
  const orderIdsNeedingInvoice = orders
    .map((o: any) => o.order_id)
    .filter((oid: string) => !invoicedSet.has(oid));

  if (orderIdsNeedingInvoice.length > 0) {
    console.log(`[shipping-labels-sync] ${sellerId}: syncing ${orderIdsNeedingInvoice.length} invoices`);
    await syncInvoiceBatch(supabase, accessToken, sellerId, userId, orderIdsNeedingInvoice, stats);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  const timer = syncStartTimer();
  const stats: SyncStats = { accounts: 0, shipments_synced: 0, shipments_updated: 0, invoices_synced: 0, errors: 0, skipped: 0 };

  // Parse body for mode, optional seller_id (sync pontual), and manual flag
  let body: any = null;
  let mode = "incremental"; // default: last 6 hours
  let targetSellerId: string | null = null;
  let isManual = false;
  try {
    body = await req.json();
    if (body?.mode === "full") mode = "full";
    if (body?.seller_id) targetSellerId = String(body.seller_id);
    if (body?.manual === true || body?.source === "manual") isManual = true;
  } catch { /* no body = incremental */ }

  if (!isAuthorized(req)) {
    let allowedTargetedUser = false;
    if (targetSellerId) {
      const authHeader = req.headers.get("authorization") || "";
      const token = authHeader.replace("Bearer ", "").trim();
      const supabaseAuth = createClient(supabaseUrl, SUPABASE_ANON_KEY, {
        global: { headers: { Authorization: authHeader } },
      });
      if (token) {
        const { data: { user } } = await supabaseAuth.auth.getUser(token);
        if (user?.id) {
          const access = await resolveAccessibleMlAccount(supabase, supabaseAuth, user.id, targetSellerId, "id");
          allowedTargetedUser = !!access.data;
        }
      }
    }
    if (!allowedTargetedUser) return new Response("Unauthorized", { status: 401 });
  }

  // sync pontual de 1 seller (chamado pelo usuário) é sempre considerado manual
  if (targetSellerId) isManual = true;

  // === Janela horária 07:00–17:00 BRT (apenas para execuções automáticas) ===
  if (!isManual) {
    const brtHour = new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo", hour: "2-digit", hour12: false });
    const hour = parseInt(brtHour, 10);
    if (hour < 7 || hour >= 17) {
      console.log(`[shipping-labels-sync] Outside window (BRT hour=${hour}); skipping auto run.`);
      return new Response(JSON.stringify({ status: "skipped", reason: "outside_window", brt_hour: hour }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  }

  const lookbackHours = mode === "full" ? 7 * 24 : 6; // 7 days or 6 hours

  try {
    // Acquire lock (apenas para syncs globais — sync pontual de 1 seller ignora o lock)
    if (!targetSellerId) {
      const { data: scheduler } = await supabase
        .from("sync_scheduler")
        .select("status, last_run_at")
        .eq("job_name", "shipping-labels-sync")
        .maybeSingle();

      if (scheduler?.status === "running") {
        const lastRun = scheduler.last_run_at ? new Date(scheduler.last_run_at).getTime() : 0;
        // 20 min stale lock window
        if (Date.now() - lastRun < 20 * 60 * 1000) {
          return new Response(JSON.stringify({ status: "skipped", reason: "already_running" }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        console.log("[shipping-labels-sync] Stale lock detected, resetting and continuing");
      }

      await supabase.from("sync_scheduler").upsert({
        job_name: "shipping-labels-sync",
        status: "running",
        last_run_at: new Date().toISOString(),
      }, { onConflict: "job_name" });
    }

    await logSyncEvent(supabase, {
      action: "sync_started",
      entityType: "shipping_labels_sync",
      metadata: { module: "shipping_labels_sync", scope: mode, seller_id: targetSellerId, manual: isManual },
    });

    // Get active accounts (todos, ou filtrado por seller_id quando informado)
    let accountsQuery = supabase
      .from("ml_accounts")
      .select("id, ml_user_id, user_id, access_token, refresh_token, token_expires_at")
      .eq("is_active", true);
    if (targetSellerId) accountsQuery = accountsQuery.eq("ml_user_id", targetSellerId);

    const { data: rawAccounts, error: accError } = await accountsQuery;

    if (accError || !rawAccounts || rawAccounts.length === 0) {
      console.log(`[shipping-labels-sync] No active accounts${targetSellerId ? ` for seller ${targetSellerId}` : ""}`);
      if (!targetSellerId) await markDone(supabase, stats);
      return new Response(JSON.stringify({ status: "idle", stats, seller_id: targetSellerId }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // === Filtrar sellers com titular ativo (last_login_at < 3 dias) ===
    // sync pontual (targetSellerId) ou manual NÃO aplica filtro de inatividade
    let accounts = rawAccounts;
    let skippedInactive = 0;
    if (!isManual) {
      const titularIds = [...new Set(rawAccounts.map((a: any) => a.user_id).filter(Boolean))];
      const threeDaysAgo = new Date(Date.now() - 3 * 24 * 3600 * 1000).toISOString();
      const { data: activeProfiles } = await supabase
        .from("profiles")
        .select("user_id, last_login_at")
        .in("user_id", titularIds)
        .gte("last_login_at", threeDaysAgo);
      const activeUserIds = new Set((activeProfiles || []).map((p: any) => p.user_id));
      accounts = rawAccounts.filter((a: any) => activeUserIds.has(a.user_id));
      skippedInactive = rawAccounts.length - accounts.length;
    }

    if (accounts.length === 0) {
      console.log(`[shipping-labels-sync] All ${rawAccounts.length} accounts skipped (inactive titulars)`);
      if (!targetSellerId) await markDone(supabase, stats);
      return new Response(JSON.stringify({ status: "idle", stats, reason: "all_inactive", skipped_inactive: skippedInactive }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`[shipping-labels-sync] Processing ${accounts.length} active accounts (skipped=${skippedInactive}), mode=${mode}, lookback=${lookbackHours}h, manual=${isManual}`);


    for (const account of accounts) {
      stats.accounts++;
      try {
        // Token expirado = 401 silencioso e conta parava de sincronizar para sempre.
        const freshToken = await ensureFreshToken(supabase, account, "[shipping-labels-sync]");
        if (!freshToken) {
          console.warn(`[shipping-labels-sync] Skipping ${account.ml_user_id}: connection revoked`);
          stats.errors++;
          continue;
        }
        await processAccount(supabase, { ...account, access_token: freshToken }, lookbackHours, stats);
      } catch (err) {
        console.error(`[shipping-labels-sync] Account ${account.ml_user_id} error:`, err);
        stats.errors++;
      }

      // Delay between accounts
      if (stats.accounts < accounts.length) await sleep(2000);
    }

    const durationMs = syncDuration(timer.startMs);
    console.log(`[shipping-labels-sync] Done in ${durationMs}ms:`, stats);

    await logSyncEvent(supabase, {
      action: "sync_finished",
      entityType: "shipping_labels_sync",
      metadata: {
        module: "shipping_labels_sync",
        scope: mode,
        duration_ms: durationMs,
        accounts_processed: stats.accounts,
        shipments_synced: stats.shipments_synced,
        shipments_updated: stats.shipments_updated,
        invoices_synced: stats.invoices_synced,
        errors: stats.errors,
      },
    });

    if (!targetSellerId) await markDone(supabase, stats);


    return new Response(JSON.stringify({ status: "completed", stats, duration_ms: durationMs }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[shipping-labels-sync] Fatal error:", error);
    await supabase.from("sync_scheduler").update({ status: "error" }).eq("job_name", "shipping-labels-sync");

    await logSyncEvent(supabase, {
      action: "sync_failed",
      entityType: "shipping_labels_sync",
      metadata: { module: "shipping_labels_sync", error_message: String(error) },
    });

    return new Response(JSON.stringify({ error: String(error) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

async function markDone(supabase: any, stats: SyncStats) {
  await supabase.from("sync_scheduler").update({
    status: "idle",
    last_run_at: new Date().toISOString(),
  }).eq("job_name", "shipping-labels-sync");
}
