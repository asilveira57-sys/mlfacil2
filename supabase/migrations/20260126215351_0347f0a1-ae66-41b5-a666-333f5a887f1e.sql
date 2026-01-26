-- Create table to store AI analysis history
CREATE TABLE public.ads_ai_analyses (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  seller_id TEXT NOT NULL,
  analysis_type TEXT NOT NULL DEFAULT 'full',
  focus_area TEXT,
  health_score INTEGER,
  health_status TEXT,
  analysis_json JSONB NOT NULL,
  input_summary JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Add index for performance
CREATE INDEX idx_ads_ai_analyses_seller ON public.ads_ai_analyses(seller_id, created_at DESC);

-- Enable RLS
ALTER TABLE public.ads_ai_analyses ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY "Users can view their own AI analyses"
  ON public.ads_ai_analyses
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own AI analyses"
  ON public.ads_ai_analyses
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Create function to auto-set user_id on insert
CREATE OR REPLACE FUNCTION public.set_ads_ai_analysis_user_id()
RETURNS TRIGGER AS $$
BEGIN
  NEW.user_id := auth.uid();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Create trigger to auto-set user_id
CREATE TRIGGER set_ads_ai_analysis_user_id_trigger
  BEFORE INSERT ON public.ads_ai_analyses
  FOR EACH ROW
  EXECUTE FUNCTION public.set_ads_ai_analysis_user_id();