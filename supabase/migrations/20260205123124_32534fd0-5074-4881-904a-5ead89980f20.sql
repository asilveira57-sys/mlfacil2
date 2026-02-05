-- =====================================================
-- Sistema de Webhooks do Mercado Livre
-- Tabelas: ml_integrations, webhook_events, webhook_event_logs
-- =====================================================

-- 1. Tabela ml_integrations: Configurações de plano e feature flags por conta ML
CREATE TABLE public.ml_integrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  ml_user_id TEXT NOT NULL,
  application_id TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'revoked')),
  plan_id UUID REFERENCES plans(id) ON DELETE SET NULL,
  feature_flags JSONB NOT NULL DEFAULT '{
    "can_sync_items": true,
    "can_sync_orders": false,
    "can_sync_messages": false,
    "can_sync_questions": false,
    "daily_event_limit": 500,
    "worker_frequency_seconds": 180
  }'::jsonb,
  daily_events_count INTEGER NOT NULL DEFAULT 0,
  daily_events_reset_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  CONSTRAINT ml_integrations_user_ml_unique UNIQUE (user_id, ml_user_id)
);

-- Índices para ml_integrations
CREATE INDEX idx_ml_integrations_ml_user_id ON ml_integrations(ml_user_id);
CREATE INDEX idx_ml_integrations_status ON ml_integrations(status);
CREATE INDEX idx_ml_integrations_user_id ON ml_integrations(user_id);

-- Trigger para updated_at
CREATE TRIGGER ml_integrations_updated_at
  BEFORE UPDATE ON ml_integrations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 2. Tabela webhook_events: Fila de eventos recebidos
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
CREATE INDEX idx_webhook_events_received ON webhook_events(received_at DESC);
CREATE INDEX idx_webhook_events_status ON webhook_events(status);

-- 3. Tabela webhook_event_logs: Logs detalhados para diagnóstico
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
CREATE INDEX idx_webhook_event_logs_created ON webhook_event_logs(created_at DESC);

-- =====================================================
-- RLS (Segurança)
-- =====================================================

-- webhook_events: somente service role pode acessar
ALTER TABLE webhook_events ENABLE ROW LEVEL SECURITY;
-- Sem policies para anon/authenticated = bloqueado por padrão

-- webhook_event_logs: somente service role pode acessar
ALTER TABLE webhook_event_logs ENABLE ROW LEVEL SECURITY;
-- Sem policies para anon/authenticated = bloqueado por padrão

-- ml_integrations: usuário vê apenas suas próprias integrações
ALTER TABLE ml_integrations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own integrations"
  ON ml_integrations FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own integrations"
  ON ml_integrations FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own integrations"
  ON ml_integrations FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own integrations"
  ON ml_integrations FOR DELETE
  USING (auth.uid() = user_id);

-- =====================================================
-- Comentários para documentação
-- =====================================================
COMMENT ON TABLE ml_integrations IS 'Configurações de integração ML por usuário, incluindo feature flags e limites de plano';
COMMENT ON TABLE webhook_events IS 'Fila de eventos webhook recebidos do Mercado Livre para processamento assíncrono';
COMMENT ON TABLE webhook_event_logs IS 'Logs detalhados de processamento de eventos para diagnóstico';