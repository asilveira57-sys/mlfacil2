-- Magalu: lojas conectadas ao MKTP Fácil (28/nov/2026), no mesmo molde de shopee_accounts.
-- A loja é o "tenant" do ID Magalu: o vendedor escolhe a loja na tela de consentimento
-- (choose_tenants=true) e o id vem de GET /seller/v1/portfolios/me (tenant.id).
-- Os tokens ficam só no servidor: o usuário logado lê as colunas públicas,
-- mas NÃO as colunas de token (GRANT por coluna). Quem grava é a função magalu-auth.
CREATE TABLE IF NOT EXISTS public.magalu_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tenant_id text NOT NULL,                         -- id da loja no ID Magalu
  seller_name text,
  ambiente text NOT NULL DEFAULT 'teste',          -- 'teste' (sandbox) ou 'producao'
  status text NOT NULL DEFAULT 'conectada',        -- conectada | expirada | desconectada
  scopes text,                                     -- escopos que o vendedor autorizou
  access_token text,
  refresh_token text,
  token_expires_at timestamptz,
  ultimo_erro text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, tenant_id, ambiente)
);

ALTER TABLE public.magalu_accounts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS magalu_accounts_select_own ON public.magalu_accounts;
CREATE POLICY magalu_accounts_select_own ON public.magalu_accounts
  FOR SELECT TO authenticated USING (user_id = auth.uid());

REVOKE ALL ON public.magalu_accounts FROM anon, authenticated;
GRANT SELECT (id, user_id, tenant_id, seller_name, ambiente, status, scopes, token_expires_at,
              ultimo_erro, created_at, updated_at)
  ON public.magalu_accounts TO authenticated;
