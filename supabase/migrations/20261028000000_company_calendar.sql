CREATE TABLE IF NOT EXISTS public.calendar_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL CHECK (char_length(trim(title)) BETWEEN 1 AND 160),
  description text,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz,
  event_type text NOT NULL DEFAULT 'meeting'
    CHECK (event_type IN ('meeting', 'programme', 'deadline', 'training', 'announcement', 'other')),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT calendar_events_valid_time CHECK (ends_at IS NULL OR ends_at > starts_at)
);

CREATE INDEX IF NOT EXISTS calendar_events_starts_at_idx
  ON public.calendar_events (starts_at);

ALTER TABLE public.calendar_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can view company calendar events"
  ON public.calendar_events;
CREATE POLICY "Authenticated users can view company calendar events"
  ON public.calendar_events
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Management can create company calendar events"
  ON public.calendar_events;
CREATE POLICY "Management can create company calendar events"
  ON public.calendar_events
  FOR INSERT TO authenticated
  WITH CHECK (
    created_by = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1
      FROM public.user_roles ur
      WHERE ur.user_id = (SELECT auth.uid())
        AND ur.role::text IN ('super_admin', 'management')
    )
  );

DROP POLICY IF EXISTS "Management can update company calendar events"
  ON public.calendar_events;
CREATE POLICY "Management can update company calendar events"
  ON public.calendar_events
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.user_roles ur
      WHERE ur.user_id = (SELECT auth.uid())
        AND ur.role::text IN ('super_admin', 'management')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.user_roles ur
      WHERE ur.user_id = (SELECT auth.uid())
        AND ur.role::text IN ('super_admin', 'management')
    )
  );

DROP POLICY IF EXISTS "Management can delete company calendar events"
  ON public.calendar_events;
CREATE POLICY "Management can delete company calendar events"
  ON public.calendar_events
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.user_roles ur
      WHERE ur.user_id = (SELECT auth.uid())
        AND ur.role::text IN ('super_admin', 'management')
    )
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.calendar_events TO authenticated;