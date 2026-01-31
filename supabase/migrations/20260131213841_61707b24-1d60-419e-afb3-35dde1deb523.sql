-- =====================================================
-- UI THEME SETTINGS - Sistema completo de personalização visual
-- =====================================================

-- Tabela principal de configurações de tema por área
CREATE TABLE IF NOT EXISTS public.ui_theme_settings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  company_id TEXT NOT NULL,
  scope TEXT NOT NULL CHECK (scope IN ('global', 'menu', 'cards', 'shortcuts')),
  
  -- Cores principais
  primary_color TEXT,
  secondary_color TEXT,
  background_color TEXT,
  text_primary_color TEXT,
  text_secondary_color TEXT,
  accent_color TEXT,
  
  -- Cores específicas do menu
  menu_bg_color TEXT,
  menu_item_color TEXT,
  menu_item_active_color TEXT,
  menu_item_hover_color TEXT,
  menu_icon_color TEXT,
  menu_text_color TEXT,
  
  -- Cores específicas dos cards
  card_bg_color TEXT,
  card_title_color TEXT,
  card_value_color TEXT,
  card_text_secondary_color TEXT,
  card_border_color TEXT,
  card_indicator_positive TEXT,
  card_indicator_warning TEXT,
  card_indicator_critical TEXT,
  
  -- Configurações gerais
  contrast_mode TEXT DEFAULT 'normal' CHECK (contrast_mode IN ('normal', 'high')),
  is_synced BOOLEAN DEFAULT true,
  active_preset_id UUID,
  
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  
  UNIQUE(user_id, company_id, scope)
);

-- Tabela de presets de tema
CREATE TABLE IF NOT EXISTS public.ui_theme_presets (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  scope TEXT NOT NULL CHECK (scope IN ('global', 'menu', 'cards', 'shortcuts')),
  theme_data JSONB NOT NULL DEFAULT '{}',
  is_default BOOLEAN DEFAULT false,
  is_system BOOLEAN DEFAULT true,
  user_id UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Habilitar RLS
ALTER TABLE public.ui_theme_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ui_theme_presets ENABLE ROW LEVEL SECURITY;

-- Políticas para ui_theme_settings
CREATE POLICY "Users can view their own theme settings"
  ON public.ui_theme_settings FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own theme settings"
  ON public.ui_theme_settings FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own theme settings"
  ON public.ui_theme_settings FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own theme settings"
  ON public.ui_theme_settings FOR DELETE
  USING (auth.uid() = user_id);

-- Políticas para ui_theme_presets
CREATE POLICY "Anyone can view system presets"
  ON public.ui_theme_presets FOR SELECT
  USING (is_system = true OR auth.uid() = user_id);

CREATE POLICY "Users can create their own presets"
  ON public.ui_theme_presets FOR INSERT
  WITH CHECK (auth.uid() = user_id AND is_system = false);

CREATE POLICY "Users can update their own presets"
  ON public.ui_theme_presets FOR UPDATE
  USING (auth.uid() = user_id AND is_system = false);

CREATE POLICY "Users can delete their own presets"
  ON public.ui_theme_presets FOR DELETE
  USING (auth.uid() = user_id AND is_system = false);

-- Trigger para atualizar updated_at
CREATE OR REPLACE FUNCTION update_ui_theme_settings_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER ui_theme_settings_updated_at
  BEFORE UPDATE ON public.ui_theme_settings
  FOR EACH ROW EXECUTE FUNCTION update_ui_theme_settings_updated_at();

-- Inserir presets padrão do sistema
INSERT INTO public.ui_theme_presets (name, description, scope, theme_data, is_default, is_system) VALUES
-- Presets Globais
('Claro', 'Tema claro padrão', 'global', '{
  "primary_color": "223 47% 23%",
  "secondary_color": "215 20% 65%",
  "background_color": "210 40% 98%",
  "text_primary_color": "222 47% 11%",
  "text_secondary_color": "215 16% 47%",
  "accent_color": "189 94% 43%"
}', true, true),

('Escuro', 'Tema escuro elegante', 'global', '{
  "primary_color": "189 94% 43%",
  "secondary_color": "215 20% 25%",
  "background_color": "222 47% 6%",
  "text_primary_color": "210 40% 98%",
  "text_secondary_color": "215 20% 65%",
  "accent_color": "189 94% 43%"
}', false, true),

('Neutro', 'Tema neutro profissional', 'global', '{
  "primary_color": "220 14% 45%",
  "secondary_color": "220 13% 65%",
  "background_color": "220 14% 96%",
  "text_primary_color": "220 14% 15%",
  "text_secondary_color": "220 10% 45%",
  "accent_color": "220 70% 50%"
}', false, true),

('Alto Contraste', 'Máxima legibilidade', 'global', '{
  "primary_color": "0 0% 0%",
  "secondary_color": "0 0% 30%",
  "background_color": "0 0% 100%",
  "text_primary_color": "0 0% 0%",
  "text_secondary_color": "0 0% 20%",
  "accent_color": "210 100% 40%"
}', false, true),

-- Presets do Menu
('Menu Padrão', 'Menu lateral padrão', 'menu', '{
  "menu_bg_color": "0 0% 100%",
  "menu_item_color": "222 47% 11%",
  "menu_item_active_color": "223 47% 23%",
  "menu_item_hover_color": "210 40% 96%",
  "menu_icon_color": "215 16% 47%",
  "menu_text_color": "222 47% 11%"
}', true, true),

('Menu Escuro', 'Menu lateral escuro', 'menu', '{
  "menu_bg_color": "222 47% 11%",
  "menu_item_color": "210 40% 98%",
  "menu_item_active_color": "189 94% 43%",
  "menu_item_hover_color": "217 33% 17%",
  "menu_icon_color": "210 40% 80%",
  "menu_text_color": "210 40% 98%"
}', false, true),

-- Presets dos Cards
('Cards Padrão', 'Cards do dashboard padrão', 'cards', '{
  "card_bg_color": "0 0% 100%",
  "card_title_color": "222 47% 11%",
  "card_value_color": "222 47% 11%",
  "card_text_secondary_color": "215 16% 47%",
  "card_border_color": "214 32% 91%",
  "card_indicator_positive": "142 71% 45%",
  "card_indicator_warning": "25 95% 53%",
  "card_indicator_critical": "0 84% 60%"
}', true, true),

('Cards Escuro', 'Cards do dashboard escuro', 'cards', '{
  "card_bg_color": "222 47% 11%",
  "card_title_color": "210 40% 98%",
  "card_value_color": "210 40% 98%",
  "card_text_secondary_color": "215 20% 65%",
  "card_border_color": "217 33% 17%",
  "card_indicator_positive": "142 71% 45%",
  "card_indicator_warning": "25 95% 53%",
  "card_indicator_critical": "0 84% 60%"
}', false, true);