INSERT INTO public.system_modules (key, name, icon_key, route, is_active, sort_order, parent_module_id)
VALUES ('postits', 'Post-its', 'sticky-note', '/postits', true, 50, NULL)
ON CONFLICT (key) DO NOTHING;