ALTER TABLE public.agent_redemptions
  ALTER COLUMN status SET DEFAULT 'requested';

UPDATE public.agent_redemptions
SET status = 'requested'
WHERE status = 'pending';

CREATE OR REPLACE FUNCTION public.log_agent_referred_client()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_agent public.agents%ROWTYPE;
BEGIN
  IF NEW.agent_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT * INTO v_agent
  FROM public.agents
  WHERE id = NEW.agent_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'The referring agent could not be found.';
  END IF;

  INSERT INTO public.audit_logs (
    actor_id, actor_email, action, entity_type, entity_id, new_value
  )
  VALUES (
    v_agent.user_id, v_agent.email, 'client.referred_registration',
    'clients', NEW.id::text,
    jsonb_build_object(
      'agent_id', v_agent.id,
      'agent_code', v_agent.agent_code,
      'referral_code', NEW.referral_code,
      'client_ref', NEW.client_ref
    )
  );

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.log_agent_referred_client() FROM PUBLIC;

DROP TRIGGER IF EXISTS clients_log_agent_referral ON public.clients;
CREATE TRIGGER clients_log_agent_referral
  AFTER INSERT ON public.clients
  FOR EACH ROW EXECUTE FUNCTION public.log_agent_referred_client();

REVOKE UPDATE ON public.agent_redemptions FROM authenticated;

CREATE TABLE public.agent_commission_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id uuid NOT NULL REFERENCES public.agents(id) ON DELETE RESTRICT,
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE RESTRICT,
  deal_id uuid REFERENCES public.deals(id) ON DELETE SET NULL,
  fee_transaction_id uuid NOT NULL UNIQUE REFERENCES public.transactions(id) ON DELETE RESTRICT,
  currency text NOT NULL DEFAULT 'UGX',
  eligible_fee_amount numeric(14, 2) NOT NULL CHECK (eligible_fee_amount > 0),
  commission_rate numeric(5, 2) NOT NULL CHECK (commission_rate > 0 AND commission_rate <= 100),
  gross_commission numeric(14, 2) NOT NULL CHECK (gross_commission > 0),
  withholding_tax numeric(14, 2) NOT NULL DEFAULT 0 CHECK (withholding_tax >= 0),
  net_payable numeric(14, 2) NOT NULL CHECK (net_payable >= 0),
  agreement_reference text NOT NULL,
  calculation_notes text,
  status text NOT NULL DEFAULT 'available' CHECK (status IN ('available', 'void')),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (withholding_tax <= gross_commission),
  CHECK (net_payable = gross_commission - withholding_tax)
);

CREATE TABLE public.agent_commission_payouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id uuid NOT NULL REFERENCES public.agents(id) ON DELETE RESTRICT,
  amount numeric(14, 2) NOT NULL CHECK (amount > 0),
  currency text NOT NULL DEFAULT 'UGX',
  status text NOT NULL DEFAULT 'requested'
    CHECK (status IN ('requested', 'approved', 'paid', 'rejected')),
  processed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  processed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.agent_commission_payout_items (
  payout_id uuid NOT NULL REFERENCES public.agent_commission_payouts(id) ON DELETE CASCADE,
  commission_id uuid NOT NULL REFERENCES public.agent_commission_ledger(id) ON DELETE RESTRICT,
  amount numeric(14, 2) NOT NULL CHECK (amount > 0),
  PRIMARY KEY (payout_id, commission_id)
);

CREATE INDEX agent_commission_ledger_agent_status_idx
  ON public.agent_commission_ledger(agent_id, status, currency);
CREATE INDEX agent_commission_payouts_agent_created_idx
  ON public.agent_commission_payouts(agent_id, created_at DESC);
CREATE INDEX agent_commission_payout_items_commission_idx
  ON public.agent_commission_payout_items(commission_id);

GRANT SELECT ON public.agent_commission_ledger, public.agent_commission_payouts,
  public.agent_commission_payout_items TO authenticated;
GRANT ALL ON public.agent_commission_ledger, public.agent_commission_payouts,
  public.agent_commission_payout_items TO service_role;

