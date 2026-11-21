CREATE SEQUENCE public.finance_journal_ref_seq;
GRANT USAGE, SELECT ON SEQUENCE public.finance_journal_ref_seq TO service_role;

CREATE TABLE public.finance_settings (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  base_currency text NOT NULL DEFAULT 'UGX' CHECK (base_currency ~ '^[A-Z]{3}$'),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.finance_settings (singleton, base_currency)
VALUES (true, 'UGX')
ON CONFLICT (singleton) DO NOTHING;

CREATE TABLE public.finance_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_code text NOT NULL UNIQUE CHECK (account_code ~ '^[A-Z0-9._-]{2,30}$'),
  name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 120),
  account_type text NOT NULL CHECK (
    account_type IN ('asset', 'liability', 'equity', 'income', 'expense')
  ),
  parent_id uuid REFERENCES public.finance_accounts(id) ON DELETE RESTRICT,
  is_active boolean NOT NULL DEFAULT true,
  is_system boolean NOT NULL DEFAULT false,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.finance_accounts (account_code, name, account_type, is_system)
VALUES
  ('1000', 'Cash and cash equivalents', 'asset', true),
  ('1100', 'Accounts receivable', 'asset', true),
  ('1500', 'Property and equipment', 'asset', true),
  ('2000', 'Accounts payable', 'liability', true),
  ('2100', 'Tax payable', 'liability', true),
  ('2200', 'Agent commissions payable', 'liability', true),
  ('3000', 'Owner equity', 'equity', true),
  ('3100', 'Retained earnings', 'equity', true),
  ('4000', 'Brokerage commission income', 'income', true),
  ('5000', 'Operating expenses', 'expense', true)
ON CONFLICT (account_code) DO NOTHING;

CREATE TABLE public.finance_journal_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  journal_ref text NOT NULL UNIQUE DEFAULT (
    'KBL-JRN-' || lpad(nextval('public.finance_journal_ref_seq')::text, 6, '0')
  ),
  entry_date date NOT NULL DEFAULT current_date,
  description text NOT NULL CHECK (char_length(btrim(description)) BETWEEN 1 AND 500),
  status text NOT NULL DEFAULT 'pending_approval'
    CHECK (status IN ('pending_approval', 'posted', 'rejected', 'changes_requested')),
  source_key text UNIQUE,
  source_type text,
  source_id uuid,
  request_fingerprint text NOT NULL CHECK (request_fingerprint ~ '^[0-9a-f]{32}$'),
  base_currency text NOT NULL CHECK (base_currency ~ '^[A-Z]{3}$'),
  base_total numeric(14, 2) NOT NULL CHECK (base_total > 0),
  review_note text,
  reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  posted_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  posted_at timestamptz
);

CREATE TABLE public.finance_journal_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  journal_id uuid NOT NULL REFERENCES public.finance_journal_entries(id) ON DELETE RESTRICT,
  line_number integer NOT NULL CHECK (line_number > 0),
  account_id uuid NOT NULL REFERENCES public.finance_accounts(id) ON DELETE RESTRICT,
  description text,
  currency text NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  debit numeric(14, 2) NOT NULL DEFAULT 0 CHECK (debit >= 0),
  credit numeric(14, 2) NOT NULL DEFAULT 0 CHECK (credit >= 0),
  exchange_rate numeric(18, 8) NOT NULL CHECK (exchange_rate > 0),
  base_debit numeric(14, 2) NOT NULL CHECK (base_debit >= 0),
  base_credit numeric(14, 2) NOT NULL CHECK (base_credit >= 0),
  UNIQUE (journal_id, line_number),
  CHECK ((debit > 0 AND credit = 0) OR (credit > 0 AND debit = 0)),
  CHECK ((base_debit > 0 AND base_credit = 0) OR (base_credit > 0 AND base_debit = 0))
);

CREATE INDEX finance_journal_entries_date_idx
  ON public.finance_journal_entries(entry_date DESC, created_at DESC);
CREATE INDEX finance_journal_lines_account_idx
  ON public.finance_journal_lines(account_id, journal_id);

CREATE TABLE public.finance_approval_limits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  role_key text NOT NULL REFERENCES public.roles(key) ON DELETE CASCADE,
  currency text NOT NULL CHECK (currency = '*' OR currency ~ '^[A-Z]{3}$'),
  max_amount numeric(14, 2) CHECK (max_amount IS NULL OR max_amount >= 0),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (role_key, currency),
  CHECK (currency <> '*' OR max_amount IS NULL)
);

INSERT INTO public.finance_approval_limits (role_key, currency, max_amount)
VALUES ('management', '*', NULL)
ON CONFLICT (role_key, currency) DO NOTHING;

INSERT INTO public.role_permissions (role_key, permission)
VALUES
  ('finance_officer', 'finance.approve'),
  ('management', 'finance.approve'),
  ('management', 'finance.configure'),
  ('super_admin', 'finance.approve'),
  ('super_admin', 'finance.configure')
ON CONFLICT (role_key, permission) DO NOTHING;

ALTER TABLE public.transactions
  ADD COLUMN approval_status text CHECK (
    approval_status IS NULL OR approval_status IN ('pending', 'approved', 'rejected', 'changes_requested')
  ),
  ADD COLUMN approval_note text,
  ADD COLUMN approved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN approved_at timestamptz;

CREATE INDEX transactions_approval_queue_idx
  ON public.transactions(approval_status, created_at DESC)
  WHERE archived_at IS NULL;

GRANT SELECT, INSERT, UPDATE ON public.finance_accounts TO authenticated;
GRANT ALL ON public.finance_accounts TO service_role;
ALTER TABLE public.finance_accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY finance_accounts_view ON public.finance_accounts
  FOR SELECT TO authenticated USING (public.has_permission(auth.uid(), 'finance.view'));
