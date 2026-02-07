
-- Create qa_settings table for greeting/signature configuration
CREATE TABLE public.qa_settings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  seller_id TEXT NOT NULL,
  greeting_template TEXT NOT NULL DEFAULT '{periodo_dia}! Obrigado pelo interesse.',
  signature_template TEXT NOT NULL DEFAULT 'Atenciosamente, {nome_loja}.',
  greeting_enabled BOOLEAN NOT NULL DEFAULT true,
  signature_enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, seller_id)
);

-- Enable RLS
ALTER TABLE public.qa_settings ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Users can view their own QA settings"
  ON public.qa_settings FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own QA settings"
  ON public.qa_settings FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own QA settings"
  ON public.qa_settings FOR UPDATE
  USING (auth.uid() = user_id);

-- Add use_greeting and use_signature flags to qa_response_library
ALTER TABLE public.qa_response_library
  ADD COLUMN IF NOT EXISTS use_greeting BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS use_signature BOOLEAN NOT NULL DEFAULT true;

-- Trigger for updated_at on qa_settings
CREATE TRIGGER update_qa_settings_updated_at
  BEFORE UPDATE ON public.qa_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
