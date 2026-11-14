-- Kalexi Brokerage: full schema. Paste into Supabase Dashboard > SQL Editor and run ONCE on an empty project.

-- ===== 20260810000000_create_storage_buckets.sql =====
-- Ensure these storage buckets exist explicitly, including when already provisioned.
INSERT INTO storage.buckets (id, name, public)
VALUES ('kalexi-vault', 'kalexi-vault', false),
       ('kalexi-avatars', 'kalexi-avatars', false)
ON CONFLICT (id) DO NOTHING;

-- ===== 20260810183553_0adf00fa-e8a8-42a4-856b-276772fac36f.sql =====
-- ROLES
CREATE TYPE public.app_role AS ENUM (
  'super_admin','receptionist','onboarding_officer','deals_manager',
  'verification_officer','risk_officer','finance_officer','management','auditor'
);

CREATE TYPE public.account_status AS ENUM ('active','disabled','pending');

-- PROFILES
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL UNIQUE,
  full_name text NOT NULL DEFAULT '',
  phone text,
  department text,
  job_title text,
  photo_url text,
  status public.account_status NOT NULL DEFAULT 'active',
  must_change_password boolean NOT NULL DEFAULT false,
  last_login_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- USER ROLES
CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role);
$$;

CREATE OR REPLACE FUNCTION public.is_active_staff(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = _user_id AND status = 'active');
$$;

-- PROFILE POLICIES
CREATE POLICY "Staff can view profiles" ON public.profiles FOR SELECT TO authenticated
  USING (public.is_active_staff(auth.uid()) OR id = auth.uid());
CREATE POLICY "Super admin can insert profiles" ON public.profiles FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(),'super_admin'));
CREATE POLICY "Update own profile" ON public.profiles FOR UPDATE TO authenticated
  USING (id = auth.uid()) WITH CHECK (id = auth.uid());
CREATE POLICY "Super admin can update profiles" ON public.profiles FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'super_admin')) WITH CHECK (public.has_role(auth.uid(),'super_admin'));

-- ROLE POLICIES
CREATE POLICY "Staff can view roles" ON public.user_roles FOR SELECT TO authenticated
  USING (public.is_active_staff(auth.uid()) OR user_id = auth.uid());

-- CLIENTS
CREATE SEQUENCE public.client_ref_seq START 1;

CREATE TABLE public.clients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_ref text NOT NULL UNIQUE DEFAULT ('KBL-CLI-' || lpad(nextval('public.client_ref_seq')::text, 6, '0')),
  full_name text NOT NULL,
  phone text NOT NULL,
  email text,
  company_name text,
  client_type text NOT NULL,
  sector text NOT NULL,
  requirement text NOT NULL,
  branch text,
  status text NOT NULL DEFAULT 'registered',
  verification_ref text NOT NULL DEFAULT encode(gen_random_bytes(8),'hex'),
  registered_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.clients TO authenticated;
GRANT ALL ON public.clients TO service_role;
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Active staff can view clients" ON public.clients FOR SELECT TO authenticated
  USING (public.is_active_staff(auth.uid()));
CREATE POLICY "Active staff can register clients" ON public.clients FOR INSERT TO authenticated
  WITH CHECK (public.is_active_staff(auth.uid()) AND registered_by = auth.uid());
CREATE POLICY "Authorised staff can update clients" ON public.clients FOR UPDATE TO authenticated
  USING (
    public.is_active_staff(auth.uid()) AND NOT (
      public.has_role(auth.uid(),'receptionist')
      AND NOT public.has_role(auth.uid(),'super_admin')
    )
  )
  WITH CHECK (public.is_active_staff(auth.uid()));

CREATE INDEX clients_search_idx ON public.clients USING gin (
  to_tsvector('english', coalesce(full_name,'') || ' ' || coalesce(company_name,'') || ' ' || coalesce(phone,'') || ' ' || coalesce(requirement,''))
);

-- AUDIT LOG
CREATE TABLE public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid REFERENCES auth.users(id),
  actor_email text,
  action text NOT NULL,
  entity_type text,
  entity_id text,
  previous_value jsonb,
  new_value jsonb,
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.audit_logs TO authenticated;
GRANT ALL ON public.audit_logs TO service_role;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Oversight roles can read audit log" ON public.audit_logs FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(),'super_admin')
    OR public.has_role(auth.uid(),'auditor')
    OR public.has_role(auth.uid(),'management')
  );
