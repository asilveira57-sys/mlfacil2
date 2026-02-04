-- =============================================
-- TABELA: post_sale_conversations
-- Armazena o cabeçalho de cada conversa (1 por pedido)
-- =============================================
CREATE TABLE IF NOT EXISTS public.post_sale_conversations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  seller_id TEXT NOT NULL,
  order_id TEXT NOT NULL,
  pack_id TEXT,
  buyer_id TEXT NOT NULL,
  buyer_name TEXT,
  item_title TEXT,
  item_thumbnail TEXT,
  shipment_id TEXT,
  conversation_status TEXT NOT NULL DEFAULT 'active',
  unread_count INTEGER NOT NULL DEFAULT 0,
  last_message_date TIMESTAMPTZ,
  last_message_text TEXT,
  last_message_from TEXT,
  seller_max_chars INTEGER DEFAULT 350,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  CONSTRAINT unique_seller_order UNIQUE (seller_id, order_id)
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_conversations_seller_unread 
  ON public.post_sale_conversations (seller_id, unread_count) 
  WHERE unread_count > 0;

CREATE INDEX IF NOT EXISTS idx_conversations_last_message 
  ON public.post_sale_conversations (seller_id, last_message_date DESC);

CREATE INDEX IF NOT EXISTS idx_conversations_user_id 
  ON public.post_sale_conversations (user_id);

-- =============================================
-- TABELA: post_sale_conversation_messages
-- Armazena cada mensagem individual
-- =============================================
CREATE TABLE IF NOT EXISTS public.post_sale_conversation_messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  conversation_id UUID NOT NULL REFERENCES public.post_sale_conversations(id) ON DELETE CASCADE,
  ml_message_id TEXT,
  from_user_id TEXT NOT NULL,
  from_type TEXT NOT NULL CHECK (from_type IN ('buyer', 'seller')),
  message_text TEXT,
  message_status TEXT DEFAULT 'available',
  moderation_status TEXT DEFAULT 'clean',
  moderation_reason TEXT,
  has_attachments BOOLEAN DEFAULT false,
  attachments JSONB DEFAULT '[]'::jsonb,
  message_date TIMESTAMPTZ NOT NULL,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  CONSTRAINT unique_ml_message UNIQUE (ml_message_id)
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_messages_conversation 
  ON public.post_sale_conversation_messages (conversation_id, message_date ASC);

CREATE INDEX IF NOT EXISTS idx_messages_unread 
  ON public.post_sale_conversation_messages (conversation_id, read_at) 
  WHERE read_at IS NULL;

-- =============================================
-- RLS: post_sale_conversations
-- =============================================
ALTER TABLE public.post_sale_conversations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own conversations"
  ON public.post_sale_conversations
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own conversations"
  ON public.post_sale_conversations
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own conversations"
  ON public.post_sale_conversations
  FOR UPDATE
  USING (auth.uid() = user_id);

-- =============================================
-- RLS: post_sale_conversation_messages
-- =============================================
ALTER TABLE public.post_sale_conversation_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view messages from their conversations"
  ON public.post_sale_conversation_messages
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.post_sale_conversations c
      WHERE c.id = conversation_id AND c.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert messages in their conversations"
  ON public.post_sale_conversation_messages
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.post_sale_conversations c
      WHERE c.id = conversation_id AND c.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update messages in their conversations"
  ON public.post_sale_conversation_messages
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.post_sale_conversations c
      WHERE c.id = conversation_id AND c.user_id = auth.uid()
    )
  );

-- =============================================
-- Trigger para updated_at
-- =============================================
CREATE TRIGGER update_post_sale_conversations_updated_at
  BEFORE UPDATE ON public.post_sale_conversations
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();