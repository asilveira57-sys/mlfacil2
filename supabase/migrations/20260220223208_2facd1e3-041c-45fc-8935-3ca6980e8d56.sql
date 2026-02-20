
-- ============================================================
-- ONBOARDING MODULE: Full Schema Migration
-- ============================================================

-- 1. onboarding_flows
CREATE TABLE public.onboarding_flows (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug           text UNIQUE NOT NULL,
  nome           text NOT NULL,
  descricao      text,
  ativo          boolean NOT NULL DEFAULT true,
  aplicacao_planos  text[],
  aplicacao_perfis  text[],
  versao         int NOT NULL DEFAULT 1,
  prioridade     int NOT NULL DEFAULT 100,
  exigir_conclusao boolean NOT NULL DEFAULT true,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_onboarding_flows_ativo_prioridade ON public.onboarding_flows(ativo, prioridade);
CREATE INDEX idx_onboarding_flows_planos ON public.onboarding_flows USING GIN(aplicacao_planos);
CREATE INDEX idx_onboarding_flows_perfis ON public.onboarding_flows USING GIN(aplicacao_perfis);

ALTER TABLE public.onboarding_flows ENABLE ROW LEVEL SECURITY;

-- Admin full access
CREATE POLICY "admin_all_onboarding_flows"
  ON public.onboarding_flows
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Users can read active flows
CREATE POLICY "users_read_active_onboarding_flows"
  ON public.onboarding_flows
  FOR SELECT
  TO authenticated
  USING (ativo = true);

-- 2. onboarding_steps
CREATE TABLE public.onboarding_steps (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  flow_id          uuid NOT NULL REFERENCES public.onboarding_flows(id) ON DELETE CASCADE,
  ordem            int NOT NULL,
  tipo             text NOT NULL CHECK (tipo IN ('texto','midia','video','pergunta','checklist','aviso','acao')),
  titulo           text NOT NULL,
  conteudo         text,
  media_url        text,
  video_url        text,
  cta_label        text,
  cta_route        text,
  obrigatoria      boolean NOT NULL DEFAULT false,
  validacao_schema jsonb,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (flow_id, ordem)
);

CREATE INDEX idx_onboarding_steps_flow_id ON public.onboarding_steps(flow_id);
CREATE INDEX idx_onboarding_steps_tipo ON public.onboarding_steps(tipo);

ALTER TABLE public.onboarding_steps ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_all_onboarding_steps"
  ON public.onboarding_steps
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "users_read_onboarding_steps"
  ON public.onboarding_steps
  FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.onboarding_flows f
    WHERE f.id = flow_id AND f.ativo = true
  ));

-- 3. onboarding_user_progress
CREATE TABLE public.onboarding_user_progress (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id        uuid NOT NULL,
  seller_id         uuid NOT NULL,
  user_id           uuid NOT NULL,
  flow_id           uuid NOT NULL REFERENCES public.onboarding_flows(id),
  flow_versao       int NOT NULL,
  status            text NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress','completed','skipped','forced_pending')),
  step_atual        int NOT NULL DEFAULT 1,
  started_at        timestamptz NOT NULL DEFAULT now(),
  completed_at      timestamptz,
  ip_inicio         text,
  ip_fim            text,
  user_agent        text,
  origem            text,
  consent_hash      text,
  payload_respostas jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, seller_id, user_id, flow_id, flow_versao)
);

CREATE INDEX idx_onb_progress_user_status ON public.onboarding_user_progress(user_id, status);
CREATE INDEX idx_onb_progress_company_seller ON public.onboarding_user_progress(company_id, seller_id);
CREATE INDEX idx_onb_progress_flow_versao ON public.onboarding_user_progress(flow_id, flow_versao);

