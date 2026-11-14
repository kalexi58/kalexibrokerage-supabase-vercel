CREATE OR REPLACE FUNCTION public.objective_metric_value(
  _metric text,
  _start_date date,
  _target_date date,
  _currency text
)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_value numeric;
BEGIN
  IF _metric = 'clients_created' THEN
    SELECT count(*)::numeric INTO v_value
    FROM public.clients c
    WHERE c.archived_at IS NULL
      AND (_start_date IS NULL OR c.created_at::date >= _start_date)
      AND (_target_date IS NULL OR c.created_at::date <= _target_date);
  ELSIF _metric = 'properties_approved' THEN
    SELECT count(DISTINCT r.property_id)::numeric INTO v_value
    FROM public.property_reviews r
    JOIN public.properties p ON p.id = r.property_id
    WHERE r.decision = 'verified'
      AND p.archived_at IS NULL
      AND (_start_date IS NULL OR r.reviewed_at::date >= _start_date)
      AND (_target_date IS NULL OR r.reviewed_at::date <= _target_date);
  ELSIF _metric = 'deals_completed' THEN
    SELECT count(*)::numeric INTO v_value
    FROM public.deals d
    WHERE d.stage = 'closed'
      AND d.archived_at IS NULL
      AND (_start_date IS NULL OR coalesce(d.closed_at, d.updated_at)::date >= _start_date)
      AND (_target_date IS NULL OR coalesce(d.closed_at, d.updated_at)::date <= _target_date);
  ELSIF _metric = 'cleared_brokerage_fees' THEN
    SELECT coalesce(sum(t.amount), 0)::numeric INTO v_value
    FROM public.transactions t
    WHERE t.purpose = 'KALEXI_BROKERAGE_FEE_RECEIPT'
      AND t.status = 'cleared'
      AND t.archived_at IS NULL
      AND t.currency = _currency
      AND (_start_date IS NULL OR t.occurred_on::date >= _start_date)
      AND (_target_date IS NULL OR t.occurred_on::date <= _target_date);
  ELSIF _metric = 'opportunities_created' THEN
    SELECT count(*)::numeric INTO v_value
    FROM public.opportunities o
    WHERE o.archived_at IS NULL
      AND (_start_date IS NULL OR o.created_at::date >= _start_date)
      AND (_target_date IS NULL OR o.created_at::date <= _target_date);
  ELSIF _metric = 'verifications_completed' THEN
    SELECT count(*)::numeric INTO v_value
    FROM public.verifications v
    WHERE v.status IN ('verified', 'cleared')
      AND v.archived_at IS NULL
      AND (_start_date IS NULL OR coalesce(v.decided_at, v.updated_at)::date >= _start_date)
      AND (_target_date IS NULL OR coalesce(v.decided_at, v.updated_at)::date <= _target_date);
  ELSE
    RAISE EXCEPTION 'Unsupported objective metric.';
  END IF;

  RETURN coalesce(v_value, 0);
END;
$$;

CREATE OR REPLACE FUNCTION public.refresh_company_objective_progress()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_objective record;
  v_key_result jsonb;
  v_updated_key_result jsonb;
  v_updated_key_results jsonb;
  v_metric text;
  v_target numeric;
  v_current numeric;
  v_total_percent numeric;
  v_result_count integer;
  v_progress integer;
  v_updated_id uuid;
  v_updated_count integer := 0;
