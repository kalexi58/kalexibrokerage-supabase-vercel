DO $$
DECLARE p record;
BEGIN
  FOR p IN
    SELECT pol.policyname, pol.tablename, pol.qual, pol.with_check
    FROM pg_policies pol
    JOIN information_schema.columns c
      ON c.table_schema = 'public' AND c.table_name = pol.tablename AND c.column_name = 'created_by'
    WHERE pol.schemaname = 'public'
      AND pol.cmd = 'UPDATE'
      AND pol.policyname LIKE '%\_edit'
  LOOP
    EXECUTE format('DROP POLICY %I ON public.%I', p.policyname, p.tablename);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated USING ((%s) OR created_by = auth.uid()) WITH CHECK ((%s) OR created_by = auth.uid())',
      p.policyname, p.tablename, p.qual, coalesce(p.with_check, p.qual));
  END LOOP;
END $$;

DROP POLICY IF EXISTS "Authorised staff can update clients" ON public.clients;
CREATE POLICY "Authorised staff can update clients"
ON public.clients FOR UPDATE TO authenticated
USING (
  is_active_staff(auth.uid())
  AND (
    registered_by = auth.uid()
    OR has_role(auth.uid(), 'super_admin'::app_role)
    OR NOT has_role(auth.uid(), 'receptionist'::app_role)
  )
)
WITH CHECK (is_active_staff(auth.uid()));