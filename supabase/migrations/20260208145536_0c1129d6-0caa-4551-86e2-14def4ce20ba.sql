INSERT INTO system_modules (id, name, description, icon_name, route, is_active) VALUES
  ('precificacao', 'Precificação', 'Simulador de precificação para Mercado Livre', 'Calculator', '/precificacao', true),
  ('comissoes', 'Comissões', 'Consulta de comissões por categoria do Mercado Livre', 'Percent', '/comissoes', true),
  ('frete', 'Gestão de Frete', 'Tabela de frete, cálculo de custos e divergências', 'Truck', '/frete', true)
ON CONFLICT (id) DO NOTHING;