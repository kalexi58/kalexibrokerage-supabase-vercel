ALTER TABLE public.brand_templates
  ADD COLUMN IF NOT EXISTS file_path text,
  ADD COLUMN IF NOT EXISTS file_type text,
  ADD COLUMN IF NOT EXISTS departments text[] NOT NULL DEFAULT '{}';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'brand_templates_file_type_check'
      AND conrelid = 'public.brand_templates'::regclass
  ) THEN
    ALTER TABLE public.brand_templates
      ADD CONSTRAINT brand_templates_file_type_check
      CHECK (file_type IS NULL OR file_type IN ('docx', 'pdf'));
  END IF;
END;
$$;

DROP POLICY IF EXISTS brand_templates_staff_read ON public.brand_templates;
CREATE POLICY brand_templates_staff_read ON public.brand_templates
  FOR SELECT TO authenticated
  USING (
    public.is_active_staff(auth.uid())
    AND (
      created_by = auth.uid()
      OR
      cardinality(departments) = 0
      OR EXISTS (
        SELECT 1
        FROM public.profiles p
        WHERE p.id = auth.uid()
          AND p.department = ANY (brand_templates.departments)
      )
      OR public.has_role(auth.uid(), 'super_admin')
    )
  );

DROP POLICY IF EXISTS brand_templates_staff_write ON public.brand_templates;
DROP POLICY IF EXISTS brand_templates_staff_insert ON public.brand_templates;
DROP POLICY IF EXISTS brand_templates_staff_update ON public.brand_templates;
DROP POLICY IF EXISTS brand_templates_staff_delete ON public.brand_templates;
CREATE POLICY brand_templates_staff_insert ON public.brand_templates
  FOR INSERT TO authenticated
  WITH CHECK (public.is_active_staff(auth.uid()));
CREATE POLICY brand_templates_staff_update ON public.brand_templates
  FOR UPDATE TO authenticated
  USING (public.is_active_staff(auth.uid()))
  WITH CHECK (public.is_active_staff(auth.uid()));
CREATE POLICY brand_templates_staff_delete ON public.brand_templates
  FOR DELETE TO authenticated
  USING (public.is_active_staff(auth.uid()));

DROP POLICY IF EXISTS brand_template_file_upload ON storage.objects;
CREATE POLICY brand_template_file_upload ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'kalexi-vault'
    AND (storage.foldername(name))[1] = 'brand-templates'
    AND (storage.foldername(name))[2] = auth.uid()::text
    AND public.is_active_staff(auth.uid())
  );
