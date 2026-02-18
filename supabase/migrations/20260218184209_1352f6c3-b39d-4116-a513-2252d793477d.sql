
-- ============================================================
-- PHASE 1: RBAC SYSTEM — TABLES + SEEDS + RLS + FUNCTIONS
-- ============================================================

-- 1. BACKUP/RENAME LEGACY TABLES
-- ============================================================
ALTER TABLE IF EXISTS public.system_modules RENAME TO system_modules_legacy;
ALTER TABLE IF EXISTS public.menu_items RENAME TO menu_items_legacy;
ALTER TABLE IF EXISTS public.menu_item_rules RENAME TO menu_item_rules_legacy;
ALTER TABLE IF EXISTS public.collaborator_module_access RENAME TO collaborator_module_access_legacy;

-- 2. CREATE ENUMS
-- ============================================================
DO $$ BEGIN
  CREATE TYPE public.module_layer AS ENUM ('admin', 'marketplace', 'operacional', 'ferramentas', 'sistema');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 3. CREATE system_modules (unified module catalog + menu tree)
-- ============================================================
CREATE TABLE public.system_modules (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  key TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  layer module_layer NOT NULL DEFAULT 'sistema',
  parent_module_id UUID REFERENCES public.system_modules(id) ON DELETE SET NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  icon_key TEXT,
  route TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  is_internal_only BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_system_modules_parent ON public.system_modules(parent_module_id);
CREATE INDEX idx_system_modules_layer ON public.system_modules(layer);
CREATE INDEX idx_system_modules_active ON public.system_modules(is_active) WHERE is_active = true;

-- 4. CREATE system_actions
-- ============================================================
CREATE TABLE public.system_actions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  key TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 5. CREATE system_features (module x action)
-- ============================================================
CREATE TABLE public.system_features (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  module_id UUID NOT NULL REFERENCES public.system_modules(id) ON DELETE CASCADE,
  action_id UUID NOT NULL REFERENCES public.system_actions(id) ON DELETE CASCADE,
  key TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(module_id, action_id)
);

CREATE INDEX idx_system_features_module ON public.system_features(module_id);

-- 6. CREATE access_profiles
-- ============================================================
CREATE TABLE public.access_profiles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  name TEXT NOT NULL,
  level INTEGER NOT NULL DEFAULT 5,
  is_system BOOLEAN NOT NULL DEFAULT false,
  is_protected BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(company_id, key)
);

CREATE INDEX idx_access_profiles_company ON public.access_profiles(company_id);

-- 7. CREATE profile_permissions
-- ============================================================
CREATE TABLE public.profile_permissions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  profile_id UUID NOT NULL REFERENCES public.access_profiles(id) ON DELETE CASCADE,
  feature_id UUID NOT NULL REFERENCES public.system_features(id) ON DELETE CASCADE,
  allowed BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(profile_id, feature_id)
);

CREATE INDEX idx_profile_permissions_profile ON public.profile_permissions(profile_id);
CREATE INDEX idx_profile_permissions_feature ON public.profile_permissions(feature_id);

-- 8. CREATE company_users (user x company link)
-- ============================================================
CREATE TABLE public.company_users (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  profile_id UUID REFERENCES public.access_profiles(id) ON DELETE SET NULL,
  is_owner BOOLEAN NOT NULL DEFAULT false,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(company_id, user_id)
);

CREATE INDEX idx_company_users_user ON public.company_users(user_id);
CREATE INDEX idx_company_users_company ON public.company_users(company_id);

-- ============================================================
-- SEED: SYSTEM ACTIONS
-- ============================================================
INSERT INTO public.system_actions (key, name) VALUES
  ('view', 'Visualizar'),
  ('create', 'Criar'),
  ('edit', 'Editar'),
  ('delete', 'Excluir'),
  ('execute', 'Executar'),
  ('configure', 'Configurar'),
  ('approve', 'Aprovar'),
  ('export', 'Exportar');

-- ============================================================
-- SEED: GLOBAL ACCESS PROFILES (company_id = NULL)
-- ============================================================
INSERT INTO public.access_profiles (company_id, key, name, level, is_system, is_protected) VALUES
  (NULL, 'owner', 'Proprietário', 1, true, true),
  (NULL, 'admin', 'Administrador', 2, true, false),
  (NULL, 'operational', 'Operacional', 3, true, false),
  (NULL, 'finance', 'Financeiro', 4, true, false),
  (NULL, 'read_only', 'Somente Leitura', 5, true, false);

-- ============================================================
-- SEED: FULL MODULE CATALOG (tree)
-- ============================================================

