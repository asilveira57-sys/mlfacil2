
-- =============================================
-- CONFIG MENU GROUPS
-- =============================================
CREATE TABLE public.config_menu_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  icon TEXT NOT NULL DEFAULT 'Settings',
  display_order INTEGER NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.config_menu_groups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read active groups"
  ON public.config_menu_groups FOR SELECT TO authenticated
  USING (active = true);

CREATE POLICY "Admins can manage groups"
  ON public.config_menu_groups FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- =============================================
-- CONFIG MENU ITEMS
-- =============================================
CREATE TABLE public.config_menu_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES public.config_menu_groups(id) ON DELETE CASCADE,
  parent_id UUID REFERENCES public.config_menu_items(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  route TEXT,
  icon TEXT DEFAULT 'Settings',
  display_order INTEGER NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_config_menu_items_group ON public.config_menu_items(group_id);
CREATE INDEX idx_config_menu_items_parent ON public.config_menu_items(parent_id);

ALTER TABLE public.config_menu_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read active items"
  ON public.config_menu_items FOR SELECT TO authenticated
  USING (active = true);

CREATE POLICY "Admins can manage items"
  ON public.config_menu_items FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- =============================================
-- ROLE MENU PERMISSIONS
-- =============================================
CREATE TABLE public.role_menu_permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  role_id UUID NOT NULL REFERENCES public.access_profiles(id) ON DELETE CASCADE,
  menu_item_id UUID NOT NULL REFERENCES public.config_menu_items(id) ON DELETE CASCADE,
  can_view BOOLEAN NOT NULL DEFAULT false,
  can_edit BOOLEAN NOT NULL DEFAULT false,
  can_manage BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(role_id, menu_item_id)
);

CREATE INDEX idx_role_menu_perms_role ON public.role_menu_permissions(role_id);
CREATE INDEX idx_role_menu_perms_item ON public.role_menu_permissions(menu_item_id);

ALTER TABLE public.role_menu_permissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own role permissions"
  ON public.role_menu_permissions FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Admins can manage role permissions"
  ON public.role_menu_permissions FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- =============================================
-- SEED: Groups
-- =============================================
INSERT INTO public.config_menu_groups (name, slug, icon, display_order) VALUES
  ('Minha Conta', 'minha-conta', 'User', 1),
  ('Equipe', 'equipe', 'Users', 2),
  ('Sistema', 'sistema', 'Settings', 3),
  ('Financeiro', 'financeiro', 'CreditCard', 4),
  ('Suporte', 'suporte', 'Headphones', 5);

-- =============================================
-- SEED: Items
-- =============================================
-- Minha Conta
WITH g AS (SELECT id FROM config_menu_groups WHERE slug = 'minha-conta')
INSERT INTO public.config_menu_items (group_id, name, slug, route, icon, display_order) VALUES
  ((SELECT id FROM g), 'Perfil', 'perfil', '/configuracoes/perfil', 'User', 1),
  ((SELECT id FROM g), 'Segurança', 'seguranca', '/configuracoes/seguranca', 'Shield', 2),
  ((SELECT id FROM g), 'Sessões Ativas', 'sessoes-ativas', '/configuracoes/sessoes', 'Activity', 3);

-- Minha Conta > Preferências (parent item)
WITH g AS (SELECT id FROM config_menu_groups WHERE slug = 'minha-conta')
INSERT INTO public.config_menu_items (group_id, name, slug, icon, display_order) VALUES
  ((SELECT id FROM g), 'Preferências', 'preferencias', 'Wrench', 4);

WITH pref AS (SELECT id, group_id FROM config_menu_items WHERE slug = 'preferencias')
INSERT INTO public.config_menu_items (group_id, parent_id, name, slug, route, icon, display_order) VALUES
  ((SELECT group_id FROM pref), (SELECT id FROM pref), 'Idioma', 'idioma', '/configuracoes/idioma', 'Globe', 1),
  ((SELECT group_id FROM pref), (SELECT id FROM pref), 'Notificações', 'notificacoes', '/configuracoes/notificacoes', 'Bell', 2),
  ((SELECT group_id FROM pref), (SELECT id FROM pref), 'Fuso Horário', 'fuso-horario', '/configuracoes/fuso-horario', 'Clock', 3);

-- Equipe
WITH g AS (SELECT id FROM config_menu_groups WHERE slug = 'equipe')
INSERT INTO public.config_menu_items (group_id, name, slug, route, icon, display_order) VALUES
  ((SELECT id FROM g), 'Colaboradores', 'colaboradores', '/configuracoes/colaboradores', 'Users', 1),
  ((SELECT id FROM g), 'Perfis de Acesso', 'perfis-acesso', '/configuracoes/perfis-acesso', 'Shield', 2);

