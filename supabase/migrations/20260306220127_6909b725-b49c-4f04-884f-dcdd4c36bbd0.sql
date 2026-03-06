-- =========================================================
-- RETROSPECTIVE SYSTEM – SCHEMA EXTENSION (PART 1)
-- Extend existing tables with missing columns
-- =========================================================

-- 1. EXTEND tenants
ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS trial_started_at  timestamptz,
  ADD COLUMN IF NOT EXISTS trial_ends_at     timestamptz,
  ADD COLUMN IF NOT EXISTS activated_at      timestamptz,
  ADD COLUMN IF NOT EXISTS first_payment_at  timestamptz,
  ADD COLUMN IF NOT EXISTS current_plan_id   uuid;

-- 2. EXTEND companies
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS tenant_id         uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS legal_type        text,
  ADD COLUMN IF NOT EXISTS document_number   text,
  ADD COLUMN IF NOT EXISTS city              text,
  ADD COLUMN IF NOT EXISTS state             text,
  ADD COLUMN IF NOT EXISTS is_primary        boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS logo_uploaded_at  timestamptz;

-- 3. EXTEND account_events (platform events ledger)
ALTER TABLE public.account_events
  ADD COLUMN IF NOT EXISTS marketplace_account_id uuid,
  ADD COLUMN IF NOT EXISTS module            text,
  ADD COLUMN IF NOT EXISTS event_scope       text DEFAULT 'company',
  ADD COLUMN IF NOT EXISTS event_source      text DEFAULT 'system',
  ADD COLUMN IF NOT EXISTS event_date        date;

CREATE INDEX IF NOT EXISTS idx_account_events_tenant_type
  ON public.account_events(tenant_id, event_type);
CREATE INDEX IF NOT EXISTS idx_account_events_company
  ON public.account_events(company_id);
CREATE INDEX IF NOT EXISTS idx_account_events_event_date
  ON public.account_events(event_date);

