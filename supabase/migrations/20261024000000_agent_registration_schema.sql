CREATE SEQUENCE IF NOT EXISTS public.agent_application_ref_seq;
CREATE SEQUENCE IF NOT EXISTS public.agent_code_seq;
CREATE SEQUENCE IF NOT EXISTS public.agent_referral_seq;

CREATE TABLE IF NOT EXISTS public.agent_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  token text NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(24), 'hex'),
  active boolean NOT NULL DEFAULT true,
  expires_at timestamptz,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.agent_registry (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reg_id text NOT NULL UNIQUE,
  full_name text NOT NULL,
  phone text,
  village text,
  district text,
  registered_on date,
  received_by text,
  signature_path text,
  linked_application_id uuid,
  status text NOT NULL DEFAULT 'registered',
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.agent_applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  application_ref text NOT NULL UNIQUE DEFAULT (
    'KBL-AG-APP-' || lpad(nextval('public.agent_application_ref_seq')::text, 6, '0')
  ),
  campaign_id uuid REFERENCES public.agent_campaigns(id) ON DELETE SET NULL,
  full_name text NOT NULL,
  phone text NOT NULL,
  email text NOT NULL,
  date_of_birth date,
  gender text,
  nationality text,
  address text,
  district text,
  village text,
  occupation text,
  id_type text NOT NULL,
  id_number text NOT NULL,
  photo_path text,
  id_front_path text,
  id_back_path text,
  payment_method text NOT NULL,
  payment_provider text,
  payment_account_name text,
  payment_account_number text,
  declarations jsonb NOT NULL DEFAULT '{}'::jsonb,
  registry_id uuid REFERENCES public.agent_registry(id) ON DELETE SET NULL,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'pending',
  review_note text,
  reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS agent_applications_active_id_number_idx
  ON public.agent_applications (lower(id_number))
  WHERE status IN ('pending', 'approved');

CREATE TABLE IF NOT EXISTS public.agents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_code text NOT NULL UNIQUE DEFAULT (
    'KBL-AG-' || lpad(nextval('public.agent_code_seq')::text, 6, '0')
  ),
  application_id uuid UNIQUE REFERENCES public.agent_applications(id) ON DELETE SET NULL,
  registry_id uuid REFERENCES public.agent_registry(id) ON DELETE SET NULL,
  full_name text NOT NULL,
  phone text NOT NULL,
  email text NOT NULL,
  company_phone text,
  district text,
  village text,
  designation text NOT NULL DEFAULT 'Digital Agent',
  commission_rate numeric NOT NULL DEFAULT 5,
  referral_code text NOT NULL UNIQUE DEFAULT (
    'KBLR' || lpad(nextval('public.agent_referral_seq')::text, 6, '0')
  ),
  verification_token text NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(24), 'hex'),
  photo_path text,
  signature_path text,
  issued_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '1 year'),
  status text NOT NULL DEFAULT 'active',
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.agent_registry
  ADD CONSTRAINT agent_registry_linked_application_id_fkey
  FOREIGN KEY (linked_application_id)
  REFERENCES public.agent_applications(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS public.agent_redemptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id uuid NOT NULL REFERENCES public.agents(id) ON DELETE CASCADE,
  tokens_used integer NOT NULL,
  amount numeric NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'UGX',
  status text NOT NULL DEFAULT 'pending',
  processed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  processed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.agent_notices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  body text NOT NULL,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.agent_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  body text NOT NULL DEFAULT '',
  attachments jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.brand_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  kind text NOT NULL DEFAULT 'letter',
  heading text,
  body text,
  doc_date date,
  signatory_name text,
  signatory_title text,
  signature_path text,
  accent text NOT NULL DEFAULT 'gold',
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.user_roles (user_id, role)
SELECT id, 'super_admin'::public.app_role
FROM auth.users
WHERE lower(email) = 'kalemireabdul09@gmail.com'
ON CONFLICT (user_id, role) DO NOTHING;

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS agent_id uuid REFERENCES public.agents(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS referral_code text;

CREATE INDEX IF NOT EXISTS clients_agent_id_idx ON public.clients (agent_id);
CREATE INDEX IF NOT EXISTS agent_applications_status_created_idx
  ON public.agent_applications (status, created_at DESC);
CREATE INDEX IF NOT EXISTS agent_messages_owner_created_idx
  ON public.agent_messages (owner_user_id, created_at);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.agent_campaigns TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.agent_registry TO authenticated;
GRANT SELECT, UPDATE ON public.agent_applications TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.agents TO authenticated;
GRANT SELECT, UPDATE ON public.agent_redemptions TO authenticated;
GRANT SELECT, INSERT ON public.agent_notices TO authenticated;
GRANT SELECT, INSERT ON public.agent_messages TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.brand_templates TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.client_ref_seq TO authenticated;
GRANT ALL ON public.agent_campaigns, public.agent_registry, public.agent_applications,
  public.agents, public.agent_redemptions, public.agent_notices, public.agent_messages,
  public.brand_templates TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.agent_application_ref_seq,
  public.agent_code_seq, public.agent_referral_seq TO service_role;

ALTER TABLE public.agent_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_registry ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_redemptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_notices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.brand_templates ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  v_table_name text;
BEGIN
  FOREACH v_table_name IN ARRAY ARRAY[
    'agent_campaigns', 'agent_registry', 'agent_applications', 'agents',
    'agent_redemptions', 'agent_notices', 'agent_messages', 'brand_templates'
  ]
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = v_table_name
        AND policyname = 'maintenance_access_gate'
    ) THEN
      EXECUTE format(
        'CREATE POLICY maintenance_access_gate ON public.%I AS RESTRICTIVE FOR ALL TO anon, authenticated USING (public.maintenance_access_allowed()) WITH CHECK (public.maintenance_access_allowed())',
        v_table_name
      );
    END IF;
  END LOOP;
END $$;

CREATE POLICY agent_campaigns_view ON public.agent_campaigns
  FOR SELECT TO authenticated USING (public.has_permission(auth.uid(), 'agents.view'));
CREATE POLICY agent_campaigns_manage ON public.agent_campaigns
  FOR ALL TO authenticated
  USING (public.has_permission(auth.uid(), 'agents.manage'))
  WITH CHECK (public.has_permission(auth.uid(), 'agents.manage'));

CREATE POLICY agent_registry_view ON public.agent_registry
  FOR SELECT TO authenticated USING (public.has_permission(auth.uid(), 'agents.view'));
CREATE POLICY agent_registry_manage ON public.agent_registry
  FOR ALL TO authenticated
  USING (public.has_permission(auth.uid(), 'agents.manage'))
  WITH CHECK (public.has_permission(auth.uid(), 'agents.manage'));

CREATE POLICY agent_applications_view ON public.agent_applications
  FOR SELECT TO authenticated USING (public.has_permission(auth.uid(), 'agents.view'));
CREATE POLICY agent_applications_owner_view ON public.agent_applications
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY agent_applications_manage ON public.agent_applications
  FOR UPDATE TO authenticated
  USING (public.has_permission(auth.uid(), 'agents.manage'))
  WITH CHECK (public.has_permission(auth.uid(), 'agents.manage'));

CREATE POLICY agents_view ON public.agents
  FOR SELECT TO authenticated USING (public.has_permission(auth.uid(), 'agents.view'));
CREATE POLICY agents_owner_view ON public.agents
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY agents_manage ON public.agents
  FOR ALL TO authenticated
  USING (public.has_permission(auth.uid(), 'agents.manage'))
  WITH CHECK (public.has_permission(auth.uid(), 'agents.manage'));

CREATE POLICY agent_redemptions_view ON public.agent_redemptions
  FOR SELECT TO authenticated USING (public.has_permission(auth.uid(), 'agents.view'));
CREATE POLICY agent_redemptions_manage ON public.agent_redemptions
  FOR UPDATE TO authenticated
  USING (public.has_permission(auth.uid(), 'agents.manage'))
  WITH CHECK (public.has_permission(auth.uid(), 'agents.manage'));

CREATE POLICY agent_notices_view ON public.agent_notices
  FOR SELECT TO authenticated USING (public.has_permission(auth.uid(), 'agents.view'));
CREATE POLICY agent_notices_manage ON public.agent_notices
  FOR INSERT TO authenticated
  WITH CHECK (
    public.has_permission(auth.uid(), 'agents.manage')
    AND (created_by IS NULL OR created_by = auth.uid())
  );

CREATE POLICY agent_messages_view ON public.agent_messages
  FOR SELECT TO authenticated
  USING (
    owner_user_id = auth.uid()
    OR public.has_permission(auth.uid(), 'agents.view')
  );
CREATE POLICY agent_messages_send ON public.agent_messages
  FOR INSERT TO authenticated
  WITH CHECK (
    sender_id = auth.uid()
    AND (
      owner_user_id = auth.uid()
      OR public.has_permission(auth.uid(), 'agents.manage')
    )
  );

CREATE POLICY brand_templates_staff_read ON public.brand_templates
  FOR SELECT TO authenticated USING (public.is_active_staff(auth.uid()));
CREATE POLICY brand_templates_staff_write ON public.brand_templates
  FOR ALL TO authenticated
  USING (public.is_active_staff(auth.uid()))
  WITH CHECK (public.is_active_staff(auth.uid()));

CREATE POLICY "Agent registry signature uploads" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'kalexi-vault'
    AND (storage.foldername(name))[1] = 'agent-registry'
    AND public.has_permission(auth.uid(), 'agents.manage')
  );

DO $$
DECLARE
  target record;
BEGIN
  FOR target IN
    SELECT unnest(ARRAY[
      'agent_campaigns', 'agent_registry', 'agent_applications', 'agents', 'brand_templates'
    ]) AS table_name
  LOOP
    EXECUTE format(
      'CREATE TRIGGER %I BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at()',
      target.table_name || '_touch',
      target.table_name
    );
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';
''