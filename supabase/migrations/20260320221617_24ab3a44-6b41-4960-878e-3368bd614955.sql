-- Admin can read all companies and profiles (for retrospective management)
CREATE POLICY "admin_read_all_companies" ON public.companies FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "admin_read_all_profiles" ON public.profiles FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));