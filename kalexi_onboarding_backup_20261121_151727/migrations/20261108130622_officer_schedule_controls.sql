CREATE TABLE IF NOT EXISTS public.officer_lunch_breaks (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    officer_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    day_of_week smallint NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
    start_time time NOT NULL,
    end_time time NOT NULL,
    is_active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    CHECK (end_time > start_time),
    UNIQUE (officer_id, day_of_week)
);

CREATE TABLE IF NOT EXISTS public.officer_presence (
    officer_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
    is_in_office boolean NOT NULL DEFAULT false,
    updated_at timestamptz NOT NULL DEFAULT now(),
    updated_by uuid REFERENCES auth.users(id)
);

ALTER TABLE public.officer_lunch_breaks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.officer_presence ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS officer_lunch_read ON public.officer_lunch_breaks;
CREATE POLICY officer_lunch_read ON public.officer_lunch_breaks
FOR SELECT TO authenticated
USING (public.is_active_staff(auth.uid()));

DROP POLICY IF EXISTS officer_lunch_manage ON public.officer_lunch_breaks;
CREATE POLICY officer_lunch_manage ON public.officer_lunch_breaks
FOR ALL TO authenticated
USING (
    officer_id = auth.uid()
    OR public.has_role(auth.uid(), 'management'::app_role)
    OR public.has_role(auth.uid(), 'super_admin'::app_role)
)
WITH CHECK (
    officer_id = auth.uid()
    OR public.has_role(auth.uid(), 'management'::app_role)
    OR public.has_role(auth.uid(), 'super_admin'::app_role)
);

DROP POLICY IF EXISTS officer_presence_read ON public.officer_presence;
CREATE POLICY officer_presence_read ON public.officer_presence
FOR SELECT TO authenticated
USING (public.is_active_staff(auth.uid()));

DROP POLICY IF EXISTS officer_presence_manage ON public.officer_presence;
CREATE POLICY officer_presence_manage ON public.officer_presence
FOR ALL TO authenticated
USING (
    officer_id = auth.uid()
    OR public.has_role(auth.uid(), 'management'::app_role)
    OR public.has_role(auth.uid(), 'super_admin'::app_role)
)
WITH CHECK (
    officer_id = auth.uid()
    OR public.has_role(auth.uid(), 'management'::app_role)
    OR public.has_role(auth.uid(), 'super_admin'::app_role)
);

CREATE INDEX IF NOT EXISTS idx_officer_lunch_schedule
ON public.officer_lunch_breaks(officer_id, day_of_week);

GRANT SELECT, INSERT, UPDATE, DELETE
ON public.officer_lunch_breaks, public.officer_presence
TO authenticated;

-- Replace the availability function without changing its parameter names.
CREATE OR REPLACE FUNCTION public.get_officer_available_slots(
    p_officer_id uuid,
    p_date date
)
RETURNS TABLE (
    slot_start timestamptz,
    slot_end timestamptz
)
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $function$
WITH candidates AS (
    SELECT
        gs.slot_start,
        gs.slot_start + make_interval(mins => r.slot_duration_minutes) AS slot_end
    FROM public.officer_availability_rules r
    CROSS JOIN LATERAL generate_series(
        (p_date + r.start_time) AT TIME ZONE 'Africa/Kampala',
        (p_date + r.end_time) AT TIME ZONE 'Africa/Kampala'
            - make_interval(mins => r.slot_duration_minutes),
        make_interval(mins => r.slot_duration_minutes)
    ) AS gs(slot_start)
    WHERE r.officer_id = p_officer_id
      AND r.is_active = true
      AND r.day_of_week = EXTRACT(DOW FROM p_date)::smallint

    UNION

    SELECT
        gs.slot_start,
        gs.slot_start + interval '30 minutes'
    FROM public.officer_availability_exceptions e
    CROSS JOIN LATERAL generate_series(
        e.starts_at,
        e.ends_at - interval '30 minutes',
        interval '30 minutes'
    ) gs(slot_start)
    WHERE e.officer_id = p_officer_id
      AND e.exception_type = 'available'
      AND e.starts_at < ((p_date + TIME '23:59:59') AT TIME ZONE 'Africa/Kampala')
      AND e.ends_at > (p_date::timestamp AT TIME ZONE 'Africa/Kampala')
),
valid_slots AS (
    SELECT DISTINCT c.slot_start, c.slot_end
    FROM candidates c
    WHERE c.slot_end > c.slot_start
      AND c.slot_start >= now()

      AND NOT EXISTS (
          SELECT 1
          FROM public.officer_availability_exceptions e
          WHERE e.officer_id = p_officer_id
            AND e.exception_type = 'unavailable'
            AND tstzrange(e.starts_at, e.ends_at, '[)')
                && tstzrange(c.slot_start, c.slot_end, '[)')
      )

      AND NOT EXISTS (
          SELECT 1
          FROM public.officer_lunch_breaks l
          WHERE l.officer_id = p_officer_id
            AND l.is_active
            AND l.day_of_week = EXTRACT(DOW FROM p_date)::smallint
            AND (c.slot_start AT TIME ZONE 'Africa/Kampala')::time < l.end_time
            AND (c.slot_end AT TIME ZONE 'Africa/Kampala')::time > l.start_time
      )

      AND NOT EXISTS (
          SELECT 1
          FROM public.officer_appointments a
          WHERE a.officer_id = p_officer_id
            AND a.status IN ('pending', 'confirmed')
            AND tstzrange(a.starts_at, a.ends_at, '[)')
                && tstzrange(c.slot_start, c.slot_end, '[)')
      )

      AND NOT EXISTS (
          SELECT 1
          FROM public.officer_programmes p
          WHERE p.officer_id = p_officer_id
            AND p.status = 'scheduled'
            AND tstzrange(p.starts_at, p.ends_at, '[)')
                && tstzrange(c.slot_start, c.slot_end, '[)')
      )
)
SELECT slot_start, slot_end
FROM valid_slots
ORDER BY slot_start;
$function$;