ALTER TABLE public.agent_commission_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_commission_payouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_commission_payout_items ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  v_table_name text;
BEGIN
  FOREACH v_table_name IN ARRAY ARRAY[
    'agent_commission_ledger',
    'agent_commission_payouts',
    'agent_commission_payout_items'
  ]
  LOOP
    EXECUTE format(
      'CREATE POLICY maintenance_access_gate ON public.%I AS RESTRICTIVE FOR ALL TO anon, authenticated USING (public.maintenance_access_allowed()) WITH CHECK (public.maintenance_access_allowed())',
      v_table_name
    );
  END LOOP;
END $$;

CREATE POLICY agent_commission_ledger_view ON public.agent_commission_ledger
  FOR SELECT TO authenticated
  USING (
    public.has_permission(auth.uid(), 'agents.view')
    OR EXISTS (
      SELECT 1 FROM public.agents a
      WHERE a.id = agent_id AND a.user_id = auth.uid()
    )
  );

CREATE POLICY agent_commission_payouts_view ON public.agent_commission_payouts
  FOR SELECT TO authenticated
  USING (
    public.has_permission(auth.uid(), 'agents.view')
    OR EXISTS (
      SELECT 1 FROM public.agents a
      WHERE a.id = agent_id AND a.user_id = auth.uid()
    )
  );

CREATE POLICY agent_commission_payout_items_view ON public.agent_commission_payout_items
  FOR SELECT TO authenticated
  USING (
    public.has_permission(auth.uid(), 'agents.view')
    OR EXISTS (
      SELECT 1
      FROM public.agent_commission_payouts p
      JOIN public.agents a ON a.id = p.agent_id
      WHERE p.id = payout_id AND a.user_id = auth.uid()
    )
  );

CREATE OR REPLACE FUNCTION public.create_agent_commission(
  _agent_id uuid,
  _fee_transaction_id uuid,
  _agreement_reference text,
  _withholding_tax numeric
)
RETURNS public.agent_commission_ledger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_agent public.agents%ROWTYPE;
  v_receipt public.transactions%ROWTYPE;
  v_client_agent_id uuid;
  v_gross numeric(14, 2);
  v_withholding numeric(14, 2);
  v_entry public.agent_commission_ledger%ROWTYPE;
  v_email text;
