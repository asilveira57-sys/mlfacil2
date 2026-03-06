
-- Widget Catalog (system-level, all available widgets)
CREATE TABLE public.widget_catalog (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text UNIQUE NOT NULL,
  nome text NOT NULL,
  descricao text,
  icone text,
  tamanho_padrao text NOT NULL DEFAULT 'medium',
  ativo boolean NOT NULL DEFAULT true,
  ordem integer NOT NULL DEFAULT 0,
  modulo_dependente text,
  plano_minimo text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.widget_catalog ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anyone_can_read_widget_catalog" ON public.widget_catalog FOR SELECT TO authenticated USING (true);

-- User Dashboard Widgets (per-user layout)
CREATE TABLE public.user_dashboard_widgets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id text NOT NULL,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  widget_slug text NOT NULL REFERENCES public.widget_catalog(slug) ON DELETE CASCADE,
  posicao_x integer NOT NULL DEFAULT 0,
  posicao_y integer NOT NULL DEFAULT 0,
  largura integer NOT NULL DEFAULT 1,
  altura integer NOT NULL DEFAULT 1,
  fixado boolean NOT NULL DEFAULT false,
  visivel boolean NOT NULL DEFAULT true,
  config_json jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.user_dashboard_widgets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users_manage_own_widgets" ON public.user_dashboard_widgets FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Widget Usage Logs (operational audit)
CREATE TABLE public.widget_usage_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id text NOT NULL,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  widget_slug text NOT NULL,
  acao text NOT NULL,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.widget_usage_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users_insert_own_usage_logs" ON public.widget_usage_logs FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "users_read_own_usage_logs" ON public.widget_usage_logs FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- Widget Event Stream (behavioral events for retrospective engine)
CREATE TABLE public.widget_event_stream (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id text NOT NULL,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  widget_slug text NOT NULL,
  evento text NOT NULL,
  valor text,
  contexto jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.widget_event_stream ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users_insert_own_events" ON public.widget_event_stream FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "users_read_own_events" ON public.widget_event_stream FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- Indexes
CREATE INDEX idx_user_dashboard_widgets_user ON public.user_dashboard_widgets(user_id);
CREATE INDEX idx_user_dashboard_widgets_tenant ON public.user_dashboard_widgets(tenant_id);
CREATE INDEX idx_widget_usage_logs_user ON public.widget_usage_logs(user_id, created_at);
CREATE INDEX idx_widget_event_stream_user ON public.widget_event_stream(user_id, created_at);

-- Seed widget catalog
INSERT INTO public.widget_catalog (slug, nome, descricao, icone, tamanho_padrao, ordem, modulo_dependente) VALUES
  ('clock', 'Relógio Digital', 'Relógio com fuso horário configurável', 'Clock', 'small', 1, NULL),
  ('weather', 'Clima', 'Condições climáticas por localização', 'CloudSun', 'small', 2, NULL),
  ('dollar-rate', 'Cotação Dólar', 'Cotação atual USD/BRL em tempo real', 'DollarSign', 'small', 3, NULL),
  ('crypto-rate', 'Cotação Criptomoedas', 'Preços de criptomoedas populares', 'Bitcoin', 'small', 4, NULL),
  ('news', 'Notícias Econômicas', 'Principais notícias do mercado', 'Newspaper', 'medium', 5, NULL),
  ('calculator', 'Calculadora Rápida', 'Calculadora simples integrada', 'Calculator', 'small', 6, NULL),
  ('stopwatch', 'Cronômetro', 'Cronômetro para controle de tempo', 'Timer', 'small', 7, NULL),
  ('countdown', 'Timer Regressivo', 'Contagem regressiva configurável', 'Hourglass', 'small', 8, NULL),
  ('notes', 'Bloco de Notas', 'Anotações rápidas do dia', 'StickyNote', 'medium', 9, NULL),
  ('tasks', 'Tarefas do Dia', 'Lista de tarefas diárias', 'CheckSquare', 'medium', 10, NULL),
  ('calendar', 'Calendário Mensal', 'Visão mensal de datas', 'CalendarDays', 'large', 11, NULL),
  ('system-alerts', 'Alertas do Sistema', 'Alertas e avisos importantes', 'Bell', 'medium', 12, NULL),
  ('sales-summary', 'Resumo de Vendas', 'Indicadores de vendas recentes', 'ShoppingCart', 'medium', 13, 'marketplace'),
  ('financial-summary', 'Resumo Financeiro', 'Indicadores financeiros do período', 'Wallet', 'medium', 14, 'financeiro'),
  ('recent-orders', 'Pedidos Recentes', 'Últimos pedidos recebidos', 'Package', 'medium', 15, 'marketplace'),
  ('important-notifications', 'Notificações Importantes', 'Notificações prioritárias', 'AlertTriangle', 'small', 16, NULL);
