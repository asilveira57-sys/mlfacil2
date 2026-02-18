
-- ============================================================
-- DYNAMIC MENU SYSTEM
-- ============================================================

-- 1. menu_items: tree structure for the dynamic menu
CREATE TABLE public.menu_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id UUID REFERENCES public.menu_items(id) ON DELETE CASCADE,
  category_root TEXT NOT NULL CHECK (category_root IN ('vision_general', 'marketplaces', 'tools', 'system', 'admin')),
  scope TEXT NOT NULL DEFAULT 'global' CHECK (scope IN ('global', 'marketplace', 'tools', 'system', 'admin')),
  marketplace_code TEXT CHECK (marketplace_code IN (NULL, 'meli', 'shopee', 'amazon_future')),
  label TEXT NOT NULL,
  icon_key TEXT,
  route TEXT,
  order_index INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'beta', 'coming_soon', 'hidden')),
  feature_key TEXT UNIQUE,
  permission_key TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for tree traversal
CREATE INDEX idx_menu_items_parent ON public.menu_items(parent_id);
CREATE INDEX idx_menu_items_category ON public.menu_items(category_root);
CREATE INDEX idx_menu_items_order ON public.menu_items(parent_id, order_index);

-- 2. menu_item_rules: access rules per menu item
CREATE TABLE public.menu_item_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  menu_item_id UUID NOT NULL REFERENCES public.menu_items(id) ON DELETE CASCADE,
  allowed_roles TEXT[] DEFAULT '{}',
  min_plan_code TEXT CHECK (min_plan_code IN (NULL, 'zpl', 'basic', 'pro', 'analytics_pro')),
  allowed_plans TEXT[] DEFAULT '{}',
  requires_marketplace_connected BOOLEAN NOT NULL DEFAULT false,
  required_feature_flags TEXT[] DEFAULT '{}',
  is_enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(menu_item_id)
);

CREATE INDEX idx_menu_item_rules_item ON public.menu_item_rules(menu_item_id);

-- 3. dynamic_feature_flags: feature flags per account or global
CREATE TABLE public.dynamic_feature_flags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE,
  feature_key TEXT NOT NULL,
  is_enabled BOOLEAN NOT NULL DEFAULT false,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(workspace_id, feature_key)
);

-- 4. collaborator_menu_permissions: granular per-collaborator permission keys
CREATE TABLE public.collaborator_menu_permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  permission_key TEXT NOT NULL,
  is_allowed BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(workspace_id, user_id, permission_key)
);

CREATE INDEX idx_collab_menu_perms_user ON public.collaborator_menu_permissions(user_id, workspace_id);

-- Triggers for updated_at
CREATE TRIGGER update_menu_items_updated_at
  BEFORE UPDATE ON public.menu_items
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_menu_item_rules_updated_at
  BEFORE UPDATE ON public.menu_item_rules
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_dynamic_feature_flags_updated_at
  BEFORE UPDATE ON public.dynamic_feature_flags
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_collaborator_menu_permissions_updated_at
  BEFORE UPDATE ON public.collaborator_menu_permissions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- RLS
ALTER TABLE public.menu_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.menu_item_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dynamic_feature_flags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.collaborator_menu_permissions ENABLE ROW LEVEL SECURITY;

-- menu_items: readable by all authenticated, writable by admins
CREATE POLICY "menu_items_select" ON public.menu_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "menu_items_admin_insert" ON public.menu_items FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "menu_items_admin_update" ON public.menu_items FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "menu_items_admin_delete" ON public.menu_items FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- menu_item_rules: same as menu_items
CREATE POLICY "menu_item_rules_select" ON public.menu_item_rules FOR SELECT TO authenticated USING (true);
CREATE POLICY "menu_item_rules_admin_insert" ON public.menu_item_rules FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "menu_item_rules_admin_update" ON public.menu_item_rules FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "menu_item_rules_admin_delete" ON public.menu_item_rules FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- dynamic_feature_flags: readable by workspace members, writable by admins
CREATE POLICY "feature_flags_select" ON public.dynamic_feature_flags FOR SELECT TO authenticated
  USING (workspace_id IS NULL OR public.is_workspace_member(auth.uid(), workspace_id));
CREATE POLICY "feature_flags_admin_insert" ON public.dynamic_feature_flags FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "feature_flags_admin_update" ON public.dynamic_feature_flags FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "feature_flags_admin_delete" ON public.dynamic_feature_flags FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- collaborator_menu_permissions: readable by self or workspace admin, writable by workspace admin
CREATE POLICY "collab_perms_select" ON public.collaborator_menu_permissions FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.can_manage_workspace(auth.uid(), workspace_id));
CREATE POLICY "collab_perms_insert" ON public.collaborator_menu_permissions FOR INSERT TO authenticated
  WITH CHECK (public.can_manage_workspace(auth.uid(), workspace_id));
CREATE POLICY "collab_perms_update" ON public.collaborator_menu_permissions FOR UPDATE TO authenticated
  USING (public.can_manage_workspace(auth.uid(), workspace_id));
CREATE POLICY "collab_perms_delete" ON public.collaborator_menu_permissions FOR DELETE TO authenticated
  USING (public.can_manage_workspace(auth.uid(), workspace_id));
