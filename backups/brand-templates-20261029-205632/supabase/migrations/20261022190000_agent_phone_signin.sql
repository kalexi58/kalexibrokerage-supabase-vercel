CREATE INDEX IF NOT EXISTS profiles_active_phone_digits_idx
  ON public.profiles (regexp_replace(coalesce(phone, ''), '[^0-9]', '', 'g'))
  WHERE status = 'active';

CREATE OR REPLACE FUNCTION public.login_identity(_email text)
RETURNS TABLE (full_name text, job_title text, department text, photo_url text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p.full_name, p.job_title, p.department, p.photo_url
  FROM public.profiles p
  WHERE p.status = 'active'
    AND (
      (position('@' IN trim(_email)) > 0 AND lower(p.email) = lower(trim(_email)))
      OR (
        position('@' IN trim(_email)) = 0
        AND length(regexp_replace(coalesce(_email, ''), '[^0-9]', '', 'g')) BETWEEN 7 AND 20
        AND regexp_replace(coalesce(p.phone, ''), '[^0-9]', '', 'g')
          = regexp_replace(coalesce(_email, ''), '[^0-9]', '', 'g')
        AND 1 = (
          SELECT count(*)
          FROM public.profiles matching
          WHERE matching.status = 'active'
            AND regexp_replace(coalesce(matching.phone, ''), '[^0-9]', '', 'g')
              = regexp_replace(coalesce(_email, ''), '[^0-9]', '', 'g')
        )
      )
    )
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.login_email_by_phone(_phone text)
RETURNS TABLE (email text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p.email
  FROM public.profiles p
  WHERE p.status = 'active'
    AND length(regexp_replace(coalesce(_phone, ''), '[^0-9]', '', 'g')) BETWEEN 7 AND 20
    AND regexp_replace(coalesce(p.phone, ''), '[^0-9]', '', 'g')
      = regexp_replace(coalesce(_phone, ''), '[^0-9]', '', 'g')
    AND 1 = (
      SELECT count(*)
      FROM public.profiles matching
      WHERE matching.status = 'active'
        AND regexp_replace(coalesce(matching.phone, ''), '[^0-9]', '', 'g')
          = regexp_replace(coalesce(_phone, ''), '[^0-9]', '', 'g')
    )
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.login_identity(text) FROM public;
GRANT EXECUTE ON FUNCTION public.login_identity(text) TO anon, authenticated;
REVOKE ALL ON FUNCTION public.login_email_by_phone(text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.login_email_by_phone(text) TO service_role;
