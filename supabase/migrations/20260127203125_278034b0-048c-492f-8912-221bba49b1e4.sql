
-- Enum for message types
CREATE TYPE post_sale_message_type AS ENUM ('informativa', 'preventiva', 'relacionamento');

-- Enum for trigger events
CREATE TYPE post_sale_trigger_event AS ENUM ('venda_confirmada', 'pedido_enviado', 'pedido_entregue');

-- Enum for logistics profile
CREATE TYPE post_sale_logistics_profile AS ENUM ('mercado_envios', 'full', 'outros');

-- Enum for message status
CREATE TYPE post_sale_message_status AS ENUM ('enviado', 'bloqueado', 'erro', 'pendente', 'rascunho');

-- Templates table
CREATE TABLE public.post_sale_templates (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  seller_id TEXT NOT NULL,
  name TEXT NOT NULL,
  trigger_event post_sale_trigger_event NOT NULL,
  message_type post_sale_message_type NOT NULL,
  content TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  logistics_profile post_sale_logistics_profile DEFAULT 'mercado_envios',
  max_characters INTEGER DEFAULT 500,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Template scope (per account, listing, or SKU)
CREATE TABLE public.post_sale_template_scopes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  template_id UUID NOT NULL REFERENCES public.post_sale_templates(id) ON DELETE CASCADE,
  scope_type TEXT NOT NULL CHECK (scope_type IN ('account', 'listing', 'sku')),
  scope_value TEXT, -- null for account-wide, listing_id or sku for specific
  is_enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Automation rules
CREATE TABLE public.post_sale_automation_rules (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  seller_id TEXT NOT NULL,
  template_id UUID NOT NULL REFERENCES public.post_sale_templates(id) ON DELETE CASCADE,
  is_active BOOLEAN NOT NULL DEFAULT false,
  require_approval BOOLEAN NOT NULL DEFAULT true,
  wait_for_buyer_response BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Message history/audit log (NEVER deleted, only deactivated)
CREATE TABLE public.post_sale_messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  seller_id TEXT NOT NULL,
  order_id TEXT NOT NULL,
  pack_id TEXT,
  buyer_id TEXT,
  buyer_name TEXT,
  listing_id TEXT,
  listing_title TEXT,
  template_id UUID REFERENCES public.post_sale_templates(id) ON DELETE SET NULL,
  trigger_event post_sale_trigger_event NOT NULL,
  message_type post_sale_message_type NOT NULL,
  content_sent TEXT NOT NULL,
  status post_sale_message_status NOT NULL DEFAULT 'pendente',
  block_reason TEXT,
  block_details JSONB,
  suggested_fix TEXT,
  ml_message_id TEXT,
  sent_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  is_visible BOOLEAN NOT NULL DEFAULT true -- soft delete
);

-- Blocked patterns for validation
CREATE TABLE public.post_sale_blocked_patterns (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  pattern TEXT NOT NULL,
  pattern_type TEXT NOT NULL CHECK (pattern_type IN ('regex', 'contains', 'exact')),
  category TEXT NOT NULL, -- phone, email, link, social, review_request, promo, pressure
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Insert default blocked patterns
INSERT INTO public.post_sale_blocked_patterns (pattern, pattern_type, category, description) VALUES
-- Phone patterns
('\+?\d{2,3}[\s\-]?\(?\d{2}\)?[\s\-]?\d{4,5}[\s\-]?\d{4}', 'regex', 'phone', 'Telefone brasileiro'),
('whatsapp|whats|zap|wpp|watts', 'regex', 'phone', 'Referência a WhatsApp'),
-- Email patterns
('[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}', 'regex', 'email', 'Endereço de email'),
-- Link patterns
('https?://[^\s]+', 'regex', 'link', 'Links HTTP/HTTPS'),
('bit\.ly|goo\.gl|tinyurl|shorturl|t\.co', 'regex', 'link', 'Links encurtados'),
('www\.[^\s]+', 'regex', 'link', 'Links com www'),
-- Social media
('@[a-zA-Z0-9_]+', 'regex', 'social', 'Menção de rede social'),
('instagram|facebook|twitter|tiktok|youtube|telegram', 'regex', 'social', 'Nome de rede social'),
-- Review requests
('avalia[çc][ãa]o|qualifica[çc][ãa]o|5 estrelas|cinco estrelas|nota m[áa]xima|deixe sua opini[ãa]o', 'regex', 'review_request', 'Pedido de avaliação'),
('avalie|qualifique|d[êe] sua nota', 'regex', 'review_request', 'Verbo de avaliação'),
-- Promo/offers
('cupom|desconto|promo[çc][ãa]o|oferta|brinde|gr[áa]tis|frete gr[áa]tis', 'regex', 'promo', 'Termos promocionais'),
-- External purchase
('compre direto|fora da plataforma|site pr[óo]prio|loja pr[óo]pria|fora do mercado', 'regex', 'external', 'Compra externa'),
-- Pressure language
('urgente|[úu]ltima chance|corra|n[ãa]o perca|tempo limitado|acaba hoje|restam poucas', 'regex', 'pressure', 'Linguagem de urgência');

-- Enable RLS
ALTER TABLE public.post_sale_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.post_sale_template_scopes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.post_sale_automation_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.post_sale_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.post_sale_blocked_patterns ENABLE ROW LEVEL SECURITY;

-- RLS Policies for templates
CREATE POLICY "Users can view their own templates"
ON public.post_sale_templates FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own templates"
ON public.post_sale_templates FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own templates"
ON public.post_sale_templates FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own templates"
ON public.post_sale_templates FOR DELETE
USING (auth.uid() = user_id);

-- RLS Policies for template scopes
CREATE POLICY "Users can view scopes of their templates"
ON public.post_sale_template_scopes FOR SELECT
USING (EXISTS (
  SELECT 1 FROM public.post_sale_templates t
  WHERE t.id = template_id AND t.user_id = auth.uid()
));

CREATE POLICY "Users can manage scopes of their templates"
ON public.post_sale_template_scopes FOR ALL
USING (EXISTS (
  SELECT 1 FROM public.post_sale_templates t
  WHERE t.id = template_id AND t.user_id = auth.uid()
));

-- RLS Policies for automation rules
CREATE POLICY "Users can view their own rules"
ON public.post_sale_automation_rules FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can manage their own rules"
ON public.post_sale_automation_rules FOR ALL
USING (auth.uid() = user_id);

-- RLS Policies for messages
CREATE POLICY "Users can view their own messages"
ON public.post_sale_messages FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own messages"
ON public.post_sale_messages FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own messages"
ON public.post_sale_messages FOR UPDATE
USING (auth.uid() = user_id);

-- Blocked patterns are public read-only
CREATE POLICY "Anyone can view blocked patterns"
ON public.post_sale_blocked_patterns FOR SELECT
USING (true);

-- Indexes for performance
CREATE INDEX idx_post_sale_templates_seller ON public.post_sale_templates(seller_id);
CREATE INDEX idx_post_sale_templates_trigger ON public.post_sale_templates(trigger_event);
CREATE INDEX idx_post_sale_messages_order ON public.post_sale_messages(order_id);
CREATE INDEX idx_post_sale_messages_seller ON public.post_sale_messages(seller_id);
CREATE INDEX idx_post_sale_messages_status ON public.post_sale_messages(status);
CREATE INDEX idx_post_sale_messages_created ON public.post_sale_messages(created_at DESC);

-- Updated at trigger
CREATE TRIGGER update_post_sale_templates_updated_at
BEFORE UPDATE ON public.post_sale_templates
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_post_sale_automation_rules_updated_at
BEFORE UPDATE ON public.post_sale_automation_rules
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
