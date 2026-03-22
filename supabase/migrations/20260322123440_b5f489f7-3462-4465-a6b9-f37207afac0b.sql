-- Drop the restrictive FK that only allows plan_tiers IDs
ALTER TABLE public.plan_modules DROP CONSTRAINT plan_modules_plan_id_fkey;

-- No new FK added — plan_id now accepts UUIDs from both plan_tiers and plan_addons