-- Fix RLS policies for listing_health_current
DROP POLICY IF EXISTS "Users can view own health current" ON listing_health_current;
CREATE POLICY "Users can view own health current" ON listing_health_current
  FOR SELECT TO authenticated
  USING (seller_id IN (SELECT ml_user_id::text FROM ml_accounts WHERE user_id = auth.uid()));

-- Fix RLS policies for listing_health_history
DROP POLICY IF EXISTS "Users can view own health history" ON listing_health_history;
CREATE POLICY "Users can view own health history" ON listing_health_history
  FOR SELECT TO authenticated
  USING (seller_id IN (SELECT ml_user_id::text FROM ml_accounts WHERE user_id = auth.uid()));