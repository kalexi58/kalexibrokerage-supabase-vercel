-- KALEXI: Synchronize approved agent identity details.
-- Matching key: registry_id
-- Target: public.agents

CREATE OR REPLACE FUNCTION public.sync_agent_application_details()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
    v_set text;
    v_payload jsonb;
BEGIN
    IF NEW.registry_id IS NULL THEN
        RETURN NEW;
    END IF;

    v_payload := to_jsonb(NEW);

    -- Only synchronize fields that exist in BOTH tables.
    -- Never synchronize approval status or primary keys.
    SELECT string_agg(
        format(
            '%1$I = (jsonb_populate_record(NULL::public.agents, jsonb_build_object(%2$L, $2 -> %2$L))).%1$I',
            a.column_name,
            a.column_name
        ),
        ', '
    )
    INTO v_set
    FROM information_schema.columns a
    JOIN information_schema.columns b
      ON b.table_schema = 'public'
     AND b.table_name = 'agent_applications'
     AND b.column_name = a.column_name
    WHERE a.table_schema = 'public'
      AND a.table_name = 'agents'
      AND a.column_name IN (
          'full_name',
          'phone',
          'email',
          'district',
          'village',
          'designation',
          'company_phone',
          'photo_path',
          'nationality',
          'date_of_birth',
          'address',
          'gender'
      );

    IF v_set IS NOT NULL THEN
        EXECUTE format(
            'UPDATE public.agents
             SET %s
             WHERE registry_id = $1',
            v_set
        )
        USING NEW.registry_id, v_payload;
    END IF;

    RETURN NEW;
END;
$function$;

-- Replace the previous synchronization trigger if present.
DROP TRIGGER IF EXISTS trg_sync_agent_application_details
ON public.agent_applications;

CREATE TRIGGER trg_sync_agent_application_details
AFTER UPDATE OF
    full_name,
    phone,
    email,
    district,
    village,
    designation,
    company_phone,
    photo_path
ON public.agent_applications
FOR EACH ROW
EXECUTE FUNCTION public.sync_agent_application_details();

-- Also synchronize newly inserted applications when they
-- already have a corresponding agent registry record.
DROP TRIGGER IF EXISTS trg_sync_new_agent_application
ON public.agent_applications;

CREATE TRIGGER trg_sync_new_agent_application
AFTER INSERT
ON public.agent_applications
FOR EACH ROW
EXECUTE FUNCTION public.sync_agent_application_details();

-- Restrict direct execution of the security-definer function.
REVOKE ALL ON FUNCTION public.sync_agent_application_details()
FROM PUBLIC;
