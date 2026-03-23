INSERT INTO plan_offers (tier_id, offer_code, billing_mode, period_months, price_brl, is_visible, is_active)
VALUES
  ('a0000000-0000-0000-0000-000000000001', 'one_1m', 'one_time', 1, 19.90, true, true),
  ('a0000000-0000-0000-0000-000000000001', 'one_3m', 'one_time', 3, 49.90, true, true),
  ('a0000000-0000-0000-0000-000000000001', 'one_6m', 'one_time', 6, 89.90, true, true),
  ('a0000000-0000-0000-0000-000000000001', 'rec_1m', 'recurring', 1, 17.90, true, true)
ON CONFLICT (tier_id, offer_code) DO NOTHING;