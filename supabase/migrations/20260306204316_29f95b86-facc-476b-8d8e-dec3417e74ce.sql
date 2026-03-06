
-- 1. Create account_events table for tracking all onboarding events
CREATE TABLE IF NOT EXISTS public.account_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.companies(id) ON DELETE SET NULL,
  user_id uuid NOT NULL,
  company_id uuid REFERENCES public.companies(id) ON DELETE SET NULL,
  event_type text NOT NULL,
  event_data jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Index for fast lookups
CREATE INDEX idx_account_events_user_id ON public.account_events(user_id);
CREATE INDEX idx_account_events_company_id ON public.account_events(company_id);
CREATE INDEX idx_account_events_event_type ON public.account_events(event_type);
CREATE INDEX idx_account_events_created_at ON public.account_events(created_at DESC);

-- RLS
ALTER TABLE public.account_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_can_insert_own_events"
ON public.account_events FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "users_can_read_own_events"
ON public.account_events FOR SELECT TO authenticated
USING (auth.uid() = user_id);

-- 2. Create seller_initial_snapshot table
CREATE TABLE IF NOT EXISTS public.seller_initial_snapshot (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.companies(id) ON DELETE SET NULL,
  company_id uuid REFERENCES public.companies(id) ON DELETE SET NULL,
  seller_id text NOT NULL,
  snapshot_date date NOT NULL DEFAULT CURRENT_DATE,
  orders_last_30_days integer DEFAULT 0,
  revenue_last_30_days numeric(14,2) DEFAULT 0,
  average_ticket numeric(14,2) DEFAULT 0,
  ads_spend_last_30_days numeric(14,2) DEFAULT 0,
  ads_roas_last_30_days numeric(8,4) DEFAULT 0,
  active_listings integer DEFAULT 0,
  products_count integer DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_seller_initial_snapshot_seller ON public.seller_initial_snapshot(seller_id);
CREATE INDEX idx_seller_initial_snapshot_company ON public.seller_initial_snapshot(company_id);

ALTER TABLE public.seller_initial_snapshot ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_can_insert_own_snapshots"
ON public.seller_initial_snapshot FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.companies c
    WHERE c.id = company_id AND c.user_id = auth.uid()
  )
);

CREATE POLICY "users_can_read_own_snapshots"
ON public.seller_initial_snapshot FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.companies c
    WHERE c.id = company_id AND c.user_id = auth.uid()
  )
);

-- 3. Add logo columns to companies
ALTER TABLE public.companies
ADD COLUMN IF NOT EXISTS logo_url text,
ADD COLUMN IF NOT EXISTS logo_original_url text,
ADD COLUMN IF NOT EXISTS logo_medium_url text,
ADD COLUMN IF NOT EXISTS logo_small_url text;

-- 4. Create storage bucket for company logos
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'company-logos',
  'company-logos',
  true,
  2097152,
  ARRAY['image/png', 'image/svg+xml']
)
ON CONFLICT (id) DO NOTHING;

-- Storage RLS: authenticated users can upload to their company folder
CREATE POLICY "auth_users_upload_logos"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'company-logos');

CREATE POLICY "auth_users_update_logos"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'company-logos');

CREATE POLICY "public_read_logos"
ON storage.objects FOR SELECT TO public
USING (bucket_id = 'company-logos');

CREATE POLICY "auth_users_delete_logos"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'company-logos');
