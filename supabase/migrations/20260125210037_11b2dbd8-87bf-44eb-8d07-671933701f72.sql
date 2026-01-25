-- Drop existing policies to recreate correctly
DROP POLICY IF EXISTS "Users can create workspaces" ON public.workspaces;
DROP POLICY IF EXISTS "Users can view their workspaces" ON public.workspaces;

-- Policy: Users can create workspaces
CREATE POLICY "Users can create workspaces"
  ON public.workspaces
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Policy: Users can view workspaces they are members of
CREATE POLICY "Users can view their workspaces"
  ON public.workspaces
  FOR SELECT
  TO authenticated
  USING (
    public.is_workspace_member(auth.uid(), id)
  );

-- Drop and recreate workspace_members policies
DROP POLICY IF EXISTS "Users can add themselves as members" ON public.workspace_members;
DROP POLICY IF EXISTS "Users can view workspace members" ON public.workspace_members;

-- Policy: Users can add themselves as members when creating workspace
CREATE POLICY "Users can add themselves as members"
  ON public.workspace_members
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

-- Policy: Users can view members of workspaces they belong to
CREATE POLICY "Users can view workspace members"
  ON public.workspace_members
  FOR SELECT
  TO authenticated
  USING (
    public.is_workspace_member(auth.uid(), workspace_id)
  );