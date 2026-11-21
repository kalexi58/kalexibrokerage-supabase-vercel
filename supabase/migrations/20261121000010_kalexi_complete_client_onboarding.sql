BEGIN;

CREATE TABLE IF NOT EXISTS public.client_registration_attachments (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    client_ref text NOT NULL REFERENCES public.clients(client_ref),
    file_name text NOT NULL,
    file_path text NOT NULL,
    file_type text NOT NULL,
    file_category text NOT NULL,
    uploaded_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS
idx_client_registration_attachments_ref
ON public.client_registration_attachments(client_ref);

ALTER TABLE public.client_registration_attachments
ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Kalexi staff view client attachments"
ON public.client_registration_attachments;

CREATE POLICY "Kalexi staff view client attachments"
ON public.client_registration_attachments
FOR SELECT TO authenticated
USING (public.is_active_staff(auth.uid()));

DROP POLICY IF EXISTS "Kalexi staff insert client attachments"
ON public.client_registration_attachments;

CREATE POLICY "Kalexi staff insert client attachments"
ON public.client_registration_attachments
FOR INSERT TO authenticated
WITH CHECK (public.is_active_staff(auth.uid()));

INSERT INTO storage.buckets
(id, name, public, file_size_limit, allowed_mime_types)
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

DROP POLICY IF EXISTS "Kalexi staff read client storage"
ON storage.objects;

CREATE POLICY "Kalexi staff read client storage"
ON storage.objects FOR SELECT TO authenticated
USING (
 bucket_id IN ('kalexi-client-profiles','kalexi-client-documents')
 AND public.is_active_staff(auth.uid())
);

DROP POLICY IF EXISTS "Kalexi staff upload client storage"
ON storage.objects;

CREATE POLICY "Kalexi staff upload client storage"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
 bucket_id IN ('kalexi-client-profiles','kalexi-client-documents')
 AND public.is_active_staff(auth.uid())
);

COMMIT;

NOTIFY pgrst, 'reload schema';
