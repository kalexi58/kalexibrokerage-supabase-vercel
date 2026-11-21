SELECT setval(
  'public.agent_referral_seq',
  greatest(
    coalesce(
      (
        SELECT max(substring(referral_code FROM '^KBLR([0-9]+)$')::bigint)
        FROM public.agents
      ),
      0
    ),
    (SELECT last_value FROM public.agent_referral_seq)
  ),
  true
);

WITH duplicate_codes AS (
  SELECT upper(btrim(referral_code)) AS normalized_code
  FROM public.agents
  GROUP BY upper(btrim(referral_code))
  HAVING count(*) > 1
)
UPDATE public.agents AS agent
SET referral_code = 'KBLR' || lpad(nextval('public.agent_referral_seq')::text, 6, '0')
WHERE agent.referral_code IS NULL
   OR btrim(agent.referral_code) = ''
   OR upper(btrim(agent.referral_code)) IN (SELECT normalized_code FROM duplicate_codes);

ALTER TABLE public.agents
  ALTER COLUMN referral_code SET DEFAULT (
    'KBLR' || lpad(nextval('public.agent_referral_seq')::text, 6, '0')
  ),
  ALTER COLUMN referral_code SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS agents_referral_code_key
  ON public.agents (referral_code);
