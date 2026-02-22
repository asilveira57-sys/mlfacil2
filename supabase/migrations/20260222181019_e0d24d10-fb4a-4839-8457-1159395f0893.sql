
-- =============================================
-- Tabela: br_estados (27 registros)
-- =============================================
CREATE TABLE IF NOT EXISTS public.br_estados (
  uf VARCHAR(2) NOT NULL PRIMARY KEY,
  codigo_uf INTEGER NOT NULL UNIQUE,
  nome TEXT NOT NULL,
  regiao TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.br_estados ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read br_estados"
  ON public.br_estados FOR SELECT
  TO authenticated
  USING (true);

-- =============================================
-- Tabela: br_municipios (~5.570 registros)
-- =============================================
CREATE TABLE IF NOT EXISTS public.br_municipios (
  codigo_ibge INTEGER NOT NULL PRIMARY KEY,
  nome TEXT NOT NULL,
  capital BOOLEAN NOT NULL DEFAULT false,
  uf VARCHAR(2) NOT NULL REFERENCES public.br_estados(uf),
  ddd INTEGER,
  fuso_horario TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.br_municipios ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read br_municipios"
  ON public.br_municipios FOR SELECT
  TO authenticated
  USING (true);

CREATE INDEX IF NOT EXISTS idx_br_municipios_uf ON public.br_municipios(uf);
CREATE INDEX IF NOT EXISTS idx_br_municipios_nome ON public.br_municipios(nome);
