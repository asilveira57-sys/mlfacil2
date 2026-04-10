
CREATE TABLE public.verification_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  verification_url TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT now() + INTERVAL '72 hours',
  used BOOLEAN NOT NULL DEFAULT false
);

ALTER TABLE public.verification_links ENABLE ROW LEVEL SECURITY;

-- Public read so the redirect page works without auth
CREATE POLICY "Anyone can read verification links"
  ON public.verification_links
  FOR SELECT
  USING (true);
