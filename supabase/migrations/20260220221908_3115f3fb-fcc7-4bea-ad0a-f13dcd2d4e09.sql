
-- ══════════════════════════════════════════════════════════
--  REAL-TIME OPERACIONAL — Tabelas de eventos e fila hot
-- ══════════════════════════════════════════════════════════

-- 1) operational_events: trilha de eventos operacionais por pedido
CREATE TABLE IF NOT EXISTS public.operational_events (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   uuid NOT NULL,
  seller_id    text NOT NULL,
  user_id      uuid NOT NULL,
  order_id     text NOT NULL,
  event_type   text NOT NULL,
  status       text NOT NULL DEFAULT 'ok',
  metadata     jsonb,
  created_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.operational_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see own operational_events"
  ON public.operational_events FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users insert own operational_events"
  ON public.operational_events FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Service role full access operational_events"
  ON public.operational_events FOR ALL
  USING (auth.role() = 'service_role');

CREATE INDEX IF NOT EXISTS idx_operational_events_company_created
  ON public.operational_events (company_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_operational_events_order
  ON public.operational_events (seller_id, order_id, created_at DESC);

-- 2) hot_orders_queue: fila de pedidos para sync rápido
CREATE TABLE IF NOT EXISTS public.hot_orders_queue (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      uuid NOT NULL,
  seller_id       text NOT NULL,
  user_id         uuid NOT NULL,
  order_id        text NOT NULL,
  priority        int NOT NULL DEFAULT 0,
  last_checked_at timestamptz,
  next_check_at   timestamptz NOT NULL DEFAULT now(),
  expires_at      timestamptz NOT NULL DEFAULT (now() + interval '6 hours'),
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (seller_id, order_id)
);

ALTER TABLE public.hot_orders_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see own hot_orders_queue"
  ON public.hot_orders_queue FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users insert own hot_orders_queue"
  ON public.hot_orders_queue FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update own hot_orders_queue"
  ON public.hot_orders_queue FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users delete own hot_orders_queue"
  ON public.hot_orders_queue FOR DELETE
  USING (auth.uid() = user_id);

CREATE POLICY "Service role full access hot_orders_queue"
  ON public.hot_orders_queue FOR ALL
  USING (auth.role() = 'service_role');

CREATE INDEX IF NOT EXISTS idx_hot_orders_queue_next_check
  ON public.hot_orders_queue (seller_id, next_check_at);

CREATE INDEX IF NOT EXISTS idx_hot_orders_queue_company
  ON public.hot_orders_queue (company_id, priority DESC, next_check_at);

-- 3) quick_sync_state: lock e estado do mini-sync por empresa
CREATE TABLE IF NOT EXISTS public.quick_sync_state (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id           uuid NOT NULL UNIQUE,
  seller_id            text NOT NULL,
  user_id              uuid NOT NULL,
  is_running           boolean NOT NULL DEFAULT false,
  last_run_at          timestamptz,
  last_run_duration_ms int,
  orders_checked       int DEFAULT 0,
  changes_found        int DEFAULT 0,
  last_error           text,
  cooldown_until       timestamptz,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.quick_sync_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see own quick_sync_state"
  ON public.quick_sync_state FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Service role full quick_sync_state"
  ON public.quick_sync_state FOR ALL
  USING (auth.role() = 'service_role');

CREATE TRIGGER set_quick_sync_state_updated_at
  BEFORE UPDATE ON public.quick_sync_state
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
