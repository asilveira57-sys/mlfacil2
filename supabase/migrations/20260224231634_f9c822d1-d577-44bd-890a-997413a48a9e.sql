
-- ETAPA 1: Garantir RLS ativo
ALTER TABLE public.meli_billing_details_cache ENABLE ROW LEVEL SECURITY;

-- ETAPA 2: Remover policy insegura existente
DROP POLICY IF EXISTS "Service role full access to billing details" ON public.meli_billing_details_cache;

-- ETAPA 3: Policy para service_role (edge functions backend)
CREATE POLICY "service_role_full_access_meli_billing"
ON public.meli_billing_details_cache
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- ETAPA 4: Seller pode ver apenas seus próprios dados (via ml_accounts)
CREATE POLICY "seller_select_own_billing"
ON public.meli_billing_details_cache
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.ml_accounts
    WHERE ml_accounts.ml_user_id = meli_billing_details_cache.seller_id
      AND ml_accounts.user_id = auth.uid()
  )
);

-- ETAPA 5: Bloquear INSERT/UPDATE/DELETE para authenticated
CREATE POLICY "block_insert_authenticated_billing"
ON public.meli_billing_details_cache
FOR INSERT
TO authenticated
WITH CHECK (false);

CREATE POLICY "block_update_authenticated_billing"
ON public.meli_billing_details_cache
FOR UPDATE
TO authenticated
USING (false);

CREATE POLICY "block_delete_authenticated_billing"
ON public.meli_billing_details_cache
FOR DELETE
TO authenticated
USING (false);
