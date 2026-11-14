CREATE POLICY "Vault read for document viewers" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'kalexi-vault' AND public.has_permission(auth.uid(), 'documents.view'));
CREATE POLICY "Vault upload for document creators" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'kalexi-vault' AND public.has_permission(auth.uid(), 'documents.create'));
CREATE POLICY "Vault update for document editors" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'kalexi-vault' AND public.has_permission(auth.uid(), 'documents.edit'))
  WITH CHECK (bucket_id = 'kalexi-vault' AND public.has_permission(auth.uid(), 'documents.edit'));
CREATE POLICY "Vault delete for super admin" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'kalexi-vault' AND public.has_role(auth.uid(), 'super_admin'::app_role));