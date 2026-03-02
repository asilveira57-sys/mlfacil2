
-- ============================================================
-- FASE 1: Módulo de Custos V2 – Migrações
-- ============================================================

-- 1.1 Nova tabela: packaging_types
CREATE TABLE public.packaging_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name text NOT NULL,
  height_cm numeric,
  width_cm numeric,
  length_cm numeric,
  cost_value numeric NOT NULL DEFAULT 0,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX idx_packaging_types_company_id ON public.packaging_types(company_id);

ALTER TABLE public.packaging_types ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view packaging_types"
  ON public.packaging_types FOR SELECT
  TO authenticated
  USING (public.is_company_member(auth.uid(), company_id));

CREATE POLICY "Members can insert packaging_types"
  ON public.packaging_types FOR INSERT
  TO authenticated
  WITH CHECK (public.is_company_member(auth.uid(), company_id));

CREATE POLICY "Members can update packaging_types"
  ON public.packaging_types FOR UPDATE
  TO authenticated
  USING (public.is_company_member(auth.uid(), company_id));

CREATE POLICY "Members can delete packaging_types"
  ON public.packaging_types FOR DELETE
  TO authenticated
  USING (public.is_company_member(auth.uid(), company_id));

CREATE TRIGGER update_packaging_types_updated_at
  BEFORE UPDATE ON public.packaging_types
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 1.2 Nova tabela: product_packaging_link
CREATE TABLE public.product_packaging_link (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  product_key text NOT NULL,
  seller_id text NOT NULL,
  packaging_id uuid NOT NULL REFERENCES public.packaging_types(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now()
);

CREATE UNIQUE INDEX idx_product_packaging_link_unique ON public.product_packaging_link(seller_id, product_key);
CREATE INDEX idx_product_packaging_link_company ON public.product_packaging_link(company_id);

ALTER TABLE public.product_packaging_link ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view product_packaging_link"
  ON public.product_packaging_link FOR SELECT
  TO authenticated
  USING (public.is_company_member(auth.uid(), company_id));

CREATE POLICY "Members can insert product_packaging_link"
  ON public.product_packaging_link FOR INSERT
  TO authenticated
  WITH CHECK (public.is_company_member(auth.uid(), company_id));

CREATE POLICY "Members can update product_packaging_link"
  ON public.product_packaging_link FOR UPDATE
  TO authenticated
  USING (public.is_company_member(auth.uid(), company_id));

CREATE POLICY "Members can delete product_packaging_link"
  ON public.product_packaging_link FOR DELETE
  TO authenticated
  USING (public.is_company_member(auth.uid(), company_id));

-- 1.3 Nova tabela: tax_configuration
CREATE TABLE public.tax_configuration (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL UNIQUE REFERENCES public.companies(id) ON DELETE CASCADE,
  das_icms_percent numeric DEFAULT 0,
  pis_percent numeric DEFAULT 0,
  cofins_percent numeric DEFAULT 0,
  irpj_percent numeric DEFAULT 0,
  csll_percent numeric DEFAULT 0,
  difal_enabled boolean DEFAULT false,
  difal_percent numeric DEFAULT 6,
  origin_state varchar(2),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.tax_configuration ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view tax_configuration"
  ON public.tax_configuration FOR SELECT
  TO authenticated
  USING (public.is_company_member(auth.uid(), company_id));

CREATE POLICY "Members can insert tax_configuration"
  ON public.tax_configuration FOR INSERT
  TO authenticated
  WITH CHECK (public.is_company_member(auth.uid(), company_id));

CREATE POLICY "Members can update tax_configuration"
  ON public.tax_configuration FOR UPDATE
  TO authenticated
  USING (public.is_company_member(auth.uid(), company_id));

CREATE TRIGGER update_tax_configuration_updated_at
  BEFORE UPDATE ON public.tax_configuration
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 1.4 Nova tabela: cost_calculation_logs
CREATE TABLE public.cost_calculation_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES public.companies(id) ON DELETE SET NULL,
  seller_id text,
  order_id text,
  receita numeric,
  custo_produto numeric,
  embalagem numeric,
  imposto_percent_total numeric,
  imposto_valor numeric,
  difal_enabled boolean,
  difal_applied boolean,
  origin_state varchar(2),
  destination_state varchar(2),
  lucro_final numeric,
  margem_final numeric,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_cost_calc_logs_company ON public.cost_calculation_logs(company_id);
CREATE INDEX idx_cost_calc_logs_order ON public.cost_calculation_logs(order_id);

ALTER TABLE public.cost_calculation_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view cost_calculation_logs"
  ON public.cost_calculation_logs FOR SELECT
  TO authenticated
  USING (public.is_company_member(auth.uid(), company_id));

CREATE POLICY "Members can insert cost_calculation_logs"
  ON public.cost_calculation_logs FOR INSERT
  TO authenticated
  WITH CHECK (public.is_company_member(auth.uid(), company_id));

-- 1.5 Dropar tabelas legado
DROP TABLE IF EXISTS public.marketplace_fee_rules CASCADE;
DROP TABLE IF EXISTS public.packaging_cost_settings CASCADE;

-- 1.6 Adicionar colunas em order_cost_breakdown_cache
ALTER TABLE public.order_cost_breakdown_cache
  ADD COLUMN IF NOT EXISTS cost_packaging_detail jsonb,
  ADD COLUMN IF NOT EXISTS tax_percent_total numeric,
  ADD COLUMN IF NOT EXISTS tax_value numeric,
  ADD COLUMN IF NOT EXISTS difal_applied boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS last_recalculated_at timestamptz;
