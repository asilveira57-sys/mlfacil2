
-- Drop old check constraints
ALTER TABLE public.erp_integrations DROP CONSTRAINT erp_integrations_provider_check;
ALTER TABLE public.erp_integrations DROP CONSTRAINT erp_integrations_status_check;

-- Recreate with all values used by the application
ALTER TABLE public.erp_integrations ADD CONSTRAINT erp_integrations_provider_check
  CHECK (provider = ANY (ARRAY['olist'::text, 'bling'::text, 'tiny'::text]));

ALTER TABLE public.erp_integrations ADD CONSTRAINT erp_integrations_status_check
  CHECK (status = ANY (ARRAY['disconnected'::text, 'connected'::text, 'error'::text, 'active'::text, 'inactive'::text]));
