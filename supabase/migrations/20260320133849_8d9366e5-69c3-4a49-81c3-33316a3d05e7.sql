-- 1. Create seed_account_rules table
CREATE TABLE seed_account_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sales_range_min integer NOT NULL,
  sales_range_max integer,
  seed_percentage numeric(5,2) NOT NULL,
  min_seeds integer NOT NULL,
  max_seeds integer NOT NULL,
  active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE seed_account_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read seed rules"
  ON seed_account_rules FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Service role full access on seed_account_rules"
  ON seed_account_rules FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- 2. Add new columns to send_seed_balance
ALTER TABLE send_seed_balance
  ADD COLUMN IF NOT EXISTS tenant_id uuid,
  ADD COLUMN IF NOT EXISTS sales_count_90d integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS sold_listings_count_90d integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS rule_id uuid REFERENCES seed_account_rules(id),
  ADD COLUMN IF NOT EXISTS seed_percentage_applied numeric(5,2),
  ADD COLUMN IF NOT EXISTS seeds_bonus integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS seeds_manual_adjustment integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS seeds_available integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS calculated_at timestamptz;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'unique_seller_seed'
  ) THEN
    ALTER TABLE send_seed_balance ADD CONSTRAINT unique_seller_seed UNIQUE (seller_id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_send_seed_balance_tenant ON send_seed_balance(tenant_id);

-- 3. Create recalculate function
CREATE OR REPLACE FUNCTION recalculate_seed_balance_for_seller(
  p_tenant_id uuid,
  p_user_id uuid,
  p_seller_id text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sales_count integer;
  v_listings_count integer;
  v_rule record;
  v_seeds integer;
  v_used integer;
  v_available integer;
  v_plan_code text;
BEGIN
  SELECT pt.code INTO v_plan_code
  FROM tenants t
  JOIN plan_tiers pt ON pt.id = t.current_plan_id
  WHERE t.id = p_tenant_id;

  IF v_plan_code = 'zpl' THEN
    INSERT INTO system_logs (level, system_area, action, user_id, success, message, meta_json, created_at)
    VALUES ('warn', 'seed', 'seed_blocked_zpl', p_user_id, false, 
            'Seed blocked for ZPL plan',
            jsonb_build_object('tenant_id', p_tenant_id, 'seller_id', p_seller_id),
            now());
    RETURN;
  END IF;

  SELECT count(*) INTO v_sales_count
  FROM meli_orders_cache
  WHERE seller_id = p_seller_id
    AND created_at_meli >= now() - interval '90 days';

  SELECT count(DISTINCT item_id) INTO v_listings_count
  FROM meli_order_items_cache
  WHERE seller_id = p_seller_id
    AND created_at_meli >= now() - interval '90 days'
    AND quantity > 0;

  SELECT * INTO v_rule
  FROM seed_account_rules
  WHERE active = true
    AND v_sales_count >= sales_range_min
    AND (sales_range_max IS NULL OR v_sales_count <= sales_range_max)
  ORDER BY sales_range_min DESC
  LIMIT 1;

  IF v_rule IS NULL THEN
    v_seeds := 5;
  ELSE
    v_seeds := floor(v_listings_count * v_rule.seed_percentage);
    IF v_seeds < v_rule.min_seeds THEN
      v_seeds := v_rule.min_seeds;
    END IF;
    IF v_seeds > v_rule.max_seeds THEN
      v_seeds := v_rule.max_seeds;
    END IF;
  END IF;

  SELECT coalesce(seeds_used, 0) INTO v_used
  FROM send_seed_balance
  WHERE seller_id = p_seller_id;

  IF v_used IS NULL THEN
    v_used := 0;
  END IF;

  v_available := GREATEST(v_seeds - v_used, 0);

  INSERT INTO send_seed_balance (
    tenant_id, user_id, seller_id,
    sales_count_90d, sold_listings_count_90d,
    rule_id, seed_percentage_applied,
    seeds_from_plan, seeds_used, seeds_available,
    calculated_at, updated_at
  ) VALUES (
    p_tenant_id, p_user_id, p_seller_id,
    v_sales_count, v_listings_count,
    v_rule.id, v_rule.seed_percentage,
    v_seeds, v_used, v_available,
    now(), now()
  )
  ON CONFLICT (seller_id)
  DO UPDATE SET
    tenant_id = EXCLUDED.tenant_id,
    sales_count_90d = EXCLUDED.sales_count_90d,
    sold_listings_count_90d = EXCLUDED.sold_listings_count_90d,
    rule_id = EXCLUDED.rule_id,
    seed_percentage_applied = EXCLUDED.seed_percentage_applied,
    seeds_from_plan = EXCLUDED.seeds_from_plan,
    seeds_available = EXCLUDED.seeds_available,
    calculated_at = now(),
    updated_at = now();

  INSERT INTO system_logs (level, system_area, action, user_id, success, message, meta_json, created_at)
  VALUES ('info', 'seed', 'seed_recalculated', p_user_id, true,
          'Seed balance recalculated for seller ' || p_seller_id,
          jsonb_build_object(
            'seller_id', p_seller_id,
            'sales_count_90d', v_sales_count,
            'sold_listings_count_90d', v_listings_count,
            'seeds_calculated', v_seeds,
            'seeds_used', v_used,
            'seeds_available', v_available,
            'rule_id', v_rule.id
          ),
          now());
END;
$$;

-- 4. Create view for frontend
CREATE OR REPLACE VIEW vw_send_seed_balance AS
SELECT
  id, tenant_id, user_id, seller_id,
  sales_count_90d, sold_listings_count_90d,
  seeds_from_plan, seeds_bonus, seeds_manual_adjustment,
  seeds_used, seeds_available, seed_percentage_applied,
  calculated_at,
  (seeds_from_plan + coalesce(seeds_bonus, 0) + coalesce(seeds_manual_adjustment, 0) - seeds_used) AS remaining,
  (seeds_used > seeds_from_plan + coalesce(seeds_bonus, 0) + coalesce(seeds_manual_adjustment, 0)) AS is_over_capacity,
  updated_at
FROM send_seed_balance;

-- 5. Updated_at trigger
CREATE OR REPLACE FUNCTION update_seed_rules_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_seed_account_rules_updated_at
  BEFORE UPDATE ON seed_account_rules
  FOR EACH ROW EXECUTE FUNCTION update_seed_rules_updated_at();
