
CREATE OR REPLACE FUNCTION public.is_company_member(_user_id uuid, _company_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    -- Owner of the company
    SELECT 1 FROM public.companies
    WHERE id = _company_id AND user_id = _user_id
    UNION ALL
    -- Additional members/collaborators
    SELECT 1 FROM public.company_users
    WHERE user_id = _user_id AND company_id = _company_id
  )
$$;
