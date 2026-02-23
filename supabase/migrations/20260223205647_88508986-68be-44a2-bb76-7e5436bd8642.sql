
-- Table: promotion_agent_config
CREATE TABLE public.promotion_agent_config (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  seller_id TEXT NOT NULL,
  is_enabled BOOLEAN NOT NULL DEFAULT false,
  max_seller_discount NUMERIC NOT NULL DEFAULT 10,
  min_total_discount NUMERIC,
  require_copart BOOLEAN NOT NULL DEFAULT false,
  scope_type TEXT NOT NULL DEFAULT 'all',
  scope_items TEXT[] NOT NULL DEFAULT '{}',
  scope_categories TEXT[] NOT NULL DEFAULT '{}',
  exclude_items TEXT[] NOT NULL DEFAULT '{}',
  accepted_types TEXT[] NOT NULL DEFAULT '{SMART,DEAL,PRICE_MATCHING}',
  accept_unknown_type BOOLEAN NOT NULL DEFAULT false,
  min_stock INTEGER NOT NULL DEFAULT 0,
  min_margin NUMERIC,
  allow_when_margin_unknown BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(workspace_id, seller_id)
);

-- Table: promotion_agent_logs
CREATE TABLE public.promotion_agent_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  seller_id TEXT NOT NULL,
  run_id TEXT NOT NULL,
  triggered_by TEXT NOT NULL DEFAULT 'manual',
  promotions_affected INTEGER NOT NULL DEFAULT 0,
  items_adhered INTEGER NOT NULL DEFAULT 0,
  items_failed INTEGER NOT NULL DEFAULT 0,
  items_skipped INTEGER NOT NULL DEFAULT 0,
  details JSONB NOT NULL DEFAULT '{}',
  executed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(workspace_id, run_id)
);

CREATE INDEX idx_promotion_agent_logs_lookup 
  ON public.promotion_agent_logs (workspace_id, seller_id, executed_at DESC);

-- RLS: promotion_agent_config
ALTER TABLE public.promotion_agent_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can select agent config"
  ON public.promotion_agent_config FOR SELECT
  USING (public.is_workspace_member(auth.uid(), workspace_id));

CREATE POLICY "Members can insert agent config"
  ON public.promotion_agent_config FOR INSERT
  WITH CHECK (public.is_workspace_member(auth.uid(), workspace_id));

CREATE POLICY "Members can update agent config"
  ON public.promotion_agent_config FOR UPDATE
  USING (public.is_workspace_member(auth.uid(), workspace_id));

CREATE POLICY "Members can delete agent config"
  ON public.promotion_agent_config FOR DELETE
  USING (public.is_workspace_member(auth.uid(), workspace_id));

-- RLS: promotion_agent_logs
ALTER TABLE public.promotion_agent_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view agent logs"
  ON public.promotion_agent_logs FOR SELECT
  USING (public.is_workspace_member(auth.uid(), workspace_id));

-- Trigger updated_at
CREATE TRIGGER set_promotion_agent_config_updated_at
  BEFORE UPDATE ON public.promotion_agent_config
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_set_updated_at();
