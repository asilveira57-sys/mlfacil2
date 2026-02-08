-- Insert SEO settings for module detail pages
INSERT INTO public.seo_page_settings (page_path, page_type, meta_title, meta_description, meta_keywords, robots_index, robots_follow)
VALUES
  ('/modulo/gestao-anuncios', 'external_page', 'Gestão de Anúncios - ML Fácil', 'Controle completo dos seus anúncios do Mercado Livre. Gerencie campanhas de ADS, lances, ACOS, ROAS e performance publicitária em um único painel.', 'gestão anúncios mercado livre, gerenciar anúncios ml, campanhas ads mercado livre, acos roas marketplace', true, true),
  ('/modulo/dashboard-analises', 'external_page', 'Dashboard e Análises - ML Fácil', 'Painéis completos com KPIs de vendas, faturamento, ticket médio e evolução de performance para vendedores do Mercado Livre.', 'dashboard mercado livre, análise vendas ml, kpi marketplace, relatórios vendas mercado livre', true, true),
  ('/modulo/precificacao-custos', 'external_page', 'Precificação e Custos - ML Fácil', 'Simulador de preços, cálculo de comissões do Mercado Livre, margem de lucro e ponto de equilíbrio por produto.', 'precificação mercado livre, calculadora comissões ml, margem lucro marketplace, custos venda ml', true, true),
  ('/modulo/radiografia-seed', 'external_page', 'Radiografia e Seed - ML Fácil', 'Análise profunda de anúncios do Mercado Livre. Diagnóstico de saúde dos listings e validação de qualidade com IA.', 'radiografia anúncio mercado livre, análise listing ml, qualidade anúncio marketplace, seed monitoramento', true, true),
  ('/modulo/tendencias-concorrencia', 'external_page', 'Tendências e Concorrência - ML Fácil', 'Descubra produtos em alta, palavras-chave trending e monitore preços e estratégias dos concorrentes no Mercado Livre.', 'tendências mercado livre, produtos em alta ml, concorrência marketplace, monitoramento preços ml', true, true),
  ('/modulo/automacoes-alertas', 'external_page', 'Automações e Alertas - ML Fácil', 'Regras automáticas, notificações inteligentes e gerenciamento de tarefas para vendedores do Mercado Livre.', 'automação mercado livre, alertas vendas ml, tarefas marketplace, notificações vendedor ml', true, true),
  ('/consultoria', 'external_page', 'Consultoria para Vendedores do Mercado Livre - ML Fácil', 'Consultoria especializada para vendedores do Mercado Livre. Diagnóstico, estratégia e acompanhamento para escalar suas vendas.', 'consultoria mercado livre, consultor marketplace, estratégia vendas ml, mentor vendedor', true, true)
ON CONFLICT (page_path) DO UPDATE SET
  meta_title = EXCLUDED.meta_title,
  meta_description = EXCLUDED.meta_description,
  meta_keywords = EXCLUDED.meta_keywords,
  robots_index = EXCLUDED.robots_index,
  robots_follow = EXCLUDED.robots_follow;