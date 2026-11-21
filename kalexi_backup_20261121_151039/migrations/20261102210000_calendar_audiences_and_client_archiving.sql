ALTER TABLE public.calendar_events
  ADD COLUMN IF NOT EXISTS notification_groups text[] NOT NULL DEFAULT ARRAY['all']::text[];

CREATE OR REPLACE FUNCTION public.valid_calendar_notification_groups(_groups text[])
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT cardinality(_groups) > 0
    AND NOT EXISTS (
      SELECT 1
      FROM unnest(_groups) AS selected(group_name)
      WHERE selected.group_name IS NULL
         OR (
           selected.group_name !~ '^department:.{1,100}$'
           AND selected.group_name NOT IN (
             'all', 'employees', 'agents', 'executive', 'finance', 'redemptions',
             'role:super_admin', 'role:receptionist', 'role:onboarding_officer',
             'role:deals_manager', 'role:verification_officer', 'role:risk_officer',
             'role:finance_officer', 'role:management', 'role:auditor'
           )
         )
    );
$$;

UPDATE public.calendar_events
SET notification_groups = ARRAY['employees']::text[]
WHERE notification_groups = ARRAY['all']::text[];

ALTER TABLE public.calendar_events
  DROP CONSTRAINT IF EXISTS calendar_events_notification_groups_check;
ALTER TABLE public.calendar_events
  ADD CONSTRAINT calendar_events_notification_groups_check
  CHECK (public.valid_calendar_notification_groups(notification_groups));

