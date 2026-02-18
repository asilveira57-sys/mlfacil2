
-- Create a security definer function to check company membership without RLS recursion
CREATE OR REPLACE FUNCTION public.is_company_member(_user_id uuid, _company_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.company_users
    WHERE user_id = _user_id AND company_id = _company_id
  )
$$;

CREATE OR REPLACE FUNCTION public.is_company_owner(_user_id uuid, _company_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.company_users
    WHERE user_id = _user_id AND company_id = _company_id AND is_owner = true
  )
$$;

-- Fix company_users policies to avoid self-referencing recursion
DROP POLICY IF EXISTS "Users can read own company members" ON public.company_users;
CREATE POLICY "Users can read own company members"
ON public.company_users
FOR SELECT
USING (user_id = auth.uid() OR public.is_company_member(auth.uid(), company_id));

DROP POLICY IF EXISTS "Company owners can manage members" ON public.company_users;
CREATE POLICY "Company owners can manage members"
ON public.company_users
FOR ALL
USING (public.is_company_owner(auth.uid(), company_id))
WITH CHECK (public.is_company_owner(auth.uid(), company_id));

-- Fix access_profiles policies to use the helper functions
DROP POLICY IF EXISTS "Users can read global and own company profiles" ON public.access_profiles;
CREATE POLICY "Users can read global and own company profiles"
ON public.access_profiles
FOR SELECT
USING (company_id IS NULL OR public.is_company_member(auth.uid(), company_id));

DROP POLICY IF EXISTS "Company owners can manage company profiles" ON public.access_profiles;
CREATE POLICY "Company owners can manage company profiles"
ON public.access_profiles
FOR ALL
USING (company_id IS NOT NULL AND public.is_company_owner(auth.uid(), company_id))
WITH CHECK (company_id IS NOT NULL AND public.is_company_owner(auth.uid(), company_id));

-- Fix profile_permissions policies
DROP POLICY IF EXISTS "Users can read permissions of accessible profiles" ON public.profile_permissions;
CREATE POLICY "Users can read permissions of accessible profiles"
ON public.profile_permissions
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM access_profiles ap
    WHERE ap.id = profile_permissions.profile_id
    AND (ap.company_id IS NULL OR public.is_company_member(auth.uid(), ap.company_id))
  )
);

DROP POLICY IF EXISTS "Company owners can manage company profile permissions" ON public.profile_permissions;
CREATE POLICY "Company owners can manage company profile permissions"
ON public.profile_permissions
FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM access_profiles ap
    WHERE ap.id = profile_permissions.profile_id
    AND ap.company_id IS NOT NULL
    AND public.is_company_owner(auth.uid(), ap.company_id)
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM access_profiles ap
    WHERE ap.id = profile_permissions.profile_id
    AND ap.company_id IS NOT NULL
    AND public.is_company_owner(auth.uid(), ap.company_id)
  )
);
