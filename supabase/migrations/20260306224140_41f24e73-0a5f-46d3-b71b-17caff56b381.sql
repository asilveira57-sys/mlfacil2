
-- Storage bucket for retrospective reports (PDF, HTML, Slides)
INSERT INTO storage.buckets (id, name, public)
VALUES ('retrospective-reports', 'retrospective-reports', true)
ON CONFLICT (id) DO NOTHING;

-- RLS: authenticated users can read their own reports
CREATE POLICY "Users can read own retrospective reports"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'retrospective-reports'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- RLS: service role can insert (edge functions use service role)
CREATE POLICY "Service can insert retrospective reports"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'retrospective-reports'
);

-- RLS: users can delete their own reports
CREATE POLICY "Users can delete own retrospective reports"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'retrospective-reports'
  AND (storage.foldername(name))[1] = auth.uid()::text
);
