-- Create billing_info table to store user billing data
CREATE TABLE public.billing_info (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  person_type TEXT NOT NULL DEFAULT 'pf' CHECK (person_type IN ('pf', 'pj')),
  is_preferred BOOLEAN NOT NULL DEFAULT true,
  
  -- PF fields
  cpf TEXT,
  pf_cep TEXT,
  pf_city TEXT,
  pf_state TEXT,
  
  -- PJ fields
  cnpj TEXT,
  razao_social TEXT,
  nome_fantasia TEXT,
  inscricao_estadual TEXT,
  is_ie_exempt BOOLEAN DEFAULT false,
  pj_cep TEXT,
  pj_city TEXT,
  pj_state TEXT,
  
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  
  UNIQUE(user_id)
);

-- Enable RLS
ALTER TABLE public.billing_info ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Users can view their own billing info"
  ON public.billing_info FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own billing info"
  ON public.billing_info FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own billing info"
  ON public.billing_info FOR UPDATE
  USING (auth.uid() = user_id);

-- Trigger for updated_at
CREATE TRIGGER update_billing_info_updated_at
  BEFORE UPDATE ON public.billing_info
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();