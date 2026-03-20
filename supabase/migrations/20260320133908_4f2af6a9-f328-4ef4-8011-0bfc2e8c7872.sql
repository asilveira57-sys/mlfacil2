-- Fix view to use security_invoker
DROP VIEW IF EXISTS vw_send_seed_balance;
CREATE VIEW vw_send_seed_balance WITH (security_invoker = on) AS
SELECT
  id, tenant_id, user_id, seller_id,
  sales_count_90d, sold_listings_count_90d,
  seeds_from_plan, seeds_bonus, seeds_manual_adjustment,
  seeds_used, seeds_available, seed_percentage_applied,
  calculated_at,
  (seeds_from_plan + coalesce(seeds_bonus, 0) + coalesce(seeds_manual_adjustment, 0) - seeds_used) AS remaining,
  (seeds_used > seeds_from_plan + coalesce(seeds_bonus, 0) + coalesce(seeds_manual_adjustment, 0)) AS is_over_capacity,
  updated_at
FROM send_seed_balance