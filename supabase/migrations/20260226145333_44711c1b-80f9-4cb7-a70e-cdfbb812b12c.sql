
-- Inserir módulo wholesale
INSERT INTO public.system_modules (key, name, layer, sort_order, icon_key, route, is_active, is_internal_only, status)
VALUES ('wholesale', 'Preço de Atacado', 'operacional', 50, 'Layers', '/atacado', true, false, 'active')
ON CONFLICT (key) DO NOTHING;

-- Inserir features com key e name obrigatórios
INSERT INTO public.system_features (module_id, action_id, key, name, is_active)
SELECT m.id, a.id, 
  'wholesale.' || a.key,
  'Preço de Atacado - ' || CASE a.key
    WHEN 'view' THEN 'Visualizar'
    WHEN 'manage' THEN 'Gerenciar'
    WHEN 'create' THEN 'Criar'
    WHEN 'edit' THEN 'Editar'
    WHEN 'delete' THEN 'Excluir'
    WHEN 'execute' THEN 'Executar'
    WHEN 'export' THEN 'Exportar'
    WHEN 'configure' THEN 'Configurar'
    ELSE a.key
  END,
  true
FROM public.system_modules m
CROSS JOIN public.system_actions a
WHERE m.key = 'wholesale'
  AND a.key IN ('view', 'create', 'edit', 'delete', 'execute', 'configure', 'export')
ON CONFLICT DO NOTHING;
