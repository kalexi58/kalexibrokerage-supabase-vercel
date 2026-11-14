CREATE OR REPLACE FUNCTION public.validate_receipt_transaction()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_transaction_status text;
  v_transaction_amount numeric;
  v_transaction_currency text;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.transaction_id IS DISTINCT FROM OLD.transaction_id
      OR NEW.amount IS DISTINCT FROM OLD.amount
      OR NEW.currency IS DISTINCT FROM OLD.currency
      OR NEW.status IS DISTINCT FROM OLD.status THEN
      RAISE EXCEPTION 'Issued receipt payment details cannot be changed.';
    END IF;
    RETURN NEW;
  END IF;

  SELECT status, amount, currency
  INTO v_transaction_status, v_transaction_amount, v_transaction_currency
  FROM public.transactions
  WHERE id = NEW.transaction_id
    AND archived_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Receipt transaction was not found or is archived.';
  END IF;

  IF v_transaction_status <> 'cleared' THEN
    RAISE EXCEPTION 'A receipt can only be issued for a cleared transaction.';
  END IF;

  IF NEW.status <> 'issued' THEN
    RAISE EXCEPTION 'New receipts must be issued in the issued state.';
  END IF;

  IF NEW.amount IS DISTINCT FROM v_transaction_amount
    OR NEW.currency IS DISTINCT FROM v_transaction_currency THEN
    RAISE EXCEPTION 'Receipt amount and currency must match the cleared transaction.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.receipts
    WHERE transaction_id = NEW.transaction_id
  ) THEN
    RAISE EXCEPTION 'A receipt already exists for this transaction.';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.validate_receipt_transaction() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER receipts_validate_transaction
BEFORE INSERT OR UPDATE ON public.receipts
FOR EACH ROW
EXECUTE FUNCTION public.validate_receipt_transaction();
