
-- PATCH: tenant_plans — add display_name
ALTER TABLE public.tenant_plans
  ADD COLUMN IF NOT EXISTS display_name text;

UPDATE public.tenant_plans SET display_name = name WHERE display_name IS NULL;

-- Rename min_sales_30d → min_orders_30d, max_sales_30d → max_orders_30d
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='tenant_plans' AND column_name='min_sales_30d') THEN
    ALTER TABLE public.tenant_plans RENAME COLUMN min_sales_30d TO min_orders_30d;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='tenant_plans' AND column_name='max_sales_30d') THEN
    ALTER TABLE public.tenant_plans RENAME COLUMN max_sales_30d TO max_orders_30d;
  END IF;
END $$;

-- PATCH: tenant_subscription — add payment tracking columns
ALTER TABLE public.tenant_subscription
  ADD COLUMN IF NOT EXISTS last_payment_id text,
  ADD COLUMN IF NOT EXISTS last_payment_external_reference text,
  ADD COLUMN IF NOT EXISTS payment_provider text DEFAULT 'mercadopago',
  ADD COLUMN IF NOT EXISTS payment_method text,
  ADD COLUMN IF NOT EXISTS payment_approved_at timestamptz;

-- CREATE: tenant_payments — payment history
CREATE TABLE IF NOT EXISTS public.tenant_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  provider text NOT NULL DEFAULT 'mercadopago',
  payment_id text NOT NULL,
  external_reference text,
  amount numeric NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'BRL',
  status text NOT NULL DEFAULT 'pending',
  paid_at timestamptz,
  raw jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tenant_payments_tenant ON public.tenant_payments(tenant_id);
CREATE INDEX IF NOT EXISTS idx_tenant_payments_status ON public.tenant_payments(status);
CREATE INDEX IF NOT EXISTS idx_tenant_payments_payment_id ON public.tenant_payments(payment_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_tenant_payments_provider_payment ON public.tenant_payments(provider, payment_id);

ALTER TABLE public.tenant_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_read_own_payments" ON public.tenant_payments
  FOR SELECT TO authenticated
  USING (
    tenant_id IN (
      SELECT id FROM public.tenants WHERE owner_user_id = auth.uid()
    )
  );
