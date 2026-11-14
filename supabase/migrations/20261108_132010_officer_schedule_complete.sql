BEGIN;

-- Officer presence and lunch configuration.
CREATE TABLE IF NOT EXISTS public.officer_schedule_settings (
    officer_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
    lunch_start time,
    lunch_end time,
    presence_status text NOT NULL DEFAULT 'out_of_office'
        CHECK (presence_status IN ('in_office','out_of_office')),
    presence_updated_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT valid_lunch_time CHECK (
        (lunch_start IS NULL AND lunch_end IS NULL)
        OR (lunch_start IS NOT NULL AND lunch_end IS NOT NULL AND lunch_end > lunch_start)
    )
);

-- Leave records.
CREATE TABLE IF NOT EXISTS public.officer_leave (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    officer_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    leave_type text NOT NULL CHECK (
        leave_type IN ('annual','sick','personal','maternity','paternity','other')
    ),
    starts_at timestamptz NOT NULL,
    ends_at timestamptz NOT NULL,
    reason text,
    status text NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending','approved','rejected','cancelled')),
    created_by uuid REFERENCES auth.users(id),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT valid_leave_time CHECK (ends_at > starts_at)
);

CREATE INDEX IF NOT EXISTS idx_officer_leave_officer_dates
ON public.officer_leave(officer_id, starts_at, ends_at);

CREATE INDEX IF NOT EXISTS idx_officer_leave_approved
ON public.officer_leave(officer_id, status);

-- Enable RLS.
ALTER TABLE public.officer_schedule_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.officer_leave ENABLE ROW LEVEL SECURITY;

-- Officers manage their own settings; management can manage all.
DROP POLICY IF EXISTS officer_schedule_settings_access
ON public.officer_schedule_settings;

CREATE POLICY officer_schedule_settings_access
ON public.officer_schedule_settings
FOR ALL TO authenticated
USING (
    public.is_active_staff(auth.uid())
    AND (
        officer_id = auth.uid()
        OR public.has_role(auth.uid(),'management'::public.app_role)
        OR public.has_role(auth.uid(),'super_admin'::public.app_role)
    )
)
WITH CHECK (
    public.is_active_staff(auth.uid())
    AND (
        officer_id = auth.uid()
        OR public.has_role(auth.uid(),'management'::public.app_role)
        OR public.has_role(auth.uid(),'super_admin'::public.app_role)
    )
);

DROP POLICY IF EXISTS officer_leave_access
ON public.officer_leave;

CREATE POLICY officer_leave_access
ON public.officer_leave
FOR ALL TO authenticated
USING (
    public.is_active_staff(auth.uid())
    AND (
        officer_id = auth.uid()
        OR public.has_role(auth.uid(),'management'::public.app_role)
        OR public.has_role(auth.uid(),'super_admin'::public.app_role)
        OR public.has_role(auth.uid(),'receptionist'::public.app_role)
    )
)
WITH CHECK (
    public.is_active_staff(auth.uid())
    AND (
        officer_id = auth.uid()
        OR public.has_role(auth.uid(),'management'::public.app_role)
        OR public.has_role(auth.uid(),'super_admin'::public.app_role)
    )
);

-- Employees can read presence and management can read all.
DROP POLICY IF EXISTS officer_schedule_presence_read
ON public.officer_schedule_settings;

CREATE POLICY officer_schedule_presence_read
ON public.officer_schedule_settings
FOR SELECT TO authenticated
USING (public.is_active_staff(auth.uid()));

-- Approved leave is authoritative for booking availability.
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
SECURITY INVOKER
SET search_path = public
AS $function$
WITH settings AS (
    SELECT lunch_start, lunch_end
    FROM public.officer_schedule_settings
    WHERE officer_id = p_officer_id
),
candidates AS (
    SELECT
        gs.slot_start,
        gs.slot_start + make_interval(mins => r.slot_duration_minutes) AS slot_end
    FROM public.officer_availability_rules r
    CROSS JOIN LATERAL generate_series(
        (p_date + r.start_time) AT TIME ZONE 'Africa/Kampala',
        (
            (p_date + r.end_time) AT TIME ZONE 'Africa/Kampala'
            - make_interval(mins => r.slot_duration_minutes)
        ),
        make_interval(mins => r.slot_duration_minutes)
    ) gs(slot_start)
    WHERE r.officer_id = p_officer_id
      AND r.is_active = true
      AND r.day_of_week = EXTRACT(DOW FROM p_date)::smallint
),
valid_slots AS (
    SELECT c.slot_start, c.slot_end
    FROM candidates c
    WHERE c.slot_start >= now()

      AND NOT EXISTS (
          SELECT 1 FROM public.officer_appointments a
          WHERE a.officer_id = p_officer_id
            AND a.status IN ('pending','confirmed')
            AND tstzrange(a.starts_at,a.ends_at,'[)')
                && tstzrange(c.slot_start,c.slot_end,'[)')
      )

      AND NOT EXISTS (
          SELECT 1 FROM public.officer_programmes p
          WHERE p.officer_id = p_officer_id
            AND p.status = 'scheduled'
            AND tstzrange(p.starts_at,p.ends_at,'[)')
                && tstzrange(c.slot_start,c.slot_end,'[)')
      )

      AND NOT EXISTS (
          SELECT 1 FROM public.officer_availability_exceptions e
          WHERE e.officer_id = p_officer_id
            AND e.exception_type = 'unavailable'
            AND tstzrange(e.starts_at,e.ends_at,'[)')
                && tstzrange(c.slot_start,c.slot_end,'[)')
      )

      AND NOT EXISTS (
          SELECT 1 FROM public.officer_leave l
          WHERE l.officer_id = p_officer_id
            AND l.status = 'approved'
            AND tstzrange(l.starts_at,l.ends_at,'[)')
                && tstzrange(c.slot_start,c.slot_end,'[)')
      )

      AND NOT EXISTS (
          SELECT 1
          FROM settings s
          WHERE s.lunch_start IS NOT NULL
            AND tstzrange(c.slot_start,c.slot_end,'[)')
                && tstzrange(
                    (p_date + s.lunch_start) AT TIME ZONE 'Africa/Kampala',
                    (p_date + s.lunch_end) AT TIME ZONE 'Africa/Kampala',
                    '[)'
                )
      )
)
SELECT slot_start, slot_end
FROM valid_slots
ORDER BY slot_start;
$function$;

GRANT EXECUTE ON FUNCTION
public.get_officer_available_slots(uuid,date)
TO authenticated;

COMMIT;
