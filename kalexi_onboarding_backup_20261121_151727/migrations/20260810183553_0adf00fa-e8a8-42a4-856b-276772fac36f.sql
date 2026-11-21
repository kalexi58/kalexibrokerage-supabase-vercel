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

-- Safe login identity lookup (no sensitive data)
CREATE OR REPLACE FUNCTION public.login_identity(_email text)
RETURNS TABLE (full_name text, job_title text, department text, photo_url text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p.full_name, p.job_title, p.department, p.photo_url
  FROM public.profiles p
  WHERE lower(p.email) = lower(trim(_email)) AND p.status = 'active'
  LIMIT 1;
$$;
REVOKE ALL ON FUNCTION public.login_identity(text) FROM public;
GRANT EXECUTE ON FUNCTION public.login_identity(text) TO anon, authenticated;