CREATE SEQUENCE IF NOT EXISTS public.property_ref_seq START 1;

CREATE TABLE IF NOT EXISTS public.properties (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_ref text NOT NULL UNIQUE
    DEFAULT ('KBL-PROP-' || lpad(nextval('public.property_ref_seq')::text, 6, '0')),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE RESTRICT,
  name text NOT NULL,
  category text NOT NULL CHECK (
    category IN ('land', 'house', 'commercial', 'industrial', 'hotel', 'rental', 'other')
  ),
  description text NOT NULL DEFAULT '',
  location text NOT NULL,
  asking_price numeric(18, 2) CHECK (asking_price IS NULL OR asking_price >= 0),
  currency text NOT NULL DEFAULT 'UGX',
  status text NOT NULL DEFAULT 'pending_verification' CHECK (
    status IN ('pending_verification', 'available', 'rejected', 'under_offer', 'sold', 'leased')
  ),
  verification_status text NOT NULL DEFAULT 'pending' CHECK (
    verification_status IN ('pending', 'verified', 'rejected')
  ),
  assigned_to uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  archived_at timestamptz,
  archived_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  archive_reason text,
  CONSTRAINT properties_status_verification_check CHECK (
    (status = 'pending_verification' AND verification_status = 'pending')
    OR (status = 'available' AND verification_status = 'verified')
    OR (status = 'rejected' AND verification_status = 'rejected')
    OR (status IN ('under_offer', 'sold', 'leased') AND verification_status = 'verified')
  )
);

CREATE INDEX IF NOT EXISTS properties_client_created_idx
  ON public.properties (client_id, created_at DESC)
  WHERE archived_at IS NULL;
CREATE INDEX IF NOT EXISTS properties_status_created_idx
  ON public.properties (status, created_at DESC)
  WHERE archived_at IS NULL;
CREATE INDEX IF NOT EXISTS properties_assigned_to_idx
  ON public.properties (assigned_to)
  WHERE archived_at IS NULL;