BEGIN
  FOR v_objective IN
    SELECT id, key_results, start_date, target_date, currency, progress
    FROM public.objectives
    WHERE archived_at IS NULL
      AND status IN ('planned', 'in_progress')
      AND jsonb_typeof(key_results) = 'array'
  LOOP
    v_updated_key_results := '[]'::jsonb;
    v_total_percent := 0;
    v_result_count := 0;

    FOR v_key_result IN
      SELECT item.value
      FROM jsonb_array_elements(v_objective.key_results) AS item(value)
    LOOP
      v_metric := v_key_result ->> 'metric';
      IF v_metric IS NULL OR v_metric NOT IN (
        'clients_created',
        'properties_approved',
        'deals_completed',
        'cleared_brokerage_fees',
        'opportunities_created',
        'verifications_completed'
      ) OR jsonb_typeof(v_key_result -> 'target') IS DISTINCT FROM 'number' THEN
        v_updated_key_results := v_updated_key_results || jsonb_build_array(v_key_result);
        CONTINUE;
      END IF;

      v_target := (v_key_result ->> 'target')::numeric;
      IF v_target <= 0 THEN
        v_updated_key_results := v_updated_key_results || jsonb_build_array(v_key_result);
        CONTINUE;
      END IF;

      v_current := public.objective_metric_value(
        v_metric,
        v_objective.start_date,
        v_objective.target_date,
        v_objective.currency
      );
      v_updated_key_result := jsonb_set(
        v_key_result,
        '{current}',
        to_jsonb(v_current),
        true
      );
      v_updated_key_results := v_updated_key_results || jsonb_build_array(v_updated_key_result);
      v_total_percent := v_total_percent + least(100, (v_current / v_target) * 100);
      v_result_count := v_result_count + 1;
    END LOOP;

    IF v_result_count = 0 THEN
      CONTINUE;
    END IF;

    v_progress := round(v_total_percent / v_result_count)::integer;
    UPDATE public.objectives
    SET progress = v_progress,
        key_results = v_updated_key_results,
        updated_at = now()
    WHERE id = v_objective.id
      AND (
        progress IS DISTINCT FROM v_progress
        OR key_results IS DISTINCT FROM v_updated_key_results
      )
    RETURNING id INTO v_updated_id;

    IF FOUND THEN
      INSERT INTO public.objective_progress (
        objective_id, progress, note, status
      )
      VALUES (
        v_updated_id,
        v_progress,
        'Automatically recalculated from live company records.',
        'automatic'
      );
      v_updated_count := v_updated_count + 1;
    END IF;
  END LOOP;

  RETURN v_updated_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.refresh_company_objectives_after_data_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF pg_trigger_depth() > 1 THEN
    RETURN NULL;
  END IF;

  PERFORM public.refresh_company_objective_progress();
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.objective_metric_value(text, date, date, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.refresh_company_objective_progress() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.refresh_company_objectives_after_data_change() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS refresh_objectives_after_client_change ON public.clients;
CREATE TRIGGER refresh_objectives_after_client_change
  AFTER INSERT OR UPDATE OR DELETE ON public.clients
  FOR EACH STATEMENT
  EXECUTE FUNCTION public.refresh_company_objectives_after_data_change();

DROP TRIGGER IF EXISTS refresh_objectives_after_property_change ON public.properties;
CREATE TRIGGER refresh_objectives_after_property_change
  AFTER INSERT OR UPDATE OR DELETE ON public.properties
  FOR EACH STATEMENT
  EXECUTE FUNCTION public.refresh_company_objectives_after_data_change();

DROP TRIGGER IF EXISTS refresh_objectives_after_property_review_change ON public.property_reviews;
CREATE TRIGGER refresh_objectives_after_property_review_change
  AFTER INSERT OR UPDATE OR DELETE ON public.property_reviews
  FOR EACH STATEMENT
  EXECUTE FUNCTION public.refresh_company_objectives_after_data_change();

DROP TRIGGER IF EXISTS refresh_objectives_after_deal_change ON public.deals;
CREATE TRIGGER refresh_objectives_after_deal_change
  AFTER INSERT OR UPDATE OR DELETE ON public.deals
  FOR EACH STATEMENT
  EXECUTE FUNCTION public.refresh_company_objectives_after_data_change();

DROP TRIGGER IF EXISTS refresh_objectives_after_transaction_change ON public.transactions;
CREATE TRIGGER refresh_objectives_after_transaction_change
  AFTER INSERT OR UPDATE OR DELETE ON public.transactions
  FOR EACH STATEMENT
  EXECUTE FUNCTION public.refresh_company_objectives_after_data_change();

DROP TRIGGER IF EXISTS refresh_objectives_after_opportunity_change ON public.opportunities;
CREATE TRIGGER refresh_objectives_after_opportunity_change
  AFTER INSERT OR UPDATE OR DELETE ON public.opportunities
  FOR EACH STATEMENT
  EXECUTE FUNCTION public.refresh_company_objectives_after_data_change();

DROP TRIGGER IF EXISTS refresh_objectives_after_verification_change ON public.verifications;
CREATE TRIGGER refresh_objectives_after_verification_change
  AFTER INSERT OR UPDATE OR DELETE ON public.verifications
  FOR EACH STATEMENT
  EXECUTE FUNCTION public.refresh_company_objectives_after_data_change();

DROP TRIGGER IF EXISTS refresh_objective_after_configuration_change ON public.objectives;
CREATE TRIGGER refresh_objective_after_configuration_change
  AFTER INSERT OR UPDATE OF key_results, start_date, target_date, currency, status, archived_at
  ON public.objectives
  FOR EACH STATEMENT
  EXECUTE FUNCTION public.refresh_company_objectives_after_data_change();