BEGIN
  IF NOT public.maintenance_access_allowed() THEN
    RAISE EXCEPTION 'Agent reward processing is unavailable during maintenance.';
  END IF;
  IF v_actor IS NULL OR NOT public.has_permission(v_actor, 'finance.create') THEN
    RAISE EXCEPTION 'Finance create permission is required.';
  END IF;
  IF char_length(btrim(coalesce(_agreement_reference, ''))) < 3
     OR char_length(btrim(_agreement_reference)) > 200 THEN
    RAISE EXCEPTION 'Enter a valid accepted commission agreement reference.';
  END IF;
  IF _withholding_tax IS NULL OR _withholding_tax < 0
     OR _withholding_tax <> round(_withholding_tax, 2) THEN
    RAISE EXCEPTION 'Enter the finance-verified withholding amount to two decimal places.';
  END IF;

  SELECT * INTO v_agent
  FROM public.agents
  WHERE id = _agent_id AND status = 'active'
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'The agent must have active status.';
  END IF;
  IF v_agent.commission_rate IS NULL
     OR v_agent.commission_rate <= 0
     OR v_agent.commission_rate > 100 THEN
    RAISE EXCEPTION 'The agent commission rate is invalid.';
  END IF;

  SELECT * INTO v_receipt
  FROM public.transactions
  WHERE id = _fee_transaction_id
  FOR SHARE;
  IF NOT FOUND OR v_receipt.archived_at IS NOT NULL
     OR v_receipt.status <> 'cleared'
     OR v_receipt.purpose <> 'KALEXI_BROKERAGE_FEE_RECEIPT'
     OR char_length(btrim(coalesce(v_receipt.payment_reference, ''))) = 0
     OR v_receipt.client_id IS NULL THEN
    RAISE EXCEPTION 'Only cleared, referenced Kalexi brokerage-fee receipts linked to a client qualify.';
  END IF;

  SELECT agent_id INTO v_client_agent_id
  FROM public.clients
  WHERE id = v_receipt.client_id;
  IF v_client_agent_id IS DISTINCT FROM v_agent.id THEN
    RAISE EXCEPTION 'The receipt client is not assigned to this agent.';
  END IF;

  v_gross := round((v_receipt.amount * v_agent.commission_rate / 100)::numeric, 2);
  IF v_gross <= 0 THEN
    RAISE EXCEPTION 'The calculated commission must be greater than zero.';
  END IF;
  IF _withholding_tax > v_gross THEN
    RAISE EXCEPTION 'Withholding cannot exceed the calculated gross commission.';
  END IF;
  v_withholding := _withholding_tax;

  INSERT INTO public.agent_commission_ledger (
    agent_id, client_id, deal_id, fee_transaction_id, currency,
    eligible_fee_amount, commission_rate, gross_commission,
    withholding_tax, net_payable, agreement_reference, calculation_notes,
    status, created_by
  )
  VALUES (
    v_agent.id, v_receipt.client_id, v_receipt.deal_id, v_receipt.id,
    coalesce(nullif(v_receipt.currency, ''), 'UGX'), v_receipt.amount,
    v_agent.commission_rate, v_gross, v_withholding, v_gross - v_withholding,
    btrim(_agreement_reference),
    'Withholding amount entered and verified by finance.',
    'available', v_actor
  )
  RETURNING * INTO v_entry;

  SELECT email INTO v_email FROM public.profiles WHERE id = v_actor;
  INSERT INTO public.audit_logs (
    actor_id, actor_email, action, entity_type, entity_id, new_value
  )
  VALUES (
    v_actor, v_email, 'agent.commission.created', 'agent_commission_ledger',
    v_entry.id::text,
    jsonb_build_object(
      'agent_id', v_agent.id, 'agent_name', v_agent.full_name,
      'fee_transaction_id', v_receipt.id,
      'eligible_fee_amount', v_receipt.amount,
      'commission_rate', v_agent.commission_rate,
      'gross_commission', v_gross, 'withholding_tax', v_withholding,
      'net_payable', v_entry.net_payable, 'currency', v_entry.currency,
      'status', 'available'
    )
  );

  RETURN v_entry;
END;
$$;

CREATE OR REPLACE FUNCTION public.request_agent_token_redemption(_tokens integer)
RETURNS public.agent_redemptions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_agent_id uuid;
  v_earned integer;
  v_used integer;
  v_redemption public.agent_redemptions%ROWTYPE;
BEGIN
  IF NOT public.maintenance_access_allowed() THEN
    RAISE EXCEPTION 'Agent reward processing is unavailable during maintenance.';
  END IF;
  IF v_actor IS NULL OR _tokens IS NULL OR _tokens < 1 THEN
    RAISE EXCEPTION 'Choose at least one available token to redeem.';
  END IF;

  SELECT id INTO v_agent_id
  FROM public.agents
  WHERE user_id = v_actor
    AND status = 'active'
    AND expires_at > now()
  FOR UPDATE;

  IF v_agent_id IS NULL THEN
    RAISE EXCEPTION 'Only active, verified agents can redeem tokens.';
  END IF;

  SELECT count(*)::integer INTO v_earned
  FROM public.clients
  WHERE agent_id = v_agent_id;

  SELECT coalesce(sum(tokens_used), 0)::integer INTO v_used
  FROM public.agent_redemptions
  WHERE agent_id = v_agent_id
    AND status <> 'rejected';

  IF _tokens > v_earned - v_used THEN
    RAISE EXCEPTION 'The requested token amount exceeds your available balance.';
  END IF;

  INSERT INTO public.agent_redemptions (agent_id, tokens_used, amount, currency, status)
  VALUES (v_agent_id, _tokens, _tokens * 1000, 'UGX', 'requested')
  RETURNING * INTO v_redemption;

  INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, new_value)
  VALUES (
    v_actor, 'agent.tokens_redeemed', 'agent_redemptions', v_redemption.id::text,
    jsonb_build_object('agent_id', v_agent_id, 'tokens', _tokens, 'amount', v_redemption.amount, 'currency', 'UGX')
  );

  RETURN v_redemption;
END;
$$;

