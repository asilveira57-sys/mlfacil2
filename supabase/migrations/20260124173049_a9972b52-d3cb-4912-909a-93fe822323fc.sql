-- =============================================
-- SITE CONTENT - EDITABLE INSTITUTIONAL TEXTS
-- =============================================

-- 1. Create site_content table
CREATE TABLE public.site_content (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    chave TEXT NOT NULL UNIQUE,
    texto TEXT NOT NULL DEFAULT '',
    pagina TEXT NOT NULL,
    secao TEXT,
    tipo TEXT NOT NULL DEFAULT 'text', -- text, html, json
    descricao TEXT,
    status TEXT NOT NULL DEFAULT 'ativo' CHECK (status IN ('ativo', 'inativo')),
    ordem INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

-- 2. Enable RLS
ALTER TABLE public.site_content ENABLE ROW LEVEL SECURITY;

-- 3. RLS Policies
-- Anyone can read active content (public)
CREATE POLICY "Anyone can read active content"
ON public.site_content
FOR SELECT
USING (status = 'ativo');

-- Admins can read all content (including inactive)
CREATE POLICY "Admins can read all content"
ON public.site_content
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- Admins can insert content
CREATE POLICY "Admins can create content"
ON public.site_content
FOR INSERT
TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Admins can update content
CREATE POLICY "Admins can update content"
ON public.site_content
FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Admins can delete content
CREATE POLICY "Admins can delete content"
ON public.site_content
FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- 4. Update timestamp trigger
CREATE TRIGGER update_site_content_updated_at
BEFORE UPDATE ON public.site_content
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- 5. Create index for faster lookups
CREATE INDEX idx_site_content_chave ON public.site_content (chave);
CREATE INDEX idx_site_content_pagina ON public.site_content (pagina);
CREATE INDEX idx_site_content_status ON public.site_content (status);