-- === ADMIN ROOT ===
INSERT INTO public.system_modules (id, key, name, layer, parent_module_id, sort_order, icon_key, route, is_active, is_internal_only) VALUES
  ('a0000000-0000-0000-0000-000000000001', 'admin', 'Admin', 'admin', NULL, 1, 'Shield', NULL, true, true),
  ('a0000000-0000-0000-0000-000000000010', 'admin.dashboard', 'Dashboard Admin', 'admin', 'a0000000-0000-0000-0000-000000000001', 1, 'LayoutDashboard', '/admin', true, true),
  ('a0000000-0000-0000-0000-000000000011', 'admin.settings', 'Configurações', 'admin', 'a0000000-0000-0000-0000-000000000001', 2, 'Settings', '/admin/configuracoes', true, true),
  ('a0000000-0000-0000-0000-000000000012', 'admin.profiles_permissions', 'Perfis e Permissões', 'admin', 'a0000000-0000-0000-0000-000000000001', 3, 'UserCog', '/admin/perfis', true, true),
  ('a0000000-0000-0000-0000-000000000013', 'admin.collaborators', 'Colaboradores', 'admin', 'a0000000-0000-0000-0000-000000000001', 4, 'Users', '/admin/colaboradores', true, true),
  ('a0000000-0000-0000-0000-000000000014', 'admin.audit', 'Auditoria e Logs', 'admin', 'a0000000-0000-0000-0000-000000000001', 5, 'ClipboardList', '/admin/logs', true, true),
  ('a0000000-0000-0000-0000-000000000015', 'admin.consents', 'Consentimentos', 'admin', 'a0000000-0000-0000-0000-000000000001', 6, 'FileCheck', '/admin/consentimentos', false, true),
  ('a0000000-0000-0000-0000-000000000016', 'admin.users', 'Usuários', 'admin', 'a0000000-0000-0000-0000-000000000001', 7, 'UserSearch', '/admin/usuarios', true, true),
  ('a0000000-0000-0000-0000-000000000017', 'admin.plans', 'Planos', 'admin', 'a0000000-0000-0000-0000-000000000001', 8, 'CreditCard', '/admin/planos', true, true),
  ('a0000000-0000-0000-0000-000000000018', 'admin.payments', 'Pagamentos', 'admin', 'a0000000-0000-0000-0000-000000000001', 9, 'Wallet', '/admin/pagamentos', true, true),
  ('a0000000-0000-0000-0000-000000000019', 'admin.blog', 'Blog', 'admin', 'a0000000-0000-0000-0000-000000000001', 10, 'FileText', '/admin/blog', true, true),
  ('a0000000-0000-0000-0000-000000000020', 'admin.seo', 'SEO', 'admin', 'a0000000-0000-0000-0000-000000000001', 11, 'Search', '/admin/seo', true, true),
  ('a0000000-0000-0000-0000-000000000021', 'admin.menu_builder', 'Construtor de Menu', 'admin', 'a0000000-0000-0000-0000-000000000001', 12, 'LayoutList', '/admin/menu-builder', true, true),
  ('a0000000-0000-0000-0000-000000000022', 'admin.feature_flags', 'Feature Flags', 'admin', 'a0000000-0000-0000-0000-000000000001', 13, 'ToggleLeft', '/admin/feature-flags', true, true),
  ('a0000000-0000-0000-0000-000000000023', 'admin.tags', 'Tags de Módulos', 'admin', 'a0000000-0000-0000-0000-000000000001', 14, 'Tags', '/admin/tags', true, true),

  -- === ADMIN > INTEGRAÇÕES ===
  ('a0000000-0000-0000-0000-000000000030', 'admin.integrations', 'Integrações', 'admin', 'a0000000-0000-0000-0000-000000000001', 20, 'Plug', NULL, true, true),
  ('a0000000-0000-0000-0000-000000000031', 'admin.integrations.ml', 'Mercado Livre', 'admin', 'a0000000-0000-0000-0000-000000000030', 1, 'Store', '/admin/integracoes/ml', true, true),
  ('a0000000-0000-0000-0000-000000000032', 'admin.integrations.shopee', 'Shopee', 'admin', 'a0000000-0000-0000-0000-000000000030', 2, 'ShoppingBag', '/admin/integracoes/shopee', false, true),
  ('a0000000-0000-0000-0000-000000000033', 'admin.integrations.erp', 'ERP (Olist/Tiny)', 'admin', 'a0000000-0000-0000-0000-000000000030', 3, 'Database', '/admin/integracoes/erp', false, true),

  -- === ADMIN > FATURAMENTO ===
  ('a0000000-0000-0000-0000-000000000040', 'admin.billing', 'Faturamento', 'admin', 'a0000000-0000-0000-0000-000000000001', 25, 'Receipt', NULL, true, true),
  ('a0000000-0000-0000-0000-000000000041', 'admin.billing.plans', 'Plano e Cobrança', 'admin', 'a0000000-0000-0000-0000-000000000040', 1, 'CreditCard', '/admin/faturamento/planos', true, true),
  ('a0000000-0000-0000-0000-000000000042', 'admin.billing.usage', 'Limites e Uso', 'admin', 'a0000000-0000-0000-0000-000000000040', 2, 'BarChart', '/admin/faturamento/uso', true, true);

