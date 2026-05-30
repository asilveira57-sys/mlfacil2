
-- Blog Pro: novas colunas
ALTER TABLE public.blog_posts
  ADD COLUMN IF NOT EXISTS imagem_capa_alt text,
  ADD COLUMN IF NOT EXISTS tempo_leitura_min integer,
  ADD COLUMN IF NOT EXISTS seo_score integer;

-- Storage bucket público para mídia do blog
INSERT INTO storage.buckets (id, name, public)
VALUES ('blog-media', 'blog-media', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- Policies
DROP POLICY IF EXISTS "blog-media public read" ON storage.objects;
CREATE POLICY "blog-media public read"
ON storage.objects FOR SELECT
USING (bucket_id = 'blog-media');

DROP POLICY IF EXISTS "blog-media authenticated insert" ON storage.objects;
CREATE POLICY "blog-media authenticated insert"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'blog-media');

DROP POLICY IF EXISTS "blog-media authenticated update" ON storage.objects;
CREATE POLICY "blog-media authenticated update"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'blog-media');

DROP POLICY IF EXISTS "blog-media authenticated delete" ON storage.objects;
CREATE POLICY "blog-media authenticated delete"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'blog-media');
