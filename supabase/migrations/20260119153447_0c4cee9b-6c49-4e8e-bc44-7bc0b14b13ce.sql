-- =====================================================
-- INFRASTRUCTURE TABLES FOR NIGHTLY TRENDS JOB
-- =====================================================

-- 1) public_categories: lista configurável de categorias para coleta
CREATE TABLE IF NOT EXISTS public.public_categories (
  id text PRIMARY KEY,
  name text NOT NULL,
  is_active boolean DEFAULT true,
  priority int DEFAULT 10,
  created_at timestamptz DEFAULT now()
);

-- Insert default categories
INSERT INTO public.public_categories (id, name, priority) VALUES
  ('__ROOT__', 'Geral (Raiz)', 1),
  ('MLB5672', 'Acessórios para Veículos', 10),
  ('MLB1051', 'Celulares e Telefones', 10),
  ('MLB1648', 'Computadores', 10),
  ('MLB1144', 'Eletrodomésticos', 10),
  ('MLB1000', 'Eletrônicos', 10),
  ('MLB1276', 'Esportes e Fitness', 10),
  ('MLB263532', 'Ferramentas', 10),
  ('MLB1574', 'Casa, Móveis e Decoração', 10),
  ('MLB1499', 'Indústria e Comércio', 10),
  ('MLB1384', 'Bebês', 10)
ON CONFLICT (id) DO NOTHING;

-- 2) job_locks: lock global para evitar execuções simultâneas
CREATE TABLE IF NOT EXISTS public.job_locks (
  lock_key text PRIMARY KEY,
  locked_at timestamptz NOT NULL DEFAULT now(),
  locked_by text,
  expires_at timestamptz NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- 3) job_runs: registro de cada execução do job
CREATE TABLE IF NOT EXISTS public.job_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_name text NOT NULL,
  status text NOT NULL DEFAULT 'running', -- running, success, partial_success, failed, skipped
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  categories_processed int DEFAULT 0,
  categories_failed int DEFAULT 0,
  keywords_saved int DEFAULT 0,
  highlights_saved int DEFAULT 0,
  items_enriched int DEFAULT 0,
  error_message text,
  created_at timestamptz DEFAULT now()
);

-- 4) job_run_steps: detalhes de cada step/categoria
CREATE TABLE IF NOT EXISTS public.job_run_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_run_id uuid REFERENCES public.job_runs(id) ON DELETE CASCADE,
  category_id text NOT NULL,
  step_type text NOT NULL, -- 'trends' or 'highlights'
  status text NOT NULL DEFAULT 'pending', -- pending, success, failed
  started_at timestamptz,
  finished_at timestamptz,
  items_count int DEFAULT 0,
  error_code text,
  error_message text,
  retry_count int DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

-- 5) public_trends_status: status global para exibição no frontend
CREATE TABLE IF NOT EXISTS public.public_trends_status (
  id text PRIMARY KEY DEFAULT 'main',
  last_run_at timestamptz,
  last_success_at timestamptz,
  last_partial_at timestamptz,
  last_failed_at timestamptz,
  coverage_keywords int DEFAULT 0,
  coverage_highlights int DEFAULT 0,
  total_categories int DEFAULT 0,
  next_run_at timestamptz,
  updated_at timestamptz DEFAULT now()
);

-- Initialize status row
INSERT INTO public.public_trends_status (id) VALUES ('main') ON CONFLICT (id) DO NOTHING;

-- 6) Add entity_type and product_id to highlights_items for PRODUCT support
ALTER TABLE public.highlights_items
ADD COLUMN IF NOT EXISTS entity_type text DEFAULT 'ITEM',
ADD COLUMN IF NOT EXISTS product_id text;

-- 7) Enable RLS on new tables
ALTER TABLE public.public_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.job_locks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.job_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.job_run_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.public_trends_status ENABLE ROW LEVEL SECURITY;

-- 8) RLS policies - public read for status/categories, service role for writes
CREATE POLICY "Public categories are readable by everyone"
ON public.public_categories FOR SELECT
USING (true);

CREATE POLICY "Public trends status is readable by everyone"
ON public.public_trends_status FOR SELECT
USING (true);

CREATE POLICY "Job runs readable by authenticated users"
ON public.job_runs FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Job run steps readable by authenticated users"
ON public.job_run_steps FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Job locks readable by authenticated users"
ON public.job_locks FOR SELECT
TO authenticated
USING (true);