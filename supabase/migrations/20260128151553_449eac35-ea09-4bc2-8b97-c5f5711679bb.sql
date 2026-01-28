-- Expand seo_page_settings with new fields for comprehensive SEO management

-- Add new columns
ALTER TABLE public.seo_page_settings 
ADD COLUMN IF NOT EXISTS page_type text NOT NULL DEFAULT 'external_page',
ADD COLUMN IF NOT EXISTS meta_keywords text,
ADD COLUMN IF NOT EXISTS seo_roadmap text,
ADD COLUMN IF NOT EXISTS primary_keyword text,
ADD COLUMN IF NOT EXISTS secondary_keywords text,
ADD COLUMN IF NOT EXISTS seo_cluster text,
ADD COLUMN IF NOT EXISTS evergreen_content boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS suggested_update_date date;

-- Add constraint for page_type
ALTER TABLE public.seo_page_settings 
DROP CONSTRAINT IF EXISTS seo_page_settings_page_type_check;

ALTER TABLE public.seo_page_settings 
ADD CONSTRAINT seo_page_settings_page_type_check 
CHECK (page_type IN ('external_page', 'nlog_post'));

-- Rename page_path to route_slug for clarity (keep backwards compatibility with alias)
-- We'll keep page_path but also add a comment
COMMENT ON COLUMN public.seo_page_settings.page_path IS 'Route slug for the page (e.g., /, /planos, /nlog/seo-guide)';

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_seo_page_settings_page_type ON public.seo_page_settings(page_type);
CREATE INDEX IF NOT EXISTS idx_seo_page_settings_robots ON public.seo_page_settings(robots_index, robots_follow);

-- Enable realtime for SEO updates
ALTER PUBLICATION supabase_realtime ADD TABLE public.seo_page_settings;