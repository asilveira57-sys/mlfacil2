-- Add utilities preferences columns to user_preferences table (if they don't exist)
DO $$ 
BEGIN
  -- Add timezone column if it doesn't exist
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'user_preferences' AND column_name = 'timezone') THEN
    ALTER TABLE public.user_preferences ADD COLUMN timezone TEXT DEFAULT 'America/Sao_Paulo';
  END IF;
  
  -- Add hour_format column if it doesn't exist
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'user_preferences' AND column_name = 'hour_format') THEN
    ALTER TABLE public.user_preferences ADD COLUMN hour_format TEXT DEFAULT '24h' CHECK (hour_format IN ('12h', '24h'));
  END IF;
  
  -- Add widgets_enabled column if it doesn't exist
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'user_preferences' AND column_name = 'widgets_enabled') THEN
    ALTER TABLE public.user_preferences ADD COLUMN widgets_enabled JSONB DEFAULT '{"clock": true, "weather": true, "calculator": true}'::jsonb;
  END IF;
  
  -- Add widgets_layout column if it doesn't exist
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'user_preferences' AND column_name = 'widgets_layout') THEN
    ALTER TABLE public.user_preferences ADD COLUMN widgets_layout JSONB DEFAULT '{"order": ["clock", "weather", "calculator"], "positions": {}}'::jsonb;
  END IF;
END $$;

-- Create workspace_preferences table if it doesn't exist
CREATE TABLE IF NOT EXISTS public.workspace_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  default_language TEXT DEFAULT 'pt-BR',
  city TEXT DEFAULT 'São Paulo',
  state TEXT DEFAULT 'SP',
  country TEXT DEFAULT 'BR',
  weather_update_interval INTEGER DEFAULT 30,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(workspace_id)
);

-- Enable RLS on workspace_preferences
ALTER TABLE public.workspace_preferences ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist and recreate
DROP POLICY IF EXISTS "Members can view workspace preferences" ON public.workspace_preferences;
DROP POLICY IF EXISTS "Admins can update workspace preferences" ON public.workspace_preferences;
DROP POLICY IF EXISTS "Admins can insert workspace preferences" ON public.workspace_preferences;

-- Create policies for workspace_preferences with correct enum values
CREATE POLICY "Members can view workspace preferences"
ON public.workspace_preferences
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.workspace_members wm
    WHERE wm.workspace_id = workspace_preferences.workspace_id
    AND wm.user_id = auth.uid()
  )
);

CREATE POLICY "Admins can update workspace preferences"
ON public.workspace_preferences
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.workspace_members wm
    WHERE wm.workspace_id = workspace_preferences.workspace_id
    AND wm.user_id = auth.uid()
    AND wm.role IN ('admin', 'gestor')
  )
);

CREATE POLICY "Admins can insert workspace preferences"
ON public.workspace_preferences
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.workspace_members wm
    WHERE wm.workspace_id = workspace_preferences.workspace_id
    AND wm.user_id = auth.uid()
    AND wm.role IN ('admin', 'gestor')
  )
);

-- Create updated_at trigger for workspace_preferences
CREATE OR REPLACE FUNCTION public.update_workspace_preferences_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

DROP TRIGGER IF EXISTS update_workspace_preferences_timestamp ON public.workspace_preferences;
CREATE TRIGGER update_workspace_preferences_timestamp
  BEFORE UPDATE ON public.workspace_preferences
  FOR EACH ROW
  EXECUTE FUNCTION public.update_workspace_preferences_updated_at();