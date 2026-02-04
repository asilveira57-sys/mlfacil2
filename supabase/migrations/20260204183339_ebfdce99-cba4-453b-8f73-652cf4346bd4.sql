-- ============================================
-- Fix RLS policies for ad_timeline_stats table
-- Adds hybrid check: direct user_id OR workspace membership
-- ============================================

-- Drop existing policies
DROP POLICY IF EXISTS "Users can view their own ad timeline stats" ON public.ad_timeline_stats;
DROP POLICY IF EXISTS "Users can insert their own ad timeline stats" ON public.ad_timeline_stats;
DROP POLICY IF EXISTS "Users can update their own ad timeline stats" ON public.ad_timeline_stats;

-- Create new SELECT policy with hybrid check
CREATE POLICY "Users can view their own ad timeline stats" 
ON public.ad_timeline_stats 
FOR SELECT 
USING (
  workspace_id = auth.uid() 
  OR 
  workspace_id IN (
    SELECT w.id 
    FROM workspaces w 
    JOIN workspace_members wm ON wm.workspace_id = w.id 
    WHERE wm.user_id = auth.uid()
  )
);

-- Create new INSERT policy with hybrid check
CREATE POLICY "Users can insert their own ad timeline stats" 
ON public.ad_timeline_stats 
FOR INSERT 
WITH CHECK (
  workspace_id = auth.uid() 
  OR 
  workspace_id IN (
    SELECT w.id 
    FROM workspaces w 
    JOIN workspace_members wm ON wm.workspace_id = w.id 
    WHERE wm.user_id = auth.uid()
  )
);

-- Create new UPDATE policy with hybrid check
CREATE POLICY "Users can update their own ad timeline stats" 
ON public.ad_timeline_stats 
FOR UPDATE 
USING (
  workspace_id = auth.uid() 
  OR 
  workspace_id IN (
    SELECT w.id 
    FROM workspaces w 
    JOIN workspace_members wm ON wm.workspace_id = w.id 
    WHERE wm.user_id = auth.uid()
  )
);