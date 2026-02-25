
-- 1. help_article_modules (many-to-many: articles ↔ system_modules)
CREATE TABLE public.help_article_modules (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  article_id UUID NOT NULL REFERENCES public.help_articles(id) ON DELETE CASCADE,
  module_id UUID NOT NULL REFERENCES public.system_modules(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(article_id, module_id)
);

ALTER TABLE public.help_article_modules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read article modules"
  ON public.help_article_modules FOR SELECT
  USING (true);

CREATE POLICY "Admins can manage article modules"
  ON public.help_article_modules FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 2. help_article_feedback (votes)
CREATE TABLE public.help_article_feedback (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  article_id UUID NOT NULL REFERENCES public.help_articles(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  session_id TEXT,
  vote BOOLEAN NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.help_article_feedback ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can insert feedback"
  ON public.help_article_feedback FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Anyone can read own feedback"
  ON public.help_article_feedback FOR SELECT
  USING (true);

-- 3. help_feedback_logs
CREATE TABLE public.help_feedback_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  article_id UUID NOT NULL REFERENCES public.help_articles(id) ON DELETE CASCADE,
  vote BOOLEAN NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.help_feedback_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can insert feedback logs"
  ON public.help_feedback_logs FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Admins can read feedback logs"
  ON public.help_feedback_logs FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- 4. Add new columns to help_articles
ALTER TABLE public.help_articles
  ADD COLUMN IF NOT EXISTS helpful_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS not_helpful_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS auto_generated BOOLEAN NOT NULL DEFAULT false;

-- 5. Trigger to auto-update helpful/not_helpful counts and log
CREATE OR REPLACE FUNCTION public.handle_help_article_feedback()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = 'public'
AS $$
BEGIN
  -- Update article counters
  IF NEW.vote = true THEN
    UPDATE public.help_articles SET helpful_count = helpful_count + 1 WHERE id = NEW.article_id;
  ELSE
    UPDATE public.help_articles SET not_helpful_count = not_helpful_count + 1 WHERE id = NEW.article_id;
  END IF;

  -- Log the feedback
  INSERT INTO public.help_feedback_logs (article_id, vote) VALUES (NEW.article_id, NEW.vote);

  RETURN NEW;
END;
$$;

CREATE TRIGGER on_help_feedback_insert
  AFTER INSERT ON public.help_article_feedback
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_help_article_feedback();
