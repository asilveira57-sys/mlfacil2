-- Add color mode preference to ui_theme_settings
ALTER TABLE public.ui_theme_settings 
ADD COLUMN IF NOT EXISTS color_mode_preference TEXT DEFAULT 'auto' CHECK (color_mode_preference IN ('light', 'dark', 'auto'));

-- Add comment for documentation
COMMENT ON COLUMN public.ui_theme_settings.color_mode_preference IS 'User preference for color mode: light, dark, or auto (follows system)';