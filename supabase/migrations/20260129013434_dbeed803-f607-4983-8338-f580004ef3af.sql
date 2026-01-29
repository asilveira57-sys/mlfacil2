-- Check if tables exist and create only if they don't
-- Then create missing indexes with unique names

-- Create index only if table exists
DO $$
BEGIN
  -- Check if competitor_tracking_alerts exists (if it does, the previous migration worked)
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'competitor_tracking_alerts') THEN
    -- Drop conflicting index if exists
    DROP INDEX IF EXISTS public.idx_competitor_alerts_unread;
    -- Create with new name
    CREATE INDEX IF NOT EXISTS idx_comp_tracking_alerts_unread 
      ON public.competitor_tracking_alerts(user_id, is_read, is_dismissed);
  END IF;
END $$;