-- KALEXI CLIENT ONBOARDING EXTENSION
BEGIN;

CREATE TABLE IF NOT EXISTS public.client_registration_attachments (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    client_ref text NOT NULL REFERENCES public.clients(client_ref),
    file_name text NOT NULL,
    file_path text NOT NULL,
    file_type text NOT NULL,
    file_category text NOT NULL DEFAULT 'supporting_document',
    uploaded_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_client_registration_attachments_ref
ON public.client_registration_attachments(client_ref);

ALTER TABLE public.client_registration_attachments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Staff view client attachments"
ON public.client_registration_attachments;

CREATE POLICY "Staff view client attachments"
ON public.client_registration_attachments
FOR SELECT TO authenticated
USING (public.is_active_staff(auth.uid()));

DROP POLICY IF EXISTS "Staff insert client attachments"
ON public.client_registration_attachments;

CREATE POLICY "Staff insert client attachments"
ON public.client_registration_attachments
FOR INSERT TO authenticated
WITH CHECK (public.is_active_staff(auth.uid()));

-- Profile photo path already exists in clients.
-- Existing client_ref sequence remains unchanged.

COMMIT;

NOTIFY pgrst, 'reload schema';