CREATE POLICY finance_accounts_configure_insert ON public.finance_accounts
  FOR INSERT TO authenticated WITH CHECK (
    public.has_permission(auth.uid(), 'finance.configure') AND created_by = auth.uid()
  );
CREATE POLICY finance_accounts_configure_update ON public.finance_accounts
  FOR UPDATE TO authenticated USING (public.has_permission(auth.uid(), 'finance.configure'))
  WITH CHECK (public.has_permission(auth.uid(), 'finance.configure'));

GRANT SELECT, UPDATE ON public.finance_settings TO authenticated;
GRANT ALL ON public.finance_settings TO service_role;
ALTER TABLE public.finance_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY finance_settings_view ON public.finance_settings
  FOR SELECT TO authenticated USING (public.has_permission(auth.uid(), 'finance.view'));
CREATE POLICY finance_settings_configure ON public.finance_settings
  FOR UPDATE TO authenticated USING (public.has_permission(auth.uid(), 'finance.configure'))
  WITH CHECK (public.has_permission(auth.uid(), 'finance.configure'));

GRANT SELECT ON public.finance_journal_entries, public.finance_journal_lines TO authenticated;
GRANT ALL ON public.finance_journal_entries, public.finance_journal_lines TO service_role;
ALTER TABLE public.finance_journal_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.finance_journal_lines ENABLE ROW LEVEL SECURITY;
CREATE POLICY finance_journal_entries_view ON public.finance_journal_entries
  FOR SELECT TO authenticated USING (public.has_permission(auth.uid(), 'finance.view'));
CREATE POLICY finance_journal_lines_view ON public.finance_journal_lines
  FOR SELECT TO authenticated USING (
    public.has_permission(auth.uid(), 'finance.view')
    AND EXISTS (
      SELECT 1 FROM public.finance_journal_entries e
      WHERE e.id = journal_id
    )
  );

GRANT SELECT, INSERT, UPDATE ON public.finance_approval_limits TO authenticated;
GRANT ALL ON public.finance_approval_limits TO service_role;
ALTER TABLE public.finance_approval_limits ENABLE ROW LEVEL SECURITY;
CREATE POLICY finance_approval_limits_view ON public.finance_approval_limits
  FOR SELECT TO authenticated USING (public.has_permission(auth.uid(), 'finance.view'));
CREATE POLICY finance_approval_limits_configure_insert ON public.finance_approval_limits
  FOR INSERT TO authenticated WITH CHECK (
    public.has_permission(auth.uid(), 'finance.configure') AND created_by = auth.uid()
  );
CREATE POLICY finance_approval_limits_configure_update ON public.finance_approval_limits
  FOR UPDATE TO authenticated USING (public.has_permission(auth.uid(), 'finance.configure'))
  WITH CHECK (public.has_permission(auth.uid(), 'finance.configure'));

CREATE POLICY finance_accounts_maintenance_gate ON public.finance_accounts AS RESTRICTIVE
  FOR ALL TO anon, authenticated
  USING (public.maintenance_access_allowed())
  WITH CHECK (public.maintenance_access_allowed());
CREATE POLICY finance_settings_maintenance_gate ON public.finance_settings AS RESTRICTIVE
  FOR ALL TO anon, authenticated
  USING (public.maintenance_access_allowed())
  WITH CHECK (public.maintenance_access_allowed());
CREATE POLICY finance_journal_entries_maintenance_gate ON public.finance_journal_entries AS RESTRICTIVE
  FOR ALL TO anon, authenticated
  USING (public.maintenance_access_allowed())
  WITH CHECK (public.maintenance_access_allowed());
CREATE POLICY finance_journal_lines_maintenance_gate ON public.finance_journal_lines AS RESTRICTIVE
  FOR ALL TO anon, authenticated
  USING (public.maintenance_access_allowed())
  WITH CHECK (public.maintenance_access_allowed());
CREATE POLICY finance_approval_limits_maintenance_gate ON public.finance_approval_limits AS RESTRICTIVE
  FOR ALL TO anon, authenticated
  USING (public.maintenance_access_allowed())
  WITH CHECK (public.maintenance_access_allowed());

CREATE OR REPLACE FUNCTION public.guard_finance_account_update()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF OLD.is_system AND (
    NEW.account_code IS DISTINCT FROM OLD.account_code
    OR NEW.name IS DISTINCT FROM OLD.name
    OR NEW.account_type IS DISTINCT FROM OLD.account_type
    OR NEW.is_system IS DISTINCT FROM OLD.is_system
  ) THEN
    RAISE EXCEPTION 'System chart-of-account definitions cannot be changed.';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER finance_accounts_guard_update
  BEFORE UPDATE ON public.finance_accounts
  FOR EACH ROW EXECUTE FUNCTION public.guard_finance_account_update();

