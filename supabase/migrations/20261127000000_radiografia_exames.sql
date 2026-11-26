-- Radiografia v2 — exames que não se perdem.
-- listing_daily_metrics: visitas por anúncio por dia (backfill de até 150 dias + coleta diária)
CREATE TABLE IF NOT EXISTS public.listing_daily_metrics (
  seller_id TEXT NOT NULL,
  item_id TEXT NOT NULL,
  day DATE NOT NULL,
  visits INTEGER NOT NULL DEFAULT 0,
  collected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (seller_id, item_id, day)
);
CREATE INDEX IF NOT EXISTS idx_ldm_seller_day ON public.listing_daily_metrics (seller_id, day);

-- listing_exam_items: estado atual de cada anúncio (preço, estoque, qualidade, idade)
CREATE TABLE IF NOT EXISTS public.listing_exam_items (
  seller_id TEXT NOT NULL,
  item_id TEXT NOT NULL,
  title TEXT, thumbnail TEXT, permalink TEXT, status TEXT,
  price NUMERIC, original_price NUMERIC, available_quantity INTEGER, sold_quantity INTEGER,
  health NUMERIC, listing_type_id TEXT, logistic_type TEXT, free_shipping BOOLEAN,
  catalog_listing BOOLEAN, user_product_id TEXT, date_created TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (seller_id, item_id)
);

-- listing_exam_runs: lista de anúncios da coleta em andamento (a tela processa em lotes)
CREATE TABLE IF NOT EXISTS public.listing_exam_runs (
  seller_id TEXT PRIMARY KEY,
  item_ids JSONB NOT NULL DEFAULT '[]',
  total INTEGER NOT NULL DEFAULT 0,
  last_cursor INTEGER NOT NULL DEFAULT 0,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ,
  claims_at TIMESTAMPTZ,
  claims_error TEXT
);

-- listing_claims: reclamações (claims) ligadas ao anúncio pelo pedido
CREATE TABLE IF NOT EXISTS public.listing_claims (
  claim_id TEXT PRIMARY KEY,
  seller_id TEXT NOT NULL,
  order_id TEXT,
  item_id TEXT,
  reason_id TEXT, status TEXT, stage TEXT, type TEXT,
  date_created TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_listing_claims_item ON public.listing_claims (seller_id, item_id);

-- Tratamentos: o "remédio" aplicado e quando, para medir antes x depois
CREATE TABLE IF NOT EXISTS public.listing_treatments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL DEFAULT auth.uid(),
  seller_id TEXT NOT NULL,
  item_id TEXT NOT NULL,
  disease TEXT,
  remedy TEXT NOT NULL,
  note TEXT,
  applied_at DATE NOT NULL DEFAULT current_date,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_listing_treatments_item ON public.listing_treatments (seller_id, item_id);

-- Leitura: só contas do próprio usuário
CREATE OR REPLACE FUNCTION public.owns_seller(p_seller text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM unified_marketplace_accounts WHERE seller_id = p_seller AND user_id = auth.uid());
$$;

ALTER TABLE public.listing_daily_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.listing_exam_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.listing_exam_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.listing_claims ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.listing_treatments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "own read" ON public.listing_daily_metrics;
CREATE POLICY "own read" ON public.listing_daily_metrics FOR SELECT USING (public.owns_seller(seller_id));
DROP POLICY IF EXISTS "own read" ON public.listing_exam_items;
CREATE POLICY "own read" ON public.listing_exam_items FOR SELECT USING (public.owns_seller(seller_id));
DROP POLICY IF EXISTS "own read" ON public.listing_exam_runs;
CREATE POLICY "own read" ON public.listing_exam_runs FOR SELECT USING (public.owns_seller(seller_id));
DROP POLICY IF EXISTS "own read" ON public.listing_claims;
CREATE POLICY "own read" ON public.listing_claims FOR SELECT USING (public.owns_seller(seller_id));
DROP POLICY IF EXISTS "own all" ON public.listing_treatments;
CREATE POLICY "own all" ON public.listing_treatments FOR ALL
  USING (public.owns_seller(seller_id)) WITH CHECK (public.owns_seller(seller_id) AND user_id = auth.uid());
GRANT SELECT ON public.listing_daily_metrics, public.listing_exam_items, public.listing_exam_runs, public.listing_claims TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.listing_treatments TO authenticated;

CREATE OR REPLACE FUNCTION public.listing_last_visit_day(p_seller text, p_items text[])
RETURNS TABLE(item_id text, last_day date) LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT m.item_id, max(m.day) FROM listing_daily_metrics m
  WHERE m.seller_id = p_seller AND m.item_id = ANY(p_items) GROUP BY m.item_id;
$$;
REVOKE ALL ON FUNCTION public.listing_last_visit_day(text, text[]) FROM PUBLIC, anon, authenticated;