-- === MARKETPLACE ROOT ===
INSERT INTO public.system_modules (id, key, name, layer, parent_module_id, sort_order, icon_key, route, is_active) VALUES
  ('b0000000-0000-0000-0000-000000000001', 'marketplace', 'Marketplace', 'marketplace', NULL, 2, 'Store', NULL, true),

  -- Painel
  ('b0000000-0000-0000-0000-000000000010', 'marketplace.panel', 'Painel', 'marketplace', 'b0000000-0000-0000-0000-000000000001', 1, 'LayoutDashboard', NULL, true),
  ('b0000000-0000-0000-0000-000000000011', 'marketplace.panel.dashboard', 'Painel de Controle', 'marketplace', 'b0000000-0000-0000-0000-000000000010', 1, 'BarChart3', '/dashboard', true),

  -- Vendas
  ('b0000000-0000-0000-0000-000000000020', 'marketplace.sales', 'Vendas', 'marketplace', 'b0000000-0000-0000-0000-000000000001', 2, 'ShoppingCart', NULL, true),
  ('b0000000-0000-0000-0000-000000000021', 'marketplace.sales.orders', 'Pedidos', 'marketplace', 'b0000000-0000-0000-0000-000000000020', 1, 'Package', '/vendas', true),
  ('b0000000-0000-0000-0000-000000000022', 'marketplace.sales.shipping', 'Envios', 'marketplace', 'b0000000-0000-0000-0000-000000000020', 2, 'Truck', '/shipping-labels', true),

  -- Anúncios
  ('b0000000-0000-0000-0000-000000000030', 'marketplace.listings', 'Anúncios', 'marketplace', 'b0000000-0000-0000-0000-000000000001', 3, 'FileText', NULL, true),
  ('b0000000-0000-0000-0000-000000000031', 'marketplace.listings.timeline', 'Linha do Tempo', 'marketplace', 'b0000000-0000-0000-0000-000000000030', 1, 'History', '/anuncios/linha-do-tempo', true),
  ('b0000000-0000-0000-0000-000000000032', 'marketplace.listings.diagnostics', 'Radiografia', 'marketplace', 'b0000000-0000-0000-0000-000000000030', 2, 'Activity', '/radiografia', true),
  ('b0000000-0000-0000-0000-000000000033', 'marketplace.listings.promotions', 'Promoções', 'marketplace', 'b0000000-0000-0000-0000-000000000030', 3, 'Percent', '/promocoes', true),

  -- Crescimento
  ('b0000000-0000-0000-0000-000000000040', 'marketplace.growth', 'Crescimento', 'marketplace', 'b0000000-0000-0000-0000-000000000001', 4, 'TrendingUp', NULL, true),
  ('b0000000-0000-0000-0000-000000000041', 'marketplace.growth.ads', 'Publicidade / ADS', 'marketplace', 'b0000000-0000-0000-0000-000000000040', 1, 'Megaphone', '/publicidade', true),
  ('b0000000-0000-0000-0000-000000000042', 'marketplace.growth.seed', 'Seed (Pós-Venda)', 'marketplace', 'b0000000-0000-0000-0000-000000000040', 2, 'Sprout', '/seed', true),
  ('b0000000-0000-0000-0000-000000000043', 'marketplace.growth.questions', 'Perguntas', 'marketplace', 'b0000000-0000-0000-0000-000000000040', 3, 'MessageSquare', '/perguntas', true),

  -- Inteligência
  ('b0000000-0000-0000-0000-000000000050', 'marketplace.intelligence', 'Inteligência', 'marketplace', 'b0000000-0000-0000-0000-000000000001', 5, 'Brain', NULL, true),
  ('b0000000-0000-0000-0000-000000000051', 'marketplace.intelligence.trends', 'Tendências', 'marketplace', 'b0000000-0000-0000-0000-000000000050', 1, 'TrendingUp', '/tendencias', true),
  ('b0000000-0000-0000-0000-000000000052', 'marketplace.intelligence.market', 'Mercado', 'marketplace', 'b0000000-0000-0000-0000-000000000050', 2, 'Globe', '/mercado', true),
  ('b0000000-0000-0000-0000-000000000053', 'marketplace.intelligence.competitors', 'Concorrência', 'marketplace', 'b0000000-0000-0000-0000-000000000050', 3, 'Users', '/concorrencia', true),
  ('b0000000-0000-0000-0000-000000000054', 'marketplace.intelligence.abc', 'Curva ABC', 'marketplace', 'b0000000-0000-0000-0000-000000000050', 4, 'BarChart3', '/abc-analysis', true),

  -- Financeiro
  ('b0000000-0000-0000-0000-000000000060', 'marketplace.financial', 'Financeiro', 'marketplace', 'b0000000-0000-0000-0000-000000000001', 6, 'DollarSign', NULL, true),
  ('b0000000-0000-0000-0000-000000000061', 'marketplace.financial.costs', 'Custos', 'marketplace', 'b0000000-0000-0000-0000-000000000060', 1, 'Calculator', '/custos', true),
  ('b0000000-0000-0000-0000-000000000062', 'marketplace.financial.pricing', 'Precificação', 'marketplace', 'b0000000-0000-0000-0000-000000000060', 2, 'Tag', '/precificacao', true),
  ('b0000000-0000-0000-0000-000000000063', 'marketplace.financial.commissions', 'Comissões', 'marketplace', 'b0000000-0000-0000-0000-000000000060', 3, 'Percent', '/comissoes', true),
  ('b0000000-0000-0000-0000-000000000064', 'marketplace.financial.freight', 'Gestão de Frete', 'marketplace', 'b0000000-0000-0000-0000-000000000060', 4, 'Truck', '/frete', true);

