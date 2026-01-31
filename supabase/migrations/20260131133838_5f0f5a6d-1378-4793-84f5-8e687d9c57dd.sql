-- Tabela temporária para rascunhos de clonagem "Clonar como anúncio novo"
-- Armazena snapshot do anúncio fonte e o draft editável do anúncio novo

CREATE TABLE public.clone_drafts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  ml_account_id UUID REFERENCES public.ml_accounts(id) ON DELETE SET NULL,
  
  -- Dados da fonte
  source_url TEXT,
  source_item_id TEXT NOT NULL,
  captured_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  
  -- Snapshot completo do anúncio fonte (JSON)
  raw_snapshot JSONB NOT NULL DEFAULT '{}',
  
  -- Payload editável para criação do anúncio novo (JSON)
  draft_payload JSONB NOT NULL DEFAULT '{}',
  
  -- Status do rascunho
  status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'READY', 'CREATING', 'CREATED', 'FAILED')),
  
  -- Resultado da criação
  created_item_id TEXT,
  error_message TEXT,
  error_details JSONB,
  
  -- Logs de validação
  validation_logs JSONB DEFAULT '[]',
  
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.clone_drafts ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Users can view their own drafts"
ON public.clone_drafts FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own drafts"
ON public.clone_drafts FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own drafts"
ON public.clone_drafts FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own drafts"
ON public.clone_drafts FOR DELETE
USING (auth.uid() = user_id);

-- Trigger para updated_at
CREATE TRIGGER update_clone_drafts_updated_at
BEFORE UPDATE ON public.clone_drafts
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Índices para performance
CREATE INDEX idx_clone_drafts_user_id ON public.clone_drafts(user_id);
CREATE INDEX idx_clone_drafts_workspace_id ON public.clone_drafts(workspace_id);
CREATE INDEX idx_clone_drafts_status ON public.clone_drafts(status);
CREATE INDEX idx_clone_drafts_created_at ON public.clone_drafts(created_at DESC);