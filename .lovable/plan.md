

# Plano: Sistema de Webhooks do Mercado Livre com Fila e Worker

## Visão Geral

Este plano implementa uma infraestrutura completa de webhooks para receber notificações do Mercado Livre em tempo real, armazenar em fila para processamento assíncrono, e respeitar os limites de cada plano de assinatura.

## Arquitetura

```text
┌─────────────────────────────────────────────────────────────────────────────────┐
│                                 MERCADO LIVRE                                    │
│                            Notificações (webhooks)                               │
└─────────────────────────────────────┬───────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                  https://www.mktpfacil.com/webhooks/mercadolivre                │
│                           (Rota pública HTTPS)                                  │
└─────────────────────────────────────┬───────────────────────────────────────────┘
                                      │ Proxy interno
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                        Edge Function: ml-webhook-ingest                         │
│  • Valida payload mínimo                                                        │
│  • Gera dedupe_key                                                              │
│  • Insere em webhook_events (status: pending)                                   │
│  • Responde 200 rapidamente                                                     │
└─────────────────────────────────────┬───────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                          Tabela: webhook_events                                  │
│  • Fila persistente                                                             │
│  • Deduplicação por dedupe_key                                                  │
│  • Controle de retry com backoff                                                │
└─────────────────────────────────────┬───────────────────────────────────────────┘
                                      │
                    ┌─────────────────┴─────────────────┐
                    │  Scheduler (Supabase pg_cron)     │
                    │  A cada 1-3 minutos               │
                    └─────────────────┬─────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                        Edge Function: ml-worker-process                         │
│  • Busca eventos pending (batch)                                                │
│  • Valida plano e feature_flags                                                 │
│  • Processa por topic (items, orders, messages, questions)                      │
│  • Atualiza meli_listings_cache ou outras tabelas                               │
│  • Controla retry com backoff exponencial                                       │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

## Importante: Limitação de Rotas Personalizadas no Lovable

O Lovable não suporta configuração de rewrites/proxy customizados no nível de Vite ou servidor. Isso significa que:
- Não é possível criar a rota `https://www.mktpfacil.com/webhooks/mercadolivre` apontando internamente para uma Edge Function
- A URL do webhook deve ser diretamente a URL da Edge Function do Supabase

**Solução**: Registrar no Mercado Livre a URL direta da Edge Function:
```
https://rfckrbqwdsejicjlxqdv.supabase.co/functions/v1/ml-webhook-ingest
```

Alternativamente, se precisar do domínio customizado:
- Usar um serviço externo de proxy (Cloudflare Workers, API Gateway)
- Ou Cloudflare com regra de rewrite (se o domínio estiver lá)

---

## Fase 1: Banco de Dados

### Tabela: ml_integrations

Mapeia cada conta ML às configurações de plano e feature flags.

```sql
CREATE TABLE public.ml_integrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  ml_user_id TEXT NOT NULL,
  application_id TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'revoked')),
  plan_id UUID REFERENCES plans(id),
  feature_flags JSONB NOT NULL DEFAULT '{
    "can_sync_items": true,
    "can_sync_orders": false,
    "can_sync_messages": false,
    "can_sync_questions": false,
    "daily_event_limit": 500,
    "worker_frequency_seconds": 180
  }',
  daily_events_count INTEGER NOT NULL DEFAULT 0,
  daily_events_reset_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  CONSTRAINT ml_integrations_user_ml_unique UNIQUE (user_id, ml_user_id)
);

CREATE INDEX idx_ml_integrations_ml_user_id ON ml_integrations(ml_user_id);
CREATE INDEX idx_ml_integrations_status ON ml_integrations(status);

-- Trigger para updated_at
CREATE TRIGGER ml_integrations_updated_at
  BEFORE UPDATE ON ml_integrations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
```

### Tabela: webhook_events

Fila de eventos recebidos do Mercado Livre.