-- === OPERACIONAL ROOT ===
INSERT INTO public.system_modules (id, key, name, layer, parent_module_id, sort_order, icon_key, route, is_active) VALUES
  ('c0000000-0000-0000-0000-000000000001', 'operacional', 'Operacional', 'operacional', NULL, 3, 'Cog', NULL, true),

  -- Etiquetas
  ('c0000000-0000-0000-0000-000000000010', 'operacional.labels', 'Etiquetas', 'operacional', 'c0000000-0000-0000-0000-000000000001', 1, 'Printer', NULL, true),
  ('c0000000-0000-0000-0000-000000000011', 'operacional.labels.generate', 'Gerar Etiqueta', 'operacional', 'c0000000-0000-0000-0000-000000000010', 1, 'Printer', '/shipping-labels', true),
  ('c0000000-0000-0000-0000-000000000012', 'operacional.labels.history', 'Histórico', 'operacional', 'c0000000-0000-0000-0000-000000000010', 2, 'Clock', '/shipping-labels/historico', false),
  ('c0000000-0000-0000-0000-000000000013', 'operacional.labels.header', 'Config. Cabeçalho', 'operacional', 'c0000000-0000-0000-0000-000000000010', 3, 'Settings', '/shipping-labels/header-settings', true),

  -- Tarefas
  ('c0000000-0000-0000-0000-000000000020', 'operacional.tasks', 'Tarefas', 'operacional', 'c0000000-0000-0000-0000-000000000001', 2, 'CheckSquare', NULL, true),
  ('c0000000-0000-0000-0000-000000000021', 'operacional.tasks.board', 'Quadro', 'operacional', 'c0000000-0000-0000-0000-000000000020', 1, 'Kanban', '/tarefas/quadro', true),
  ('c0000000-0000-0000-0000-000000000022', 'operacional.tasks.inbox', 'Inbox', 'operacional', 'c0000000-0000-0000-0000-000000000020', 2, 'Inbox', '/tarefas/inbox', true),
  ('c0000000-0000-0000-0000-000000000023', 'operacional.tasks.rules', 'Regras', 'operacional', 'c0000000-0000-0000-0000-000000000020', 3, 'Zap', '/tarefas/regras', true);

-- === FERRAMENTAS ROOT ===
INSERT INTO public.system_modules (id, key, name, layer, parent_module_id, sort_order, icon_key, route, is_active) VALUES
  ('d0000000-0000-0000-0000-000000000001', 'ferramentas', 'Ferramentas', 'ferramentas', NULL, 4, 'Wrench', NULL, true),
  ('d0000000-0000-0000-0000-000000000010', 'ferramentas.zpl_viewer', 'Visualizador ZPL', 'ferramentas', 'd0000000-0000-0000-0000-000000000001', 1, 'FileCode', '/ferramentas/zpl', true),
  ('d0000000-0000-0000-0000-000000000011', 'ferramentas.trends_lite', 'Tendências Lite', 'ferramentas', 'd0000000-0000-0000-0000-000000000001', 2, 'TrendingUp', '/ferramentas/tendencias', true),
  ('d0000000-0000-0000-0000-000000000012', 'ferramentas.pricing_calc', 'Calculadora de Precificação', 'ferramentas', 'd0000000-0000-0000-0000-000000000001', 3, 'Calculator', '/ferramentas/precificacao', true),
  ('d0000000-0000-0000-0000-000000000013', 'ferramentas.commissions_calc', 'Comissões ML', 'ferramentas', 'd0000000-0000-0000-0000-000000000001', 4, 'Percent', '/ferramentas/comissoes', true);

