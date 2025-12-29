-- =============================================
-- MÓDULO ETIQUETAS DE ENVIO - TABELAS E VIEW
-- =============================================

-- 1. Tabela meli_orders_cache
CREATE TABLE public.meli_orders_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  seller_id text NOT NULL,
  order_id text NOT NULL,
  created_at_meli timestamptz NULL,
  order_status text NULL,
  shipment_id text NULL,
  buyer_nickname text NULL,
  total_amount numeric NULL,
  last_sync_at timestamptz NOT NULL DEFAULT now(),
  
  CONSTRAINT meli_orders_cache_seller_order_unique UNIQUE (seller_id, order_id)
);

CREATE INDEX idx_meli_orders_cache_seller_date ON public.meli_orders_cache (seller_id, created_at_meli DESC);
CREATE INDEX idx_meli_orders_cache_seller_status ON public.meli_orders_cache (seller_id, order_status);
CREATE INDEX idx_meli_orders_cache_seller_shipment ON public.meli_orders_cache (seller_id, shipment_id);
CREATE INDEX idx_meli_orders_cache_user ON public.meli_orders_cache (user_id);

ALTER TABLE public.meli_orders_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "meli_orders_cache_all" ON public.meli_orders_cache
  FOR ALL USING (auth.uid() = user_id);

-- 2. Tabela meli_shipments_cache
CREATE TABLE public.meli_shipments_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  seller_id text NOT NULL,
  order_id text NOT NULL,
  shipment_id text NOT NULL,
  shipment_status text NULL,
  shipment_substatus text NULL,
  tracking_number text NULL,
  label_available boolean NOT NULL DEFAULT false,
  receiver_name text NULL,
  receiver_address text NULL,
  last_sync_at timestamptz NOT NULL DEFAULT now(),
  
  CONSTRAINT meli_shipments_cache_seller_shipment_unique UNIQUE (seller_id, shipment_id)
);

CREATE INDEX idx_meli_shipments_cache_seller_order ON public.meli_shipments_cache (seller_id, order_id);
CREATE INDEX idx_meli_shipments_cache_seller_status ON public.meli_shipments_cache (seller_id, shipment_status);
CREATE INDEX idx_meli_shipments_cache_seller_label ON public.meli_shipments_cache (seller_id, label_available);
CREATE INDEX idx_meli_shipments_cache_user ON public.meli_shipments_cache (user_id);

ALTER TABLE public.meli_shipments_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "meli_shipments_cache_all" ON public.meli_shipments_cache
  FOR ALL USING (auth.uid() = user_id);

-- 3. Tabela meli_invoices_cache
CREATE TABLE public.meli_invoices_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  seller_id text NOT NULL,
  order_id text NOT NULL,
  invoice_status text NOT NULL DEFAULT 'pendente' 
    CHECK (invoice_status IN ('emitida', 'pendente', 'erro', 'nao_localizada')),
  invoice_number text NULL,
  invoice_key text NULL,
  issued_at timestamptz NULL,
  error_message text NULL,
  last_sync_at timestamptz NOT NULL DEFAULT now(),
  
  CONSTRAINT meli_invoices_cache_seller_order_unique UNIQUE (seller_id, order_id)
);

CREATE INDEX idx_meli_invoices_cache_seller_status ON public.meli_invoices_cache (seller_id, invoice_status);
CREATE INDEX idx_meli_invoices_cache_seller_issued ON public.meli_invoices_cache (seller_id, issued_at DESC);
CREATE INDEX idx_meli_invoices_cache_user ON public.meli_invoices_cache (user_id);

ALTER TABLE public.meli_invoices_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "meli_invoices_cache_all" ON public.meli_invoices_cache
  FOR ALL USING (auth.uid() = user_id);

-- 4. Tabela meli_print_queue
CREATE TABLE public.meli_print_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  seller_id text NOT NULL,
  format text NOT NULL CHECK (format IN ('pdf', 'zpl')),
  shipment_ids jsonb NOT NULL,
  total_labels integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'gerada' CHECK (status IN ('gerada', 'erro')),
  file_url text NULL,
  zpl_content text NULL,
  error_log text NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_meli_print_queue_seller_created ON public.meli_print_queue (seller_id, created_at DESC);
CREATE INDEX idx_meli_print_queue_seller_format ON public.meli_print_queue (seller_id, format);
CREATE INDEX idx_meli_print_queue_seller_status ON public.meli_print_queue (seller_id, status);
CREATE INDEX idx_meli_print_queue_user ON public.meli_print_queue (user_id);

ALTER TABLE public.meli_print_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "meli_print_queue_all" ON public.meli_print_queue
  FOR ALL USING (auth.uid() = user_id);

-- 5. View meli_orders_ready_view
CREATE OR REPLACE VIEW public.meli_orders_ready_view AS
SELECT 
  o.id,
  o.user_id,
  o.seller_id,
  o.order_id,
  o.created_at_meli,
  o.order_status,
  o.shipment_id,
  o.buyer_nickname,
  o.total_amount,
  o.last_sync_at as order_sync_at,
  
  s.shipment_status,
  s.shipment_substatus,
  s.tracking_number,
  s.label_available,
  s.receiver_name,
  s.last_sync_at as shipment_sync_at,
  
  i.invoice_status,
  i.invoice_number,
  i.invoice_key,
  i.issued_at,
  i.last_sync_at as invoice_sync_at,
  
  CASE
    WHEN COALESCE(s.label_available, false) = true AND COALESCE(i.invoice_status, 'pendente') = 'emitida' THEN 'pronta'
    WHEN COALESCE(s.label_available, false) = true AND COALESCE(i.invoice_status, 'pendente') != 'emitida' THEN 'aguardando_nf'
    WHEN o.shipment_id IS NULL OR COALESCE(s.label_available, false) = false THEN 'sem_etiqueta'
    WHEN COALESCE(i.invoice_status, 'pendente') = 'erro' THEN 'erro'
    ELSE 'sem_etiqueta'
  END as final_status,
  
  (COALESCE(s.label_available, false) = true AND COALESCE(i.invoice_status, 'pendente') = 'emitida') as selectable

FROM public.meli_orders_cache o
LEFT JOIN public.meli_shipments_cache s 
  ON o.seller_id = s.seller_id AND o.shipment_id = s.shipment_id
LEFT JOIN public.meli_invoices_cache i 
  ON o.seller_id = i.seller_id AND o.order_id = i.order_id;

-- 6. Storage bucket para PDFs
INSERT INTO storage.buckets (id, name, public)
VALUES ('meli-labels', 'meli-labels', false);

CREATE POLICY "meli_labels_insert" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'meli-labels' AND
    auth.uid()::text = (string_to_array(name, '/'))[1]
  );

CREATE POLICY "meli_labels_select" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'meli-labels' AND
    auth.uid()::text = (string_to_array(name, '/'))[1]
  );

CREATE POLICY "meli_labels_delete" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'meli-labels' AND
    auth.uid()::text = (string_to_array(name, '/'))[1]
  );