CREATE POLICY "Active staff can append audit entries" ON public.audit_logs FOR INSERT TO authenticated
  WITH CHECK (public.is_active_staff(auth.uid()) AND actor_id = auth.uid());

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TRIGGER profiles_touch BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER clients_touch BEFORE UPDATE ON public.clients
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- New user bootstrap
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, department, job_title)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email,'@',1)),
    NEW.raw_user_meta_data->>'department',
    NEW.raw_user_meta_data->>'job_title'
  )
  ON CONFLICT (id) DO NOTHING;

  IF lower(NEW.email) = 'kalemireabdul09@gmail.com' THEN
    UPDATE public.profiles
      SET full_name = 'Kalemire Abdulrahuman', job_title = 'Super Admin', department = 'Executive'
      WHERE id = NEW.id;
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'super_admin')
      ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END; $$;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

CREATE INDEX IF NOT EXISTS profiles_active_phone_digits_idx
  ON public.profiles (regexp_replace(coalesce(phone, ''), '[^0-9]', '', 'g'))
  WHERE status = 'active';

-- Safe login identity lookup (no sensitive data)
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
REVOKE ALL ON FUNCTION public.login_identity(text) FROM public;
GRANT EXECUTE ON FUNCTION public.login_identity(text) TO anon, authenticated;
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
REVOKE ALL ON FUNCTION public.login_email_by_phone(text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.login_email_by_phone(text) TO service_role;
-- ===== 20260810183607_27fb022b-9190-4fef-95ab-401dd97e086e.sql =====
REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM anon, authenticated, public;
REVOKE ALL ON FUNCTION public.is_active_staff(uuid) FROM anon, authenticated, public;
REVOKE ALL ON FUNCTION public.touch_updated_at() FROM anon, authenticated, public;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM anon, authenticated, public;
REVOKE ALL ON FUNCTION public.login_identity(text) FROM anon, authenticated, public;
GRANT EXECUTE ON FUNCTION public.login_identity(text) TO service_role;
-- ===== 20260811070002_342b9224-48fc-4f99-85d6-5813b0f1b401.sql =====

-- ============ ROLES & PERMISSIONS ============
CREATE TABLE public.roles (
  key text PRIMARY KEY,
  label text NOT NULL,
  description text,
  is_system boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.roles TO authenticated;
GRANT ALL ON public.roles TO service_role;
ALTER TABLE public.roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff can view roles catalogue" ON public.roles FOR SELECT TO authenticated USING (is_active_staff(auth.uid()));

CREATE TABLE public.role_permissions (
  role_key text NOT NULL REFERENCES public.roles(key) ON DELETE CASCADE,
  permission text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (role_key, permission)
);
GRANT SELECT ON public.role_permissions TO authenticated;
GRANT ALL ON public.role_permissions TO service_role;
ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff can view role permissions" ON public.role_permissions FOR SELECT TO authenticated USING (is_active_staff(auth.uid()));

CREATE TABLE public.user_role_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role_key text NOT NULL REFERENCES public.roles(key) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role_key)
);
GRANT SELECT ON public.user_role_assignments TO authenticated;
GRANT ALL ON public.user_role_assignments TO service_role;
ALTER TABLE public.user_role_assignments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff can view role assignments" ON public.user_role_assignments FOR SELECT TO authenticated USING (is_active_staff(auth.uid()) OR user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.has_permission(_user_id uuid, _perm text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = _user_id AND p.status = 'active')
    AND (
      EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = _user_id AND ur.role = 'super_admin')
      OR EXISTS (
        SELECT 1 FROM public.role_permissions rp
        WHERE rp.permission = _perm
          AND (
            rp.role_key IN (SELECT ur.role::text FROM public.user_roles ur WHERE ur.user_id = _user_id)
            OR rp.role_key IN (SELECT a.role_key FROM public.user_role_assignments a WHERE a.user_id = _user_id)
          )
      )
    );
$$;

CREATE OR REPLACE FUNCTION public.my_permissions()
RETURNS TABLE(permission text) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT DISTINCT rp.permission FROM public.role_permissions rp
  WHERE rp.role_key IN (SELECT ur.role::text FROM public.user_roles ur WHERE ur.user_id = auth.uid())
     OR rp.role_key IN (SELECT a.role_key FROM public.user_role_assignments a WHERE a.user_id = auth.uid());
$$;

INSERT INTO public.roles(key,label,description,is_system) VALUES
 ('super_admin','Super Admin','Unrestricted administrative authority',true),
 ('receptionist','Receptionist','Front desk client registration',true),
 ('onboarding_officer','Client Onboarding Officer','Completes client profiles and KYC intake',true),
 ('deals_manager','Deals Manager','Owns opportunities, matching and deals',true),
 ('verification_officer','Verification Officer','Verification and due diligence',true),
 ('risk_officer','Risk Officer','Risk cases and investigations',true),
 ('finance_officer','Finance Officer','Transactions, receipts and commission',true),
 ('management','Management','Company-wide oversight',true),
 ('auditor','Auditor','Read-only assurance access',true);

