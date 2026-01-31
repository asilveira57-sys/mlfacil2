-- Add language column to user_preferences table
ALTER TABLE public.user_preferences 
ADD COLUMN IF NOT EXISTS language TEXT DEFAULT 'pt-BR';

-- Add index for language preference lookups
CREATE INDEX IF NOT EXISTS idx_user_preferences_language ON public.user_preferences(language);

-- Add comment for documentation
COMMENT ON COLUMN public.user_preferences.language IS 'User preferred language: pt-BR, en, or es';