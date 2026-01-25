-- =============================================
-- TASK MANAGEMENT MODULE - Complete Schema
-- =============================================

-- 1. WORKSPACES
CREATE TABLE public.workspaces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.workspaces ENABLE ROW LEVEL SECURITY;

-- 2. WORKSPACE MEMBERS with role enum
CREATE TYPE public.workspace_role AS ENUM ('admin', 'gestor', 'operador', 'visualizador');

CREATE TABLE public.workspace_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  role workspace_role NOT NULL DEFAULT 'operador',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(workspace_id, user_id)
);

ALTER TABLE public.workspace_members ENABLE ROW LEVEL SECURITY;

-- 3. ACCOUNTS (multi-conta dentro do workspace)
CREATE TABLE public.workspace_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  marketplace TEXT NOT NULL DEFAULT 'ml',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.workspace_accounts ENABLE ROW LEVEL SECURITY;

-- 4. TASKS with enums
CREATE TYPE public.task_status AS ENUM ('todo', 'doing', 'blocked', 'done');
CREATE TYPE public.task_priority AS ENUM ('low', 'medium', 'high', 'urgent');

CREATE TABLE public.tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  account_id UUID REFERENCES public.workspace_accounts(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT,
  status task_status NOT NULL DEFAULT 'todo',
  priority task_priority NOT NULL DEFAULT 'medium',
  due_at TIMESTAMPTZ,
  assignee_user_id UUID,
  created_by_user_id UUID NOT NULL,
  tags TEXT[] DEFAULT '{}',
  source_type TEXT,
  source_id TEXT,
  source_ref JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;

-- 5. TASK CHECKLISTS
CREATE TABLE public.task_checklists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  is_done BOOLEAN NOT NULL DEFAULT false,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.task_checklists ENABLE ROW LEVEL SECURITY;

-- 6. TASK COMMENTS
CREATE TABLE public.task_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  comment TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.task_comments ENABLE ROW LEVEL SECURITY;

-- 7. TASK WATCHERS
CREATE TABLE public.task_watchers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(task_id, user_id)
);

ALTER TABLE public.task_watchers ENABLE ROW LEVEL SECURITY;

-- 8. NOTIFICATIONS
CREATE TABLE public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT,
  link TEXT,
  is_read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- 9. SYSTEM EVENTS (motor de automação)
CREATE TABLE public.system_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  account_id UUID REFERENCES public.workspace_accounts(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}',
  processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.system_events ENABLE ROW LEVEL SECURITY;

-- 10. AUTOMATION RULES
CREATE TABLE public.automation_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  account_id UUID REFERENCES public.workspace_accounts(id) ON DELETE SET NULL,
  is_enabled BOOLEAN NOT NULL DEFAULT true,
  name TEXT NOT NULL,
  trigger_event_type TEXT NOT NULL,
  conditions JSONB NOT NULL DEFAULT '{}',
  actions JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.automation_rules ENABLE ROW LEVEL SECURITY;

-- 11. AUDIT LOGS
CREATE TABLE public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id UUID,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  action TEXT NOT NULL,
  details JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- =============================================
-- HELPER FUNCTIONS
-- =============================================

-- Check if user is member of workspace
CREATE OR REPLACE FUNCTION public.is_workspace_member(_user_id UUID, _workspace_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.workspace_members
    WHERE user_id = _user_id AND workspace_id = _workspace_id
  )
$$;

-- Get user role in workspace
CREATE OR REPLACE FUNCTION public.get_workspace_role(_user_id UUID, _workspace_id UUID)
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role::TEXT FROM public.workspace_members
  WHERE user_id = _user_id AND workspace_id = _workspace_id
  LIMIT 1
$$;

-- Check if user can manage (admin or gestor)
CREATE OR REPLACE FUNCTION public.can_manage_workspace(_user_id UUID, _workspace_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.workspace_members
    WHERE user_id = _user_id 
      AND workspace_id = _workspace_id
      AND role IN ('admin', 'gestor')
  )
$$;