INSERT INTO public.role_permissions(role_key, permission)
SELECT 'receptionist', p FROM unnest(ARRAY['clients.view','clients.create']) p
UNION ALL SELECT 'onboarding_officer', p FROM unnest(ARRAY['clients.view','clients.create','clients.edit','requirements.view','requirements.create','requirements.edit','documents.view','documents.create','documents.download','forms.view','forms.create']) p
UNION ALL SELECT 'deals_manager', p FROM unnest(ARRAY['clients.view','requirements.view','opportunities.view','opportunities.create','opportunities.edit','opportunities.archive','opportunities.export','deals.view','deals.create','deals.edit','deals.close','deals.archive','deals.export','documents.view','documents.create','documents.download','tasks.view','tasks.create','tasks.edit']) p
UNION ALL SELECT 'verification_officer', p FROM unnest(ARRAY['clients.view','opportunities.view','verification.view','verification.create','verification.edit','verification.close','documents.view','documents.create','documents.download']) p
UNION ALL SELECT 'risk_officer', p FROM unnest(ARRAY['clients.view','risk.view','risk.create','risk.edit','risk.close','risk.export','research.view','research.create','research.edit','documents.view','documents.download']) p
UNION ALL SELECT 'finance_officer', p FROM unnest(ARRAY['clients.view','deals.view','finance.view','finance.create','finance.edit','finance.export','documents.view','documents.download']) p
UNION ALL SELECT 'management', p FROM unnest(ARRAY['clients.view','clients.export','requirements.view','opportunities.view','opportunities.export','deals.view','deals.export','verification.view','risk.view','research.view','documents.view','documents.download','finance.view','finance.export','tasks.view','objectives.view','objectives.create','objectives.edit','objectives.archive','objectives.export','archive.view','archive.restore','audit.view','forms.view']) p
UNION ALL SELECT 'auditor', p FROM unnest(ARRAY['clients.view','requirements.view','opportunities.view','deals.view','verification.view','risk.view','research.view','documents.view','finance.view','objectives.view','archive.view','audit.view','forms.view','tasks.view']) p;

-- ============ SEQUENCES ============
CREATE SEQUENCE public.opp_ref_seq;  CREATE SEQUENCE public.req_ref_seq;
CREATE SEQUENCE public.deal_ref_seq; CREATE SEQUENCE public.risk_ref_seq;
CREATE SEQUENCE public.inv_ref_seq;  CREATE SEQUENCE public.res_ref_seq;
CREATE SEQUENCE public.doc_ref_seq;  CREATE SEQUENCE public.txn_ref_seq;
CREATE SEQUENCE public.rcp_ref_seq;  CREATE SEQUENCE public.obj_ref_seq;
CREATE SEQUENCE public.inq_ref_seq;  CREATE SEQUENCE public.ver_ref_seq;
CREATE SEQUENCE public.cmp_ref_seq;  CREATE SEQUENCE public.frm_ref_seq;
CREATE SEQUENCE public.prj_ref_seq;  CREATE SEQUENCE public.med_ref_seq;

-- ============ CLIENT DOMAIN ============
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS address text,
  ADD COLUMN IF NOT EXISTS id_type text,
  ADD COLUMN IF NOT EXISTS id_number text,
  ADD COLUMN IF NOT EXISTS legal_name text,
  ADD COLUMN IF NOT EXISTS kyc_status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS kyc_details jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS archived_at timestamptz,
  ADD COLUMN IF NOT EXISTS archived_by uuid,
  ADD COLUMN IF NOT EXISTS archive_reason text;

CREATE TABLE public.companies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_ref text NOT NULL DEFAULT ('KBL-CMP-'||lpad(nextval('cmp_ref_seq')::text,6,'0')),
  client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  name text NOT NULL,
  registration_number text,
  country text,
  address text,
  directors jsonb NOT NULL DEFAULT '[]'::jsonb,
  representatives jsonb NOT NULL DEFAULT '[]'::jsonb,
  beneficial_owners jsonb NOT NULL DEFAULT '[]'::jsonb,
  notes text,
  status text NOT NULL DEFAULT 'active',
  archived_at timestamptz, archived_by uuid, archive_reason text,
  created_by uuid, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid REFERENCES public.clients(id) ON DELETE CASCADE,
  company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE,
  full_name text NOT NULL, role text, phone text, email text, notes text,
  status text NOT NULL DEFAULT 'active',
  archived_at timestamptz, archived_by uuid, archive_reason text,
  created_by uuid, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.communications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid REFERENCES public.clients(id) ON DELETE CASCADE,
  deal_id uuid,
  channel text NOT NULL DEFAULT 'note',
  subject text, body text NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'logged',
  archived_at timestamptz, archived_by uuid, archive_reason text,
  created_by uuid, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.client_requirements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requirement_ref text NOT NULL DEFAULT ('KBL-REQ-'||lpad(nextval('req_ref_seq')::text,6,'0')),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  sector text NOT NULL,
  title text NOT NULL,
  description text,
  budget_min numeric, budget_max numeric, currency text NOT NULL DEFAULT 'USD',
  location text, quantity text, specifications text,
  deadline date, priority text NOT NULL DEFAULT 'normal',
  status text NOT NULL DEFAULT 'open',
  archived_at timestamptz, archived_by uuid, archive_reason text,
  created_by uuid, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);

