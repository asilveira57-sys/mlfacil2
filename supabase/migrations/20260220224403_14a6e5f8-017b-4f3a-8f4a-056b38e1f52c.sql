
-- ============================================================
-- CANAL OFICIAL MKTPFACIL
-- Comunicados institucionais da plataforma
-- ============================================================

-- 1. Tabela principal de comunicados
CREATE TABLE IF NOT EXISTS public.mktpfacil_announcements (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title         text NOT NULL,
  content       text NOT NULL,
  image_url     text NULL,
  link_url      text NULL,
  plan_target   text NOT NULL DEFAULT 'all',
  is_active     boolean NOT NULL DEFAULT true,
  priority      integer NOT NULL DEFAULT 0,
  created_by    uuid NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_mktpfacil_ann_created_at    ON public.mktpfacil_announcements (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_mktpfacil_ann_is_active     ON public.mktpfacil_announcements (is_active);
CREATE INDEX IF NOT EXISTS idx_mktpfacil_ann_plan_target   ON public.mktpfacil_announcements (plan_target);
CREATE INDEX IF NOT EXISTS idx_mktpfacil_ann_priority      ON public.mktpfacil_announcements (priority DESC, created_at DESC);

-- Trigger updated_at
CREATE TRIGGER trg_mktpfacil_ann_updated_at
  BEFORE UPDATE ON public.mktpfacil_announcements
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2. Tabela de leituras por usuário
CREATE TABLE IF NOT EXISTS public.mktpfacil_announcement_reads (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  announcement_id   uuid NOT NULL REFERENCES public.mktpfacil_announcements(id) ON DELETE CASCADE,
  user_id           uuid NOT NULL,
  read_at           timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_ann_read_user UNIQUE (user_id, announcement_id)
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_mktpfacil_reads_user_id         ON public.mktpfacil_announcement_reads (user_id);
CREATE INDEX IF NOT EXISTS idx_mktpfacil_reads_announcement_id ON public.mktpfacil_announcement_reads (announcement_id);

-- ============================================================
-- RLS
-- ============================================================

-- mktpfacil_announcements
ALTER TABLE public.mktpfacil_announcements ENABLE ROW LEVEL SECURITY;

-- Todos os usuários autenticados podem ler comunicados ativos
CREATE POLICY "Announcements: authenticated users can read active"
  ON public.mktpfacil_announcements
  FOR SELECT
  TO authenticated
  USING (is_active = true);

-- Admins podem fazer tudo (usa função get_user_role existente)
CREATE POLICY "Announcements: admins full access"
  ON public.mktpfacil_announcements
  FOR ALL
  TO authenticated
  USING (public.get_user_role(auth.uid()) = 'admin')
  WITH CHECK (public.get_user_role(auth.uid()) = 'admin');

-- mktpfacil_announcement_reads
ALTER TABLE public.mktpfacil_announcement_reads ENABLE ROW LEVEL SECURITY;

-- Usuário vê e insere apenas suas próprias leituras
CREATE POLICY "Reads: user can view own reads"
  ON public.mktpfacil_announcement_reads
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Reads: user can insert own reads"
  ON public.mktpfacil_announcement_reads
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

-- Admin lê tudo
CREATE POLICY "Reads: admin full access"
  ON public.mktpfacil_announcement_reads
  FOR ALL
  TO authenticated
  USING (public.get_user_role(auth.uid()) = 'admin');
