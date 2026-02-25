
-- ============================================================
-- FIX LINT 0007: Habilitar RLS em tabelas que já possuem policies
-- Tabelas: module_rating_stats, system_rating_stats
-- ============================================================

-- 1. Habilitar RLS
ALTER TABLE public.module_rating_stats ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_rating_stats ENABLE ROW LEVEL SECURITY;

-- 2. Substituir policy de escrita "System updates stats" por uma que
--    permita service_role (usado por triggers SECURITY DEFINER)
--    A policy ALL atual requer has_role(admin) que não funciona em triggers.

-- module_rating_stats
DROP POLICY IF EXISTS "System updates stats" ON public.module_rating_stats;

CREATE POLICY "service_role_full_access_module_rating_stats"
ON public.module_rating_stats
FOR ALL TO service_role
USING (true)
WITH CHECK (true);

CREATE POLICY "admin_full_access_module_rating_stats"
ON public.module_rating_stats
FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

-- system_rating_stats
DROP POLICY IF EXISTS "System updates stats" ON public.system_rating_stats;

CREATE POLICY "service_role_full_access_system_rating_stats"
ON public.system_rating_stats
FOR ALL TO service_role
USING (true)
WITH CHECK (true);

CREATE POLICY "admin_full_access_system_rating_stats"
ON public.system_rating_stats
FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

-- ============================================================
-- Log de auditoria
-- ============================================================
INSERT INTO public.system_logs (level, system_area, action, success, message, meta_json)
VALUES (
  'info',
  'database_security',
  'enable_rls_on_tables_with_policies',
  true,
  'RLS habilitado em 2 tabelas que tinham policies criadas mas RLS desativado: module_rating_stats, system_rating_stats',
  '{"tables_fixed": ["public.module_rating_stats", "public.system_rating_stats"], "total_fixed": 2, "policies_adjusted": ["System updates stats replaced with service_role + admin policies"]}'::jsonb
);