```sql
CREATE TABLE public.webhook_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider TEXT NOT NULL DEFAULT 'mercadolibre',
  ml_user_id TEXT NOT NULL,
  application_id TEXT,
  topic TEXT NOT NULL,
  resource TEXT NOT NULL,
  payload_raw JSONB NOT NULL,
  dedupe_key TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'done', 'error', 'skipped')),
  attempts INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 5,
  next_retry_at TIMESTAMPTZ,
  last_error TEXT,
  error_code TEXT,
  processed_at TIMESTAMPTZ,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Índices para performance do worker
CREATE INDEX idx_webhook_events_pending ON webhook_events(status, next_retry_at) 
  WHERE status IN ('pending', 'processing');
CREATE INDEX idx_webhook_events_ml_user ON webhook_events(ml_user_id);
CREATE INDEX idx_webhook_events_topic ON webhook_events(topic);
CREATE INDEX idx_webhook_events_received ON webhook_events(received_at);
```

### Tabela: webhook_event_logs

Logs detalhados para diagnóstico.

```sql
CREATE TABLE public.webhook_event_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID REFERENCES webhook_events(id) ON DELETE CASCADE,
  level TEXT NOT NULL CHECK (level IN ('info', 'warn', 'error')),
  message TEXT NOT NULL,
  details JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_webhook_event_logs_event ON webhook_event_logs(event_id);
CREATE INDEX idx_webhook_event_logs_level ON webhook_event_logs(level);
```

### RLS (Segurança)

```sql
-- webhook_events: somente service role
ALTER TABLE webhook_events ENABLE ROW LEVEL SECURITY;
-- Nenhuma policy para anon/authenticated = bloqueado

-- ml_integrations: usuário vê apenas suas próprias
ALTER TABLE ml_integrations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own integrations"
  ON ml_integrations FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Service role full access to webhook_events"
  ON webhook_events FOR ALL
  USING (true)
  WITH CHECK (true);
-- (aplica apenas a service_role por default quando sem policy para anon)
```

---

## Fase 2: Edge Function ml-webhook-ingest

Responsável por receber notificações e enfileirar rapidamente.

### Arquivo: `supabase/functions/ml-webhook-ingest/index.ts`

```typescript
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { createHash } from "https://deno.land/std@0.168.0/hash/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Allowed application IDs (your ML app)
const ALLOWED_APP_IDS = (Deno.env.get("ML_APP_ID") || "").split(",");

serve(async (req) => {
  const startTime = Date.now();
  
  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Only accept POST
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  // Validate Content-Type
  const contentType = req.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) {
    return new Response("Invalid content type", { status: 400 });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    // Parse body with size limit (100KB)
    const bodyText = await req.text();
    if (bodyText.length > 102400) {
      console.error("[ml-webhook-ingest] Payload too large");
      return new Response("Payload too large", { status: 413 });
    }

    const payload = JSON.parse(bodyText);
    console.log("[ml-webhook-ingest] Received:", JSON.stringify(payload).substring(0, 500));

    // Validate minimum fields
    const { topic, resource, user_id, application_id, _id, sent } = payload;

    if (!topic || !resource || !user_id) {
      console.error("[ml-webhook-ingest] Missing required fields");
      return new Response(JSON.stringify({ error: "Missing required fields" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Validate application_id if provided
    if (application_id && ALLOWED_APP_IDS.length > 0 && !ALLOWED_APP_IDS.includes(String(application_id))) {
      console.warn("[ml-webhook-ingest] Unknown application_id:", application_id);
      // Still accept but log - ML might send for valid reasons
    }

    // Generate dedupe_key
    // Format: provider:user_id:topic:resource:event_id_or_timestamp
    const eventId = _id || sent || Date.now().toString();
    const dedupeRaw = `mercadolibre:${user_id}:${topic}:${resource}:${eventId}`;
    const dedupeKey = createHash("sha256").update(dedupeRaw).toString();

    // Check for duplicate
    const { data: existing } = await supabase
      .from("webhook_events")
      .select("id, status")
      .eq("dedupe_key", dedupeKey)
      .maybeSingle();

    if (existing) {
      console.log("[ml-webhook-ingest] Duplicate event, already exists:", existing.id);
      // Return 200 to prevent ML from retrying
      return new Response(JSON.stringify({ 
        status: "duplicate",
        event_id: existing.id 
      }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Insert into queue
    const { data: inserted, error: insertError } = await supabase
      .from("webhook_events")
      .insert({
        provider: "mercadolibre",
        ml_user_id: String(user_id),
        application_id: application_id ? String(application_id) : null,
        topic,
        resource,
        payload_raw: payload,
        dedupe_key: dedupeKey,
        status: "pending",
        received_at: new Date().toISOString(),
      })
      .select("id")
      .single();

    if (insertError) {
      // If duplicate key error, still return 200
      if (insertError.code === "23505") {
        console.log("[ml-webhook-ingest] Race condition duplicate, ignoring");
        return new Response(JSON.stringify({ status: "duplicate" }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      console.error("[ml-webhook-ingest] Insert error:", insertError);
      // Return 200 anyway to prevent infinite retries from ML
      return new Response(JSON.stringify({ 
        status: "error",
        error: "queue_failed" 
      }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const duration = Date.now() - startTime;
    console.log(`[ml-webhook-ingest] Queued event ${inserted.id} in ${duration}ms`);

    return new Response(JSON.stringify({
      status: "queued",
      event_id: inserted.id,
      topic,
      duration_ms: duration,
    }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err) {
    console.error("[ml-webhook-ingest] Error:", err);
    // Always return 200 to prevent ML from hammering us
    return new Response(JSON.stringify({ 
      status: "error",
      message: "Internal error, event logged" 
    }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
```

