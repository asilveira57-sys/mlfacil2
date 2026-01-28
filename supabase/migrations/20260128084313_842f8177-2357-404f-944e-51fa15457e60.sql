-- =============================================
-- COLLABORATORS MANAGEMENT SYSTEM
-- =============================================

-- 1) collaborators table - Main collaborator registry
CREATE TABLE public.collaborators (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  name text NOT NULL,
  email text NOT NULL,
  status text NOT NULL DEFAULT 'invited' CHECK (status IN ('invited', 'active', 'disabled', 'deleted')),
  invited_at timestamptz,
  accepted_at timestamptz,
  disabled_at timestamptz,
  deleted_at timestamptz,
  auth_user_id uuid,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Partial unique index: no duplicate active emails per workspace
CREATE UNIQUE INDEX idx_collaborators_unique_email 
ON public.collaborators (workspace_id, lower(email)) 
WHERE deleted_at IS NULL;

-- Performance indexes
CREATE INDEX idx_collaborators_workspace ON public.collaborators(workspace_id);
CREATE INDEX idx_collaborators_status ON public.collaborators(status);
CREATE INDEX idx_collaborators_auth_user ON public.collaborators(auth_user_id) WHERE auth_user_id IS NOT NULL;

-- 2) collaborator_module_access table - Module permissions
CREATE TABLE public.collaborator_module_access (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  collaborator_id uuid NOT NULL REFERENCES public.collaborators(id) ON DELETE CASCADE,
  module_key text NOT NULL,
  enabled boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(collaborator_id, module_key)
);

CREATE INDEX idx_collaborator_module_collab ON public.collaborator_module_access(collaborator_id);
CREATE INDEX idx_collaborator_module_key ON public.collaborator_module_access(module_key) WHERE enabled = true;

-- 3) Enable RLS
ALTER TABLE public.collaborators ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.collaborator_module_access ENABLE ROW LEVEL SECURITY;

-- 4) RLS Policies for collaborators
-- Only workspace admins can manage collaborators (using existing 'admin' role)
CREATE POLICY "Workspace admins can view collaborators"
ON public.collaborators FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.workspace_members wm
    WHERE wm.workspace_id = collaborators.workspace_id
    AND wm.user_id = auth.uid()
    AND wm.role = 'admin'
  )
);

CREATE POLICY "Workspace admins can insert collaborators"
ON public.collaborators FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.workspace_members wm
    WHERE wm.workspace_id = collaborators.workspace_id
    AND wm.user_id = auth.uid()
    AND wm.role = 'admin'
  )
);

CREATE POLICY "Workspace admins can update collaborators"
ON public.collaborators FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.workspace_members wm
    WHERE wm.workspace_id = collaborators.workspace_id
    AND wm.user_id = auth.uid()
    AND wm.role = 'admin'
  )
);

CREATE POLICY "Workspace admins can delete collaborators"
ON public.collaborators FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM public.workspace_members wm
    WHERE wm.workspace_id = collaborators.workspace_id
    AND wm.user_id = auth.uid()
    AND wm.role = 'admin'
  )
);

-- 5) RLS Policies for collaborator_module_access
CREATE POLICY "Workspace admins can view module access"
ON public.collaborator_module_access FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.collaborators c
    JOIN public.workspace_members wm ON wm.workspace_id = c.workspace_id
    WHERE c.id = collaborator_module_access.collaborator_id
    AND wm.user_id = auth.uid()
    AND wm.role = 'admin'
  )
);

CREATE POLICY "Workspace admins can insert module access"
ON public.collaborator_module_access FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.collaborators c
    JOIN public.workspace_members wm ON wm.workspace_id = c.workspace_id
    WHERE c.id = collaborator_module_access.collaborator_id
    AND wm.user_id = auth.uid()
    AND wm.role = 'admin'
  )
);

CREATE POLICY "Workspace admins can update module access"
ON public.collaborator_module_access FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.collaborators c
    JOIN public.workspace_members wm ON wm.workspace_id = c.workspace_id
    WHERE c.id = collaborator_module_access.collaborator_id
    AND wm.user_id = auth.uid()
    AND wm.role = 'admin'
  )
);

CREATE POLICY "Workspace admins can delete module access"
ON public.collaborator_module_access FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM public.collaborators c
    JOIN public.workspace_members wm ON wm.workspace_id = c.workspace_id
    WHERE c.id = collaborator_module_access.collaborator_id
    AND wm.user_id = auth.uid()
    AND wm.role = 'admin'
  )
);

-- 6) Collaborators can read their own module access
CREATE POLICY "Collaborators can view own module access"
ON public.collaborator_module_access FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.collaborators c
    WHERE c.id = collaborator_module_access.collaborator_id
    AND c.auth_user_id = auth.uid()
    AND c.status = 'active'
  )
);

-- 7) Update trigger for updated_at
CREATE OR REPLACE FUNCTION public.update_collaborators_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_collaborators_updated_at
BEFORE UPDATE ON public.collaborators
FOR EACH ROW EXECUTE FUNCTION public.update_collaborators_updated_at();

CREATE TRIGGER update_collaborator_module_access_updated_at
BEFORE UPDATE ON public.collaborator_module_access
FOR EACH ROW EXECUTE FUNCTION public.update_collaborators_updated_at();