INSERT INTO public.system_modules (id, key, name, description, layer, parent_module_id, sort_order, icon_key, route, is_active, status, category)
VALUES (
  gen_random_uuid(),
  'marketplace.sales.label_teste',
  'Label Teste',
  'Geração de etiquetas em modo teste (V2).',
  'marketplace',
  'b0000000-0000-0000-0000-000000000100',
  35,
  'TestTube',
  '/label-teste',
  true,
  'active',
  'logistics'
)
ON CONFLICT (key) DO UPDATE
SET name = EXCLUDED.name,
    parent_module_id = EXCLUDED.parent_module_id,
    sort_order = EXCLUDED.sort_order,
    route = EXCLUDED.route,
    icon_key = EXCLUDED.icon_key,
    is_active = true;