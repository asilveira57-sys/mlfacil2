-- 1. Criar tabela de preferências de cabeçalho por seller
CREATE TABLE IF NOT EXISTS public.meli_label_header_preferences (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  seller_id TEXT NOT NULL,
  
  -- Flags de exibição
  show_customer BOOLEAN NOT NULL DEFAULT true,
  show_products BOOLEAN NOT NULL DEFAULT true,
  show_order_id BOOLEAN NOT NULL DEFAULT true,
  show_shipment_id BOOLEAN NOT NULL DEFAULT false,
  show_comment BOOLEAN NOT NULL DEFAULT true,
  
  -- Limites
  max_total_lines INTEGER NOT NULL DEFAULT 6,
  max_product_lines INTEGER NOT NULL DEFAULT 3,
  font_size INTEGER NOT NULL DEFAULT 8,
  
  -- Ordem das linhas (array de strings: 'customer', 'products', 'order', 'shipment', 'comment')
  line_order TEXT[] NOT NULL DEFAULT ARRAY['customer', 'products', 'order', 'comment'],
  
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  
  -- Constraint de unicidade por seller
  UNIQUE(seller_id)
);

-- 2. Habilitar RLS
ALTER TABLE public.meli_label_header_preferences ENABLE ROW LEVEL SECURITY;

-- 3. Criar política de acesso
CREATE POLICY "meli_label_header_preferences_all" 
ON public.meli_label_header_preferences 
FOR ALL 
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- 4. Criar índice para busca rápida por seller
CREATE INDEX idx_meli_label_header_preferences_seller ON public.meli_label_header_preferences(seller_id);

-- 5. Adicionar campo internal_header na tabela de orders se não existir
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'meli_orders_cache' 
    AND column_name = 'internal_header'
  ) THEN
    ALTER TABLE public.meli_orders_cache ADD COLUMN internal_header TEXT;
  END IF;
END $$;

-- 6. Adicionar campo layout na tabela de print queue se não existir
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'meli_print_queue' 
    AND column_name = 'layout'
  ) THEN
    ALTER TABLE public.meli_print_queue ADD COLUMN layout TEXT NOT NULL DEFAULT 'meli_100x150';
  END IF;
END $$;

-- 7. Trigger para atualizar updated_at
CREATE OR REPLACE FUNCTION public.update_meli_label_header_preferences_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

DROP TRIGGER IF EXISTS update_meli_label_header_preferences_updated_at ON public.meli_label_header_preferences;
CREATE TRIGGER update_meli_label_header_preferences_updated_at
BEFORE UPDATE ON public.meli_label_header_preferences
FOR EACH ROW
EXECUTE FUNCTION public.update_meli_label_header_preferences_updated_at();