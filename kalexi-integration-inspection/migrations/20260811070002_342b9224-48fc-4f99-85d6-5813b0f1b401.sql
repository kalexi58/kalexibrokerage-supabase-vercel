
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
