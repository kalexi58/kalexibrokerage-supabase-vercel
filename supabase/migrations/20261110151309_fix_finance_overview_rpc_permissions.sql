-- Allow authenticated users to execute the Finance overview RPC.
-- The function itself still checks finance.view permission.
GRANT EXECUTE ON FUNCTION public.finance_overview_totals(date, date) TO authenticated;

-- Keep anonymous users from executing this finance function.
REVOKE EXECUTE ON FUNCTION public.finance_overview_totals(date, date) FROM anon;
