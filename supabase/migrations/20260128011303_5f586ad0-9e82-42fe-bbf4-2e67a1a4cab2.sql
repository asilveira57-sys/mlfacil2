-- =============================================
-- INTEGRAÇÃO TINY/OLIST + FILA NFS-e
-- =============================================

-- Adicionar campos extras na tabela erp_integrations
ALTER TABLE public.erp_integrations
ADD COLUMN IF NOT EXISTS display_name TEXT,
ADD COLUMN IF NOT EXISTS environment TEXT DEFAULT 'production',
ADD COLUMN IF NOT EXISTS sync_frequency_minutes INT DEFAULT 30,
ADD COLUMN IF NOT EXISTS capture_from_date DATE,
ADD COLUMN IF NOT EXISTS order_status_filter TEXT[] DEFAULT ARRAY['confirmed'],
ADD COLUMN IF NOT EXISTS channel_filter TEXT[],
ADD COLUMN IF NOT EXISTS last_test_status TEXT,
ADD COLUMN IF NOT EXISTS last_test_message TEXT;

-- Configurações de NFS-e por empresa
CREATE TABLE IF NOT EXISTS public.nfse_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL,
  service_description TEXT,
  service_code TEXT,
  cnae TEXT,
  aliquota_iss NUMERIC(5,2),
  natureza_operacao TEXT,
  observacoes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(company_id)
);

-- Mapeamento de campos do tomador
CREATE TABLE IF NOT EXISTS public.nfse_field_mappings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL,
  provider TEXT NOT NULL, -- 'tiny' | 'olist'
  target_field TEXT NOT NULL, -- 'nome', 'documento', 'email', etc.
  source_path TEXT NOT NULL, -- caminho no JSON de origem ex: 'cliente.nome'
  fallback_value TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(company_id, provider, target_field)
);

-- Log de execuções de sincronização
CREATE TABLE IF NOT EXISTS public.integration_sync_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  integration_id UUID NOT NULL REFERENCES public.erp_integrations(id) ON DELETE CASCADE,
  company_id UUID NOT NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'running', -- 'running', 'success', 'partial', 'failed'
  orders_fetched INT DEFAULT 0,
  orders_created INT DEFAULT 0,
  orders_updated INT DEFAULT 0,
  orders_failed INT DEFAULT 0,
  error_message TEXT,
  error_details JSONB
);

-- Pedidos de serviço capturados
CREATE TABLE IF NOT EXISTS public.service_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL,
  integration_id UUID REFERENCES public.erp_integrations(id) ON DELETE SET NULL,
  provider TEXT NOT NULL, -- 'tiny' | 'olist'
  external_order_id TEXT NOT NULL,
  external_order_number TEXT,
  order_date TIMESTAMPTZ,
  order_status TEXT,
  channel TEXT, -- marketplace, site, etc.
  total_value NUMERIC(12,2),
  raw_data JSONB,
  customer_id UUID,
  nfse_status TEXT DEFAULT 'pending', -- 'pending', 'ready', 'issued', 'error'
  nfse_error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(company_id, provider, external_order_id)
);

-- Clientes/Tomadores normalizados
CREATE TABLE IF NOT EXISTS public.service_order_customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL,
  external_customer_id TEXT,
  provider TEXT,
  nome TEXT,
  documento TEXT, -- CPF ou CNPJ
  documento_tipo TEXT, -- 'cpf' | 'cnpj'
  email TEXT,
  telefone TEXT,
  endereco_rua TEXT,
  endereco_numero TEXT,
  endereco_complemento TEXT,
  endereco_bairro TEXT,
  endereco_cidade TEXT,
  endereco_uf TEXT,
  endereco_cep TEXT,
  observacoes TEXT,
  is_complete BOOLEAN DEFAULT false,
  missing_fields TEXT[],
  raw_data JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(company_id, documento)
);

-- Adicionar FK do customer na service_orders
ALTER TABLE public.service_orders
ADD CONSTRAINT fk_service_orders_customer
FOREIGN KEY (customer_id) REFERENCES public.service_order_customers(id) ON DELETE SET NULL;

-- Fila de NFS-e específica para serviços
CREATE TABLE IF NOT EXISTS public.service_invoice_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL,
  service_order_id UUID REFERENCES public.service_orders(id) ON DELETE CASCADE,
  customer_id UUID REFERENCES public.service_order_customers(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'ready', 'processing', 'issued', 'error', 'cancelled'
  nfse_number TEXT,
  nfse_protocol TEXT,
  nfse_url TEXT,
  issued_at TIMESTAMPTZ,
  service_description TEXT,
  service_code TEXT,
  valor_servico NUMERIC(12,2),
  valor_iss NUMERIC(12,2),
  error_message TEXT,
  retry_count INT DEFAULT 0,
  last_retry_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Eventos/histórico de cada item na fila
CREATE TABLE IF NOT EXISTS public.service_invoice_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  queue_id UUID REFERENCES public.service_invoice_queue(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL, -- 'created', 'data_completed', 'submitted', 'issued', 'error', 'retry', 'cancelled'
  event_data JSONB,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_service_orders_company_status ON public.service_orders(company_id, nfse_status);
CREATE INDEX IF NOT EXISTS idx_service_orders_provider ON public.service_orders(provider, external_order_id);
CREATE INDEX IF NOT EXISTS idx_service_invoice_queue_status ON public.service_invoice_queue(company_id, status);
CREATE INDEX IF NOT EXISTS idx_integration_sync_runs_integration ON public.integration_sync_runs(integration_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_service_order_customers_documento ON public.service_order_customers(company_id, documento);

-- RLS
ALTER TABLE public.nfse_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nfse_field_mappings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.integration_sync_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_order_customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_invoice_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_invoice_events ENABLE ROW LEVEL SECURITY;

-- Políticas RLS (admin via função has_role)
CREATE POLICY "Admins can manage nfse_settings" ON public.nfse_settings
  FOR ALL USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can manage nfse_field_mappings" ON public.nfse_field_mappings
  FOR ALL USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can view integration_sync_runs" ON public.integration_sync_runs
  FOR ALL USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can manage service_orders" ON public.service_orders
  FOR ALL USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can manage service_order_customers" ON public.service_order_customers
  FOR ALL USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can manage service_invoice_queue" ON public.service_invoice_queue
  FOR ALL USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can manage service_invoice_events" ON public.service_invoice_events
  FOR ALL USING (public.has_role(auth.uid(), 'admin'));