CREATE OR REPLACE FUNCTION public.request_agent_commission_payout(
  _currency text,
  _amount numeric
)
RETURNS public.agent_commission_payouts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_agent_id uuid;
  v_available numeric(14, 2);
  v_payout public.agent_commission_payouts%ROWTYPE;
BEGIN
  IF NOT public.maintenance_access_allowed() THEN
    RAISE EXCEPTION 'Agent reward processing is unavailable during maintenance.';
  END IF;
  IF v_actor IS NULL OR _currency IS NULL OR _currency !~ '^[A-Z]{3}$'
     OR _amount IS NULL OR _amount <= 0 OR _amount <> round(_amount, 2) THEN
    RAISE EXCEPTION 'Enter a positive payout amount with no more than two decimal places.';
  END IF;

  SELECT id INTO v_agent_id
  FROM public.agents
  WHERE user_id = v_actor
    AND status = 'active'
    AND expires_at > now()
  FOR UPDATE;

  IF v_agent_id IS NULL THEN
    RAISE EXCEPTION 'Only active, verified agents can request commission payouts.';
  END IF;

  SELECT coalesce(sum(l.net_payable - coalesce(reserved.amount, 0)), 0)::numeric(14, 2)
    INTO v_available
  FROM public.agent_commission_ledger l
  LEFT JOIN (
    SELECT i.commission_id, sum(i.amount) AS amount
    FROM public.agent_commission_payout_items i
    JOIN public.agent_commission_payouts p ON p.id = i.payout_id
    WHERE p.status <> 'rejected'
    GROUP BY i.commission_id
  ) reserved ON reserved.commission_id = l.id
  WHERE l.agent_id = v_agent_id
    AND l.currency = _currency
    AND l.status = 'available'
    AND l.net_payable > coalesce(reserved.amount, 0);

  IF _amount > v_available THEN
    RAISE EXCEPTION 'The requested payout exceeds your available commission balance.';
  END IF;

  INSERT INTO public.agent_commission_payouts (agent_id, amount, currency)
  VALUES (v_agent_id, _amount, _currency)
  RETURNING * INTO v_payout;

  WITH reserved AS (
    SELECT i.commission_id, sum(i.amount) AS amount
    FROM public.agent_commission_payout_items i
    JOIN public.agent_commission_payouts p ON p.id = i.payout_id
    WHERE p.status <> 'rejected'
    GROUP BY i.commission_id
  ),
  available AS (
    SELECT l.id, l.created_at, l.net_payable - coalesce(reserved.amount, 0) AS amount
    FROM public.agent_commission_ledger l
    LEFT JOIN reserved ON reserved.commission_id = l.id
    WHERE l.agent_id = v_agent_id
      AND l.currency = _currency
      AND l.status = 'available'
      AND l.net_payable > coalesce(reserved.amount, 0)
  ),
  allocation AS (
    SELECT id, amount,
      coalesce(
        sum(amount) OVER (
          ORDER BY created_at, id
          ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING
        ),
        0
      ) AS prior_amount
    FROM available
  )
  INSERT INTO public.agent_commission_payout_items (payout_id, commission_id, amount)
  SELECT v_payout.id, id, least(amount, _amount - prior_amount)
  FROM allocation
  WHERE prior_amount < _amount;

  INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, new_value)
  VALUES (
    v_actor, 'agent.commission_payout_requested', 'agent_commission_payouts', v_payout.id::text,
    jsonb_build_object('agent_id', v_agent_id, 'amount', _amount, 'currency', _currency)
  );

  RETURN v_payout;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_agent_redemption_status(
  _redemption_id uuid,
  _next_status text
)
RETURNS public.agent_redemptions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_redemption public.agent_redemptions%ROWTYPE;
  v_updated public.agent_redemptions%ROWTYPE;
  v_email text;
