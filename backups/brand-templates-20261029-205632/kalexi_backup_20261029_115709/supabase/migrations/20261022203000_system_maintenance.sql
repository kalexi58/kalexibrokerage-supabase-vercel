CREATE TABLE IF NOT EXISTS public.system_maintenance (
  id text PRIMARY KEY CHECK (id = 'global'),
  maintenance_enabled boolean NOT NULL DEFAULT false,
  maintenance_message text,
  maintenance_start_time timestamptz,
  estimated_completion_time timestamptz,
  maintenance_updated_at timestamptz NOT NULL DEFAULT now(),
  maintenance_updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

INSERT INTO public.system_maintenance (id)
VALUES ('global')
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.system_maintenance ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.system_maintenance FROM anon, authenticated;
GRANT ALL ON TABLE public.system_maintenance TO service_role;

CREATE OR REPLACE FUNCTION public.maintenance_access_allowed()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    NOT COALESCE(
      (SELECT maintenance_enabled
       FROM public.system_maintenance
       WHERE id = 'global'),
      true
    )
    OR EXISTS (
      SELECT 1
      FROM public.user_roles
      WHERE user_id = auth.uid()
        AND role = 'super_admin'::public.app_role
    );
$$;

REVOKE ALL ON FUNCTION public.maintenance_access_allowed() FROM public;
GRANT EXECUTE ON FUNCTION public.maintenance_access_allowed() TO anon, authenticated;

DO $$
DECLARE
  target record;
BEGIN
  FOR target IN
    SELECT n.nspname, c.relname
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind IN ('r', 'p')
      AND c.relrowsecurity
      AND c.relname <> 'system_maintenance'
  LOOP
    IF NOT EXISTS (
      SELECT 1
      FROM pg_policies
      WHERE schemaname = target.nspname
        AND tablename = target.relname
        AND policyname = 'maintenance_access_gate'
    ) THEN
      EXECUTE format(
        'CREATE POLICY maintenance_access_gate ON %I.%I AS RESTRICTIVE FOR ALL TO anon, authenticated USING (public.maintenance_access_allowed()) WITH CHECK (public.maintenance_access_allowed())',
        target.nspname,
        target.relname
      );
    END IF;
  END LOOP;
END $$;

DO $$
BEGIN
  IF to_regclass('storage.objects') IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'storage'
        AND tablename = 'objects'
        AND policyname = 'maintenance_access_gate'
    )
  THEN
    EXECUTE
      'CREATE POLICY maintenance_access_gate ON storage.objects AS RESTRICTIVE FOR ALL TO anon, authenticated USING (public.maintenance_access_allowed()) WITH CHECK (public.maintenance_access_allowed())';
  END IF;
END $$;