-- 4. tenant_plan_history
CREATE TABLE IF NOT EXISTS public.tenant_plan_history (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  plan_id             uuid,
  plan_name_snapshot  text NOT NULL,
  billing_type        text NOT NULL DEFAULT 'recurring',
  sales_range_snapshot text,
  started_at          timestamptz NOT NULL DEFAULT now(),
  ended_at            timestamptz,
  is_current          boolean NOT NULL DEFAULT true,
  payment_status      text NOT NULL DEFAULT 'pending',
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tenant_plan_history_tenant
  ON public.tenant_plan_history(tenant_id);

-- 5. retrospective_snapshots
CREATE TABLE IF NOT EXISTS public.retrospective_snapshots (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id               uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  company_id              uuid REFERENCES public.companies(id) ON DELETE CASCADE,
  marketplace_account_id  uuid,
  snapshot_type            text NOT NULL,
  snapshot_date            date NOT NULL DEFAULT CURRENT_DATE,
  period_start             date,
  period_end               date,
  orders_count            integer DEFAULT 0,
  revenue_total           numeric(14,2) DEFAULT 0,
  average_ticket          numeric(14,2) DEFAULT 0,
  ads_spend               numeric(14,2) DEFAULT 0,
  roas                    numeric(8,2) DEFAULT 0,
  acos                    numeric(8,2) DEFAULT 0,
  tacos                   numeric(8,2) DEFAULT 0,
  active_listings         integer DEFAULT 0,
  products_count          integer DEFAULT 0,
  cancellations_count     integer DEFAULT 0,
  cancellations_value     numeric(14,2) DEFAULT 0,
  total_fees              numeric(14,2) DEFAULT 0,
  total_cost              numeric(14,2) DEFAULT 0,
  estimated_profit        numeric(14,2) DEFAULT 0,
  average_margin          numeric(8,2) DEFAULT 0,
  created_at              timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_retro_snapshots_tenant
  ON public.retrospective_snapshots(tenant_id, snapshot_type);
CREATE INDEX IF NOT EXISTS idx_retro_snapshots_company
  ON public.retrospective_snapshots(company_id);

-- 6. retrospective_rules
CREATE TABLE IF NOT EXISTS public.retrospective_rules (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name                text NOT NULL,
  period_days         integer NOT NULL,
  retrospective_type  text NOT NULL,
  applies_to_scope    text NOT NULL DEFAULT 'company',
  is_active           boolean NOT NULL DEFAULT true,
  auto_generate       boolean NOT NULL DEFAULT true,
  auto_send           boolean NOT NULL DEFAULT true,
  created_at          timestamptz NOT NULL DEFAULT now()
);

-- 7. retrospective_targets (generation queue)
CREATE TABLE IF NOT EXISTS public.retrospective_targets (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  company_id    uuid REFERENCES public.companies(id) ON DELETE CASCADE,
  rule_id       uuid REFERENCES public.retrospective_rules(id) ON DELETE SET NULL,
  anchor_date   date NOT NULL,
  due_date      date NOT NULL,
  target_scope  text NOT NULL DEFAULT 'company',
  status        text NOT NULL DEFAULT 'pending',
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_retro_targets_status
  ON public.retrospective_targets(status, due_date);
CREATE INDEX IF NOT EXISTS idx_retro_targets_tenant
  ON public.retrospective_targets(tenant_id);

-- 8. retrospectives (generated reports)
CREATE TABLE IF NOT EXISTS public.retrospectives (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  company_id            uuid REFERENCES public.companies(id) ON DELETE CASCADE,
  rule_id               uuid REFERENCES public.retrospective_rules(id) ON DELETE SET NULL,
  retrospective_type    text NOT NULL,
  title                 text NOT NULL,
  period_start          date NOT NULL,
  period_end            date NOT NULL,
  anchor_start_date     date,
  anchor_end_date       date,
  status                text NOT NULL DEFAULT 'draft',
  pdf_url               text,
  presentation_url      text,
  html_url              text,
  summary_json          jsonb DEFAULT '{}'::jsonb,
  generated_at          timestamptz,
  sent_at               timestamptz,
  created_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_retrospectives_tenant
  ON public.retrospectives(tenant_id, retrospective_type);
CREATE INDEX IF NOT EXISTS idx_retrospectives_company
  ON public.retrospectives(company_id);

-- 9. retrospective_delivery_log
CREATE TABLE IF NOT EXISTS public.retrospective_delivery_log (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  retrospective_id    uuid NOT NULL REFERENCES public.retrospectives(id) ON DELETE CASCADE,
  delivery_channel    text NOT NULL DEFAULT 'internal_notification',
  recipient_email     text,
  recipient_user_id   uuid,
  status              text NOT NULL DEFAULT 'pending',
  sent_at             timestamptz,
  opened_at           timestamptz,
  clicked_at          timestamptz,
  error_message       text,
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_retro_delivery_retro
  ON public.retrospective_delivery_log(retrospective_id);

-- 10. RLS on all new tables
ALTER TABLE public.tenant_plan_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.retrospective_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.retrospective_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.retrospective_targets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.retrospectives ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.retrospective_delivery_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_members_read_plan_history"
  ON public.tenant_plan_history FOR SELECT TO authenticated
  USING (public.is_tenant_member(auth.uid(), tenant_id));

CREATE POLICY "tenant_members_read_snapshots"
  ON public.retrospective_snapshots FOR SELECT TO authenticated
  USING (public.is_tenant_member(auth.uid(), tenant_id));

CREATE POLICY "authenticated_read_rules"
  ON public.retrospective_rules FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "tenant_members_read_targets"
  ON public.retrospective_targets FOR SELECT TO authenticated
  USING (public.is_tenant_member(auth.uid(), tenant_id));

CREATE POLICY "tenant_members_read_retrospectives"
  ON public.retrospectives FOR SELECT TO authenticated
  USING (public.is_tenant_member(auth.uid(), tenant_id));

CREATE POLICY "tenant_members_read_delivery_log"
  ON public.retrospective_delivery_log FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.retrospectives r
      WHERE r.id = retrospective_id
        AND public.is_tenant_member(auth.uid(), r.tenant_id)
    )
  );