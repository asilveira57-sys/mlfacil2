-- Pedidos Shopee (27/nov/2026).
-- Política de dados da Shopee (DPP 10.6/10.7, declaração assinada em 27/nov): não guardar dados pessoais do
-- comprador por mais de 90 dias. Por isso esta tabela NÃO guarda nome, telefone, e-mail nem endereço do
-- comprador. A etiqueta (que tem o endereço) é gerada na hora e entregue ao navegador, sem ficar gravada.
-- Por segurança, pedidos com mais de 90 dias também são apagados todo dia (cron abaixo).
CREATE TABLE IF NOT EXISTS public.shopee_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  shopee_account_id uuid NOT NULL REFERENCES public.shopee_accounts(id) ON DELETE CASCADE,
  shop_id bigint NOT NULL,
  order_sn text NOT NULL,
  order_status text,
  create_time timestamptz,
  update_time timestamptz,
  total_amount numeric,
  currency text,
  shipping_carrier text,
  package_number text,
  tracking_number text,
  itens jsonb NOT NULL DEFAULT '[]'::jsonb,       -- [{nome, sku, variacao, quantidade, item_id, model_id}]
  etiqueta_baixada_em timestamptz,
  synced_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (shop_id, order_sn)
);
CREATE INDEX IF NOT EXISTS shopee_orders_user_status_idx ON public.shopee_orders (user_id, order_status, create_time DESC);

ALTER TABLE public.shopee_orders ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS shopee_orders_select_own ON public.shopee_orders;
CREATE POLICY shopee_orders_select_own ON public.shopee_orders FOR SELECT TO authenticated USING (user_id = auth.uid());
REVOKE ALL ON public.shopee_orders FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.shopee_orders FROM authenticated;
GRANT SELECT ON public.shopee_orders TO authenticated;

-- Limpeza diária (04:40): pedidos Shopee com mais de 90 dias
SELECT cron.schedule('shopee-orders-purge-90d', '40 4 * * *',
  $$DELETE FROM public.shopee_orders WHERE create_time < now() - interval '90 days'$$);