-- === SISTEMA ROOT (settings, profile, sandbox) ===
INSERT INTO public.system_modules (id, key, name, layer, parent_module_id, sort_order, icon_key, route, is_active) VALUES
  ('e0000000-0000-0000-0000-000000000001', 'sistema', 'Sistema', 'sistema', NULL, 5, 'Settings', NULL, true),
  ('e0000000-0000-0000-0000-000000000010', 'sistema.settings', 'Configurações', 'sistema', 'e0000000-0000-0000-0000-000000000001', 1, 'Settings', '/settings', true),
  ('e0000000-0000-0000-0000-000000000011', 'sistema.sandbox', 'Sandbox', 'sistema', 'e0000000-0000-0000-0000-000000000001', 2, 'FlaskConical', '/sandbox', true),
  ('e0000000-0000-0000-0000-000000000012', 'sistema.notifications', 'Notificações', 'sistema', 'e0000000-0000-0000-0000-000000000001', 3, 'Bell', '/notifications', true);

-- ============================================================
-- SEED: SYSTEM FEATURES (module x action)
-- Auto-generate for all leaf modules (modules with routes)
-- ============================================================
DO $$
DECLARE
  r_module RECORD;
  r_action RECORD;
  v_feature_key TEXT;
  v_feature_name TEXT;
  v_is_leaf BOOLEAN;
BEGIN
  FOR r_module IN SELECT * FROM public.system_modules WHERE is_active = true LOOP
    -- Check if leaf (has route or no children)
    SELECT NOT EXISTS(SELECT 1 FROM public.system_modules WHERE parent_module_id = r_module.id) INTO v_is_leaf;
    
    -- Only create features for leaf modules (actual pages/tools)
    IF v_is_leaf AND r_module.route IS NOT NULL THEN
      FOR r_action IN SELECT * FROM public.system_actions LOOP
        v_feature_key := r_module.key || '.' || r_action.key;
        v_feature_name := r_module.name || ' - ' || r_action.name;
        
        -- Only create relevant actions per module type
        -- All modules get: view, export
        -- Admin/config modules get: configure, edit
        -- Operational modules get: execute
        -- Management modules get: create, edit, delete, approve
        IF r_action.key IN ('view', 'export') THEN
          INSERT INTO public.system_features (module_id, action_id, key, name, is_active)
          VALUES (r_module.id, r_action.id, v_feature_key, v_feature_name, true)
          ON CONFLICT (key) DO NOTHING;
        ELSIF r_action.key = 'execute' AND r_module.layer IN ('operacional', 'marketplace', 'ferramentas') THEN
          INSERT INTO public.system_features (module_id, action_id, key, name, is_active)
          VALUES (r_module.id, r_action.id, v_feature_key, v_feature_name, true)
          ON CONFLICT (key) DO NOTHING;
        ELSIF r_action.key = 'configure' AND (r_module.layer = 'admin' OR r_module.key LIKE '%.settings%' OR r_module.key LIKE '%.rules%' OR r_module.key LIKE '%.header%' OR r_module.key LIKE '%.pricing%' OR r_module.key LIKE '%.freight%') THEN
          INSERT INTO public.system_features (module_id, action_id, key, name, is_active)
          VALUES (r_module.id, r_action.id, v_feature_key, v_feature_name, true)
          ON CONFLICT (key) DO NOTHING;
        ELSIF r_action.key IN ('create', 'edit', 'delete') AND (r_module.layer = 'admin' OR r_module.key LIKE '%collaborators%' OR r_module.key LIKE '%tasks%' OR r_module.key LIKE '%blog%') THEN
          INSERT INTO public.system_features (module_id, action_id, key, name, is_active)
          VALUES (r_module.id, r_action.id, v_feature_key, v_feature_name, true)
          ON CONFLICT (key) DO NOTHING;
        ELSIF r_action.key = 'approve' AND (r_module.key LIKE '%billing%' OR r_module.key LIKE '%plans%') THEN
          INSERT INTO public.system_features (module_id, action_id, key, name, is_active)
          VALUES (r_module.id, r_action.id, v_feature_key, v_feature_name, true)
          ON CONFLICT (key) DO NOTHING;
        END IF;
      END LOOP;
    END IF;
  END LOOP;
END $$;

-- ============================================================
-- SEED: PROFILE PERMISSIONS (auto-fill for global profiles)
-- ============================================================
DO $$
DECLARE
  r_profile RECORD;
  r_feature RECORD;
  v_allowed BOOLEAN;
  v_module_layer module_layer;
  v_action_key TEXT;
