-- Create user_preferences table
CREATE TABLE public.user_preferences (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  active_workspace_id UUID REFERENCES public.workspaces(id) ON DELETE SET NULL,
  tasks_enabled BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.user_preferences ENABLE ROW LEVEL SECURITY;

-- Policies for user_preferences
CREATE POLICY "Users can view their own preferences"
  ON public.user_preferences
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert their own preferences"
  ON public.user_preferences
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update their own preferences"
  ON public.user_preferences
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid());

-- Trigger for updated_at
CREATE TRIGGER update_user_preferences_updated_at
  BEFORE UPDATE ON public.user_preferences
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_set_updated_at();

-- Function to ensure workspace exists
CREATE OR REPLACE FUNCTION public.ensure_workspace(p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_prefs RECORD;
  v_workspace_id UUID;
  v_account_id UUID;
  v_result JSONB;
BEGIN
  -- Get or create user_preferences
  SELECT * INTO v_prefs FROM user_preferences WHERE user_id = p_user_id;
  
  IF v_prefs IS NULL THEN
    INSERT INTO user_preferences (user_id, tasks_enabled, active_workspace_id)
    VALUES (p_user_id, false, NULL)
    RETURNING * INTO v_prefs;
  END IF;
  
  -- If active_workspace_id is null, try to find or create one
  IF v_prefs.active_workspace_id IS NULL THEN
    -- Look for existing workspace membership
    SELECT workspace_id INTO v_workspace_id
    FROM workspace_members
    WHERE user_id = p_user_id
    ORDER BY created_at ASC
    LIMIT 1;
    
    IF v_workspace_id IS NULL THEN
      -- Create default workspace
      INSERT INTO workspaces (name)
      VALUES ('Meu workspace')
      RETURNING id INTO v_workspace_id;
      
      -- Add user as admin
      INSERT INTO workspace_members (workspace_id, user_id, role)
      VALUES (v_workspace_id, p_user_id, 'admin');
      
      -- Create default account
      INSERT INTO workspace_accounts (workspace_id, name, is_active)
      VALUES (v_workspace_id, 'Conta principal', true)
      RETURNING id INTO v_account_id;
    END IF;
    
    -- Update preferences with active workspace
    UPDATE user_preferences
    SET active_workspace_id = v_workspace_id, updated_at = now()
    WHERE user_id = p_user_id;
    
    v_prefs.active_workspace_id := v_workspace_id;
  END IF;
  
  -- Build result
  v_result := jsonb_build_object(
    'user_id', v_prefs.user_id,
    'active_workspace_id', v_prefs.active_workspace_id,
    'tasks_enabled', v_prefs.tasks_enabled,
    'created', v_workspace_id IS NOT NULL
  );
  
  RETURN v_result;
END;
$$;