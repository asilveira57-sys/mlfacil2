
-- Drop existing policies
DROP POLICY "Users can insert own erp integrations" ON public.erp_integrations;
DROP POLICY "Users can update own erp integrations" ON public.erp_integrations;
DROP POLICY "Users can view own erp integrations" ON public.erp_integrations;
DROP POLICY "Users can delete own erp integrations" ON public.erp_integrations;

-- Recreate with admin support
CREATE POLICY "Users can view own erp integrations"
ON public.erp_integrations FOR SELECT
USING (
  public.is_company_member(auth.uid(), company_id)
  OR public.has_role(auth.uid(), 'admin')
);

CREATE POLICY "Users can insert own erp integrations"
ON public.erp_integrations FOR INSERT
WITH CHECK (
  public.is_company_member(auth.uid(), company_id)
  OR public.has_role(auth.uid(), 'admin')
);

CREATE POLICY "Users can update own erp integrations"
ON public.erp_integrations FOR UPDATE
USING (
  public.is_company_member(auth.uid(), company_id)
  OR public.has_role(auth.uid(), 'admin')
);

CREATE POLICY "Users can delete own erp integrations"
ON public.erp_integrations FOR DELETE
USING (
  public.is_company_member(auth.uid(), company_id)
  OR public.has_role(auth.uid(), 'admin')
);