BEGIN
  FOR r_profile IN SELECT * FROM public.access_profiles WHERE is_system = true AND company_id IS NULL LOOP
    FOR r_feature IN 
      SELECT sf.*, sa.key as action_key, sm.layer as module_layer, sm.key as module_key, sm.is_internal_only
      FROM public.system_features sf
      JOIN public.system_actions sa ON sa.id = sf.action_id
      JOIN public.system_modules sm ON sm.id = sf.module_id
      WHERE sf.is_active = true
    LOOP
      v_allowed := false;
      v_module_layer := r_feature.module_layer;
      v_action_key := r_feature.action_key;

      CASE r_profile.key
        -- OWNER: everything
        WHEN 'owner' THEN
          v_allowed := true;

        -- ADMIN: almost everything, restrict billing/integrations configure
        WHEN 'admin' THEN
          IF r_feature.is_internal_only AND v_module_layer = 'admin' THEN
            v_allowed := true; -- Admin sees admin modules
          ELSE
            v_allowed := true;
          END IF;

        -- OPERATIONAL: view+execute+export on operational/marketplace, no configure/delete
        WHEN 'operational' THEN
          IF v_module_layer = 'admin' THEN
            v_allowed := false;
          ELSIF v_action_key IN ('view', 'execute', 'export') THEN
            v_allowed := true;
          ELSIF v_action_key IN ('create', 'edit') AND (r_feature.module_key LIKE '%tasks%') THEN
            v_allowed := true;
          ELSE
            v_allowed := false;
          END IF;

        -- FINANCE: view+export on financial/reports, no execute operational
        WHEN 'finance' THEN
          IF v_module_layer = 'admin' THEN
            v_allowed := false;
          ELSIF v_action_key IN ('view', 'export') THEN
            v_allowed := true;
          ELSIF v_action_key = 'configure' AND r_feature.module_key LIKE '%financial%' THEN
            v_allowed := true;
          ELSE
            v_allowed := false;
          END IF;

        -- READ_ONLY: view only
        WHEN 'read_only' THEN
          IF v_module_layer = 'admin' THEN
            v_allowed := false;
          ELSIF v_action_key = 'view' THEN
            v_allowed := true;
          ELSIF v_action_key = 'export' THEN
            v_allowed := true; -- allow export for read users
          ELSE
            v_allowed := false;
          END IF;
      END CASE;

      INSERT INTO public.profile_permissions (profile_id, feature_id, allowed)
      VALUES (r_profile.id, r_feature.id, v_allowed)
      ON CONFLICT (profile_id, feature_id) DO UPDATE SET allowed = v_allowed;
    END LOOP;
  END LOOP;
END $$;

-- ============================================================
-- FUNCTIONS
-- ============================================================

-- Permission check function
CREATE OR REPLACE FUNCTION public.check_permission(
  p_user_id UUID,
  p_company_id UUID,
  p_feature_key TEXT
) RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_is_owner BOOLEAN;
  v_profile_id UUID;
  v_allowed BOOLEAN;
BEGIN
  -- Check if user is Owner of company (always full access)
  SELECT cu.is_owner, cu.profile_id
  INTO v_is_owner, v_profile_id
  FROM public.company_users cu
  WHERE cu.company_id = p_company_id AND cu.user_id = p_user_id AND cu.status = 'active';

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  IF v_is_owner THEN
    RETURN true;
  END IF;

  -- Check global admin role (user_roles table)
  IF EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = p_user_id AND role = 'admin') THEN
    RETURN true;
  END IF;

  -- Check profile permission
  IF v_profile_id IS NULL THEN
    RETURN false;
  END IF;

  SELECT pp.allowed INTO v_allowed
  FROM public.profile_permissions pp
  JOIN public.system_features sf ON sf.id = pp.feature_id
  WHERE pp.profile_id = v_profile_id AND sf.key = p_feature_key;

  RETURN COALESCE(v_allowed, false);
END;
$fn$;

-- Get user permissions for menu rendering
CREATE OR REPLACE FUNCTION public.get_user_permissions(
  p_user_id UUID,
  p_company_id UUID
) RETURNS TABLE(feature_key TEXT, allowed BOOLEAN)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_is_owner BOOLEAN;
  v_profile_id UUID;
  v_is_global_admin BOOLEAN;
BEGIN
  -- Check company_users
  SELECT cu.is_owner, cu.profile_id
  INTO v_is_owner, v_profile_id
  FROM public.company_users cu
  WHERE cu.company_id = p_company_id AND cu.user_id = p_user_id AND cu.status = 'active';

  -- Check global admin
  SELECT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id = p_user_id AND role = 'admin')
  INTO v_is_global_admin;

  -- Owner or global admin: all features allowed
  IF v_is_owner OR v_is_global_admin THEN
    RETURN QUERY
    SELECT sf.key, true
    FROM public.system_features sf
    WHERE sf.is_active = true;
    RETURN;
  END IF;

  -- Regular user: return profile permissions
  IF v_profile_id IS NOT NULL THEN
    RETURN QUERY
    SELECT sf.key, COALESCE(pp.allowed, false)
    FROM public.system_features sf
    LEFT JOIN public.profile_permissions pp ON pp.feature_id = sf.id AND pp.profile_id = v_profile_id
    WHERE sf.is_active = true;
    RETURN;
  END IF;

  -- No profile: deny all
  RETURN QUERY
  SELECT sf.key, false
  FROM public.system_features sf
  WHERE sf.is_active = true;
