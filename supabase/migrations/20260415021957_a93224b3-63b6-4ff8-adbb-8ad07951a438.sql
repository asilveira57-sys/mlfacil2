ALTER TABLE public.meli_label_header_preferences
  ADD COLUMN IF NOT EXISTS show_variation_attrs boolean NOT NULL DEFAULT true;