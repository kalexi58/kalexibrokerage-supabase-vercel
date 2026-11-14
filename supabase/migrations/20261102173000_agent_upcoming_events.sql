ALTER TABLE public.calendar_events
  ADD COLUMN IF NOT EXISTS location text,
  ADD COLUMN IF NOT EXISTS requirements text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'calendar_events_location_length'
      AND conrelid = 'public.calendar_events'::regclass
  ) THEN
    ALTER TABLE public.calendar_events
      ADD CONSTRAINT calendar_events_location_length
      CHECK (location IS NULL OR char_length(location) <= 300);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'calendar_events_requirements_length'
      AND conrelid = 'public.calendar_events'::regclass
  ) THEN
    ALTER TABLE public.calendar_events
      ADD CONSTRAINT calendar_events_requirements_length
      CHECK (requirements IS NULL OR char_length(requirements) <= 4000);
  END IF;
END;
$$;

DROP POLICY IF EXISTS "Authenticated users can view company calendar events"
  ON public.calendar_events;
DROP POLICY IF EXISTS "Staff with client permission can view company calendar events"
  ON public.calendar_events;
CREATE POLICY "Staff with client permission can view company calendar events"
  ON public.calendar_events
  FOR SELECT TO authenticated
  USING (
    public.has_permission((SELECT auth.uid()), 'clients.view')
    AND NOT EXISTS (
      SELECT 1
      FROM public.agents a
      WHERE a.user_id = (SELECT auth.uid())
    )
    AND NOT EXISTS (
      SELECT 1
      FROM public.agent_applications a
      WHERE a.user_id = (SELECT auth.uid())
    )
  );