-- Check if user can edit tasks (admin, gestor, operador)
CREATE OR REPLACE FUNCTION public.can_edit_tasks(_user_id UUID, _workspace_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.workspace_members
    WHERE user_id = _user_id 
      AND workspace_id = _workspace_id
      AND role IN ('admin', 'gestor', 'operador')
  )
$$;

-- =============================================
-- RLS POLICIES
-- =============================================

-- WORKSPACES: members can view
CREATE POLICY "Members can view workspaces"
  ON public.workspaces FOR SELECT
  TO authenticated
  USING (public.is_workspace_member(auth.uid(), id));

CREATE POLICY "Admins can update workspaces"
  ON public.workspaces FOR UPDATE
  TO authenticated
  USING (public.get_workspace_role(auth.uid(), id) = 'admin');

CREATE POLICY "Authenticated users can create workspaces"
  ON public.workspaces FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- WORKSPACE_MEMBERS: members can view, admin/gestor can manage
CREATE POLICY "Members can view workspace members"
  ON public.workspace_members FOR SELECT
  TO authenticated
  USING (public.is_workspace_member(auth.uid(), workspace_id));

CREATE POLICY "Admins can manage members"
  ON public.workspace_members FOR ALL
  TO authenticated
  USING (public.get_workspace_role(auth.uid(), workspace_id) = 'admin');

CREATE POLICY "Users can join as first member (admin)"
  ON public.workspace_members FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = auth.uid() AND
    NOT EXISTS (SELECT 1 FROM public.workspace_members wm WHERE wm.workspace_id = workspace_id)
  );

-- WORKSPACE_ACCOUNTS: members can view, admin/gestor can manage
CREATE POLICY "Members can view accounts"
  ON public.workspace_accounts FOR SELECT
  TO authenticated
  USING (public.is_workspace_member(auth.uid(), workspace_id));

CREATE POLICY "Managers can manage accounts"
  ON public.workspace_accounts FOR ALL
  TO authenticated
  USING (public.can_manage_workspace(auth.uid(), workspace_id));

-- TASKS: members can view, operador+ can manage
CREATE POLICY "Members can view tasks"
  ON public.tasks FOR SELECT
  TO authenticated
  USING (public.is_workspace_member(auth.uid(), workspace_id));

CREATE POLICY "Operators can insert tasks"
  ON public.tasks FOR INSERT
  TO authenticated
  WITH CHECK (public.can_edit_tasks(auth.uid(), workspace_id));

CREATE POLICY "Operators can update tasks"
  ON public.tasks FOR UPDATE
  TO authenticated
  USING (public.can_edit_tasks(auth.uid(), workspace_id));

CREATE POLICY "Managers can delete tasks"
  ON public.tasks FOR DELETE
  TO authenticated
  USING (public.can_manage_workspace(auth.uid(), workspace_id));

-- TASK_CHECKLISTS: inherit from task
CREATE POLICY "Members can view checklists"
  ON public.task_checklists FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.tasks t 
    WHERE t.id = task_id AND public.is_workspace_member(auth.uid(), t.workspace_id)
  ));

CREATE POLICY "Operators can manage checklists"
  ON public.task_checklists FOR ALL
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.tasks t 
    WHERE t.id = task_id AND public.can_edit_tasks(auth.uid(), t.workspace_id)
  ));

-- TASK_COMMENTS: inherit from task
CREATE POLICY "Members can view comments"
  ON public.task_comments FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.tasks t 
    WHERE t.id = task_id AND public.is_workspace_member(auth.uid(), t.workspace_id)
  ));

CREATE POLICY "Operators can add comments"
  ON public.task_comments FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.tasks t 
    WHERE t.id = task_id AND public.can_edit_tasks(auth.uid(), t.workspace_id)
  ) AND user_id = auth.uid());

CREATE POLICY "Users can delete own comments"
  ON public.task_comments FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

-- TASK_WATCHERS
CREATE POLICY "Members can view watchers"
  ON public.task_watchers FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.tasks t 
    WHERE t.id = task_id AND public.is_workspace_member(auth.uid(), t.workspace_id)
  ));

CREATE POLICY "Members can manage own watch"
  ON public.task_watchers FOR ALL
  TO authenticated
  USING (user_id = auth.uid() AND EXISTS (
    SELECT 1 FROM public.tasks t 
    WHERE t.id = task_id AND public.is_workspace_member(auth.uid(), t.workspace_id)
  ));