END;
$fn$;

-- Get menu tree for user
CREATE OR REPLACE FUNCTION public.get_user_menu(
  p_user_id UUID,
  p_company_id UUID
) RETURNS TABLE(
  module_id UUID,
  module_key TEXT,
  module_name TEXT,
  layer module_layer,
  parent_module_id UUID,
  sort_order INTEGER,
  icon_key TEXT,
  route TEXT,
  is_internal_only BOOLEAN
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_is_owner BOOLEAN;
  v_is_global_admin BOOLEAN;
  v_profile_id UUID;
BEGIN
  SELECT cu.is_owner, cu.profile_id
  INTO v_is_owner, v_profile_id
  FROM public.company_users cu
  WHERE cu.company_id = p_company_id AND cu.user_id = p_user_id AND cu.status = 'active';

  SELECT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id = p_user_id AND role = 'admin')
  INTO v_is_global_admin;

  -- Owner/Admin: see all active modules (including internal for admin)
  IF v_is_owner OR v_is_global_admin THEN
    RETURN QUERY
    SELECT sm.id, sm.key, sm.name, sm.layer, sm.parent_module_id, sm.sort_order, sm.icon_key, sm.route, sm.is_internal_only
    FROM public.system_modules sm
    WHERE sm.is_active = true
    ORDER BY sm.sort_order;
    RETURN;
  END IF;

  -- Regular user: only modules where they have at least 'view' permission
  RETURN QUERY
  WITH viewable_modules AS (
    SELECT DISTINCT sf.module_id
    FROM public.system_features sf
    JOIN public.profile_permissions pp ON pp.feature_id = sf.id
    JOIN public.system_actions sa ON sa.id = sf.action_id
    WHERE pp.profile_id = v_profile_id
      AND pp.allowed = true
      AND sa.key = 'view'
  ),
  -- Include parent modules of viewable modules
  all_visible AS (
    SELECT sm.id FROM viewable_modules vm JOIN public.system_modules sm ON sm.id = vm.module_id
    UNION
    SELECT sm2.id FROM viewable_modules vm 
    JOIN public.system_modules sm ON sm.id = vm.module_id
    JOIN public.system_modules sm2 ON sm2.id = sm.parent_module_id
    UNION
    SELECT sm3.id FROM viewable_modules vm
    JOIN public.system_modules sm ON sm.id = vm.module_id
    JOIN public.system_modules sm2 ON sm2.id = sm.parent_module_id
    JOIN public.system_modules sm3 ON sm3.id = sm2.parent_module_id
  )
  SELECT sm.id, sm.key, sm.name, sm.layer, sm.parent_module_id, sm.sort_order, sm.icon_key, sm.route, sm.is_internal_only
  FROM public.system_modules sm
  JOIN all_visible av ON av.id = sm.id
  WHERE sm.is_active = true
    AND sm.is_internal_only = false  -- non-admin users don't see internal modules
  ORDER BY sm.sort_order;
END;
$fn$;

-- Auto-generate features when module is created
CREATE OR REPLACE FUNCTION public.auto_create_module_features()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  r_action RECORD;
  v_feature_key TEXT;
BEGIN
  -- Only for leaf modules with routes
  IF NEW.route IS NOT NULL THEN
    FOR r_action IN SELECT * FROM public.system_actions WHERE key IN ('view', 'execute', 'export') LOOP
      v_feature_key := NEW.key || '.' || r_action.key;
      INSERT INTO public.system_features (module_id, action_id, key, name, is_active)
      VALUES (NEW.id, r_action.id, v_feature_key, NEW.name || ' - ' || r_action.name, true)
      ON CONFLICT (key) DO NOTHING;
    END LOOP;
  END IF;
  RETURN NEW;
END;
$fn$;

CREATE TRIGGER trg_auto_create_module_features
  AFTER INSERT ON public.system_modules
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_create_module_features();

-- Auto-generate profile_permissions when feature is created
CREATE OR REPLACE FUNCTION public.auto_create_feature_permissions()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  r_profile RECORD;
  v_allowed BOOLEAN;
  v_action_key TEXT;
  v_module_layer module_layer;
