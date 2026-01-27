-- Create tags table
CREATE TABLE public.module_tags (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  color TEXT NOT NULL DEFAULT '#6366f1',
  style TEXT NOT NULL DEFAULT 'badge' CHECK (style IN ('badge', 'selo')),
  priority INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create modules registry table
CREATE TABLE public.system_modules (
  id TEXT NOT NULL PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  icon_name TEXT,
  route TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create module-tag association table
CREATE TABLE public.module_tag_assignments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  module_id TEXT NOT NULL REFERENCES public.system_modules(id) ON DELETE CASCADE,
  tag_id UUID NOT NULL REFERENCES public.module_tags(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(module_id, tag_id)
);

-- Enable RLS
ALTER TABLE public.module_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_modules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.module_tag_assignments ENABLE ROW LEVEL SECURITY;

-- Tags: Everyone can read, only admins can modify
CREATE POLICY "Anyone can view active tags" ON public.module_tags
  FOR SELECT USING (is_active = true);

CREATE POLICY "Admins can manage tags" ON public.module_tags
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin')
  );

-- Modules: Everyone can read
CREATE POLICY "Anyone can view modules" ON public.system_modules
  FOR SELECT USING (true);

CREATE POLICY "Admins can manage modules" ON public.system_modules
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin')
  );

-- Assignments: Everyone can read, only admins can modify
CREATE POLICY "Anyone can view tag assignments" ON public.module_tag_assignments
  FOR SELECT USING (true);

CREATE POLICY "Admins can manage tag assignments" ON public.module_tag_assignments
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin')
  );

-- Insert default tags
INSERT INTO public.module_tags (name, color, style, priority) VALUES
  ('Novo', '#22c55e', 'badge', 1),
  ('Beta', '#f59e0b', 'badge', 2),
  ('Em breve', '#6366f1', 'selo', 3);

-- Insert system modules
INSERT INTO public.system_modules (id, name, description, icon_name, route) VALUES
  ('dashboard', 'Dashboard', 'Visão geral do sistema', 'LayoutDashboard', '/dashboard'),
  ('etiquetas', 'Etiquetas ZPL', 'Geração de etiquetas de envio', 'Printer', '/etiquetas'),
  ('custos', 'Custos', 'Análise de custos e margens', 'Calculator', '/custos'),
  ('abc', 'Análise ABC', 'Classificação ABC de produtos', 'BarChart3', '/abc'),
  ('tendencias', 'Tendências', 'Análise de mercado', 'TrendingUp', '/tendencias'),
  ('mercado', 'Mercado', 'Explorador de mercado', 'Store', '/mercado'),
  ('radiografia', 'Radiografia', 'Diagnóstico de anúncios', 'Activity', '/radiografia'),
  ('publicidade', 'Publicidade', 'Gestão de ads', 'Megaphone', '/publicidade'),
  ('promocoes', 'Promoções', 'Gestão de promoções', 'Percent', '/promocoes'),
  ('perguntas', 'Perguntas', 'Central de Q&A', 'MessageSquare', '/perguntas'),
  ('pos-venda', 'Pós-Venda', 'Mensagens pós-venda', 'MessageCircle', '/pos-venda'),
  ('tarefas', 'Tarefas', 'Gestão de tarefas', 'CheckSquare', '/tarefas'),
  ('concorrencia', 'Concorrência', 'Monitoramento de concorrentes', 'Users', '/concorrencia');

-- Add trigger for updated_at
CREATE TRIGGER update_module_tags_updated_at
  BEFORE UPDATE ON public.module_tags
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_system_modules_updated_at
  BEFORE UPDATE ON public.system_modules
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();