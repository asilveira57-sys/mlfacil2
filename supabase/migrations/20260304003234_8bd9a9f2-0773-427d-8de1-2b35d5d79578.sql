
-- ============================================================
-- EMAIL MODULE - Phase 2: Event Rules & Dedup
-- ============================================================

-- Enum for scope
CREATE TYPE public.email_scope AS ENUM ('user', 'company', 'both');

-- ============================================================
-- D) Event Rules
-- ============================================================
CREATE TABLE public.email_event_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_key TEXT NOT NULL UNIQUE,
  template_id UUID NOT NULL REFERENCES public.email_templates(id),
  is_enabled BOOLEAN NOT NULL DEFAULT true,
  scope public.email_scope NOT NULL DEFAULT 'user',
  cooldown_minutes INTEGER NOT NULL DEFAULT 0,
  max_per_day INTEGER NOT NULL DEFAULT 10,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.email_event_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_manage_event_rules" ON public.email_event_rules
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER set_email_event_rules_updated_at
  BEFORE UPDATE ON public.email_event_rules
  FOR EACH ROW EXECUTE FUNCTION public.trigger_set_updated_at();

-- ============================================================
-- D2) Event Dedup
-- ============================================================
CREATE TABLE public.email_event_dedup (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_key TEXT NOT NULL,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  company_id UUID,
  dedup_key TEXT NOT NULL DEFAULT '',
  last_sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  sent_count_day INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.email_event_dedup ENABLE ROW LEVEL SECURITY;

-- Only service role writes to dedup (via edge functions)
CREATE POLICY "admin_read_event_dedup" ON public.email_event_dedup
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "service_manage_event_dedup" ON public.email_event_dedup
  FOR ALL TO authenticated
  WITH CHECK (true);

CREATE INDEX idx_email_event_dedup_lookup 
  ON public.email_event_dedup (event_key, user_id, company_id, dedup_key);

CREATE TRIGGER set_email_event_dedup_updated_at
  BEFORE UPDATE ON public.email_event_dedup
  FOR EACH ROW EXECUTE FUNCTION public.trigger_set_updated_at();