### Configuração

No `supabase/config.toml`, adicionar:

```toml
[functions.ml-webhook-ingest]
verify_jwt = false
```

---

## Fase 3: Edge Function ml-worker-process

Processa eventos da fila em background.

### Arquivo: `supabase/functions/ml-worker-process/index.ts`

```typescript
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-internal-key",
};

const INTERNAL_KEY = Deno.env.get("WEBHOOK_WORKER_SECRET") || "change-me-in-production";
const ML_APP_ID = Deno.env.get("ML_APP_ID")!;
const ML_SECRET_KEY = Deno.env.get("ML_SECRET_KEY")!;

const BATCH_SIZE = 25;
const MAX_ATTEMPTS = 5;

// Backoff delays in minutes
const RETRY_DELAYS = [2, 10, 30, 120, 360];

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

serve(async (req) => {
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
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

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
    const eventIds = events.map(e => e.id);
    await supabase
      .from("webhook_events")
      .update({ status: "processing" })
      .in("id", eventIds);

    // Process each event
    for (const event of events) {
      stats.processed++;

      try {
        // Get integration settings for this ML user
        const { data: integration } = await supabase
          .from("ml_integrations")
          .select("*")
          .eq("ml_user_id", event.ml_user_id)
          .maybeSingle();

        // If no integration found, check if we have an ml_account
        if (!integration) {
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
          await supabase.from("ml_integrations").insert({
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
          });
        }

        // Re-fetch integration
        const { data: currentIntegration } = await supabase
          .from("ml_integrations")
          .select("*")
          .eq("ml_user_id", event.ml_user_id)
          .single();

        // Check if integration is active
        if (currentIntegration.status !== "active") {
          await markEventError(supabase, event.id, "INTEGRATION_INACTIVE", `Status: ${currentIntegration.status}`);
          stats.skipped++;
          continue;
        }

        // Check daily limit
        const featureFlags = currentIntegration.feature_flags || {};
        const dailyLimit = featureFlags.daily_event_limit || 500;
        
        // Reset counter if needed
        const resetAt = currentIntegration.daily_events_reset_at 
          ? new Date(currentIntegration.daily_events_reset_at) 
          : null;
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        let currentCount = currentIntegration.daily_events_count || 0;
        if (!resetAt || resetAt < today) {
          // Reset counter
          currentCount = 0;
          await supabase
            .from("ml_integrations")
            .update({ 
              daily_events_count: 0, 
              daily_events_reset_at: today.toISOString() 
            })
            .eq("id", currentIntegration.id);
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
          
          stats.rate_limited++;
          continue;
        }

        // Check if feature is enabled for this topic
        const topicFeatureMap: Record<string, string> = {
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
          
          await logEvent(supabase, event.id, "info", `Feature ${featureKey} not enabled, skipping`);
          stats.skipped++;
          continue;
        }

        // Process based on topic
        let processResult: { success: boolean; error?: string };
        
        switch (event.topic) {
          case "items":
            processResult = await processItemEvent(supabase, event, currentIntegration);
            break;
          case "orders_v2":
          case "orders":
            processResult = await processOrderEvent(supabase, event, currentIntegration);
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
              processed_at: new Date().toISOString() 
            })
            .eq("id", event.id);
          
          // Increment daily counter
          await supabase
            .from("ml_integrations")
            .update({ daily_events_count: currentCount + 1 })
            .eq("id", currentIntegration.id);
          
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

      // Small delay between events
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
async function markEventError(supabase: any, eventId: string, code: string, message: string) {
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

async function handleEventRetry(supabase: any, event: any, error: string) {
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
}

async function logEvent(supabase: any, eventId: string, level: string, message: string, details?: any) {
  await supabase.from("webhook_event_logs").insert({
    event_id: eventId,
    level,
    message,
    details,
  });
}

// Topic processors
async function processItemEvent(supabase: any, event: any, integration: any): Promise<{ success: boolean; error?: string }> {
  const resource = event.resource; // e.g., "/items/MLB12345"
  const itemIdMatch = resource.match(/\/items\/(MLB\d+)/);
  
  if (!itemIdMatch) {
    return { success: false, error: "Invalid resource format" };
  }

  const itemId = itemIdMatch[1];

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
    return { success: false, error: `ML_API_${itemResponse.status}` };
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
      onConflict: "seller_id,item_id,variation_id" 
    });

  if (upsertError) {
    return { success: false, error: `DB_UPSERT: ${upsertError.message}` };
  }

  return { success: true };
}

async function processOrderEvent(supabase: any, event: any, integration: any): Promise<{ success: boolean; error?: string }> {
  // Orders processing - similar to items but for order data
  // This would follow the existing pattern in ml-sync-orders
  
  // For MVP, just mark as success and log
  await logEvent(supabase, event.id, "info", "Order event received, manual sync recommended");
  return { success: true };
}
```

