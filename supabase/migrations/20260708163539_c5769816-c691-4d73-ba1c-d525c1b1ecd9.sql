CREATE POLICY "Collaborators can view their own record"
ON public.collaborators
FOR SELECT
TO authenticated
USING (auth_user_id = auth.uid());