-- ============ OPPORTUNITIES ============
CREATE TABLE public.opportunities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  opportunity_ref text NOT NULL DEFAULT ('KBL-OPP-'||lpad(nextval('opp_ref_seq')::text,6,'0')),
  sector text NOT NULL,
  opportunity_type text NOT NULL,
  title text NOT NULL,
  description text,
  owner_name text, owner_contact text, source text,
  location text,
  price numeric, currency text NOT NULL DEFAULT 'USD',
  quantity text, availability text, requirements text,
  sector_details jsonb NOT NULL DEFAULT '{}'::jsonb,
  verification_status text NOT NULL DEFAULT 'unverified',
  assigned_to uuid,
  status text NOT NULL DEFAULT 'new',
  notes text,
  archived_at timestamptz, archived_by uuid, archive_reason text,
  created_by uuid, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.opportunity_matches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requirement_id uuid NOT NULL REFERENCES public.client_requirements(id) ON DELETE CASCADE,
  opportunity_id uuid NOT NULL REFERENCES public.opportunities(id) ON DELETE CASCADE,
  score integer NOT NULL DEFAULT 0,
  reasons jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'suggested',
  reviewed_by uuid, reviewed_at timestamptz,
  archived_at timestamptz, archived_by uuid, archive_reason text,
  created_by uuid, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (requirement_id, opportunity_id)
);

-- ============ DEALS ============
CREATE TABLE public.deals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_ref text NOT NULL DEFAULT ('KBL-DEAL-'||lpad(nextval('deal_ref_seq')::text,6,'0')),
  title text NOT NULL,
  sector text NOT NULL,
  client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  opportunity_id uuid REFERENCES public.opportunities(id) ON DELETE SET NULL,
  requirement_id uuid REFERENCES public.client_requirements(id) ON DELETE SET NULL,
  stage text NOT NULL DEFAULT 'source',
  status text NOT NULL DEFAULT 'active',
  value numeric, currency text NOT NULL DEFAULT 'USD',
  commission_rate numeric,
  expected_close date, closed_at timestamptz, close_outcome text,
  assigned_to uuid, notes text,
  archived_at timestamptz, archived_by uuid, archive_reason text,
  created_by uuid, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.deal_parties (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id uuid NOT NULL REFERENCES public.deals(id) ON DELETE CASCADE,
  party_role text NOT NULL,
  client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  company_id uuid REFERENCES public.companies(id) ON DELETE SET NULL,
  name text NOT NULL, contact text, notes text,
  status text NOT NULL DEFAULT 'active',
  archived_at timestamptz, archived_by uuid, archive_reason text,
  created_by uuid, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.offers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id uuid NOT NULL REFERENCES public.deals(id) ON DELETE CASCADE,
  offered_by text NOT NULL, amount numeric NOT NULL, currency text NOT NULL DEFAULT 'USD',
  terms text, status text NOT NULL DEFAULT 'submitted',
  offered_at timestamptz NOT NULL DEFAULT now(),
  archived_at timestamptz, archived_by uuid, archive_reason text,
  created_by uuid, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.negotiations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id uuid NOT NULL REFERENCES public.deals(id) ON DELETE CASCADE,
  entry_type text NOT NULL DEFAULT 'note',
  summary text NOT NULL, detail text,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'logged',
  archived_at timestamptz, archived_by uuid, archive_reason text,
  created_by uuid, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL, detail text,
  deal_id uuid REFERENCES public.deals(id) ON DELETE CASCADE,
  client_id uuid REFERENCES public.clients(id) ON DELETE CASCADE,
  assigned_to uuid, due_date date,
  status text NOT NULL DEFAULT 'open',
  archived_at timestamptz, archived_by uuid, archive_reason text,
  created_by uuid, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);

