-- Create blog_categories table
CREATE TABLE public.blog_categories (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  nome TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  descricao TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create blog_posts table
CREATE TABLE public.blog_posts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  titulo TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  resumo TEXT,
  conteudo_principal TEXT,
  imagem_capa TEXT,
  status TEXT NOT NULL DEFAULT 'rascunho' CHECK (status IN ('rascunho', 'publicado', 'arquivado')),
  data_publicacao TIMESTAMP WITH TIME ZONE,
  data_agendada TIMESTAMP WITH TIME ZONE,
  autor TEXT,
  categoria_id UUID REFERENCES public.blog_categories(id) ON DELETE SET NULL,
  tags TEXT[] DEFAULT '{}',
  -- SEO fields
  meta_title TEXT,
  meta_description TEXT,
  meta_keywords TEXT,
  canonical_url TEXT,
  -- Automation fields (prepared for future)
  origem TEXT DEFAULT 'manual' CHECK (origem IN ('manual', 'automatico')),
  modulo_vinculado TEXT,
  modulo_referencia_id TEXT,
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.blog_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.blog_posts ENABLE ROW LEVEL SECURITY;

-- Public read policies for published posts
CREATE POLICY "Published posts are publicly readable"
ON public.blog_posts
FOR SELECT
USING (status = 'publicado' AND (data_publicacao IS NULL OR data_publicacao <= now()));

-- Public read for categories
CREATE POLICY "Categories are publicly readable"
ON public.blog_categories
FOR SELECT
USING (true);

-- Authenticated users can manage posts
CREATE POLICY "Authenticated users can manage posts"
ON public.blog_posts
FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);

-- Authenticated users can manage categories
CREATE POLICY "Authenticated users can manage categories"
ON public.blog_categories
FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);

-- Function to generate slug from title
CREATE OR REPLACE FUNCTION public.generate_blog_slug(title TEXT)
RETURNS TEXT AS $$
DECLARE
  base_slug TEXT;
  final_slug TEXT;
  counter INTEGER := 0;
BEGIN
  -- Convert to lowercase, replace spaces with hyphens, remove special chars
  base_slug := lower(trim(title));
  base_slug := regexp_replace(base_slug, '[áàâãä]', 'a', 'gi');
  base_slug := regexp_replace(base_slug, '[éèêë]', 'e', 'gi');
  base_slug := regexp_replace(base_slug, '[íìîï]', 'i', 'gi');
  base_slug := regexp_replace(base_slug, '[óòôõö]', 'o', 'gi');
  base_slug := regexp_replace(base_slug, '[úùûü]', 'u', 'gi');
  base_slug := regexp_replace(base_slug, '[ç]', 'c', 'gi');
  base_slug := regexp_replace(base_slug, '[^a-z0-9\s-]', '', 'gi');
  base_slug := regexp_replace(base_slug, '\s+', '-', 'g');
  base_slug := regexp_replace(base_slug, '-+', '-', 'g');
  base_slug := trim(both '-' from base_slug);
  
  final_slug := base_slug;
  
  -- Check for uniqueness and add suffix if needed
  WHILE EXISTS (SELECT 1 FROM public.blog_posts WHERE slug = final_slug) LOOP
    counter := counter + 1;
    final_slug := base_slug || '-' || counter;
  END LOOP;
  
  RETURN final_slug;
END;
$$ LANGUAGE plpgsql;

-- Function to generate category slug
CREATE OR REPLACE FUNCTION public.generate_category_slug(name TEXT)
RETURNS TEXT AS $$
DECLARE
  base_slug TEXT;
  final_slug TEXT;
  counter INTEGER := 0;
BEGIN
  base_slug := lower(trim(name));
  base_slug := regexp_replace(base_slug, '[áàâãä]', 'a', 'gi');
  base_slug := regexp_replace(base_slug, '[éèêë]', 'e', 'gi');
  base_slug := regexp_replace(base_slug, '[íìîï]', 'i', 'gi');
  base_slug := regexp_replace(base_slug, '[óòôõö]', 'o', 'gi');
  base_slug := regexp_replace(base_slug, '[úùûü]', 'u', 'gi');
  base_slug := regexp_replace(base_slug, '[ç]', 'c', 'gi');
  base_slug := regexp_replace(base_slug, '[^a-z0-9\s-]', '', 'gi');
  base_slug := regexp_replace(base_slug, '\s+', '-', 'g');
  base_slug := regexp_replace(base_slug, '-+', '-', 'g');
  base_slug := trim(both '-' from base_slug);
  
  final_slug := base_slug;
  
  WHILE EXISTS (SELECT 1 FROM public.blog_categories WHERE slug = final_slug) LOOP
    counter := counter + 1;
    final_slug := base_slug || '-' || counter;
  END LOOP;
  
  RETURN final_slug;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-generate slug on insert (posts)
CREATE OR REPLACE FUNCTION public.blog_post_before_insert()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.slug IS NULL OR NEW.slug = '' THEN
    NEW.slug := public.generate_blog_slug(NEW.titulo);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER blog_post_auto_slug
BEFORE INSERT ON public.blog_posts
FOR EACH ROW
EXECUTE FUNCTION public.blog_post_before_insert();

-- Trigger to prevent slug change after publication
CREATE OR REPLACE FUNCTION public.blog_post_before_update()
RETURNS TRIGGER AS $$
BEGIN
  -- Prevent slug change if post was ever published
  IF OLD.status = 'publicado' AND NEW.slug != OLD.slug THEN
    RAISE EXCEPTION 'Cannot change slug after post has been published';
  END IF;
  
  -- Auto-set publication date when status changes to published
  IF NEW.status = 'publicado' AND OLD.status != 'publicado' AND NEW.data_publicacao IS NULL THEN
    NEW.data_publicacao := now();
  END IF;
  
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER blog_post_update_check
BEFORE UPDATE ON public.blog_posts
FOR EACH ROW
EXECUTE FUNCTION public.blog_post_before_update();

-- Trigger for category slug
CREATE OR REPLACE FUNCTION public.blog_category_before_insert()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.slug IS NULL OR NEW.slug = '' THEN
    NEW.slug := public.generate_category_slug(NEW.nome);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER blog_category_auto_slug
BEFORE INSERT ON public.blog_categories
FOR EACH ROW
EXECUTE FUNCTION public.blog_category_before_insert();

-- Update timestamp trigger for categories
CREATE TRIGGER update_blog_categories_updated_at
BEFORE UPDATE ON public.blog_categories
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Create indexes for performance
CREATE INDEX idx_blog_posts_status ON public.blog_posts(status);
CREATE INDEX idx_blog_posts_slug ON public.blog_posts(slug);
CREATE INDEX idx_blog_posts_categoria ON public.blog_posts(categoria_id);
CREATE INDEX idx_blog_posts_data_publicacao ON public.blog_posts(data_publicacao);
CREATE INDEX idx_blog_categories_slug ON public.blog_categories(slug);