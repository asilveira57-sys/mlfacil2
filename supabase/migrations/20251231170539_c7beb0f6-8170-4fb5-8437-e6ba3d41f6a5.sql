-- Tabela para armazenar histórico de tempos de conversão
CREATE TABLE public.zpl_conversion_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  label_type TEXT NOT NULL,
  label_subtype TEXT,
  label_count INTEGER NOT NULL,
  width_mm NUMERIC NOT NULL,
  height_mm NUMERIC NOT NULL,
  duration_seconds NUMERIC NOT NULL,
  time_per_label NUMERIC GENERATED ALWAYS AS (duration_seconds / NULLIF(label_count, 0)) STORED,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Índice para busca rápida por tipo e usuário
CREATE INDEX idx_zpl_history_user_label ON public.zpl_conversion_history(user_id, label_type);

-- RLS
ALTER TABLE public.zpl_conversion_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "zpl_conversion_history_all" ON public.zpl_conversion_history
  FOR ALL USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);