-- Sistema
WITH g AS (SELECT id FROM config_menu_groups WHERE slug = 'sistema')
INSERT INTO public.config_menu_items (group_id, name, slug, icon, display_order) VALUES
  ((SELECT id FROM g), 'Personalização', 'personalizacao', 'Palette', 1);

WITH pers AS (SELECT id, group_id FROM config_menu_items WHERE slug = 'personalizacao')
INSERT INTO public.config_menu_items (group_id, parent_id, name, slug, route, icon, display_order) VALUES
  ((SELECT group_id FROM pers), (SELECT id FROM pers), 'Nome da Empresa', 'nome-empresa', '/configuracoes/nome-empresa', 'Building2', 1),
  ((SELECT group_id FROM pers), (SELECT id FROM pers), 'Logotipo', 'logotipo', '/configuracoes/logotipo', 'Image', 2),
  ((SELECT group_id FROM pers), (SELECT id FROM pers), 'Cores', 'cores', '/configuracoes/cores', 'Palette', 3);

WITH g AS (SELECT id FROM config_menu_groups WHERE slug = 'sistema')
INSERT INTO public.config_menu_items (group_id, name, slug, icon, display_order) VALUES
  ((SELECT id FROM g), 'Aparência', 'aparencia', 'LayoutTemplate', 2);

WITH apar AS (SELECT id, group_id FROM config_menu_items WHERE slug = 'aparencia')
INSERT INTO public.config_menu_items (group_id, parent_id, name, slug, route, icon, display_order) VALUES
  ((SELECT group_id FROM apar), (SELECT id FROM apar), 'Tema Claro/Escuro', 'tema', '/configuracoes/tema', 'Sun', 1);

WITH g AS (SELECT id FROM config_menu_groups WHERE slug = 'sistema')
INSERT INTO public.config_menu_items (group_id, name, slug, icon, display_order) VALUES
  ((SELECT id FROM g), 'Privacidade e LGPD', 'privacidade-lgpd', 'ShieldCheck', 3);

WITH priv AS (SELECT id, group_id FROM config_menu_items WHERE slug = 'privacidade-lgpd')
INSERT INTO public.config_menu_items (group_id, parent_id, name, slug, route, icon, display_order) VALUES
  ((SELECT group_id FROM priv), (SELECT id FROM priv), 'Consentimentos', 'consentimentos', '/configuracoes/consentimentos', 'FileCheck', 1),
  ((SELECT group_id FROM priv), (SELECT id FROM priv), 'Exportação de Dados', 'exportacao-dados', '/configuracoes/exportacao-dados', 'Download', 2);

WITH g AS (SELECT id FROM config_menu_groups WHERE slug = 'sistema')
INSERT INTO public.config_menu_items (group_id, name, slug, icon, display_order) VALUES
  ((SELECT id FROM g), 'Utilidades', 'utilidades', 'Wrench', 4);

WITH util AS (SELECT id, group_id FROM config_menu_items WHERE slug = 'utilidades')
INSERT INTO public.config_menu_items (group_id, parent_id, name, slug, route, icon, display_order) VALUES
  ((SELECT group_id FROM util), (SELECT id FROM util), 'Chaves de API', 'chaves-api', '/configuracoes/chaves-api', 'Key', 1),
  ((SELECT group_id FROM util), (SELECT id FROM util), 'Webhooks', 'webhooks', '/configuracoes/webhooks', 'Webhook', 2),
  ((SELECT group_id FROM util), (SELECT id FROM util), 'Logs', 'logs', '/configuracoes/logs', 'FileText', 3);

-- Financeiro
WITH g AS (SELECT id FROM config_menu_groups WHERE slug = 'financeiro')
INSERT INTO public.config_menu_items (group_id, name, slug, route, icon, display_order) VALUES
  ((SELECT id FROM g), 'Plano', 'plano', '/configuracoes/plano', 'CreditCard', 1),
  ((SELECT id FROM g), 'Faturamento', 'faturamento', '/configuracoes/faturamento', 'Receipt', 2),
  ((SELECT id FROM g), 'Histórico de Pagamentos', 'historico-pagamentos', '/configuracoes/historico-pagamentos', 'History', 3),
  ((SELECT id FROM g), 'Empresas e Contas', 'empresas-contas', '/configuracoes/empresas-contas', 'Building2', 4);

-- Suporte
WITH g AS (SELECT id FROM config_menu_groups WHERE slug = 'suporte')
INSERT INTO public.config_menu_items (group_id, name, slug, route, icon, display_order) VALUES
  ((SELECT id FROM g), 'Abrir Chamado', 'abrir-chamado', '/configuracoes/abrir-chamado', 'MessageSquare', 1),
  ((SELECT id FROM g), 'Base de Conhecimento', 'base-conhecimento', '/configuracoes/base-conhecimento', 'BookOpen', 2),
  ((SELECT id FROM g), 'Status do Sistema', 'status-sistema', '/configuracoes/status-sistema', 'Activity', 3);