-- ============ VERIFICATION / RISK / RESEARCH ============
CREATE TABLE public.verifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_ref text NOT NULL DEFAULT ('KBL-VER-'||lpad(nextval('ver_ref_seq')::text,6,'0')),
  case_kind text NOT NULL DEFAULT 'verification',
  subject text NOT NULL, sector text,
  client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  deal_id uuid REFERENCES public.deals(id) ON DELETE SET NULL,
  opportunity_id uuid REFERENCES public.opportunities(id) ON DELETE SET NULL,
  summary text, findings text,
  status text NOT NULL DEFAULT 'open',
  officer_id uuid, decided_at timestamptz,
  archived_at timestamptz, archived_by uuid, archive_reason text,
  created_by uuid, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.verification_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  verification_id uuid NOT NULL REFERENCES public.verifications(id) ON DELETE CASCADE,
  label text NOT NULL, requirement_note text,
  state text NOT NULL DEFAULT 'pending', comment text,
  status text NOT NULL DEFAULT 'active',
  archived_at timestamptz, archived_by uuid, archive_reason text,
  created_by uuid, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.risk_cases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_ref text NOT NULL,
  case_kind text NOT NULL DEFAULT 'risk',
  subject_name text NOT NULL, subject_company text,
  subject_phone text, subject_email text, subject_identifier text,
  client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  deal_id uuid REFERENCES public.deals(id) ON DELETE SET NULL,
  source text, description text NOT NULL,
  allegation text, verified_finding text, resolution text,
  severity text NOT NULL DEFAULT 'medium',
  status text NOT NULL DEFAULT 'reported',
  investigator_id uuid, closed_at timestamptz,
  archived_at timestamptz, archived_by uuid, archive_reason text,
  created_by uuid, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.research_cases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_ref text NOT NULL DEFAULT ('KBL-RES-'||lpad(nextval('res_ref_seq')::text,6,'0')),
  subject text NOT NULL, research_question text,
  keywords text[] NOT NULL DEFAULT '{}',
  related_party text,
  client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  deal_id uuid REFERENCES public.deals(id) ON DELETE SET NULL,
  sources jsonb NOT NULL DEFAULT '[]'::jsonb,
  findings text, notes text,
  researcher_id uuid,
  status text NOT NULL DEFAULT 'open',
  archived_at timestamptz, archived_by uuid, archive_reason text,
  created_by uuid, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);

-- ============ DOCUMENTS & MEDIA ============
CREATE TABLE public.documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_ref text NOT NULL DEFAULT ('KBL-DOC-'||lpad(nextval('doc_ref_seq')::text,6,'0')),
  title text NOT NULL, document_type text NOT NULL DEFAULT 'other',
  storage_path text NOT NULL, mime_type text, size_bytes bigint,
  parent_type text NOT NULL, parent_id uuid NOT NULL,
  verification_status text NOT NULL DEFAULT 'unverified',
  confidential boolean NOT NULL DEFAULT false,
  version integer NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'active',
  archived_at timestamptz, archived_by uuid, archive_reason text,
  created_by uuid, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.document_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  version integer NOT NULL, storage_path text NOT NULL,
  note text, status text NOT NULL DEFAULT 'active',
  archived_at timestamptz, archived_by uuid, archive_reason text,
  created_by uuid, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.media (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  media_ref text NOT NULL DEFAULT ('KBL-MED-'||lpad(nextval('med_ref_seq')::text,6,'0')),
  caption text, media_type text NOT NULL DEFAULT 'image',
  storage_path text NOT NULL, mime_type text,
  parent_type text NOT NULL, parent_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'active',
  archived_at timestamptz, archived_by uuid, archive_reason text,
  created_by uuid, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);

-- ============ FORMS ============
CREATE TABLE public.forms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  form_ref text NOT NULL DEFAULT ('KBL-FRM-'||lpad(nextval('frm_ref_seq')::text,6,'0')),
  title text NOT NULL, purpose text,
  schema jsonb NOT NULL DEFAULT '[]'::jsonb,
  target text NOT NULL DEFAULT 'client',
  client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  access_token text NOT NULL DEFAULT encode(extensions.gen_random_bytes(16),'hex'),
  allow_multiple boolean NOT NULL DEFAULT false,
  expires_at timestamptz,
  status text NOT NULL DEFAULT 'created',
  opened_at timestamptz, submitted_at timestamptz,
  archived_at timestamptz, archived_by uuid, archive_reason text,
  created_by uuid, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.form_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  form_id uuid NOT NULL REFERENCES public.forms(id) ON DELETE CASCADE,
  answers jsonb NOT NULL DEFAULT '{}'::jsonb,
  submitted_by_name text, submitted_internally boolean NOT NULL DEFAULT false,
  client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  review_note text,
  status text NOT NULL DEFAULT 'submitted',
  archived_at timestamptz, archived_by uuid, archive_reason text,
  created_by uuid, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);

