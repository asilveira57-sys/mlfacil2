
-- =============================================
-- SHIPPING CUTOFF CACHE
-- =============================================
CREATE TABLE public.shipping_cutoff_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL,
  seller_id UUID NOT NULL,
  provider TEXT NOT NULL DEFAULT 'meli',
  date_ref DATE NOT NULL,
  timezone TEXT NOT NULL DEFAULT 'America/Sao_Paulo',
  
  -- FLEX
  flex_enabled BOOLEAN NOT NULL DEFAULT false,
  flex_cutoff_type TEXT NULL, -- single | by_zone | unknown
  flex_cutoff_time TEXT NULL, -- HH:MM
  flex_zone_summary_first TEXT NULL,
  flex_zone_summary_last TEXT NULL,
  flex_zone_details JSONB NULL,
  
  -- COLETA / PLACES
  colecta_enabled BOOLEAN NOT NULL DEFAULT false,
  colecta_cutoff_time TEXT NULL,
  colecta_window_from TEXT NULL,
  colecta_window_to TEXT NULL,
  colecta_cutoff_calculated BOOLEAN NOT NULL DEFAULT false,
  
  -- OPERATIONAL
  source_payload JSONB NULL,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'ok', -- ok | partial | error
  error_message TEXT NULL,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  CONSTRAINT uq_cutoff_company_seller_date UNIQUE (company_id, seller_id, date_ref)
);

CREATE INDEX idx_cutoff_company_seller ON public.shipping_cutoff_cache (company_id, seller_id);
CREATE INDEX idx_cutoff_date_ref ON public.shipping_cutoff_cache (date_ref);
CREATE INDEX idx_cutoff_expires_at ON public.shipping_cutoff_cache (expires_at);

ALTER TABLE public.shipping_cutoff_cache ENABLE ROW LEVEL SECURITY;

-- Seller sees own records via company membership
CREATE POLICY "Users can view their own cutoff cache"
  ON public.shipping_cutoff_cache FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.companies c
      WHERE c.id = shipping_cutoff_cache.company_id
        AND c.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert their own cutoff cache"
  ON public.shipping_cutoff_cache FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.companies c
      WHERE c.id = shipping_cutoff_cache.company_id
        AND c.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update their own cutoff cache"
  ON public.shipping_cutoff_cache FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.companies c
      WHERE c.id = shipping_cutoff_cache.company_id
        AND c.user_id = auth.uid()
    )
  );

-- Admin policy
CREATE POLICY "Admins can view all cutoff cache"
  ON public.shipping_cutoff_cache FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));

-- Service role bypass for edge functions
CREATE POLICY "Service role full access cutoff cache"
  ON public.shipping_cutoff_cache FOR ALL
  USING (auth.role() = 'service_role');

-- Updated at trigger
CREATE TRIGGER update_shipping_cutoff_cache_updated_at
  BEFORE UPDATE ON public.shipping_cutoff_cache
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =============================================
-- SHIPPING CUTOFF LOGS
-- =============================================
CREATE TABLE public.shipping_cutoff_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NULL,
  seller_id UUID NULL,
  action TEXT NOT NULL, -- auto_refresh | manual_refresh | read_cache | api_error
  status TEXT NOT NULL DEFAULT 'success', -- success | partial | error
  execution_time_ms INTEGER NULL,
  payload_summary JSONB NULL,
  error_message TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_cutoff_logs_company_seller ON public.shipping_cutoff_logs (company_id, seller_id);
CREATE INDEX idx_cutoff_logs_created_at ON public.shipping_cutoff_logs (created_at);

ALTER TABLE public.shipping_cutoff_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own cutoff logs"
  ON public.shipping_cutoff_logs FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.companies c
      WHERE c.id = shipping_cutoff_logs.company_id
        AND c.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert cutoff logs"
  ON public.shipping_cutoff_logs FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.companies c
      WHERE c.id = shipping_cutoff_logs.company_id
        AND c.user_id = auth.uid()
    )
  );

CREATE POLICY "Admins can view all cutoff logs"
  ON public.shipping_cutoff_logs FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Service role full access cutoff logs"
  ON public.shipping_cutoff_logs FOR ALL
  USING (auth.role() = 'service_role');
