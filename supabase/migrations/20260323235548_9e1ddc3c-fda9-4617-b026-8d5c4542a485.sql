
-- Table: user_label_preferences
CREATE TABLE public.user_label_preferences (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  label_type TEXT, -- null = global default
  default_width_mm INTEGER NOT NULL DEFAULT 100,
  default_height_mm INTEGER NOT NULL DEFAULT 150,
  default_columns INTEGER NOT NULL DEFAULT 1,
  dpi INTEGER NOT NULL DEFAULT 203,
  print_method TEXT NOT NULL DEFAULT 'thermal',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, label_type)
);

ALTER TABLE public.user_label_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own label preferences"
ON public.user_label_preferences FOR ALL
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Table: zpl_imports
CREATE TABLE public.zpl_imports (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  company_id UUID,
  zpl_content TEXT NOT NULL,
  zpl_hash TEXT NOT NULL,
  detected_type TEXT NOT NULL DEFAULT 'unknown_zpl',
  source TEXT NOT NULL DEFAULT 'manual',
  file_name TEXT,
  preset_applied_width INTEGER,
  preset_applied_height INTEGER,
  preset_source TEXT,
  confidence_level TEXT NOT NULL DEFAULT 'medium',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_zpl_imports_user ON public.zpl_imports(user_id);
CREATE INDEX idx_zpl_imports_hash ON public.zpl_imports(zpl_hash);

ALTER TABLE public.zpl_imports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own zpl imports"
ON public.zpl_imports FOR ALL
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Table: zpl_generated_files
CREATE TABLE public.zpl_generated_files (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  zpl_import_id UUID REFERENCES public.zpl_imports(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  pdf_url TEXT,
  total_labels INTEGER NOT NULL DEFAULT 1,
  width_mm INTEGER NOT NULL,
  height_mm INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.zpl_generated_files ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own generated files"
ON public.zpl_generated_files FOR ALL
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);
