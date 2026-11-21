ALTER TABLE public.agents
  ADD COLUMN id_card_serial text,
  ADD COLUMN id_card_issued_at timestamptz;

UPDATE public.agents
SET id_card_serial = 'KBL-ID-' || upper(substr(replace(id::text, '-', ''), 1, 12)),
    id_card_issued_at = coalesce(issued_at, created_at, now())
WHERE id_card_serial IS NULL
   OR id_card_issued_at IS NULL;

CREATE UNIQUE INDEX agents_id_card_serial_key
  ON public.agents (id_card_serial);

CREATE OR REPLACE FUNCTION public.prepare_agent_id_card()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.id_card_serial IS NULL THEN
    NEW.id_card_serial :=
      'KBL-ID-' || upper(substr(replace(NEW.id::text, '-', ''), 1, 12));
  END IF;
  IF NEW.id_card_issued_at IS NULL THEN
    NEW.id_card_issued_at := coalesce(NEW.issued_at, now());
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER agents_prepare_id_card
  BEFORE INSERT ON public.agents
  FOR EACH ROW EXECUTE FUNCTION public.prepare_agent_id_card();

CREATE OR REPLACE FUNCTION public.guard_agent_id_card_fields()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF (
    NEW.id_card_serial IS DISTINCT FROM OLD.id_card_serial
    OR NEW.id_card_issued_at IS DISTINCT FROM OLD.id_card_issued_at
    OR NEW.verification_token IS DISTINCT FROM OLD.verification_token
  ) AND current_setting('app.agent_id_issuance', true) IS DISTINCT FROM 'on' THEN
    RAISE EXCEPTION 'Use the authorized agent ID issuance workflow to change identification fields.';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER agents_guard_id_card_fields
  BEFORE UPDATE ON public.agents
  FOR EACH ROW EXECUTE FUNCTION public.guard_agent_id_card_fields();

CREATE OR REPLACE FUNCTION public.audit_agent_id_management()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := coalesce(auth.uid(), NEW.created_by);
  v_email text;
BEGIN
  IF TG_OP = 'UPDATE'
    AND NEW.status IS NOT DISTINCT FROM OLD.status
    AND NEW.id_card_serial IS NOT DISTINCT FROM OLD.id_card_serial
    AND NEW.id_card_issued_at IS NOT DISTINCT FROM OLD.id_card_issued_at THEN
    RETURN NEW;
  END IF;

  SELECT email INTO v_email FROM public.profiles WHERE id = v_actor;
  INSERT INTO public.audit_logs (
    actor_id, actor_email, action, entity_type, entity_id, previous_value, new_value
  )
  VALUES (
    v_actor,
    v_email,
    CASE
      WHEN TG_OP = 'INSERT' THEN 'agent.id_card_issued'
      WHEN NEW.status IS DISTINCT FROM OLD.status THEN 'agent.status_changed'
      ELSE 'agent.id_card_reissued'
    END,
    'agents',
    NEW.id::text,
    CASE WHEN TG_OP = 'UPDATE' THEN jsonb_build_object(
      'status', OLD.status,
      'id_card_serial', OLD.id_card_serial,
      'id_card_issued_at', OLD.id_card_issued_at
    ) ELSE NULL END,
    jsonb_build_object(
      'status', NEW.status,
      'id_card_serial', NEW.id_card_serial,
      'id_card_issued_at', NEW.id_card_issued_at
    )
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER agents_audit_id_management
  AFTER INSERT OR UPDATE ON public.agents
  FOR EACH ROW EXECUTE FUNCTION public.audit_agent_id_management();

CREATE OR REPLACE FUNCTION public.issue_agent_id_card(_agent_id uuid)
RETURNS public.agents
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_agent public.agents%ROWTYPE;
BEGIN
  IF NOT public.maintenance_access_allowed() THEN
    RAISE EXCEPTION 'Agent ID issuance is unavailable during maintenance.';
  END IF;
  IF auth.uid() IS NULL OR NOT public.has_permission(auth.uid(), 'agents.manage') THEN
    RAISE EXCEPTION 'Agent management permission is required to issue an ID.';
  END IF;

  PERFORM 1
  FROM public.agents
  WHERE id = _agent_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Agent record not found.';
  END IF;

  PERFORM set_config('app.agent_id_issuance', 'on', true);
  UPDATE public.agents
  SET id_card_serial = 'KBL-ID-' || upper(substr(replace(id::text, '-', ''), 1, 12))
      || '-' || upper(encode(gen_random_bytes(4), 'hex')),
      id_card_issued_at = now(),
      verification_token = encode(gen_random_bytes(24), 'hex')
  WHERE id = _agent_id
  RETURNING * INTO v_agent;

  RETURN v_agent;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_agent_status(_agent_id uuid, _status text)
RETURNS public.agents
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_agent public.agents%ROWTYPE;
BEGIN
  IF NOT public.maintenance_access_allowed() THEN
    RAISE EXCEPTION 'Agent management is unavailable during maintenance.';
  END IF;
  IF auth.uid() IS NULL OR NOT public.has_permission(auth.uid(), 'agents.manage') THEN
    RAISE EXCEPTION 'Agent management permission is required.';
  END IF;
  IF _status IS NULL OR _status NOT IN ('active', 'suspended', 'revoked') THEN
    RAISE EXCEPTION 'Choose a supported agent status.';
  END IF;

  UPDATE public.agents
  SET status = _status
  WHERE id = _agent_id
  RETURNING * INTO v_agent;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Agent record not found.';
  END IF;
  RETURN v_agent;
END;
$$;

REVOKE ALL ON FUNCTION public.issue_agent_id_card(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_agent_status(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.issue_agent_id_card(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_agent_status(uuid, text) TO authenticated;

NOTIFY pgrst, 'reload schema';
