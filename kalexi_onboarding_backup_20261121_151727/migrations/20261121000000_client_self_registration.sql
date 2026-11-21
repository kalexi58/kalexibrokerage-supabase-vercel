CREATE TABLE IF NOT EXISTS public.client_registration_invites (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    token text NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(32), 'hex'),
    created_by uuid NOT NULL REFERENCES auth.users(id),
    expires_at timestamptz NOT NULL DEFAULT (now() + interval '7 days'),
    used_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.client_registration_invites ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT ON public.client_registration_invites TO authenticated;
GRANT ALL ON public.client_registration_invites TO service_role;

CREATE POLICY client_invites_staff_read
ON public.client_registration_invites
FOR SELECT TO authenticated
USING (
    public.has_permission(auth.uid(), 'clients.create')
);

CREATE POLICY client_invites_staff_create
ON public.client_registration_invites
FOR INSERT TO authenticated
WITH CHECK (
    created_by = auth.uid()
    AND public.has_permission(auth.uid(), 'clients.create')
);

CREATE OR REPLACE FUNCTION public.create_client_registration_invite()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_token text;
BEGIN
    IF auth.uid() IS NULL
       OR NOT public.has_permission(auth.uid(), 'clients.create') THEN
        RAISE EXCEPTION 'You are not authorised to invite clients';
    END IF;

    INSERT INTO public.client_registration_invites(created_by)
    VALUES (auth.uid())
    RETURNING token INTO v_token;

    RETURN v_token;
END;
$$;

CREATE OR REPLACE FUNCTION public.submit_client_registration(
    p_token text,
    p_full_name text,
    p_phone text,
    p_email text,
    p_company_name text,
    p_client_type text,
    p_sector text,
    p_requirement text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_invite public.client_registration_invites%ROWTYPE;
    v_client_id uuid;
    v_client_ref text;
BEGIN
    IF length(trim(coalesce(p_full_name,''))) < 2
       OR length(trim(coalesce(p_phone,''))) < 6
       OR length(trim(coalesce(p_requirement,''))) < 5 THEN
        RAISE EXCEPTION 'Please complete all required fields';
    END IF;

    IF length(p_full_name) > 120
       OR length(p_phone) > 30
       OR length(coalesce(p_email,'')) > 255
       OR length(coalesce(p_company_name,'')) > 160
       OR length(p_requirement) > 2000 THEN
        RAISE EXCEPTION 'One or more fields exceed the allowed length';
    END IF;

    IF coalesce(p_email,'') <> ''
       AND p_email !~* '^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$' THEN
        RAISE EXCEPTION 'Enter a valid email address';
    END IF;

    SELECT * INTO v_invite
    FROM public.client_registration_invites
    WHERE token = p_token
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Invalid registration invitation';
    END IF;

    IF v_invite.used_at IS NOT NULL THEN
        RAISE EXCEPTION 'This invitation has already been used';
    END IF;

    IF v_invite.expires_at < now() THEN
        RAISE EXCEPTION 'This invitation has expired';
    END IF;

    IF EXISTS (
        SELECT 1 FROM public.clients
        WHERE regexp_replace(phone, '[^0-9]', '', 'g') =
              regexp_replace(trim(p_phone), '[^0-9]', '', 'g')
    ) THEN
        RAISE EXCEPTION 'A client with this phone number already exists. Contact Kalexi for assistance.';
    END IF;

    IF nullif(trim(coalesce(p_email,'')), '') IS NOT NULL
       AND EXISTS (
           SELECT 1 FROM public.clients
           WHERE lower(email) = lower(trim(p_email))
       ) THEN
        RAISE EXCEPTION 'A client with this email already exists. Contact Kalexi for assistance.';
    END IF;

    INSERT INTO public.clients (
        full_name,
        phone,
        email,
        company_name,
        client_type,
        sector,
        requirement,
        status,
        registered_by
    )
    VALUES (
        trim(p_full_name),
        trim(p_phone),
        nullif(trim(coalesce(p_email,'')), ''),
        nullif(trim(coalesce(p_company_name,'')), ''),
        trim(p_client_type),
        trim(p_sector),
        trim(p_requirement),
        'pending_verification',
        v_invite.created_by
    )
    RETURNING id, client_ref
    INTO v_client_id, v_client_ref;

    UPDATE public.client_registration_invites
    SET used_at = now()
    WHERE id = v_invite.id;

    RETURN jsonb_build_object(
        'success', true,
        'client_id', v_client_id,
        'client_ref', v_client_ref
    );
END;
$$;

REVOKE ALL ON FUNCTION public.create_client_registration_invite() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.submit_client_registration(
    text,text,text,text,text,text,text,text
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.create_client_registration_invite()
TO authenticated;

GRANT EXECUTE ON FUNCTION public.submit_client_registration(
    text,text,text,text,text,text,text,text
) TO anon, authenticated;
