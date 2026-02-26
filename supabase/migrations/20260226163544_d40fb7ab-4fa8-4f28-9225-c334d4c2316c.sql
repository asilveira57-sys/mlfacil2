
-- Fix wholesale_profiles RLS: use companies.user_id instead of company_users
DROP POLICY IF EXISTS "wholesale_profiles_select" ON public.wholesale_profiles;
DROP POLICY IF EXISTS "wholesale_profiles_insert" ON public.wholesale_profiles;
DROP POLICY IF EXISTS "wholesale_profiles_update" ON public.wholesale_profiles;
DROP POLICY IF EXISTS "wholesale_profiles_delete" ON public.wholesale_profiles;

CREATE POLICY "wholesale_profiles_select" ON public.wholesale_profiles
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.companies c WHERE c.id = company_id AND c.user_id = auth.uid())
  );

CREATE POLICY "wholesale_profiles_insert" ON public.wholesale_profiles
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM public.companies c WHERE c.id = company_id AND c.user_id = auth.uid())
  );

CREATE POLICY "wholesale_profiles_update" ON public.wholesale_profiles
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM public.companies c WHERE c.id = company_id AND c.user_id = auth.uid())
  );

CREATE POLICY "wholesale_profiles_delete" ON public.wholesale_profiles
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM public.companies c WHERE c.id = company_id AND c.user_id = auth.uid())
  );

-- Fix wholesale_profile_tiers RLS similarly
DROP POLICY IF EXISTS "wholesale_tiers_select" ON public.wholesale_profile_tiers;
DROP POLICY IF EXISTS "wholesale_tiers_insert" ON public.wholesale_profile_tiers;
DROP POLICY IF EXISTS "wholesale_tiers_update" ON public.wholesale_profile_tiers;
DROP POLICY IF EXISTS "wholesale_tiers_delete" ON public.wholesale_profile_tiers;

CREATE POLICY "wholesale_tiers_select" ON public.wholesale_profile_tiers
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.wholesale_profiles p JOIN public.companies c ON c.id = p.company_id WHERE p.id = profile_id AND c.user_id = auth.uid())
  );

CREATE POLICY "wholesale_tiers_insert" ON public.wholesale_profile_tiers
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM public.wholesale_profiles p JOIN public.companies c ON c.id = p.company_id WHERE p.id = profile_id AND c.user_id = auth.uid())
  );

CREATE POLICY "wholesale_tiers_update" ON public.wholesale_profile_tiers
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM public.wholesale_profiles p JOIN public.companies c ON c.id = p.company_id WHERE p.id = profile_id AND c.user_id = auth.uid())
  );

CREATE POLICY "wholesale_tiers_delete" ON public.wholesale_profile_tiers
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM public.wholesale_profiles p JOIN public.companies c ON c.id = p.company_id WHERE p.id = profile_id AND c.user_id = auth.uid())
  );