CREATE OR REPLACE FUNCTION public.audit_finance_account_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_email text;
BEGIN
  SELECT email INTO v_email FROM public.profiles WHERE id = v_actor;
  INSERT INTO public.audit_logs (
    actor_id, actor_email, action, entity_type, entity_id, previous_value, new_value
  )
  VALUES (
    v_actor, v_email,
    CASE WHEN TG_OP = 'INSERT' THEN 'finance.account.created' ELSE 'finance.account.updated' END,
    'finance_accounts', NEW.id::text,
    CASE WHEN TG_OP = 'UPDATE' THEN to_jsonb(OLD) ELSE NULL END,
    to_jsonb(NEW)
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER finance_accounts_audit
  AFTER INSERT OR UPDATE ON public.finance_accounts
  FOR EACH ROW EXECUTE FUNCTION public.audit_finance_account_change();

CREATE OR REPLACE FUNCTION public.guard_finance_settings_update()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.base_currency IS DISTINCT FROM OLD.base_currency
    AND EXISTS (SELECT 1 FROM public.finance_journal_entries) THEN
    RAISE EXCEPTION 'Base currency cannot change after journal entries have been recorded.';
  END IF;
  NEW.updated_by := auth.uid();
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER finance_settings_guard_update
  BEFORE UPDATE ON public.finance_settings
  FOR EACH ROW EXECUTE FUNCTION public.guard_finance_settings_update();

CREATE OR REPLACE FUNCTION public.audit_finance_settings_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_email text;
BEGIN
  IF NEW.base_currency IS NOT DISTINCT FROM OLD.base_currency THEN
    RETURN NEW;
  END IF;
  SELECT email INTO v_email FROM public.profiles WHERE id = v_actor;
  INSERT INTO public.audit_logs (
    actor_id, actor_email, action, entity_type, entity_id, previous_value, new_value
  )
  VALUES (
    v_actor, v_email, 'finance.base_currency.updated',
    'finance_settings', 'global',
    jsonb_build_object('base_currency', OLD.base_currency),
    jsonb_build_object('base_currency', NEW.base_currency)
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER finance_settings_audit
  AFTER UPDATE ON public.finance_settings
  FOR EACH ROW EXECUTE FUNCTION public.audit_finance_settings_update();

CREATE OR REPLACE FUNCTION public.audit_finance_approval_limit_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_email text;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.role_permissions rp
    WHERE rp.role_key = NEW.role_key AND rp.permission = 'finance.approve'
  ) THEN
    RAISE EXCEPTION 'Approval limits can only be configured for roles with finance approval permission.';
  END IF;
  NEW.updated_at := now();
  NEW.updated_by := v_actor;
  SELECT email INTO v_email FROM public.profiles WHERE id = v_actor;
  INSERT INTO public.audit_logs (
    actor_id, actor_email, action, entity_type, entity_id, previous_value, new_value
  )
  VALUES (
    v_actor, v_email,
    CASE WHEN TG_OP = 'INSERT' THEN 'finance.approval_limit.created' ELSE 'finance.approval_limit.updated' END,
    'finance_approval_limits', NEW.id::text,
    CASE WHEN TG_OP = 'UPDATE' THEN to_jsonb(OLD) ELSE NULL END,
    to_jsonb(NEW)
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER finance_approval_limits_audit
  BEFORE INSERT OR UPDATE ON public.finance_approval_limits
  FOR EACH ROW EXECUTE FUNCTION public.audit_finance_approval_limit_change();

CREATE OR REPLACE FUNCTION public.guard_financial_transaction_approval()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_email text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.approval_status IS NOT NULL AND NEW.approval_status <> 'pending' THEN
      RAISE EXCEPTION 'New financial transactions must enter the pending approval queue.';
    END IF;
    IF NEW.amount <= 0 THEN
      RAISE EXCEPTION 'Transaction amount must be greater than zero.';
    END IF;
    NEW.currency := upper(btrim(NEW.currency));
    IF NEW.currency !~ '^[A-Z]{3}$' THEN
      RAISE EXCEPTION 'Transaction currency must be a three-letter currency code.';
    END IF;
    IF char_length(btrim(coalesce(NEW.purpose, ''))) = 0 THEN
      RAISE EXCEPTION 'Transaction purpose is required.';
    END IF;
    IF NEW.commission_amount < 0 THEN
      RAISE EXCEPTION 'Commission amount cannot be negative.';
    END IF;
    NEW.status := 'pending';
    NEW.approval_status := 'pending';
    NEW.approval_note := NULL;
    NEW.approved_by := NULL;
    NEW.approved_at := NULL;
    SELECT email INTO v_email FROM public.profiles WHERE id = v_actor;
    INSERT INTO public.audit_logs (
      actor_id, actor_email, action, entity_type, entity_id, new_value
    )
    VALUES (
      v_actor, v_email, 'finance.transaction_submitted_for_approval',
      'transactions', NEW.id::text,
      jsonb_build_object(
        'transaction_ref', NEW.transaction_ref,
        'amount', NEW.amount,
        'currency', NEW.currency,
        'approval_status', NEW.approval_status
      )
    );
    RETURN NEW;
  END IF;

  IF OLD.approval_status IS NOT NULL THEN
    IF NEW.amount <= 0 THEN
      RAISE EXCEPTION 'Transaction amount must be greater than zero.';
    END IF;
    NEW.currency := upper(btrim(NEW.currency));
    IF NEW.currency !~ '^[A-Z]{3}$' THEN
      RAISE EXCEPTION 'Transaction currency must be a three-letter currency code.';
    END IF;
    IF char_length(btrim(coalesce(NEW.purpose, ''))) = 0 THEN
      RAISE EXCEPTION 'Transaction purpose is required.';
    END IF;
    IF NEW.commission_amount < 0 THEN
      RAISE EXCEPTION 'Commission amount cannot be negative.';
    END IF;
  END IF;

  IF current_setting('app.finance_transaction_review', true) IS DISTINCT FROM 'on'
    AND (
      NEW.approval_status IS DISTINCT FROM OLD.approval_status
      OR NEW.approval_note IS DISTINCT FROM OLD.approval_note
      OR NEW.approved_by IS DISTINCT FROM OLD.approved_by
      OR NEW.approved_at IS DISTINCT FROM OLD.approved_at
    ) THEN
    RAISE EXCEPTION 'Use the finance approval workflow to change approval fields.';
  END IF;

  IF OLD.approval_status = 'approved'
    AND (
      NEW.client_id IS DISTINCT FROM OLD.client_id
      OR NEW.deal_id IS DISTINCT FROM OLD.deal_id
      OR NEW.amount IS DISTINCT FROM OLD.amount
      OR NEW.currency IS DISTINCT FROM OLD.currency
      OR NEW.purpose IS DISTINCT FROM OLD.purpose
    ) THEN
    RAISE EXCEPTION 'Approved transaction facts cannot be changed; submit a corrected transaction for review.';
  END IF;

  IF OLD.approval_status IS NOT NULL
    AND NEW.status IS DISTINCT FROM OLD.status
    AND NEW.status NOT IN ('archived')
    AND NEW.approval_status IS DISTINCT FROM 'approved' THEN
    RAISE EXCEPTION 'A transaction must be approved before its payment status is updated.';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER transactions_guard_financial_approval
  BEFORE INSERT OR UPDATE ON public.transactions
  FOR EACH ROW EXECUTE FUNCTION public.guard_financial_transaction_approval();

CREATE OR REPLACE FUNCTION public.audit_finance_record_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_email text;
  v_old jsonb;
  v_new jsonb;
BEGIN
  v_old := jsonb_build_object(
    'status', to_jsonb(OLD)->'status',
    'amount', to_jsonb(OLD)->'amount',
    'currency', to_jsonb(OLD)->'currency'
  );
  v_new := jsonb_build_object(
    'status', to_jsonb(NEW)->'status',
    'amount', to_jsonb(NEW)->'amount',
    'currency', to_jsonb(NEW)->'currency'
  );
  IF v_old IS NOT DISTINCT FROM v_new THEN
    RETURN NEW;
  END IF;

  SELECT email INTO v_email FROM public.profiles WHERE id = v_actor;
  INSERT INTO public.audit_logs (
    actor_id, actor_email, action, entity_type, entity_id, previous_value, new_value
  )
  VALUES (
    v_actor, v_email, 'finance.' || TG_TABLE_NAME || '.updated',
    TG_TABLE_NAME, to_jsonb(NEW)->>'id', v_old, v_new
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER transactions_finance_audit
  AFTER UPDATE ON public.transactions
  FOR EACH ROW EXECUTE FUNCTION public.audit_finance_record_update();
CREATE TRIGGER invoices_finance_audit
  AFTER UPDATE ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.audit_finance_record_update();
CREATE TRIGGER commissions_finance_audit
  AFTER UPDATE ON public.commissions
  FOR EACH ROW EXECUTE FUNCTION public.audit_finance_record_update();
CREATE TRIGGER receipts_finance_audit
  AFTER UPDATE ON public.receipts
  FOR EACH ROW EXECUTE FUNCTION public.audit_finance_record_update();

CREATE OR REPLACE FUNCTION public.review_finance_transaction(
  _transaction_id uuid,
  _decision text,
  _note text DEFAULT NULL
)
RETURNS public.transactions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_transaction public.transactions%ROWTYPE;
  v_updated public.transactions%ROWTYPE;
  v_limit_count integer;
  v_has_unlimited_limit boolean;
  v_max_amount numeric(14, 2);
  v_email text;
BEGIN
  IF NOT public.maintenance_access_allowed() THEN
    RAISE EXCEPTION 'Finance approvals are unavailable during maintenance.';
  END IF;
  IF v_actor IS NULL
    OR NOT public.has_permission(v_actor, 'finance.view')
    OR NOT public.has_permission(v_actor, 'finance.approve') THEN
    RAISE EXCEPTION 'Finance view and approval permissions are required.';
  END IF;
  IF _decision IS NULL OR _decision NOT IN ('approved', 'rejected', 'changes_requested') THEN
    RAISE EXCEPTION 'Choose approve, reject, or request changes.';
  END IF;
  IF _decision IN ('rejected', 'changes_requested')
    AND char_length(btrim(coalesce(_note, ''))) < 3 THEN
    RAISE EXCEPTION 'Enter a reason for rejection or requested changes.';
  END IF;

  SELECT * INTO v_transaction
  FROM public.transactions
  WHERE id = _transaction_id AND archived_at IS NULL
  FOR UPDATE;
  IF NOT FOUND OR v_transaction.approval_status <> 'pending' THEN
    RAISE EXCEPTION 'This transaction is no longer awaiting approval.';
  END IF;
  IF v_transaction.created_by = v_actor THEN
    RAISE EXCEPTION 'You cannot approve or reject a transaction you submitted.';
  END IF;

  IF _decision = 'approved' THEN
    IF v_transaction.amount <= 0 THEN
      RAISE EXCEPTION 'Transaction amount must be greater than zero before approval.';
    END IF;

    WITH assigned_roles AS (
      SELECT ur.role::text AS role_key
      FROM public.user_roles ur
      WHERE ur.user_id = v_actor
      UNION
      SELECT ura.role_key
      FROM public.user_role_assignments ura
      WHERE ura.user_id = v_actor
    ),
    effective_limits AS (
      SELECT DISTINCT ON (l.role_key) l.role_key, l.max_amount
      FROM public.finance_approval_limits l
      JOIN assigned_roles ar ON ar.role_key = l.role_key
      WHERE l.currency IN (v_transaction.currency, '*')
        AND EXISTS (
          SELECT 1 FROM public.role_permissions rp
          WHERE rp.role_key = l.role_key AND rp.permission = 'finance.approve'
        )
      ORDER BY l.role_key, (l.currency = v_transaction.currency) DESC
    )
    SELECT count(*)::integer, coalesce(bool_or(max_amount IS NULL), false), max(max_amount)
    INTO v_limit_count, v_has_unlimited_limit, v_max_amount
    FROM effective_limits;
    IF v_limit_count = 0 THEN
      RAISE EXCEPTION 'No approval limit is configured for your role and transaction currency.';
    END IF;
    IF NOT v_has_unlimited_limit AND v_transaction.amount > v_max_amount THEN
      RAISE EXCEPTION 'Transaction exceeds your configured approval limit.';
    END IF;
  END IF;

  PERFORM set_config('app.finance_transaction_review', 'on', true);
  UPDATE public.transactions
  SET approval_status = _decision,
      approval_note = nullif(btrim(coalesce(_note, '')), ''),
      approved_by = CASE WHEN _decision = 'approved' THEN v_actor ELSE NULL END,
      approved_at = CASE WHEN _decision = 'approved' THEN now() ELSE NULL END
  WHERE id = _transaction_id
  RETURNING * INTO v_updated;

  SELECT email INTO v_email FROM public.profiles WHERE id = v_actor;
  INSERT INTO public.audit_logs (
    actor_id, actor_email, action, entity_type, entity_id, previous_value, new_value
  )
  VALUES (
    v_actor, v_email, 'finance.transaction_' || _decision,
    'transactions', v_updated.id::text,
    jsonb_build_object('approval_status', v_transaction.approval_status),
    jsonb_build_object(
      'approval_status', v_updated.approval_status,
      'approval_note', v_updated.approval_note,
      'amount', v_updated.amount,
      'currency', v_updated.currency
    )
  );
  RETURN v_updated;
END;
$$;

CREATE OR REPLACE FUNCTION public.resubmit_finance_transaction(_transaction_id uuid)
RETURNS public.transactions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_transaction public.transactions%ROWTYPE;
  v_updated public.transactions%ROWTYPE;
  v_email text;
BEGIN
  IF NOT public.maintenance_access_allowed() THEN
    RAISE EXCEPTION 'Finance approvals are unavailable during maintenance.';
  END IF;
  SELECT * INTO v_transaction
  FROM public.transactions
  WHERE id = _transaction_id AND archived_at IS NULL
  FOR UPDATE;
  IF NOT FOUND
    OR v_transaction.approval_status NOT IN ('rejected', 'changes_requested')
    OR (v_transaction.created_by IS DISTINCT FROM v_actor
      AND NOT public.has_permission(v_actor, 'finance.edit')) THEN
    RAISE EXCEPTION 'This transaction cannot be resubmitted by your account.';
  END IF;

  PERFORM set_config('app.finance_transaction_review', 'on', true);
  UPDATE public.transactions
  SET approval_status = 'pending',
      approval_note = NULL,
      approved_by = NULL,
      approved_at = NULL
  WHERE id = _transaction_id
  RETURNING * INTO v_updated;

  SELECT email INTO v_email FROM public.profiles WHERE id = v_actor;
  INSERT INTO public.audit_logs (
    actor_id, actor_email, action, entity_type, entity_id, previous_value, new_value
  )
  VALUES (
    v_actor, v_email, 'finance.transaction_resubmitted',
    'transactions', v_updated.id::text,
    jsonb_build_object('approval_status', v_transaction.approval_status),
    jsonb_build_object('approval_status', 'pending')
  );
  RETURN v_updated;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_finance_journal(
  _entry_date date,
  _description text,
  _lines jsonb,
  _source_key text DEFAULT NULL,
  _source_type text DEFAULT NULL,
  _source_id uuid DEFAULT NULL
)
RETURNS public.finance_journal_entries
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_base_currency text;
  v_line jsonb;
  v_line_number integer := 0;
  v_account_id uuid;
  v_account_active boolean;
  v_currency text;
  v_debit numeric;
  v_credit numeric;
  v_rate numeric;
  v_base_debit numeric(14, 2);
  v_base_credit numeric(14, 2);
  v_total_debit numeric(14, 2) := 0;
  v_total_credit numeric(14, 2) := 0;
  v_entry public.finance_journal_entries%ROWTYPE;
  v_request_fingerprint text;
  v_email text;
BEGIN
  IF NOT public.maintenance_access_allowed() THEN
    RAISE EXCEPTION 'Finance journal posting is unavailable during maintenance.';
  END IF;
  IF v_actor IS NULL OR NOT public.has_permission(v_actor, 'finance.create') THEN
    RAISE EXCEPTION 'Finance create permission is required to post a journal.';
  END IF;
  IF char_length(btrim(coalesce(_description, ''))) NOT BETWEEN 1 AND 500 THEN
    RAISE EXCEPTION 'Journal description must be between 1 and 500 characters.';
  END IF;
  IF jsonb_typeof(_lines) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Journal lines must be supplied as an array.';
  END IF;
  IF jsonb_array_length(_lines) < 2 OR jsonb_array_length(_lines) > 200 THEN
    RAISE EXCEPTION 'A journal must contain between two and 200 lines.';
  END IF;
  IF _source_key IS NOT NULL AND char_length(_source_key) > 200 THEN
    RAISE EXCEPTION 'Journal source key is too long.';
  END IF;
  IF _source_key IS NOT NULL THEN
    _source_key := btrim(_source_key);
    IF _source_key = '' THEN
      RAISE EXCEPTION 'Journal source key cannot be blank.';
    END IF;
  END IF;
  v_request_fingerprint := md5(jsonb_build_object(
    'entry_date', coalesce(_entry_date, current_date),
    'description', btrim(_description),
    'lines', _lines,
    'source_type', _source_type,
    'source_id', _source_id
  )::text);

  IF _source_key IS NOT NULL THEN
    SELECT * INTO v_entry
    FROM public.finance_journal_entries
    WHERE source_key = _source_key;
    IF FOUND THEN
      IF v_entry.source_type IS DISTINCT FROM _source_type
        OR v_entry.source_id IS DISTINCT FROM _source_id
        OR v_entry.request_fingerprint IS DISTINCT FROM v_request_fingerprint THEN
        RAISE EXCEPTION 'Journal source key is already associated with a different source.';
      END IF;
      RETURN v_entry;
    END IF;
  END IF;

  SELECT base_currency INTO v_base_currency
  FROM public.finance_settings
  WHERE singleton = true;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Finance base currency is not configured.';
  END IF;

  FOR v_line IN SELECT value FROM jsonb_array_elements(_lines)
  LOOP
    v_line_number := v_line_number + 1;
    v_account_id := nullif(v_line->>'account_id', '')::uuid;
    v_debit := coalesce(nullif(v_line->>'debit', '')::numeric, 0);
    v_credit := coalesce(nullif(v_line->>'credit', '')::numeric, 0);
    v_currency := upper(coalesce(nullif(v_line->>'currency', ''), v_base_currency));

    IF (v_debit > 0) = (v_credit > 0) OR v_debit < 0 OR v_credit < 0
      OR v_debit <> round(v_debit, 2) OR v_credit <> round(v_credit, 2) THEN
      RAISE EXCEPTION 'Each journal line must have exactly one positive debit or credit rounded to two decimals.';
    END IF;
    IF v_currency !~ '^[A-Z]{3}$' THEN
      RAISE EXCEPTION 'Journal currencies must be three-letter currency codes.';
    END IF;

    SELECT is_active INTO v_account_active
    FROM public.finance_accounts
    WHERE id = v_account_id
    FOR SHARE;
    IF NOT FOUND OR NOT v_account_active THEN
      RAISE EXCEPTION 'Every journal line must use an active chart-of-account entry.';
    END IF;

    v_rate := coalesce(
      nullif(v_line->>'exchange_rate', '')::numeric,
      CASE WHEN v_currency = v_base_currency THEN 1 ELSE NULL END
    );
    IF v_rate IS NULL OR v_rate <= 0 OR v_rate <> round(v_rate, 8) THEN
      RAISE EXCEPTION 'Enter a positive exchange rate to eight decimals for each journal line.';
    END IF;
    IF v_currency = v_base_currency AND v_rate <> 1 THEN
      RAISE EXCEPTION 'Base-currency journal lines must use an exchange rate of 1.';
    END IF;

    v_base_debit := round(v_debit * v_rate, 2);
    v_base_credit := round(v_credit * v_rate, 2);
    v_total_debit := v_total_debit + v_base_debit;
    v_total_credit := v_total_credit + v_base_credit;

    IF v_base_debit = 0 AND v_base_credit = 0 THEN
      RAISE EXCEPTION 'Every journal line must have a positive base-currency value.';
    END IF;
  END LOOP;

  IF v_total_debit = 0 OR v_total_debit <> v_total_credit THEN
    RAISE EXCEPTION 'Journal is not balanced in base currency: debits % and credits %.',
      v_total_debit, v_total_credit;
  END IF;

  INSERT INTO public.finance_journal_entries (
    entry_date, description, source_key, source_type, source_id,
    request_fingerprint, base_currency, base_total, created_by
  )
  VALUES (
    coalesce(_entry_date, current_date), btrim(_description),
    _source_key, _source_type, _source_id, v_request_fingerprint, v_base_currency,
    v_total_debit, v_actor
  )
  ON CONFLICT (source_key) DO NOTHING
  RETURNING * INTO v_entry;

  IF NOT FOUND THEN
    SELECT * INTO v_entry
    FROM public.finance_journal_entries
    WHERE source_key = _source_key;
    IF NOT FOUND
      OR v_entry.source_type IS DISTINCT FROM _source_type
      OR v_entry.source_id IS DISTINCT FROM _source_id
      OR v_entry.request_fingerprint IS DISTINCT FROM v_request_fingerprint THEN
      RAISE EXCEPTION 'Journal source key is already associated with a different request.';
    END IF;
    RETURN v_entry;
  END IF;

  v_line_number := 0;
  FOR v_line IN SELECT value FROM jsonb_array_elements(_lines)
  LOOP
    v_line_number := v_line_number + 1;
    v_account_id := (v_line->>'account_id')::uuid;
    v_debit := coalesce(nullif(v_line->>'debit', '')::numeric, 0);
    v_credit := coalesce(nullif(v_line->>'credit', '')::numeric, 0);
    v_currency := upper(coalesce(nullif(v_line->>'currency', ''), v_base_currency));
    v_rate := coalesce(
      nullif(v_line->>'exchange_rate', '')::numeric,
      CASE WHEN v_currency = v_base_currency THEN 1 ELSE NULL END
    );
    INSERT INTO public.finance_journal_lines (
      journal_id, line_number, account_id, description, currency,
      debit, credit, exchange_rate,
      base_debit, base_credit
    )
    VALUES (
      v_entry.id, v_line_number, v_account_id,
      nullif(btrim(v_line->>'description'), ''), v_currency,
      v_debit, v_credit, v_rate,
      round(v_debit * v_rate, 2), round(v_credit * v_rate, 2)
    );
  END LOOP;

  SELECT email INTO v_email FROM public.profiles WHERE id = v_actor;
  INSERT INTO public.audit_logs (
    actor_id, actor_email, action, entity_type, entity_id, new_value
  )
  VALUES (
    v_actor, v_email,     'finance.journal.submitted',
    'finance_journal_entries', v_entry.id::text,
    jsonb_build_object(
      'journal_ref', v_entry.journal_ref,
      'entry_date', v_entry.entry_date,
      'description', v_entry.description,
      'base_currency', v_base_currency,
      'base_debits', v_total_debit,
      'base_credits', v_total_credit,
      'status', 'pending_approval',
      'source_key', _source_key,
      'source_type', _source_type,
      'source_id', _source_id
    )
  );
  RETURN v_entry;
END;
$$;

CREATE OR REPLACE FUNCTION public.review_finance_journal_entry(
  _journal_id uuid,
  _decision text,
  _note text DEFAULT NULL
)
RETURNS public.finance_journal_entries
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_entry public.finance_journal_entries%ROWTYPE;
  v_updated public.finance_journal_entries%ROWTYPE;
  v_limit_count integer;
  v_has_unlimited_limit boolean;
  v_max_amount numeric(14, 2);
  v_email text;
BEGIN
  IF NOT public.maintenance_access_allowed() THEN
    RAISE EXCEPTION 'Finance approvals are unavailable during maintenance.';
  END IF;
  IF v_actor IS NULL
    OR NOT public.has_permission(v_actor, 'finance.view')
    OR NOT public.has_permission(v_actor, 'finance.approve') THEN
    RAISE EXCEPTION 'Finance view and approval permissions are required.';
  END IF;
  IF _decision IS NULL OR _decision NOT IN ('approved', 'rejected', 'changes_requested') THEN
    RAISE EXCEPTION 'Choose approve, reject, or request changes.';
  END IF;
  IF _decision IN ('rejected', 'changes_requested')
    AND char_length(btrim(coalesce(_note, ''))) < 3 THEN
    RAISE EXCEPTION 'Enter a reason for rejection or requested changes.';
  END IF;

  SELECT * INTO v_entry
  FROM public.finance_journal_entries
  WHERE id = _journal_id AND status = 'pending_approval'
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'This journal is no longer awaiting approval.';
  END IF;
  IF v_entry.created_by = v_actor THEN
    RAISE EXCEPTION 'You cannot approve or reject a journal you submitted.';
  END IF;

  IF _decision = 'approved' THEN
    WITH assigned_roles AS (
      SELECT ur.role::text AS role_key
      FROM public.user_roles ur
      WHERE ur.user_id = v_actor
      UNION
      SELECT ura.role_key
      FROM public.user_role_assignments ura
      WHERE ura.user_id = v_actor
    ),
    effective_limits AS (
      SELECT DISTINCT ON (l.role_key) l.role_key, l.max_amount
      FROM public.finance_approval_limits l
      JOIN assigned_roles ar ON ar.role_key = l.role_key
      WHERE l.currency IN (v_entry.base_currency, '*')
        AND EXISTS (
          SELECT 1 FROM public.role_permissions rp
          WHERE rp.role_key = l.role_key AND rp.permission = 'finance.approve'
        )
      ORDER BY l.role_key, (l.currency = v_entry.base_currency) DESC
    )
    SELECT count(*)::integer, coalesce(bool_or(max_amount IS NULL), false), max(max_amount)
    INTO v_limit_count, v_has_unlimited_limit, v_max_amount
    FROM effective_limits;
    IF v_limit_count = 0 THEN
      RAISE EXCEPTION 'No approval limit is configured for your role and journal currency.';
    END IF;
    IF NOT v_has_unlimited_limit AND v_entry.base_total > v_max_amount THEN
      RAISE EXCEPTION 'Journal exceeds your configured approval limit.';
    END IF;
  END IF;

  UPDATE public.finance_journal_entries
  SET status = CASE WHEN _decision = 'approved' THEN 'posted' ELSE _decision END,
      review_note = nullif(btrim(coalesce(_note, '')), ''),
      reviewed_by = v_actor,
      reviewed_at = now(),
      posted_by = CASE WHEN _decision = 'approved' THEN v_actor ELSE NULL END,
      posted_at = CASE WHEN _decision = 'approved' THEN now() ELSE NULL END
  WHERE id = _journal_id
  RETURNING * INTO v_updated;

  SELECT email INTO v_email FROM public.profiles WHERE id = v_actor;
  INSERT INTO public.audit_logs (
    actor_id, actor_email, action, entity_type, entity_id, previous_value, new_value
  )
  VALUES (
    v_actor, v_email, 'finance.journal_' || _decision,
    'finance_journal_entries', v_updated.id::text,
    jsonb_build_object('status', v_entry.status),
    jsonb_build_object('status', v_updated.status, 'review_note', v_updated.review_note)
  );
  RETURN v_updated;
END;
$$;

CREATE OR REPLACE FUNCTION public.reverse_finance_journal(_journal_id uuid, _reason text)
RETURNS public.finance_journal_entries
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_original public.finance_journal_entries%ROWTYPE;
  v_reversal public.finance_journal_entries%ROWTYPE;
  v_lines jsonb;
  v_source_key text;
BEGIN
  IF NOT public.maintenance_access_allowed() THEN
    RAISE EXCEPTION 'Finance journal posting is unavailable during maintenance.';
  END IF;
  IF char_length(btrim(coalesce(_reason, ''))) < 3 THEN
    RAISE EXCEPTION 'Enter a reason for reversing this journal.';
  END IF;
  IF v_actor IS NULL OR NOT public.has_permission(v_actor, 'finance.create') THEN
    RAISE EXCEPTION 'Finance create permission is required to reverse a journal.';
  END IF;
  SELECT * INTO v_original
  FROM public.finance_journal_entries
  WHERE id = _journal_id
  FOR UPDATE;
  IF NOT FOUND OR v_original.status <> 'posted' OR v_original.source_type = 'reversal' THEN
    RAISE EXCEPTION 'This journal cannot be reversed.';
  END IF;
  SELECT * INTO v_reversal
  FROM public.finance_journal_entries
  WHERE source_type = 'reversal' AND source_id = _journal_id
  ORDER BY created_at DESC
  LIMIT 1
  FOR UPDATE;
  IF FOUND THEN
    IF v_reversal.status IN ('pending_approval', 'posted') THEN
      RETURN v_reversal;
    END IF;
    v_source_key := 'reversal:' || _journal_id::text || ':retry:' || v_reversal.id::text;
  ELSE
    v_source_key := 'reversal:' || _journal_id::text;
  END IF;

  SELECT jsonb_agg(jsonb_build_object(
    'account_id', account_id,
    'description', coalesce(description, _reason),
    'currency', currency,
    'debit', credit,
    'credit', debit,
    'exchange_rate', exchange_rate
  ) ORDER BY line_number)
  INTO v_lines
  FROM public.finance_journal_lines
  WHERE journal_id = _journal_id;

  v_reversal := public.create_finance_journal(
    current_date,
    'Reversal of ' || v_original.journal_ref || ': ' || btrim(_reason),
    v_lines,
    v_source_key,
    'reversal',
    _journal_id
  );
  RETURN v_reversal;
END;
$$;

CREATE OR REPLACE FUNCTION public.finance_account_balances()
RETURNS TABLE (
  account_id uuid,
  account_code text,
  account_name text,
  account_type text,
  base_currency text,
  total_debits numeric,
  total_credits numeric,
  balance numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.maintenance_access_allowed()
    OR NOT public.has_permission(auth.uid(), 'finance.view') THEN
    RAISE EXCEPTION 'Finance view permission is required.';
  END IF;

  RETURN QUERY
  SELECT
    a.id,
    a.account_code,
    a.name,
    a.account_type,
    s.base_currency,
    coalesce(sum(l.base_debit) FILTER (WHERE e.status = 'posted'), 0)::numeric,
    coalesce(sum(l.base_credit) FILTER (WHERE e.status = 'posted'), 0)::numeric,
    CASE
      WHEN a.account_type IN ('asset', 'expense')
        THEN (
          coalesce(sum(l.base_debit) FILTER (WHERE e.status = 'posted'), 0)
          - coalesce(sum(l.base_credit) FILTER (WHERE e.status = 'posted'), 0)
        )::numeric
      ELSE (
        coalesce(sum(l.base_credit) FILTER (WHERE e.status = 'posted'), 0)
        - coalesce(sum(l.base_debit) FILTER (WHERE e.status = 'posted'), 0)
      )::numeric
    END
  FROM public.finance_accounts a
  CROSS JOIN public.finance_settings s
  LEFT JOIN public.finance_journal_lines l ON l.account_id = a.id
  LEFT JOIN public.finance_journal_entries e
    ON e.id = l.journal_id AND e.status = 'posted'
  WHERE s.singleton = true
  GROUP BY a.id, a.account_code, a.name, a.account_type, s.base_currency
  ORDER BY a.account_code;
END;
$$;

CREATE OR REPLACE FUNCTION public.finance_overview_totals(_from date DEFAULT NULL, _to date DEFAULT NULL)
RETURNS TABLE (
  metric text,
  currency text,
  amount numeric,
  record_count bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.maintenance_access_allowed()
    OR NOT public.has_permission(auth.uid(), 'finance.view') THEN
    RAISE EXCEPTION 'Finance view permission is required.';
  END IF;

  RETURN QUERY
  SELECT 'collected_volume'::text, t.currency, sum(t.amount)::numeric, count(*)::bigint
  FROM public.transactions t
  WHERE t.status = 'cleared'
    AND t.archived_at IS NULL
    AND (_from IS NULL OR t.occurred_on >= _from)
    AND (_to IS NULL OR t.occurred_on <= _to)
  GROUP BY t.currency
  UNION ALL
  SELECT 'open_invoice_value'::text, i.currency, sum(i.amount)::numeric, count(*)::bigint
  FROM public.invoices i
  WHERE i.status IN ('pending', 'overdue')
    AND i.archived_at IS NULL
    AND (_from IS NULL OR coalesce(i.due_date, i.created_at::date) >= _from)
    AND (_to IS NULL OR coalesce(i.due_date, i.created_at::date) <= _to)
  GROUP BY i.currency
  UNION ALL
  SELECT 'recorded_commissions'::text, c.currency, sum(c.amount)::numeric, count(*)::bigint
  FROM public.commissions c
  WHERE c.status <> 'archived'
    AND c.archived_at IS NULL
    AND (_from IS NULL OR c.created_at::date >= _from)
    AND (_to IS NULL OR c.created_at::date <= _to)
  GROUP BY c.currency
  UNION ALL
  SELECT 'awaiting_approval'::text, t.currency, sum(t.amount)::numeric, count(*)::bigint
  FROM public.transactions t
  WHERE t.approval_status = 'pending'
    AND t.archived_at IS NULL
    AND (_from IS NULL OR t.created_at::date >= _from)
    AND (_to IS NULL OR t.created_at::date <= _to)
  GROUP BY t.currency;
END;
$$;

REVOKE ALL ON FUNCTION public.review_finance_transaction(uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.resubmit_finance_transaction(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_finance_journal(date, text, jsonb, text, text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.review_finance_journal_entry(uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reverse_finance_journal(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.finance_account_balances() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.finance_overview_totals(date, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.review_finance_transaction(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.resubmit_finance_transaction(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_finance_journal(date, text, jsonb, text, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.review_finance_journal_entry(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reverse_finance_journal(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.finance_account_balances() TO authenticated;
GRANT EXECUTE ON FUNCTION public.finance_overview_totals(date, date) TO authenticated;
