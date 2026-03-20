
-- Add anomaly_flags column to listing_health_current for anomaly detection
ALTER TABLE public.listing_health_current
  ADD COLUMN IF NOT EXISTS anomaly_flags TEXT[] DEFAULT '{}';

-- Ensure pg_cron and pg_net extensions are enabled
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;