BEGIN
  SELECT sa.key INTO v_action_key FROM public.system_actions sa WHERE sa.id = NEW.action_id;
  SELECT sm.layer INTO v_module_layer FROM public.system_modules sm WHERE sm.id = NEW.module_id;

  FOR r_profile IN SELECT * FROM public.access_profiles WHERE is_system = true AND company_id IS NULL LOOP
    v_allowed := CASE r_profile.key
      WHEN 'owner' THEN true
      WHEN 'admin' THEN true
      WHEN 'operational' THEN v_action_key IN ('view', 'execute', 'export') AND v_module_layer != 'admin'
      WHEN 'finance' THEN v_action_key IN ('view', 'export') AND v_module_layer != 'admin'
      WHEN 'read_only' THEN v_action_key IN ('view', 'export') AND v_module_layer != 'admin'
      ELSE false
    END;

    INSERT INTO public.profile_permissions (profile_id, feature_id, allowed)
    VALUES (r_profile.id, NEW.id, v_allowed)
    ON CONFLICT (profile_id, feature_id) DO NOTHING;
  END LOOP;
  RETURN NEW;
END;
$fn$;

CREATE TRIGGER trg_auto_create_feature_permissions
  AFTER INSERT ON public.system_features
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_create_feature_permissions();

-- Updated_at triggers
CREATE TRIGGER trg_system_modules_updated_at BEFORE UPDATE ON public.system_modules FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_access_profiles_updated_at BEFORE UPDATE ON public.access_profiles FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_profile_permissions_updated_at BEFORE UPDATE ON public.profile_permissions FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_company_users_updated_at BEFORE UPDATE ON public.company_users FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================================================
-- RLS POLICIES
-- ============================================================

-- system_modules: readable by all authenticated, writable by admin
ALTER TABLE public.system_modules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read modules"
  ON public.system_modules FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins can manage modules"
  ON public.system_modules FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- system_actions: readable by all authenticated
ALTER TABLE public.system_actions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read actions"
  ON public.system_actions FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins can manage actions"
  ON public.system_actions FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- system_features: readable by all authenticated
ALTER TABLE public.system_features ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read features"
  ON public.system_features FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins can manage features"
  ON public.system_features FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- access_profiles: readable by company members or global profiles
ALTER TABLE public.access_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read global and own company profiles"
  ON public.access_profiles FOR SELECT
  TO authenticated
  USING (
    company_id IS NULL  -- global profiles
    OR EXISTS (
      SELECT 1 FROM public.company_users cu
      WHERE cu.company_id = access_profiles.company_id AND cu.user_id = auth.uid()
    )
  );

CREATE POLICY "Admins can manage profiles"
  ON public.access_profiles FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Company owners can manage company profiles"
  ON public.access_profiles FOR ALL
  TO authenticated
  USING (
    company_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.company_users cu
      WHERE cu.company_id = access_profiles.company_id AND cu.user_id = auth.uid() AND cu.is_owner = true
    )
  )
  WITH CHECK (
    company_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.company_users cu
      WHERE cu.company_id = access_profiles.company_id AND cu.user_id = auth.uid() AND cu.is_owner = true
    )
  );

-- profile_permissions: readable alongside profiles
ALTER TABLE public.profile_permissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read permissions of accessible profiles"
  ON public.profile_permissions FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.access_profiles ap
      WHERE ap.id = profile_permissions.profile_id
        AND (ap.company_id IS NULL OR EXISTS (
          SELECT 1 FROM public.company_users cu
          WHERE cu.company_id = ap.company_id AND cu.user_id = auth.uid()
        ))
    )
  );

CREATE POLICY "Admins can manage permissions"
  ON public.profile_permissions FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Company owners can manage company profile permissions"
  ON public.profile_permissions FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.access_profiles ap
      JOIN public.company_users cu ON cu.company_id = ap.company_id AND cu.user_id = auth.uid() AND cu.is_owner = true
      WHERE ap.id = profile_permissions.profile_id AND ap.company_id IS NOT NULL
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.access_profiles ap
      JOIN public.company_users cu ON cu.company_id = ap.company_id AND cu.user_id = auth.uid() AND cu.is_owner = true
      WHERE ap.id = profile_permissions.profile_id AND ap.company_id IS NOT NULL
    )
  );

-- company_users: scoped to company
ALTER TABLE public.company_users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own company members"
  ON public.company_users FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid() OR EXISTS (
      SELECT 1 FROM public.company_users cu2
      WHERE cu2.company_id = company_users.company_id AND cu2.user_id = auth.uid()
    )
  );

CREATE POLICY "Admins can manage company users"
  ON public.company_users FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Company owners can manage members"
  ON public.company_users FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.company_users cu2
      WHERE cu2.company_id = company_users.company_id AND cu2.user_id = auth.uid() AND cu2.is_owner = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.company_users cu2
      WHERE cu2.company_id = company_users.company_id AND cu2.user_id = auth.uid() AND cu2.is_owner = true
    )
  );
