
-- =============================================
-- FASE 4: email_campaigns + email_campaign_recipients
-- =============================================

CREATE TYPE public.email_campaign_status AS ENUM ('draft', 'scheduled', 'running', 'paused', 'completed', 'cancelled');

CREATE TABLE public.email_campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  template_id UUID NOT NULL REFERENCES public.email_templates(id) ON DELETE CASCADE,
  status email_campaign_status NOT NULL DEFAULT 'draft',
  audience_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  variables_default JSONB DEFAULT '{}'::jsonb,
  throttle_per_minute INTEGER NOT NULL DEFAULT 60,
  scheduled_at TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  total_recipients INTEGER DEFAULT 0,
  sent_count INTEGER DEFAULT 0,
  failed_count INTEGER DEFAULT 0,
  open_count INTEGER DEFAULT 0,
  click_count INTEGER DEFAULT 0,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.email_campaigns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_manage_email_campaigns" ON public.email_campaigns
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_email_campaigns_updated_at
  BEFORE UPDATE ON public.email_campaigns
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Campaign recipients (pre-built list)
CREATE TABLE public.email_campaign_recipients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES public.email_campaigns(id) ON DELETE CASCADE,
  user_id UUID,
  email TEXT NOT NULL,
  variables_json JSONB DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'queued', 'sent', 'failed', 'skipped')),
  queue_id UUID,
  sent_at TIMESTAMPTZ,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.email_campaign_recipients ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_manage_campaign_recipients" ON public.email_campaign_recipients
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE INDEX idx_campaign_recipients_campaign ON public.email_campaign_recipients (campaign_id, status);
