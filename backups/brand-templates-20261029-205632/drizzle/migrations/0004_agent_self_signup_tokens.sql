ALTER TABLE public.agent_applications ADD COLUMN IF NOT EXISTS user_id uuid UNIQUE;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS referral_code text;

CREATE TABLE public.agent_redemptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id uuid NOT NULL REFERENCES public.agents(id),
  tokens_used integer NOT NULL,
  amount numeric NOT NULL DEFAULT 100000,
  currency text NOT NULL DEFAULT 'UGX',
  status text NOT NULL DEFAULT 'requested',
  processed_by uuid,
  processed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, UPDATE ON public.agent_redemptions TO authenticated;
GRANT ALL ON public.agent_redemptions TO service_role;
ALTER TABLE public.agent_redemptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "redemptions staff read" ON public.agent_redemptions FOR SELECT TO authenticated USING (public.has_permission(auth.uid(),'agents.view'));
CREATE POLICY "redemptions staff update" ON public.agent_redemptions FOR UPDATE TO authenticated USING (public.has_permission(auth.uid(),'agents.manage'));

CREATE OR REPLACE FUNCTION public.is_active_staff(_user_id uuid)
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = _user_id AND status = 'active')
     AND NOT EXISTS (SELECT 1 FROM public.agents WHERE user_id = _user_id)
     AND NOT EXISTS (SELECT 1 FROM public.agent_applications WHERE user_id = _user_id);
$$;