-- ============ FINANCE ============
CREATE TABLE public.transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_ref text NOT NULL DEFAULT ('KBL-TXN-'||lpad(nextval('txn_ref_seq')::text,6,'0')),
  client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  deal_id uuid REFERENCES public.deals(id) ON DELETE SET NULL,
  amount numeric NOT NULL, currency text NOT NULL DEFAULT 'USD',
  payment_method text, payment_reference text, purpose text NOT NULL,
  commission_amount numeric,
  occurred_on date NOT NULL DEFAULT current_date,
  status text NOT NULL DEFAULT 'recorded',
  archived_at timestamptz, archived_by uuid, archive_reason text,
  created_by uuid, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  receipt_ref text NOT NULL DEFAULT ('KBL-RCP-'||lpad(nextval('rcp_ref_seq')::text,6,'0')),
  transaction_id uuid NOT NULL REFERENCES public.transactions(id) ON DELETE CASCADE,
  verification_ref text NOT NULL DEFAULT encode(extensions.gen_random_bytes(8),'hex'),
  issued_to text NOT NULL, amount numeric NOT NULL, currency text NOT NULL DEFAULT 'USD',
  narrative text,
  status text NOT NULL DEFAULT 'issued',
  archived_at timestamptz, archived_by uuid, archive_reason text,
  created_by uuid, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_ref text NOT NULL DEFAULT ('KBL-INV-'||lpad(nextval('inq_ref_seq')::text,6,'0')),
  client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  deal_id uuid REFERENCES public.deals(id) ON DELETE SET NULL,
  amount numeric NOT NULL, currency text NOT NULL DEFAULT 'USD',
  due_date date, narrative text,
  status text NOT NULL DEFAULT 'draft',
  archived_at timestamptz, archived_by uuid, archive_reason text,
  created_by uuid, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.commissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id uuid NOT NULL REFERENCES public.deals(id) ON DELETE CASCADE,
  transaction_id uuid REFERENCES public.transactions(id) ON DELETE SET NULL,
  rate numeric, amount numeric NOT NULL, currency text NOT NULL DEFAULT 'USD',
  beneficiary text, narrative text,
  status text NOT NULL DEFAULT 'pending',
  archived_at timestamptz, archived_by uuid, archive_reason text,
  created_by uuid, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);

-- ============ OBJECTIVES & PROJECTS ============
CREATE TABLE public.projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_ref text NOT NULL DEFAULT ('KBL-PRJ-'||lpad(nextval('prj_ref_seq')::text,6,'0')),
  title text NOT NULL, description text, department text,
  lead_id uuid, start_date date, target_date date,
  status text NOT NULL DEFAULT 'planned',
  archived_at timestamptz, archived_by uuid, archive_reason text,
  created_by uuid, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.objectives (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  objective_ref text NOT NULL DEFAULT ('KBL-OBJ-'||lpad(nextval('obj_ref_seq')::text,6,'0')),
  title text NOT NULL, description text,
  department text, sector text,
  responsible_id uuid,
  start_date date, target_date date,
  priority text NOT NULL DEFAULT 'normal',
  key_results jsonb NOT NULL DEFAULT '[]'::jsonb,
  budget numeric, currency text NOT NULL DEFAULT 'USD',
  progress integer NOT NULL DEFAULT 0,
  project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL,
  outcome text, completed_at timestamptz, notes text,
  status text NOT NULL DEFAULT 'planned',
  archived_at timestamptz, archived_by uuid, archive_reason text,
  created_by uuid, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.objective_progress (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  objective_id uuid NOT NULL REFERENCES public.objectives(id) ON DELETE CASCADE,
  progress integer NOT NULL DEFAULT 0,
  note text NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'logged',
  archived_at timestamptz, archived_by uuid, archive_reason text,
  created_by uuid, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);

-- ============ ARCHIVE REGISTER ============
CREATE TABLE public.archive_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  entity_ref text,
  title text,
  original_created_at timestamptz,
  original_created_by uuid,
  previous_status text,
  reason text,
  archived_by uuid, archived_at timestamptz NOT NULL DEFAULT now(),
  restored_by uuid, restored_at timestamptz, restore_reason text,
  state text NOT NULL DEFAULT 'archived',
  snapshot jsonb,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);

-- ============ NOTIFICATIONS ============
CREATE TABLE public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL, body text, link text,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, UPDATE ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Own notifications" ON public.notifications FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Update own notifications" ON public.notifications FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- ============ GENERIC GRANTS / RLS / POLICIES / TRIGGERS ============
DO $$
DECLARE
  m record;
  pairs text[][] := ARRAY[
    ['companies','clients'],['contacts','clients'],['communications','clients'],
    ['client_requirements','requirements'],
    ['opportunities','opportunities'],['opportunity_matches','opportunities'],
    ['deals','deals'],['deal_parties','deals'],['offers','deals'],['negotiations','deals'],
    ['tasks','tasks'],
    ['verifications','verification'],['verification_items','verification'],
    ['risk_cases','risk'],['research_cases','research'],
    ['documents','documents'],['document_versions','documents'],['media','documents'],
    ['forms','forms'],['form_submissions','forms'],
    ['transactions','finance'],['receipts','finance'],['invoices','finance'],['commissions','finance'],
    ['projects','objectives'],['objectives','objectives'],['objective_progress','objectives'],
    ['archive_records','archive']
  ];
  t text; md text; i int;
