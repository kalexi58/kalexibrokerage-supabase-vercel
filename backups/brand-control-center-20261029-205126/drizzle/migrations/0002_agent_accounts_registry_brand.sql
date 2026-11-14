ALTER TABLE public.agents ADD COLUMN IF NOT EXISTS user_id uuid UNIQUE;
ALTER TABLE public.agents ADD COLUMN IF NOT EXISTS village text;
ALTER TABLE public.agents ADD COLUMN IF NOT EXISTS registry_id uuid;
ALTER TABLE public.agent_applications ADD COLUMN IF NOT EXISTS registry_id uuid;
ALTER TABLE public.agent_applications ADD COLUMN IF NOT EXISTS village text;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS agent_id uuid REFERENCES public.agents(id);

CREATE TABLE public.agent_registry (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reg_id text NOT NULL UNIQUE,
  full_name text NOT NULL,
  phone text,
  village text,
  district text,
  registered_on date,
  signature_path text,
  received_by text,
  status text NOT NULL DEFAULT 'registered',
  linked_application_id uuid,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.agent_notices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  body text NOT NULL,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.brand_templates (
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
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.agent_registry, public.agent_notices, public.brand_templates TO authenticated;
GRANT ALL ON public.agent_registry, public.agent_notices, public.brand_templates TO service_role;
ALTER TABLE public.agent_registry ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_notices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.brand_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "registry staff all" ON public.agent_registry FOR ALL TO authenticated
  USING (public.has_permission(auth.uid(),'agents.manage')) WITH CHECK (public.has_permission(auth.uid(),'agents.manage'));
CREATE POLICY "registry staff read" ON public.agent_registry FOR SELECT TO authenticated USING (public.has_permission(auth.uid(),'agents.view'));
CREATE POLICY "notices staff all" ON public.agent_notices FOR ALL TO authenticated
  USING (public.has_permission(auth.uid(),'agents.manage')) WITH CHECK (public.has_permission(auth.uid(),'agents.manage'));
CREATE POLICY "notices agents read" ON public.agent_notices FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.agents a WHERE a.user_id = auth.uid() AND a.status = 'active'));
CREATE POLICY "brand staff all" ON public.brand_templates FOR ALL TO authenticated
  USING (public.is_active_staff(auth.uid())) WITH CHECK (public.is_active_staff(auth.uid()));
CREATE POLICY "agent reads self" ON public.agents FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "agent reads own clients" ON public.clients FOR SELECT TO authenticated
  USING (agent_id IN (SELECT a.id FROM public.agents a WHERE a.user_id = auth.uid()));

CREATE TRIGGER agent_registry_touch BEFORE UPDATE ON public.agent_registry FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER brand_templates_touch BEFORE UPDATE ON public.brand_templates FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();