CREATE TABLE IF NOT EXISTS public.property_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL REFERENCES public.properties(id) ON DELETE RESTRICT,
  category text NOT NULL CHECK (
    category IN (
      'photo', 'video', 'ownership_document', 'land_title', 'agreement',
      'valuation_report', 'inspection_report', 'other'
    )
  ),
  display_name text NOT NULL,
  storage_path text NOT NULL UNIQUE,
  mime_type text NOT NULL,
  byte_size bigint NOT NULL CHECK (byte_size > 0 AND byte_size <= 52428800),
  uploaded_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  archived_at timestamptz,
  archived_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS property_files_property_created_idx
  ON public.property_files (property_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.property_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL REFERENCES public.properties(id) ON DELETE RESTRICT,
  decision text NOT NULL CHECK (decision IN ('verified', 'rejected')),
  note text NOT NULL DEFAULT '',
  reviewed_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  reviewed_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.property_status_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL REFERENCES public.properties(id) ON DELETE RESTRICT,
  previous_status text NOT NULL,
  next_status text NOT NULL,
  changed_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  changed_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS property_reviews_property_reviewed_idx
  ON public.property_reviews (property_id, reviewed_at DESC);
CREATE INDEX IF NOT EXISTS property_status_events_property_changed_idx
  ON public.property_status_events (property_id, changed_at DESC);

GRANT SELECT, INSERT, UPDATE ON public.properties TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.property_files TO authenticated;
GRANT SELECT ON public.property_reviews TO authenticated;
GRANT SELECT ON public.property_status_events TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.property_ref_seq TO authenticated;
GRANT ALL ON public.properties, public.property_files, public.property_reviews,
  public.property_status_events TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.property_ref_seq TO service_role;

ALTER TABLE public.properties ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.property_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.property_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.property_status_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS properties_select ON public.properties;
CREATE POLICY properties_select ON public.properties
  FOR SELECT TO authenticated
  USING (public.has_permission(auth.uid(), 'properties.view'));

DROP POLICY IF EXISTS properties_insert ON public.properties;
CREATE POLICY properties_insert ON public.properties
  FOR INSERT TO authenticated
  WITH CHECK (
    public.has_permission(auth.uid(), 'properties.create')
    AND created_by = auth.uid()
    AND status = 'pending_verification'
    AND verification_status = 'pending'
  );

DROP POLICY IF EXISTS properties_update ON public.properties;
CREATE POLICY properties_update ON public.properties
  FOR UPDATE TO authenticated
  USING (
    public.has_permission(auth.uid(), 'properties.edit')
    OR public.has_permission(auth.uid(), 'properties.verify')
  )
  WITH CHECK (
    public.has_permission(auth.uid(), 'properties.edit')
    OR public.has_permission(auth.uid(), 'properties.verify')
  );

DROP POLICY IF EXISTS property_files_select ON public.property_files;
CREATE POLICY property_files_select ON public.property_files
  FOR SELECT TO authenticated
  USING (public.has_permission(auth.uid(), 'properties.view'));

DROP POLICY IF EXISTS property_files_insert ON public.property_files;
CREATE POLICY property_files_insert ON public.property_files
  FOR INSERT TO authenticated
  WITH CHECK (
    uploaded_by = auth.uid()
    AND (storage.foldername(storage_path))[1] = auth.uid()::text
    AND (storage.foldername(storage_path))[2] = property_id::text
    AND (
      public.has_permission(auth.uid(), 'properties.create')
      OR public.has_permission(auth.uid(), 'properties.edit')
    )
  );

DROP POLICY IF EXISTS property_files_update ON public.property_files;
CREATE POLICY property_files_update ON public.property_files
  FOR UPDATE TO authenticated
  USING (public.has_permission(auth.uid(), 'properties.edit'))
  WITH CHECK (
    public.has_permission(auth.uid(), 'properties.edit')
    AND (archived_by IS NULL OR archived_by = auth.uid())
  );

CREATE OR REPLACE FUNCTION public.guard_property_file_archive()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF OLD.archived_at IS NOT NULL
     OR NEW.archived_at IS NULL
     OR NEW.archived_by IS DISTINCT FROM auth.uid()
     OR ROW(
       NEW.property_id, NEW.category, NEW.display_name, NEW.storage_path,
       NEW.mime_type, NEW.byte_size, NEW.uploaded_by, NEW.created_at
     ) IS DISTINCT FROM ROW(
       OLD.property_id, OLD.category, OLD.display_name, OLD.storage_path,
       OLD.mime_type, OLD.byte_size, OLD.uploaded_by, OLD.created_at
     )
     OR NOT public.has_permission(auth.uid(), 'properties.edit') THEN
    RAISE EXCEPTION 'Property file records can only be archived by authorized property editors.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS property_files_archive_guard ON public.property_files;
CREATE TRIGGER property_files_archive_guard
  BEFORE UPDATE ON public.property_files
  FOR EACH ROW EXECUTE FUNCTION public.guard_property_file_archive();

DROP POLICY IF EXISTS property_reviews_select ON public.property_reviews;
CREATE POLICY property_reviews_select ON public.property_reviews
  FOR SELECT TO authenticated
  USING (public.has_permission(auth.uid(), 'properties.view'));

DROP POLICY IF EXISTS property_status_events_select ON public.property_status_events;
CREATE POLICY property_status_events_select ON public.property_status_events
  FOR SELECT TO authenticated
  USING (public.has_permission(auth.uid(), 'properties.view'));

CREATE OR REPLACE FUNCTION public.guard_property_update()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.verification_status IS DISTINCT FROM OLD.verification_status THEN
    IF NOT public.has_permission(auth.uid(), 'properties.verify')
       OR OLD.status <> 'pending_verification'
       OR NEW.status NOT IN ('available', 'rejected') THEN
      RAISE EXCEPTION 'Property verification status can only be changed by an authorized reviewer from pending verification.';
    END IF;
  ELSIF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NOT public.has_permission(auth.uid(), 'properties.edit')
       OR NOT (
         (OLD.status = 'available' AND NEW.status = 'under_offer')
         OR (OLD.status = 'under_offer' AND NEW.status IN ('available', 'sold', 'leased'))
       ) THEN
      RAISE EXCEPTION 'Property status transition is not allowed.';
    END IF;
  ELSIF NOT public.has_permission(auth.uid(), 'properties.edit') THEN
    RAISE EXCEPTION 'Property edit permission is required.';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.record_property_status_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO public.property_status_events (
      property_id, previous_status, next_status, changed_by
    )
    VALUES (NEW.id, OLD.status, NEW.status, auth.uid());
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS properties_guard_update ON public.properties;
CREATE TRIGGER properties_guard_update
  BEFORE UPDATE ON public.properties
  FOR EACH ROW EXECUTE FUNCTION public.guard_property_update();

DROP TRIGGER IF EXISTS properties_record_status_event ON public.properties;
CREATE TRIGGER properties_record_status_event
  AFTER UPDATE ON public.properties
  FOR EACH ROW EXECUTE FUNCTION public.record_property_status_event();

DROP TRIGGER IF EXISTS properties_touch_updated_at ON public.properties;
CREATE TRIGGER properties_touch_updated_at
  BEFORE UPDATE ON public.properties
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE OR REPLACE FUNCTION public.review_property(
  _property_id uuid,
  _decision text,
  _note text DEFAULT ''
)
RETURNS public.properties
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  reviewed public.properties;
BEGIN
  IF NOT public.has_permission(auth.uid(), 'properties.verify') THEN
    RAISE EXCEPTION 'Property verification permission is required.';
  END IF;
  IF _decision NOT IN ('verified', 'rejected') THEN
    RAISE EXCEPTION 'Decision must be verified or rejected.';
  END IF;

  UPDATE public.properties
  SET status = CASE WHEN _decision = 'verified' THEN 'available' ELSE 'rejected' END,
      verification_status = _decision
  WHERE id = _property_id
    AND status = 'pending_verification'
    AND verification_status = 'pending'
    AND archived_at IS NULL
  RETURNING * INTO reviewed;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Property is no longer pending review.';
  END IF;

  INSERT INTO public.property_reviews (property_id, decision, note, reviewed_by)
  VALUES (_property_id, _decision, coalesce(_note, ''), auth.uid());

  RETURN reviewed;
END;
$$;

REVOKE ALL ON FUNCTION public.review_property(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.review_property(uuid, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.transition_property_status(
  _property_id uuid,
  _next_status text
)
RETURNS public.properties
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  changed public.properties;
BEGIN
  IF NOT public.has_permission(auth.uid(), 'properties.edit') THEN
    RAISE EXCEPTION 'Property edit permission is required.';
  END IF;
  IF _next_status NOT IN ('available', 'under_offer', 'sold', 'leased') THEN
    RAISE EXCEPTION 'The requested property status is not supported.';
  END IF;

  UPDATE public.properties
  SET status = _next_status
  WHERE id = _property_id
    AND archived_at IS NULL
    AND verification_status = 'verified'
    AND (
      (status = 'available' AND _next_status = 'under_offer')
      OR (status = 'under_offer' AND _next_status IN ('available', 'sold', 'leased'))
    )
  RETURNING * INTO changed;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Property is no longer in a state that permits this transition.';
  END IF;

  RETURN changed;
END;
$$;

REVOKE ALL ON FUNCTION public.transition_property_status(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.transition_property_status(uuid, text) TO authenticated;

INSERT INTO public.role_permissions (role_key, permission)
SELECT role_key, permission
FROM (
  VALUES
    ('management', 'properties.view'),
    ('management', 'properties.verify'),
    ('deals_manager', 'properties.view'),
    ('deals_manager', 'properties.create'),
    ('deals_manager', 'properties.edit'),
    ('verification_officer', 'properties.view'),
    ('verification_officer', 'properties.verify'),
    ('onboarding_officer', 'properties.view'),
    ('auditor', 'properties.view')
) AS permissions(role_key, permission)
ON CONFLICT (role_key, permission) DO NOTHING;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'property-files',
  'property-files',
  false,
  52428800,
  ARRAY[
    'image/jpeg', 'image/png', 'image/webp',
    'video/mp4', 'video/webm',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ]
)
ON CONFLICT (id) DO UPDATE
SET public = false,
    file_size_limit = 52428800,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS property_files_storage_select ON storage.objects;
CREATE POLICY property_files_storage_select ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'property-files'
    AND public.has_permission(auth.uid(), 'properties.view')
  );

DROP POLICY IF EXISTS property_files_storage_insert ON storage.objects;
CREATE POLICY property_files_storage_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'property-files'
    AND (storage.foldername(name))[1] = auth.uid()::text
    AND (public.has_permission(auth.uid(), 'properties.create')
      OR public.has_permission(auth.uid(), 'properties.edit'))
  );

DROP POLICY IF EXISTS property_files_storage_update ON storage.objects;
CREATE POLICY property_files_storage_update ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'property-files'
    AND public.has_permission(auth.uid(), 'properties.edit')
  )
  WITH CHECK (
    bucket_id = 'property-files'
    AND public.has_permission(auth.uid(), 'properties.edit')
  );

DROP POLICY IF EXISTS property_files_storage_delete ON storage.objects;
CREATE POLICY property_files_storage_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'property-files'
    AND public.has_permission(auth.uid(), 'properties.edit')
  );
