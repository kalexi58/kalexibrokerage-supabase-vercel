CREATE SEQUENCE IF NOT EXISTS public.agent_app_seq;
CREATE SEQUENCE IF NOT EXISTS public.agent_code_seq;

CREATE TABLE public.agent_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  token text NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(18),'hex'),
  active boolean NOT NULL DEFAULT true,
  expires_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.agent_applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  application_ref text NOT NULL UNIQUE DEFAULT 'KBL-APP-'||lpad(nextval('public.agent_app_seq')::text,6,'0'),
  campaign_id uuid REFERENCES public.agent_campaigns(id),
  full_name text NOT NULL, phone text NOT NULL, email text NOT NULL,
  date_of_birth date, gender text, nationality text, address text, district text, occupation text,
  id_type text NOT NULL, id_number text NOT NULL,
  photo_path text, id_front_path text, id_back_path text,
  payment_method text NOT NULL, payment_provider text, payment_account_name text, payment_account_number text,
  declarations jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'pending',
  review_note text, reviewed_by uuid, reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.agents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_code text NOT NULL UNIQUE DEFAULT 'KBL-AG-'||lpad(nextval('public.agent_code_seq')::text,6,'0'),
  application_id uuid UNIQUE REFERENCES public.agent_applications(id),
  full_name text NOT NULL, phone text NOT NULL, email text NOT NULL,
  district text, photo_path text,
  referral_code text NOT NULL UNIQUE DEFAULT upper(encode(gen_random_bytes(4),'hex')),
  verification_token text NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(16),'hex'),
  commission_rate numeric NOT NULL DEFAULT 0.9,
  status text NOT NULL DEFAULT 'active',
  issued_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT now() + interval '1 year',
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.agent_campaigns, public.agent_applications, public.agents TO authenticated;
GRANT ALL ON public.agent_campaigns, public.agent_applications, public.agents TO service_role;
ALTER TABLE public.agent_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "agents staff read" ON public.agent_campaigns FOR SELECT TO authenticated USING (public.has_permission(auth.uid(),'agents.view'));
CREATE POLICY "agents staff write" ON public.agent_campaigns FOR INSERT TO authenticated WITH CHECK (public.has_permission(auth.uid(),'agents.manage'));
CREATE POLICY "agents staff update" ON public.agent_campaigns FOR UPDATE TO authenticated USING (public.has_permission(auth.uid(),'agents.manage'));
CREATE POLICY "apps staff read" ON public.agent_applications FOR SELECT TO authenticated USING (public.has_permission(auth.uid(),'agents.view'));
CREATE POLICY "apps staff update" ON public.agent_applications FOR UPDATE TO authenticated USING (public.has_permission(auth.uid(),'agents.manage'));
CREATE POLICY "agent staff read" ON public.agents FOR SELECT TO authenticated USING (public.has_permission(auth.uid(),'agents.view'));
CREATE POLICY "agent staff insert" ON public.agents FOR INSERT TO authenticated WITH CHECK (public.has_permission(auth.uid(),'agents.manage'));
CREATE POLICY "agent staff update" ON public.agents FOR UPDATE TO authenticated USING (public.has_permission(auth.uid(),'agents.manage'));

CREATE TRIGGER agent_campaigns_touch BEFORE UPDATE ON public.agent_campaigns FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER agent_applications_touch BEFORE UPDATE ON public.agent_applications FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER agents_touch BEFORE UPDATE ON public.agents FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();