-- NOTIFICATIONS: only own
CREATE POLICY "Users can view own notifications"
  ON public.notifications FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can update own notifications"
  ON public.notifications FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "System can insert notifications"
  ON public.notifications FOR INSERT
  TO authenticated
  WITH CHECK (public.is_workspace_member(auth.uid(), workspace_id) OR user_id = auth.uid());

-- SYSTEM_EVENTS: managers can view
CREATE POLICY "Managers can view events"
  ON public.system_events FOR SELECT
  TO authenticated
  USING (public.can_manage_workspace(auth.uid(), workspace_id));

CREATE POLICY "Members can insert events"
  ON public.system_events FOR INSERT
  TO authenticated
  WITH CHECK (public.is_workspace_member(auth.uid(), workspace_id));

-- AUTOMATION_RULES: managers only
CREATE POLICY "Managers can view rules"
  ON public.automation_rules FOR SELECT
  TO authenticated
  USING (public.can_manage_workspace(auth.uid(), workspace_id));

CREATE POLICY "Managers can manage rules"
  ON public.automation_rules FOR ALL
  TO authenticated
  USING (public.can_manage_workspace(auth.uid(), workspace_id));

-- AUDIT_LOGS: managers can view
CREATE POLICY "Managers can view audit logs"
  ON public.audit_logs FOR SELECT
  TO authenticated
  USING (public.can_manage_workspace(auth.uid(), workspace_id));

CREATE POLICY "System can insert audit logs"
  ON public.audit_logs FOR INSERT
  TO authenticated
  WITH CHECK (public.is_workspace_member(auth.uid(), workspace_id));

-- =============================================
-- INDEXES
-- =============================================

CREATE INDEX idx_workspace_members_user ON public.workspace_members(user_id);
CREATE INDEX idx_workspace_members_workspace ON public.workspace_members(workspace_id);

CREATE INDEX idx_workspace_accounts_workspace ON public.workspace_accounts(workspace_id);

CREATE INDEX idx_tasks_workspace_status_due ON public.tasks(workspace_id, status, due_at);
CREATE INDEX idx_tasks_assignee_status ON public.tasks(assignee_user_id, status);
CREATE INDEX idx_tasks_account ON public.tasks(account_id);
CREATE INDEX idx_tasks_source ON public.tasks(source_type, source_id);
CREATE INDEX idx_tasks_created_by ON public.tasks(created_by_user_id);

CREATE INDEX idx_task_checklists_task ON public.task_checklists(task_id);
CREATE INDEX idx_task_comments_task ON public.task_comments(task_id);
CREATE INDEX idx_task_watchers_task ON public.task_watchers(task_id);
CREATE INDEX idx_task_watchers_user ON public.task_watchers(user_id);

CREATE INDEX idx_notifications_user_read ON public.notifications(user_id, is_read, created_at DESC);
CREATE INDEX idx_notifications_workspace ON public.notifications(workspace_id);

CREATE INDEX idx_system_events_workspace_type ON public.system_events(workspace_id, event_type, created_at DESC);
CREATE INDEX idx_system_events_processed ON public.system_events(processed_at) WHERE processed_at IS NULL;

CREATE INDEX idx_automation_rules_workspace ON public.automation_rules(workspace_id);
CREATE INDEX idx_automation_rules_trigger ON public.automation_rules(trigger_event_type) WHERE is_enabled = true;

CREATE INDEX idx_audit_logs_workspace ON public.audit_logs(workspace_id, created_at DESC);
CREATE INDEX idx_audit_logs_entity ON public.audit_logs(entity_type, entity_id);

-- =============================================
-- TRIGGERS for updated_at
-- =============================================

CREATE TRIGGER set_workspaces_updated_at
  BEFORE UPDATE ON public.workspaces
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER set_workspace_accounts_updated_at
  BEFORE UPDATE ON public.workspace_accounts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER set_tasks_updated_at
  BEFORE UPDATE ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER set_automation_rules_updated_at
  BEFORE UPDATE ON public.automation_rules
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();