-- Shopee: lojas conectadas ao MKTP Fácil (27/nov/2026).
-- Os tokens ficam só no servidor: o usuário logado lê as colunas públicas,
-- mas NÃO as colunas de token (GRANT por coluna). Quem grava é a função shopee-auth.
CREATE TABLE IF NOT EXISTS public.shopee_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  shop_id bigint NOT NULL,
  shop_name text,
  region text,
  ambiente text NOT NULL DEFAULT 'teste',          -- 'teste' (sandbox) ou 'producao'
  status text NOT NULL DEFAULT 'conectada',        -- conectada | expirada | desconectada
  access_token text,
  refresh_token text,
  token_expires_at timestamptz,
  refresh_expires_at timestamptz,
  ultimo_erro text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, shop_id, ambiente)
);

ALTER TABLE public.shopee_accounts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS shopee_accounts_select_own ON public.shopee_accounts;
CREATE POLICY shopee_accounts_select_own ON public.shopee_accounts
  FOR SELECT TO authenticated USING (user_id = auth.uid());

REVOKE ALL ON public.shopee_accounts FROM anon, authenticated;
GRANT SELECT (id, user_id, shop_id, shop_name, region, ambiente, status, token_expires_at,
              refresh_expires_at, ultimo_erro, created_at, updated_at)
  ON public.shopee_accounts TO authenticated;
