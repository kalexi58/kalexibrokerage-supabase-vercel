-- Kalexi Reception: officer programmes and appointment scheduling.
-- Overlap prevention is enforced in PostgreSQL, not only in the browser.
CREATE TABLE IF NOT EXISTS public.officer_programmes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  officer_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  title text NOT NULL CHECK (char_length(trim(title)) BETWEEN 2 AND 180),
  programme_type text NOT NULL DEFAULT 'programme',
  details text,
  location text,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled','cancelled','completed')),
  created_by uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT officer_programmes_valid_time CHECK (ends_at > starts_at)
);

CREATE TABLE IF NOT EXISTS public.officer_appointments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_ref text NOT NULL UNIQUE DEFAULT ('KAL-APT-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12))),
  officer_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  customer_name text NOT NULL CHECK (char_length(trim(customer_name)) BETWEEN 2 AND 160),
  customer_phone text NOT NULL,
  customer_email text,
  request_type text NOT NULL DEFAULT 'appointment' CHECK (request_type IN ('booking','meeting','appointment','consultation','website')),
  title text NOT NULL CHECK (char_length(trim(title)) BETWEEN 2 AND 180),
  description text,
  meeting_method text NOT NULL DEFAULT 'in_person' CHECK (meeting_method IN ('in_person','telephone','online')),
  location text,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','confirmed','completed','cancelled','rejected','missed')),
  source text NOT NULL DEFAULT 'internal' CHECK (source IN ('internal','website')),
  external_record_id text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT officer_appointments_valid_time CHECK (ends_at > starts_at),
  CONSTRAINT officer_appointments_external_unique UNIQUE (source, external_record_id)
);

CREATE INDEX IF NOT EXISTS officer_programmes_officer_time_idx ON public.officer_programmes (officer_id, starts_at, ends_at);
CREATE INDEX IF NOT EXISTS officer_appointments_officer_time_idx ON public.officer_appointments (officer_id, starts_at, ends_at);
CREATE INDEX IF NOT EXISTS officer_appointments_status_time_idx ON public.officer_appointments (status, starts_at);

CREATE OR REPLACE FUNCTION public.prevent_officer_schedule_overlap()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  conflict_found boolean := false;
BEGIN
  -- Serialize concurrent schedule writes for the same officer.
  PERFORM pg_advisory_xact_lock(hashtextextended(NEW.officer_id::text, 0));

  IF TG_TABLE_NAME = 'officer_appointments' THEN
    IF NEW.status IN ('pending','confirmed') THEN
      SELECT EXISTS (
        SELECT 1 FROM public.officer_appointments a
        WHERE a.officer_id = NEW.officer_id
          AND a.id <> NEW.id
          AND a.status IN ('pending','confirmed')
          AND tstzrange(a.starts_at, a.ends_at, '[)') && tstzrange(NEW.starts_at, NEW.ends_at, '[)')
      ) OR EXISTS (
        SELECT 1 FROM public.officer_programmes p
        WHERE p.officer_id = NEW.officer_id
          AND p.status = 'scheduled'
          AND tstzrange(p.starts_at, p.ends_at, '[)') && tstzrange(NEW.starts_at, NEW.ends_at, '[)')
      ) INTO conflict_found;
    END IF;
  ELSE
    IF NEW.status = 'scheduled' THEN
      SELECT EXISTS (
        SELECT 1 FROM public.officer_programmes p
        WHERE p.officer_id = NEW.officer_id
          AND p.id <> NEW.id
          AND p.status = 'scheduled'
          AND tstzrange(p.starts_at, p.ends_at, '[)') && tstzrange(NEW.starts_at, NEW.ends_at, '[)')
      ) OR EXISTS (
        SELECT 1 FROM public.officer_appointments a
        WHERE a.officer_id = NEW.officer_id
          AND a.status IN ('pending','confirmed')
          AND tstzrange(a.starts_at, a.ends_at, '[)') && tstzrange(NEW.starts_at, NEW.ends_at, '[)')
      ) INTO conflict_found;
    END IF;
  END IF;

  IF conflict_found THEN
    RAISE EXCEPTION 'OFFICER_TIME_CONFLICT: This officer already has a booking or programme during the selected time.'
      USING ERRCODE = '23P01';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS officer_appointments_prevent_overlap ON public.officer_appointments;