CREATE OR REPLACE FUNCTION public.is_calendar_employee(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT NOT EXISTS (
    SELECT 1 FROM public.agents a WHERE a.user_id = _user_id
  )
  AND NOT EXISTS (
    SELECT 1 FROM public.agent_applications a WHERE a.user_id = _user_id
  );
$$;

CREATE OR REPLACE FUNCTION public.can_view_calendar_event(_groups text[], _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT _user_id = auth.uid() AND EXISTS (
    SELECT 1
    FROM public.profiles p
    LEFT JOIN public.user_roles ur ON ur.user_id = p.id
    WHERE p.id = _user_id
      AND p.status = 'active'
      AND (
        public.has_permission(_user_id, 'clients.view')
        OR (
          'all' = ANY(_groups)
          AND (
            public.is_calendar_employee(p.id)
            OR EXISTS (
              SELECT 1 FROM public.agents a
              WHERE a.user_id = p.id AND a.status = 'active' AND a.expires_at > now()
            )
          )
        )
        OR (
          'employees' = ANY(_groups)
          AND public.is_calendar_employee(p.id)
        )
        OR (
          'agents' = ANY(_groups)
          AND EXISTS (
            SELECT 1 FROM public.agents a
            WHERE a.user_id = p.id AND a.status = 'active' AND a.expires_at > now()
          )
        )
        OR (
          public.is_calendar_employee(p.id)
          AND (
            (
              'executive' = ANY(_groups)
              AND (
                lower(coalesce(p.department, '')) LIKE '%executive%'
                OR ur.role::text IN ('super_admin', 'management')
              )
            )
            OR (
              'finance' = ANY(_groups)
              AND (
                lower(coalesce(p.department, '')) LIKE '%finance%'
                OR ur.role::text = 'finance_officer'
              )
            )
            OR (
              'redemptions' = ANY(_groups)
              AND lower(coalesce(p.department, '')) LIKE '%redemption%'
            )
            OR EXISTS (
              SELECT 1
              FROM unnest(_groups) AS selected(group_name)
              WHERE selected.group_name = 'role:' || ur.role::text
                 OR selected.group_name = 'department:' ||
                   regexp_replace(lower(btrim(coalesce(p.department, ''))), '[^a-z0-9 _-]', '', 'g')
            )
          )
        )
      )
  );
$$;

REVOKE ALL ON FUNCTION public.is_calendar_employee(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_view_calendar_event(text[], uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_view_calendar_event(text[], uuid) TO authenticated;

DROP POLICY IF EXISTS "Authenticated users can view company calendar events"
  ON public.calendar_events;
DROP POLICY IF EXISTS "Staff with client permission can view company calendar events"
  ON public.calendar_events;
CREATE POLICY "Staff and selected agents can view company calendar events"
  ON public.calendar_events
  FOR SELECT TO authenticated
  USING (public.can_view_calendar_event(notification_groups, auth.uid()));

CREATE OR REPLACE FUNCTION public.notify_calendar_event_audience()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_body text;
BEGIN
  v_body := 'Scheduled for ' ||
    to_char(NEW.starts_at AT TIME ZONE 'Africa/Kampala', 'DD Mon YYYY, HH24:MI') ||
    ' Kampala time.';

  INSERT INTO public.notifications (user_id, title, body, link)
  SELECT recipients.user_id,
         'Calendar event: ' || NEW.title,
         v_body,
         '/calendar?event=' || NEW.id::text
  FROM (
    SELECT DISTINCT p.id AS user_id
    FROM public.profiles p
    LEFT JOIN public.user_roles ur ON ur.user_id = p.id
    WHERE p.status = 'active'
      AND p.id IS DISTINCT FROM NEW.created_by
      AND (
        (
          'all' = ANY(NEW.notification_groups)
          AND (
            public.is_calendar_employee(p.id)
            OR EXISTS (
              SELECT 1 FROM public.agents a
              WHERE a.user_id = p.id AND a.status = 'active' AND a.expires_at > now()
            )
          )
        )
        OR (
          'employees' = ANY(NEW.notification_groups)
          AND public.is_calendar_employee(p.id)
        )
        OR (
          'agents' = ANY(NEW.notification_groups)
          AND EXISTS (
            SELECT 1
            FROM public.agents a
            WHERE a.user_id = p.id
              AND a.status = 'active'
              AND a.expires_at > now()
          )
        )
        OR (
          public.is_calendar_employee(p.id)
          AND (
            (
              'executive' = ANY(NEW.notification_groups)
              AND (
                lower(coalesce(p.department, '')) LIKE '%executive%'
                OR ur.role::text IN ('super_admin', 'management')
              )
            )
            OR (
              'finance' = ANY(NEW.notification_groups)
              AND (
                lower(coalesce(p.department, '')) LIKE '%finance%'
                OR ur.role::text = 'finance_officer'
              )
            )
            OR (
              'redemptions' = ANY(NEW.notification_groups)
              AND lower(coalesce(p.department, '')) LIKE '%redemption%'
            )
            OR EXISTS (
              SELECT 1
              FROM unnest(NEW.notification_groups) AS selected_group(group_name)
              WHERE selected_group.group_name = 'role:' || ur.role::text
                 OR selected_group.group_name =
                   'department:' ||
                   regexp_replace(lower(btrim(coalesce(p.department, ''))), '[^a-z0-9 _-]', '', 'g')
            )
          )
        )
      )
  ) AS recipients;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS calendar_event_audience_notifications ON public.calendar_events;
CREATE TRIGGER calendar_event_audience_notifications
  AFTER INSERT ON public.calendar_events
  FOR EACH ROW EXECUTE FUNCTION public.notify_calendar_event_audience();

CREATE OR REPLACE FUNCTION public.guard_client_archive_changes()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF ROW(NEW.archived_at, NEW.archived_by, NEW.archive_reason)
       IS DISTINCT FROM ROW(OLD.archived_at, OLD.archived_by, OLD.archive_reason)
     AND auth.uid() IS NOT NULL
     AND NOT (
       public.has_permission(auth.uid(), 'clients.archive')
       OR public.has_permission(auth.uid(), 'archive.restore')
     ) THEN
    RAISE EXCEPTION 'You do not have permission to archive or restore client records.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS clients_archive_permission_guard ON public.clients;
CREATE TRIGGER clients_archive_permission_guard
  BEFORE UPDATE ON public.clients
  FOR EACH ROW EXECUTE FUNCTION public.guard_client_archive_changes();

REVOKE ALL ON FUNCTION public.notify_calendar_event_audience() FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.archive_client(_client_id uuid, _reason text)
RETURNS public.clients
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_client public.clients%ROWTYPE;
  v_previous_status text;
BEGIN
  IF v_actor IS NULL OR NOT public.has_permission(v_actor, 'clients.archive') THEN
    RAISE EXCEPTION 'You do not have permission to archive client records.';
  END IF;
  IF char_length(btrim(coalesce(_reason, ''))) < 5
     OR char_length(btrim(_reason)) > 1000 THEN
    RAISE EXCEPTION 'Enter an archive reason between 5 and 1000 characters.';
  END IF;

  SELECT * INTO v_client
  FROM public.clients
  WHERE id = _client_id
    AND archived_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Client record not found or already archived.';
  END IF;
  v_previous_status := v_client.status;

  UPDATE public.clients
  SET archived_at = now(),
      archived_by = v_actor,
      archive_reason = btrim(_reason),
      status = 'archived'
  WHERE id = _client_id
    AND archived_at IS NULL
  RETURNING * INTO v_client;

  INSERT INTO public.archive_records (
    entity_type, entity_id, entity_ref, title, original_created_at,
    original_created_by, previous_status, reason, archived_by, state, snapshot, created_by
  )
  VALUES (
    'clients', v_client.id, v_client.client_ref, v_client.full_name,
    v_client.created_at, v_client.registered_by, v_previous_status,
    btrim(_reason), v_actor, 'archived', to_jsonb(v_client), v_actor
  );

  INSERT INTO public.audit_logs (
    actor_id, action, entity_type, entity_id, previous_value, new_value
  )
  VALUES (
    v_actor, 'client.archived', 'clients', v_client.id::text,
    jsonb_build_object('status', v_previous_status),
    jsonb_build_object('client_ref', v_client.client_ref, 'reason', btrim(_reason))
  );

  RETURN v_client;
END;
$$;

REVOKE ALL ON FUNCTION public.archive_client(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.archive_client(uuid, text) TO authenticated;
