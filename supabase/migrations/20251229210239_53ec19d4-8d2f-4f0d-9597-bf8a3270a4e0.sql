-- Corrigir view para usar SECURITY INVOKER (padrão do PostgreSQL)
DROP VIEW IF EXISTS public.meli_orders_ready_view;

CREATE VIEW public.meli_orders_ready_view 
WITH (security_invoker = on)
AS
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