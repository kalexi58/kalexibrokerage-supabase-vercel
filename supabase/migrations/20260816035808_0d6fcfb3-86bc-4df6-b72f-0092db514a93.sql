CREATE POLICY "Avatar read for staff"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'kalexi-avatars' AND is_active_staff(auth.uid()));

CREATE POLICY "Avatar upload for admin or owner"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'kalexi-avatars'
  AND (has_role(auth.uid(), 'super_admin'::app_role) OR (storage.foldername(name))[1] = auth.uid()::text)
);

CREATE POLICY "Avatar update for admin or owner"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'kalexi-avatars'
  AND (has_role(auth.uid(), 'super_admin'::app_role) OR (storage.foldername(name))[1] = auth.uid()::text)
)
WITH CHECK (
  bucket_id = 'kalexi-avatars'
  AND (has_role(auth.uid(), 'super_admin'::app_role) OR (storage.foldername(name))[1] = auth.uid()::text)
);

CREATE POLICY "Avatar delete for admin or owner"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'kalexi-avatars'
  AND (has_role(auth.uid(), 'super_admin'::app_role) OR (storage.foldername(name))[1] = auth.uid()::text)
);