BEGIN
  FOR i IN 1..array_length(pairs,1) LOOP
    t := pairs[i][1]; md := pairs[i][2];
    EXECUTE format('GRANT SELECT, INSERT, UPDATE ON public.%I TO authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (has_permission(auth.uid(), %L))', t||'_view', t, md||'.view');
    EXECUTE format('CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK (has_permission(auth.uid(), %L) AND created_by = auth.uid())', t||'_create', t, md||'.create');
    EXECUTE format('CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated USING (has_permission(auth.uid(), %L)) WITH CHECK (has_permission(auth.uid(), %L))', t||'_edit', t, md||'.edit', md||'.edit');
    EXECUTE format('CREATE POLICY %I ON public.%I FOR DELETE TO authenticated USING (has_role(auth.uid(), ''super_admin''::app_role))', t||'_delete', t);
    EXECUTE format('CREATE TRIGGER %I BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at()', t||'_touch', t);
  END LOOP;
END $$;

-- archive_records has no created_by column; replace its insert policy
DROP POLICY archive_records_create ON public.archive_records;
CREATE POLICY archive_records_create ON public.archive_records FOR INSERT TO authenticated
  WITH CHECK (is_active_staff(auth.uid()) AND archived_by = auth.uid());

-- risk case reference generator (risk vs investigation prefixes)
CREATE OR REPLACE FUNCTION public.set_risk_case_ref()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.case_ref IS NULL OR NEW.case_ref = '' THEN
    IF NEW.case_kind = 'investigation' THEN
      NEW.case_ref := 'KBL-INV-'||lpad(nextval('inv_ref_seq')::text,6,'0');
    ELSE
      NEW.case_ref := 'KBL-RISK-'||lpad(nextval('risk_ref_seq')::text,6,'0');
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER risk_cases_ref BEFORE INSERT ON public.risk_cases FOR EACH ROW EXECUTE FUNCTION public.set_risk_case_ref();
ALTER TABLE public.risk_cases ALTER COLUMN case_ref DROP NOT NULL;

-- helpful indexes
CREATE INDEX idx_requirements_client ON public.client_requirements(client_id);
CREATE INDEX idx_opportunities_sector_status ON public.opportunities(sector, status);
CREATE INDEX idx_deals_client ON public.deals(client_id);
CREATE INDEX idx_documents_parent ON public.documents(parent_type, parent_id);
CREATE INDEX idx_media_parent ON public.media(parent_type, parent_id);
CREATE INDEX idx_archive_entity ON public.archive_records(entity_type, entity_id);

-- ===== 20260811070025_56fabcfd-1eff-46ec-9183-fbbf25285203.sql =====
REVOKE ALL ON FUNCTION public.has_permission(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.my_permissions() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_permission(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.my_permissions() TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.set_risk_case_ref() FROM PUBLIC, anon, authenticated;
-- ===== 20260811070056_99e69905-f7a3-491a-9627-218a01cda62f.sql =====
CREATE POLICY "Vault read for document viewers" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'kalexi-vault' AND public.has_permission(auth.uid(), 'documents.view'));
CREATE POLICY "Vault upload for document creators" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'kalexi-vault' AND public.has_permission(auth.uid(), 'documents.create'));
CREATE POLICY "Vault update for document editors" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'kalexi-vault' AND public.has_permission(auth.uid(), 'documents.edit'))
  WITH CHECK (bucket_id = 'kalexi-vault' AND public.has_permission(auth.uid(), 'documents.edit'));
