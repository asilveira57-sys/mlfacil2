-- Add unique constraint for upsert to work
CREATE UNIQUE INDEX IF NOT EXISTS idx_social_calendar_events_source_date_title
ON public.social_calendar_events (source, event_date, title);