
-- =============================================
-- Tabela: br_feriados (~10.000 registros/ano)
-- =============================================
CREATE TABLE public.br_feriados (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  data DATE NOT NULL,
  nome TEXT NOT NULL,
  tipo TEXT NOT NULL,
  descricao TEXT,
  uf VARCHAR(2),
  codigo_ibge INTEGER,
  ano INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Unique index com COALESCE para evitar duplicatas
CREATE UNIQUE INDEX idx_br_feriados_unique 
  ON public.br_feriados(data, nome, tipo, COALESCE(uf, ''), COALESCE(codigo_ibge, 0));

ALTER TABLE public.br_feriados ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read br_feriados"
  ON public.br_feriados FOR SELECT
  TO authenticated
  USING (true);

CREATE INDEX idx_br_feriados_data ON public.br_feriados(data);
CREATE INDEX idx_br_feriados_ano ON public.br_feriados(ano);
CREATE INDEX idx_br_feriados_tipo ON public.br_feriados(tipo);
CREATE INDEX idx_br_feriados_uf ON public.br_feriados(uf);
CREATE INDEX idx_br_feriados_codigo_ibge ON public.br_feriados(codigo_ibge);
CREATE INDEX idx_br_feriados_ano_tipo ON public.br_feriados(ano, tipo);

-- =============================================
-- Adicionar colunas em social_calendar_user_preferences
-- =============================================
ALTER TABLE public.social_calendar_user_preferences
  ADD COLUMN IF NOT EXISTS uf VARCHAR(2),
  ADD COLUMN IF NOT EXISTS codigo_ibge INTEGER;
