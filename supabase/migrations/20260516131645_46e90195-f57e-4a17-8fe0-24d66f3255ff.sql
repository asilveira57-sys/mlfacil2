DROP POLICY IF EXISTS "Global admins can view collaborators" ON public.collaborators;
CREATE POLICY "Global admins can view collaborators"
ON public.collaborators
FOR SELECT
USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Global admins can insert collaborators" ON public.collaborators;
CREATE POLICY "Global admins can insert collaborators"
ON public.collaborators
FOR INSERT
WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Global admins can update collaborators" ON public.collaborators;
CREATE POLICY "Global admins can update collaborators"
ON public.collaborators
FOR UPDATE
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Global admins can delete collaborators" ON public.collaborators;
CREATE POLICY "Global admins can delete collaborators"
ON public.collaborators
FOR DELETE
USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Global admins can manage workspace members" ON public.workspace_members;
CREATE POLICY "Global admins can manage workspace members"
ON public.workspace_members
FOR ALL
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Global admins can manage user preferences" ON public.user_preferences;
CREATE POLICY "Global admins can manage user preferences"
ON public.user_preferences
FOR ALL
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Global admins can manage user context" ON public.user_context;
CREATE POLICY "Global admins can manage user context"
ON public.user_context
FOR ALL
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));