BEGIN
  IF NOT public.maintenance_access_allowed() THEN
    RAISE EXCEPTION 'Agent reward processing is unavailable during maintenance.';
  END IF;
  IF v_actor IS NULL OR NOT public.has_permission(v_actor, 'agents.manage') THEN
    RAISE EXCEPTION 'You do not have permission to process agent rewards.';
  END IF;
  IF _next_status IS NULL OR _next_status NOT IN ('approved', 'paid', 'rejected') THEN
    RAISE EXCEPTION 'Unsupported reward status.';
  END IF;

  SELECT * INTO v_redemption
  FROM public.agent_redemptions
  WHERE id = _redemption_id
  FOR UPDATE;

  IF NOT FOUND
     OR NOT (
       (v_redemption.status = 'requested' AND _next_status IN ('approved', 'rejected'))
       OR (v_redemption.status = 'approved' AND _next_status IN ('paid', 'rejected'))
     ) THEN
    RAISE EXCEPTION 'This request is no longer available for that action. Refresh and try again.';
  END IF;

  PERFORM 1 FROM public.agents WHERE id = v_redemption.agent_id FOR UPDATE;

  UPDATE public.agent_redemptions
  SET status = _next_status, processed_by = v_actor, processed_at = now()
  WHERE id = _redemption_id AND status = v_redemption.status
  RETURNING * INTO v_updated;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Request status changed before it could be processed.';
  END IF;

  SELECT email INTO v_email FROM public.profiles WHERE id = v_actor;
  INSERT INTO public.audit_logs (
    actor_id, actor_email, action, entity_type, entity_id, previous_value, new_value
  )
  VALUES (
    v_actor, v_email, 'agent.redemption_' || _next_status,
    'agent_redemptions', _redemption_id::text,
    jsonb_build_object('status', v_redemption.status),
    jsonb_build_object(
      'status', _next_status, 'amount', v_redemption.amount,
      'currency', v_redemption.currency, 'tokens_used', v_redemption.tokens_used
    )
  );

  RETURN v_updated;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_agent_commission_payout_status(
  _payout_id uuid,
  _next_status text
)
RETURNS public.agent_commission_payouts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_payout public.agent_commission_payouts%ROWTYPE;
  v_updated public.agent_commission_payouts%ROWTYPE;
BEGIN
  IF NOT public.maintenance_access_allowed() THEN
    RAISE EXCEPTION 'Agent reward processing is unavailable during maintenance.';
  END IF;
  IF v_actor IS NULL OR NOT public.has_permission(v_actor, 'agents.manage') THEN
    RAISE EXCEPTION 'You do not have permission to process agent commission payouts.';
  END IF;
  IF _next_status IS NULL OR _next_status NOT IN ('approved', 'paid', 'rejected') THEN
    RAISE EXCEPTION 'Unsupported commission payout status.';
  END IF;

  SELECT * INTO v_payout
  FROM public.agent_commission_payouts
  WHERE id = _payout_id
  FOR UPDATE;

  IF NOT FOUND
     OR NOT (
       (v_payout.status = 'requested' AND _next_status IN ('approved', 'rejected'))
       OR (v_payout.status = 'approved' AND _next_status IN ('paid', 'rejected'))
     ) THEN
    RAISE EXCEPTION 'This payout is no longer available for that action. Refresh and try again.';
  END IF;

  PERFORM 1 FROM public.agents WHERE id = v_payout.agent_id FOR UPDATE;

  UPDATE public.agent_commission_payouts
  SET status = _next_status, processed_by = v_actor, processed_at = now()
  WHERE id = _payout_id AND status = v_payout.status
  RETURNING * INTO v_updated;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payout status changed before it could be processed.';
  END IF;

  INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, previous_value, new_value)
  VALUES (
    v_actor, 'agent.commission_payout_' || _next_status,
    'agent_commission_payouts', _payout_id::text,
    jsonb_build_object('status', v_payout.status),
    jsonb_build_object('status', _next_status, 'amount', v_payout.amount, 'currency', v_payout.currency)
  );

  RETURN v_updated;
END;
$$;

REVOKE ALL ON FUNCTION public.request_agent_token_redemption(integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_agent_commission(uuid, uuid, text, numeric) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.request_agent_commission_payout(text, numeric) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_agent_commission_payout_status(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_agent_redemption_status(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.request_agent_token_redemption(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_agent_commission(uuid, uuid, text, numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.request_agent_commission_payout(text, numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_agent_commission_payout_status(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_agent_redemption_status(uuid, text) TO authenticated;
