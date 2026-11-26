-- Pop-ups de novidade: registra quem já viu, para abrir uma única vez por usuário.
CREATE TABLE IF NOT EXISTS public.user_feature_announcements_seen (
  user_id UUID NOT NULL DEFAULT auth.uid(),
  announcement_key TEXT NOT NULL,
  action TEXT,
  seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, announcement_key)
);
ALTER TABLE public.user_feature_announcements_seen ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own announcements seen select" ON public.user_feature_announcements_seen;
DROP POLICY IF EXISTS "own announcements seen insert" ON public.user_feature_announcements_seen;
CREATE POLICY "own announcements seen select" ON public.user_feature_announcements_seen FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "own announcements seen insert" ON public.user_feature_announcements_seen FOR INSERT WITH CHECK (auth.uid() = user_id);
GRANT SELECT, INSERT ON public.user_feature_announcements_seen TO authenticated;
