-- First drop all existing competitor tables
DROP TABLE IF EXISTS public.competitor_alerts CASCADE;
DROP TABLE IF EXISTS public.competitor_catalog_snapshots CASCADE;
DROP TABLE IF EXISTS public.competitor_market_snapshots CASCADE;
DROP TABLE IF EXISTS public.competitor_settings CASCADE;
DROP TABLE IF EXISTS public.competitor_tracking_alerts CASCADE;
DROP TABLE IF EXISTS public.competitor_price_history CASCADE;
DROP TABLE IF EXISTS public.competitor_tracked_listings CASCADE;
DROP TABLE IF EXISTS public.competitor_trackers CASCADE;
DROP TABLE IF EXISTS public.competitor_snapshots CASCADE;
DROP TABLE IF EXISTS public.competitor_events CASCADE;
DROP TABLE IF EXISTS public.competitor_price_actions CASCADE;
DROP TABLE IF EXISTS public.competitor_rate_limits CASCADE;