ALTER TABLE public.onboarding_user_progress ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_own_onboarding_progress"
  ON public.onboarding_user_progress
  FOR ALL
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "admin_all_onboarding_progress"
  ON public.onboarding_user_progress
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 4. onboarding_step_events (audit log)
CREATE TABLE public.onboarding_step_events (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   uuid NOT NULL,
  seller_id    uuid NOT NULL,
  user_id      uuid NOT NULL,
  flow_id      uuid NOT NULL,
  flow_versao  int NOT NULL,
  step_id      uuid NOT NULL REFERENCES public.onboarding_steps(id),
  step_ordem   int NOT NULL,
  evento       text NOT NULL CHECK (evento IN ('view','next','back','submit','fail_validation','cta_click')),
  ip           text,
  user_agent   text,
  details      jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_onb_step_events_user ON public.onboarding_step_events(company_id, seller_id, user_id);
CREATE INDEX idx_onb_step_events_flow ON public.onboarding_step_events(flow_id, flow_versao, step_ordem);
CREATE INDEX idx_onb_step_events_evento ON public.onboarding_step_events(evento, created_at);

ALTER TABLE public.onboarding_step_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_own_onboarding_step_events"
  ON public.onboarding_step_events
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "users_read_own_onboarding_step_events"
  ON public.onboarding_step_events
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "admin_all_onboarding_step_events"
  ON public.onboarding_step_events
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 5. timeline_events (Retrospectiva integration)
CREATE TABLE public.timeline_events (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    uuid NOT NULL,
  seller_id     uuid NOT NULL,
  user_id       uuid,
  event_type    text NOT NULL,
  event_title   text NOT NULL,
  event_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at   timestamptz NOT NULL,
  ip            text,
  user_agent    text,
  source        text,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_timeline_events_company_seller ON public.timeline_events(company_id, seller_id, occurred_at);
CREATE INDEX idx_timeline_events_type ON public.timeline_events(event_type, occurred_at);
CREATE INDEX idx_timeline_events_user ON public.timeline_events(user_id);

ALTER TABLE public.timeline_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_read_own_timeline_events"
  ON public.timeline_events
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "users_insert_own_timeline_events"
  ON public.timeline_events
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "admin_all_timeline_events"
  ON public.timeline_events
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Triggers for updated_at
CREATE TRIGGER trg_onboarding_flows_updated_at
  BEFORE UPDATE ON public.onboarding_flows
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER trg_onboarding_steps_updated_at
  BEFORE UPDATE ON public.onboarding_steps
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER trg_onboarding_progress_updated_at
  BEFORE UPDATE ON public.onboarding_user_progress
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Insert a default welcome flow so sellers see something immediately
INSERT INTO public.onboarding_flows (slug, nome, descricao, ativo, versao, prioridade, exigir_conclusao)
VALUES (
  'boas_vindas_padrao_2026',
  'Boas-Vindas ao Marketplace Fácil',
  'Fluxo padrão de boas-vindas para novos usuários',
  true, 1, 100, false
);

-- Insert initial steps for the default flow
WITH flow AS (SELECT id FROM public.onboarding_flows WHERE slug = 'boas_vindas_padrao_2026')
INSERT INTO public.onboarding_steps (flow_id, ordem, tipo, titulo, conteudo, obrigatoria)
VALUES
  ((SELECT id FROM flow), 1, 'texto', 'Bem-vindo ao Marketplace Fácil! 🎉',
   'Ficamos felizes em ter você aqui. O **Marketplace Fácil** é a plataforma completa para gestão do seu negócio no Mercado Livre.\n\nNas próximas telas, vamos te mostrar o que você pode fazer.', false),
  ((SELECT id FROM flow), 2, 'texto', 'Gerencie seus pedidos e etiquetas',
   'Acesse o módulo **Etiquetas de Envio** para imprimir etiquetas em lote, gerenciar NFs e acompanhar o status de cada envio em tempo real.', false),
  ((SELECT id FROM flow), 3, 'texto', 'Monitore suas campanhas de ADS',
   'No módulo de **Publicidade**, você acompanha ACOS, ROAS e todas as métricas das suas campanhas diretamente na plataforma, sem precisar alternar abas.', false),
  ((SELECT id FROM flow), 4, 'texto', 'Sandbox Operacional',
   'O **Sandbox** é o seu painel de controle multi-empresa: veja pendências de NF, etiquetas, reclamações e muito mais de todas as suas empresas em uma única tela.', false),
  ((SELECT id FROM flow), 5, 'checklist', 'Próximos passos recomendados',
   'Marque os itens abaixo conforme for explorando a plataforma:', true);

-- Update the checklist step with validation schema
WITH flow AS (SELECT id FROM public.onboarding_flows WHERE slug = 'boas_vindas_padrao_2026'),
     step AS (SELECT id FROM public.onboarding_steps WHERE flow_id = (SELECT id FROM flow) AND ordem = 5)
UPDATE public.onboarding_steps SET
  validacao_schema = '{"type":"checklist","items":[{"id":"conectar_ml","label":"Conectar minha conta do Mercado Livre","required":false},{"id":"ver_etiquetas","label":"Conhecer o módulo de Etiquetas","required":false},{"id":"ver_sandbox","label":"Explorar o Sandbox Operacional","required":false}],"minRequired":0}'::jsonb,
  cta_label = 'Ir para Configurações',
  cta_route = '/settings'
WHERE id = (SELECT id FROM step);