CREATE TRIGGER officer_appointments_prevent_overlap
BEFORE INSERT OR UPDATE OF officer_id, starts_at, ends_at, status
ON public.officer_appointments
FOR EACH ROW EXECUTE FUNCTION public.prevent_officer_schedule_overlap();

DROP TRIGGER IF EXISTS officer_programmes_prevent_overlap ON public.officer_programmes;
CREATE TRIGGER officer_programmes_prevent_overlap
BEFORE INSERT OR UPDATE OF officer_id, starts_at, ends_at, status
ON public.officer_programmes
FOR EACH ROW EXECUTE FUNCTION public.prevent_officer_schedule_overlap();

ALTER TABLE public.officer_programmes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.officer_appointments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS officer_programmes_staff_read ON public.officer_programmes;
CREATE POLICY officer_programmes_staff_read ON public.officer_programmes
FOR SELECT TO authenticated
USING (public.is_active_staff(auth.uid()));

DROP POLICY IF EXISTS officer_programmes_reception_insert ON public.officer_programmes;
CREATE POLICY officer_programmes_reception_insert ON public.officer_programmes
FOR INSERT TO authenticated
WITH CHECK (
  created_by = auth.uid() AND (
    public.has_role(auth.uid(), 'receptionist'::public.app_role) OR
    public.has_role(auth.uid(), 'management'::public.app_role) OR
    public.has_role(auth.uid(), 'super_admin'::public.app_role)
  )
);

DROP POLICY IF EXISTS officer_programmes_reception_update ON public.officer_programmes;
CREATE POLICY officer_programmes_reception_update ON public.officer_programmes
FOR UPDATE TO authenticated
USING (
  public.has_role(auth.uid(), 'receptionist'::public.app_role) OR
  public.has_role(auth.uid(), 'management'::public.app_role) OR
  public.has_role(auth.uid(), 'super_admin'::public.app_role)
)
WITH CHECK (
  public.has_role(auth.uid(), 'receptionist'::public.app_role) OR
  public.has_role(auth.uid(), 'management'::public.app_role) OR
  public.has_role(auth.uid(), 'super_admin'::public.app_role)
);

DROP POLICY IF EXISTS officer_appointments_staff_read ON public.officer_appointments;
CREATE POLICY officer_appointments_staff_read ON public.officer_appointments
FOR SELECT TO authenticated
USING (
  officer_id = auth.uid() OR
  public.has_role(auth.uid(), 'receptionist'::public.app_role) OR
  public.has_role(auth.uid(), 'management'::public.app_role) OR
  public.has_role(auth.uid(), 'super_admin'::public.app_role)
);

DROP POLICY IF EXISTS officer_appointments_reception_insert ON public.officer_appointments;
CREATE POLICY officer_appointments_reception_insert ON public.officer_appointments
FOR INSERT TO authenticated
WITH CHECK (
  created_by = auth.uid() AND (
    public.has_role(auth.uid(), 'receptionist'::public.app_role) OR
    public.has_role(auth.uid(), 'management'::public.app_role) OR
    public.has_role(auth.uid(), 'super_admin'::public.app_role)
  )
);

DROP POLICY IF EXISTS officer_appointments_reception_update ON public.officer_appointments;
CREATE POLICY officer_appointments_reception_update ON public.officer_appointments
FOR UPDATE TO authenticated
USING (
  public.has_role(auth.uid(), 'receptionist'::public.app_role) OR
  public.has_role(auth.uid(), 'management'::public.app_role) OR
  public.has_role(auth.uid(), 'super_admin'::public.app_role)
)
WITH CHECK (
  public.has_role(auth.uid(), 'receptionist'::public.app_role) OR
  public.has_role(auth.uid(), 'management'::public.app_role) OR
  public.has_role(auth.uid(), 'super_admin'::public.app_role)
);

GRANT SELECT, INSERT, UPDATE ON public.officer_programmes TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.officer_appointments TO authenticated;
GRANT ALL ON public.officer_programmes, public.officer_appointments TO service_role;