### Configuração

No `supabase/config.toml`:

```toml
[functions.ml-worker-process]
verify_jwt = false
```

---

## Fase 4: Agendamento do Worker

### Opção A: Supabase pg_cron (Recomendado)

Criar função SQL + job:

```sql
-- Função para chamar o worker
CREATE OR REPLACE FUNCTION public.trigger_ml_worker()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  PERFORM net.http_post(
    url := current_setting('app.supabase_url') || '/functions/v1/ml-worker-process',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-internal-key', current_setting('app.webhook_worker_secret')
    ),
    body := '{}'::jsonb
  );
END;
$$;

-- Agendar para rodar a cada 3 minutos (requer pg_cron habilitado)
SELECT cron.schedule(
  'ml-webhook-worker',
  '*/3 * * * *',
  'SELECT public.trigger_ml_worker()'
);
```

### Opção B: Chamada Externa (se pg_cron não disponível)

Configurar um serviço externo (cron-job.org, GitHub Actions, etc.) para chamar:

```bash
curl -X POST https://rfckrbqwdsejicjlxqdv.supabase.co/functions/v1/ml-worker-process \
  -H "Content-Type: application/json" \
  -H "x-internal-key: YOUR_SECRET_KEY"
```

---

## Fase 5: Segredo Adicional

Adicionar secret para proteção do worker:

```
WEBHOOK_WORKER_SECRET=uma-chave-longa-e-segura-gerada-aleatoriamente
```

---

## Fase 6: Registro no Mercado Livre

URL a configurar nas notifications do seu App no ML:

```
https://rfckrbqwdsejicjlxqdv.supabase.co/functions/v1/ml-webhook-ingest
```

Topics recomendados para ativar:
- `items` - Mudanças em anúncios
- `orders_v2` - Vendas (se o plano permitir)
- `questions` - Perguntas (se o plano permitir)
- `messages` - Mensagens (se o plano permitir)

---

## Resumo de Arquivos

| Arquivo | Ação |
|---------|------|
| `supabase/functions/ml-webhook-ingest/index.ts` | Criar |
| `supabase/functions/ml-worker-process/index.ts` | Criar |
| `supabase/config.toml` | Adicionar configs das novas functions |
| Migration SQL | Criar tabelas + índices + RLS |
| Secret `WEBHOOK_WORKER_SECRET` | Adicionar |

---

## Resultado Esperado

1. Mercado Livre envia notificação para a Edge Function
2. Evento é validado e inserido na fila em <100ms
3. Worker processa em background a cada 3 minutos
4. Limites de plano são respeitados automaticamente
5. Retry com backoff exponencial para falhas temporárias
6. Logs detalhados para diagnóstico
7. Dados de itens atualizados em `meli_listings_cache`

