
DROP POLICY IF EXISTS "plans_select" ON public.plan_tiers;
CREATE POLICY "anyone_can_read_plan_tiers"
ON public.plan_tiers
FOR SELECT
TO public
USING (true);
