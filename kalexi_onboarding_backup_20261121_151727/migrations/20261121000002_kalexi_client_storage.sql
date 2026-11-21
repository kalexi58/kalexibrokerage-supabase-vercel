INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
(
  'kalexi-client-profiles',
  'kalexi-client-profiles',
  false,
  5242880,
  ARRAY['image/jpeg','image/png','image/webp']
),
(
  'kalexi-client-documents',
  'kalexi-client-documents',
  false,
  20971520,
  ARRAY[
    'image/jpeg','image/png','image/webp',
    'video/mp4','video/webm',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ]
)
ON CONFLICT (id) DO UPDATE SET
  public = false,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "Kalexi staff read client files" ON storage.objects;

CREATE POLICY "Kalexi staff read client files"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id IN ('kalexi-client-profiles','kalexi-client-documents')
  AND public.is_active_staff(auth.uid())
);

DROP POLICY IF EXISTS "Kalexi staff upload client files" ON storage.objects;

CREATE POLICY "Kalexi staff upload client files"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id IN ('kalexi-client-profiles','kalexi-client-documents')
  AND public.is_active_staff(auth.uid())
);