CREATE POLICY "Vault delete for super admin" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'kalexi-vault' AND public.has_role(auth.uid(), 'super_admin'::app_role));
-- ===== 20260814162920_0cb94f30-e546-4b87-b52a-0da3fc1f43e3.sql =====
GRANT EXECUTE ON FUNCTION public.is_active_staff(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_permission(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.my_permissions() TO authenticated;
GRANT EXECUTE ON FUNCTION public.login_identity(text) TO anon, authenticated;
REVOKE ALL ON FUNCTION public.login_email_by_phone(text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.login_email_by_phone(text) TO service_role;
-- ===== 20260816035733_d4bba811-549a-4efa-a1fb-e69056e0792b.sql =====
DO $$
DECLARE p record;
BEGIN
  FOR p IN
    SELECT pol.policyname, pol.tablename, pol.qual, pol.with_check
    FROM pg_policies pol
    JOIN information_schema.columns c
      ON c.table_schema = 'public' AND c.table_name = pol.tablename AND c.column_name = 'created_by'
    WHERE pol.schemaname = 'public'
      AND pol.cmd = 'UPDATE'
      AND pol.policyname LIKE '%\_edit'
  LOOP
    EXECUTE format('DROP POLICY %I ON public.%I', p.policyname, p.tablename);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated USING ((%s) OR created_by = auth.uid()) WITH CHECK ((%s) OR created_by = auth.uid())',
      p.policyname, p.tablename, p.qual, coalesce(p.with_check, p.qual));
  END LOOP;
END $$;

DROP POLICY IF EXISTS "Authorised staff can update clients" ON public.clients;
CREATE POLICY "Authorised staff can update clients"
ON public.clients FOR UPDATE TO authenticated
USING (
  is_active_staff(auth.uid())
  AND (
    registered_by = auth.uid()
    OR has_role(auth.uid(), 'super_admin'::app_role)
    OR NOT has_role(auth.uid(), 'receptionist'::app_role)
  )
)
WITH CHECK (is_active_staff(auth.uid()));
-- ===== 20260816035808_0d6fcfb3-86bc-4df6-b72f-0092db514a93.sql =====
CREATE POLICY "Avatar read for staff"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'kalexi-avatars' AND is_active_staff(auth.uid()));

CREATE POLICY "Avatar upload for admin or owner"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'kalexi-avatars'
  AND (has_role(auth.uid(), 'super_admin'::app_role) OR (storage.foldername(name))[1] = auth.uid()::text)
);

CREATE POLICY "Avatar update for admin or owner"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'kalexi-avatars'
  AND (has_role(auth.uid(), 'super_admin'::app_role) OR (storage.foldername(name))[1] = auth.uid()::text)
)
WITH CHECK (
  bucket_id = 'kalexi-avatars'
  AND (has_role(auth.uid(), 'super_admin'::app_role) OR (storage.foldername(name))[1] = auth.uid()::text)
);

CREATE POLICY "Avatar delete for admin or owner"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'kalexi-avatars'
  AND (has_role(auth.uid(), 'super_admin'::app_role) OR (storage.foldername(name))[1] = auth.uid()::text)
);

-- ===== System maintenance mode =====
CREATE TABLE IF NOT EXISTS public.system_maintenance (
  id text PRIMARY KEY CHECK (id = 'global'),
  maintenance_enabled boolean NOT NULL DEFAULT false,
  maintenance_message text,
  maintenance_start_time timestamptz,
  estimated_completion_time timestamptz,
  maintenance_updated_at timestamptz NOT NULL DEFAULT now(),
  maintenance_updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);
INSERT INTO public.system_maintenance (id)
VALUES ('global')
ON CONFLICT (id) DO NOTHING;
ALTER TABLE public.system_maintenance ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.system_maintenance FROM anon, authenticated;
GRANT ALL ON TABLE public.system_maintenance TO service_role;

CREATE OR REPLACE FUNCTION public.maintenance_access_allowed()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    NOT COALESCE(
      (SELECT maintenance_enabled
       FROM public.system_maintenance
       WHERE id = 'global'),
      true
    )
    OR EXISTS (
      SELECT 1
      FROM public.user_roles
      WHERE user_id = auth.uid()
        AND role = 'super_admin'::public.app_role
    );
$$;
REVOKE ALL ON FUNCTION public.maintenance_access_allowed() FROM public;
GRANT EXECUTE ON FUNCTION public.maintenance_access_allowed() TO anon, authenticated;

DO $$
DECLARE
  target record;
BEGIN
  FOR target IN
    SELECT n.nspname, c.relname
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind IN ('r', 'p')
      AND c.relrowsecurity
      AND c.relname <> 'system_maintenance'
  LOOP
    IF NOT EXISTS (
      SELECT 1
      FROM pg_policies
      WHERE schemaname = target.nspname
        AND tablename = target.relname
        AND policyname = 'maintenance_access_gate'
    ) THEN
      EXECUTE format(
        'CREATE POLICY maintenance_access_gate ON %I.%I AS RESTRICTIVE FOR ALL TO anon, authenticated USING (public.maintenance_access_allowed()) WITH CHECK (public.maintenance_access_allowed())',
        target.nspname,
        target.relname
      );
    END IF;
  END LOOP;
END $$;

DO $$
BEGIN
  IF to_regclass('storage.objects') IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'storage'
        AND tablename = 'objects'
        AND policyname = 'maintenance_access_gate'
    )
  THEN
    EXECUTE
      'CREATE POLICY maintenance_access_gate ON storage.objects AS RESTRICTIVE FOR ALL TO anon, authenticated USING (public.maintenance_access_allowed()) WITH CHECK (public.maintenance_access_allowed())';
  END IF;
END $$;

-- ===== 20261024000000_agent_registration_schema.sql =====
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