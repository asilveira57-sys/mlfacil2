
-- =============================================
-- LEGAL DOCUMENTS TABLE
-- =============================================
CREATE TABLE public.legal_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  doc_type TEXT NOT NULL CHECK (doc_type IN ('terms', 'privacy_policy', 'cookies_policy')),
  version TEXT NOT NULL,
  content TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  published_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  is_active BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Unique partial index: only 1 active document per doc_type
CREATE UNIQUE INDEX idx_legal_documents_one_active_per_type 
  ON public.legal_documents (doc_type) WHERE is_active = true;

CREATE INDEX idx_legal_documents_type_active 
  ON public.legal_documents (doc_type, is_active);

-- Enable RLS
ALTER TABLE public.legal_documents ENABLE ROW LEVEL SECURITY;

-- Anyone can read active documents
CREATE POLICY "Anyone can read active legal documents"
  ON public.legal_documents FOR SELECT
  USING (is_active = true);

-- Only admins can manage (via has_role)
CREATE POLICY "Admins can manage legal documents"
  ON public.legal_documents FOR ALL
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- =============================================
-- USER CONSENTS TABLE (history - append only)
-- =============================================
CREATE TABLE public.user_consents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  consent_scope TEXT NOT NULL CHECK (consent_scope IN ('cookies', 'terms')),
  consent_type TEXT NOT NULL,
  essential BOOLEAN NOT NULL DEFAULT true,
  performance BOOLEAN,
  analytics BOOLEAN,
  document_type TEXT NOT NULL,
  document_version TEXT NOT NULL,
  document_hash TEXT NOT NULL,
  accepted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ip_address TEXT,
  user_agent TEXT,
  source TEXT NOT NULL CHECK (source IN ('banner', 'settings', 'system')),
  pdf_path TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_user_consents_user_accepted 
  ON public.user_consents (user_id, accepted_at DESC);

CREATE INDEX idx_user_consents_scope 
  ON public.user_consents (user_id, consent_scope, accepted_at DESC);

-- Enable RLS
ALTER TABLE public.user_consents ENABLE ROW LEVEL SECURITY;

-- Users can only see their own consents
CREATE POLICY "Users can read own consents"
  ON public.user_consents FOR SELECT
  USING (auth.uid() = user_id);

-- Users can only insert their own consents
CREATE POLICY "Users can insert own consents"
  ON public.user_consents FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- No UPDATE or DELETE allowed (append-only history)

-- =============================================
-- USER SENTIMENTS TABLE
-- =============================================
CREATE TABLE public.user_sentiments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  context TEXT NOT NULL CHECK (context IN ('cookies', 'terms', 'privacy_settings')),
  sentiment TEXT NOT NULL CHECK (sentiment IN ('muito_satisfeito', 'satisfeito', 'neutro', 'insatisfeito', 'muito_insatisfeito')),
  comment TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_user_sentiments_user_created 
  ON public.user_sentiments (user_id, created_at DESC);

-- Enable RLS
ALTER TABLE public.user_sentiments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own sentiments"
  ON public.user_sentiments FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own sentiments"
  ON public.user_sentiments FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- No UPDATE or DELETE allowed

-- =============================================
-- STORAGE BUCKET: legal_consents (private)
-- =============================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('legal_consents', 'legal_consents', false)
ON CONFLICT (id) DO NOTHING;

-- Users can only download their own consent PDFs
CREATE POLICY "Users can download own consent PDFs"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'legal_consents' 
    AND auth.uid()::text = (storage.foldername(name))[2]
    AND (storage.foldername(name))[1] = 'consents'
  );

-- =============================================
-- SEED: initial legal documents (version 1.0)
-- =============================================
INSERT INTO public.legal_documents (doc_type, version, content, content_hash, is_active)
VALUES 
  ('cookies_policy', '1.0', 'Política de Cookies v1.0 - Conteúdo inicial.', encode(digest('Política de Cookies v1.0 - Conteúdo inicial.', 'sha256'), 'hex'), true),
  ('terms', '1.0', 'Termos de Uso v1.0 - Conteúdo inicial.', encode(digest('Termos de Uso v1.0 - Conteúdo inicial.', 'sha256'), 'hex'), true),
  ('privacy_policy', '1.0', 'Política de Privacidade v1.0 - Conteúdo inicial.', encode(digest('Política de Privacidade v1.0 - Conteúdo inicial.', 'sha256'), 'hex'), true);
