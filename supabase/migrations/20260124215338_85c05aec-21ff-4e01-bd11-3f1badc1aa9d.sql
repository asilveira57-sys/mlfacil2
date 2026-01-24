-- Create storage bucket for public assets (site content images, logos, etc.)
INSERT INTO storage.buckets (id, name, public)
VALUES ('public-assets', 'public-assets', true)
ON CONFLICT (id) DO NOTHING;

-- Allow anyone to view public assets
CREATE POLICY "Public assets are publicly accessible"
ON storage.objects FOR SELECT
USING (bucket_id = 'public-assets');

-- Allow authenticated admins to upload public assets
CREATE POLICY "Admins can upload public assets"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'public-assets' 
  AND EXISTS (
    SELECT 1 FROM public.user_roles 
    WHERE user_id = auth.uid() 
    AND role = 'admin'
  )
);

-- Allow authenticated admins to update public assets
CREATE POLICY "Admins can update public assets"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'public-assets' 
  AND EXISTS (
    SELECT 1 FROM public.user_roles 
    WHERE user_id = auth.uid() 
    AND role = 'admin'
  )
);

-- Allow authenticated admins to delete public assets
CREATE POLICY "Admins can delete public assets"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'public-assets' 
  AND EXISTS (
    SELECT 1 FROM public.user_roles 
    WHERE user_id = auth.uid() 
    AND role = 'admin'
  )
);