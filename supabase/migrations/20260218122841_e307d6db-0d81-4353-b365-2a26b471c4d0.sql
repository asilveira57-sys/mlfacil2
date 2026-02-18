
-- Cookie consents table for LGPD compliance
CREATE TABLE public.cookie_consents (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  consent_type TEXT NOT NULL CHECK (consent_type IN ('all', 'custom')),
  essential BOOLEAN NOT NULL DEFAULT true,
  performance BOOLEAN NOT NULL DEFAULT false,
  analytics BOOLEAN NOT NULL DEFAULT false,
  policy_version TEXT NOT NULL DEFAULT '1.0',
  ip_address TEXT,
  user_agent TEXT,
  fingerprint TEXT,
  accepted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for performance (no row limits)
CREATE INDEX idx_cookie_consents_user_id ON public.cookie_consents(user_id);
CREATE INDEX idx_cookie_consents_accepted_at ON public.cookie_consents(accepted_at);
CREATE INDEX idx_cookie_consents_policy_version ON public.cookie_consents(policy_version);
CREATE INDEX idx_cookie_consents_fingerprint ON public.cookie_consents(fingerprint);

-- Enable RLS
ALTER TABLE public.cookie_consents ENABLE ROW LEVEL SECURITY;

-- Users can read their own consents
CREATE POLICY "Users can read own consents"
  ON public.cookie_consents FOR SELECT
  USING (auth.uid() = user_id);

-- Users can insert their own consents
CREATE POLICY "Users can insert own consents"
  ON public.cookie_consents FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Allow anonymous inserts (for non-logged users syncing later or recording via edge function)
CREATE POLICY "Allow anon consent inserts"
  ON public.cookie_consents FOR INSERT
  WITH CHECK (user_id IS NULL);

-- Admins can read all consents for compliance auditing
CREATE POLICY "Admins can read all consents"
  ON public.cookie_consents FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));
