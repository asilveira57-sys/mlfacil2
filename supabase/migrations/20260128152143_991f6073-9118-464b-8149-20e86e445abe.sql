
-- Table for company color preferences
CREATE TABLE public.company_customization (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL,
  user_id UUID NOT NULL,
  color_key TEXT NOT NULL DEFAULT 'blue',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(company_id, user_id)
);

-- Table for user dashboard shortcuts
CREATE TABLE public.user_dashboard_shortcuts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  company_id UUID NOT NULL,
  shortcut_key TEXT NOT NULL,
  is_enabled BOOLEAN NOT NULL DEFAULT true,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, company_id, shortcut_key)
);

-- Enable RLS
ALTER TABLE public.company_customization ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_dashboard_shortcuts ENABLE ROW LEVEL SECURITY;

-- RLS Policies for company_customization
CREATE POLICY "Users can view their own company customizations"
ON public.company_customization FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own company customizations"
ON public.company_customization FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own company customizations"
ON public.company_customization FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own company customizations"
ON public.company_customization FOR DELETE
USING (auth.uid() = user_id);

-- RLS Policies for user_dashboard_shortcuts
CREATE POLICY "Users can view their own shortcuts"
ON public.user_dashboard_shortcuts FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own shortcuts"
ON public.user_dashboard_shortcuts FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own shortcuts"
ON public.user_dashboard_shortcuts FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own shortcuts"
ON public.user_dashboard_shortcuts FOR DELETE
USING (auth.uid() = user_id);

-- Indexes
CREATE INDEX idx_company_customization_user ON public.company_customization(user_id);
CREATE INDEX idx_company_customization_company ON public.company_customization(company_id);
CREATE INDEX idx_user_shortcuts_user_company ON public.user_dashboard_shortcuts(user_id, company_id);
