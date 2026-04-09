
-- Add the parent group "Mercado Livre" to ZPL Básico plan so child modules (Etiqueta Full) are visible
INSERT INTO plan_modules (plan_id, module_id, is_enabled)
VALUES ('a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000100', true)
ON CONFLICT DO NOTHING;
