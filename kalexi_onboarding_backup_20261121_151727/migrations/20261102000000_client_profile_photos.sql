ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS photo_path text;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'client-photos',
  'client-photos',
  false,
  5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE
SET public = false,
    file_size_limit = 5242880,
    allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp'];

DROP POLICY IF EXISTS client_photos_staff_read ON storage.objects;
CREATE POLICY client_photos_staff_read
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'client-photos'
    AND public.has_permission(auth.uid(), 'clients.view')
  );

DROP POLICY IF EXISTS client_photos_staff_upload ON storage.objects;
CREATE POLICY client_photos_staff_upload
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'client-photos'
    AND (storage.foldername(name))[1] = auth.uid()::text
    AND (
      public.has_permission(auth.uid(), 'clients.create')
      OR public.has_permission(auth.uid(), 'clients.edit')
    )
  );

DROP POLICY IF EXISTS client_photos_staff_update ON storage.objects;
CREATE POLICY client_photos_staff_update
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'client-photos'
    AND (storage.foldername(name))[1] = auth.uid()::text
    AND public.has_permission(auth.uid(), 'clients.edit')
  )
  WITH CHECK (
    bucket_id = 'client-photos'
    AND (storage.foldername(name))[1] = auth.uid()::text
    AND public.has_permission(auth.uid(), 'clients.edit')
  );

DROP POLICY IF EXISTS client_photos_staff_delete ON storage.objects;
CREATE POLICY client_photos_staff_delete
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'client-photos'
    AND (
      public.has_permission(auth.uid(), 'clients.edit')
      OR (
        (storage.foldername(name))[1] = auth.uid()::text
        AND public.has_permission(auth.uid(), 'clients.create')
      )
    )
  );
