CREATE TABLE IF NOT EXISTS public.company_branding (
  id text PRIMARY KEY DEFAULT 'default' CHECK (id = 'default'),
  logo_path text,
  primary_color text NOT NULL DEFAULT '#145453'
    CHECK (primary_color ~ '^#[0-9A-Fa-f]{6}$'),
  accent_color text NOT NULL DEFAULT '#d3ad52'
    CHECK (accent_color ~ '^#[0-9A-Fa-f]{6}$'),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

ALTER TABLE public.company_branding ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS company_branding_public_read ON public.company_branding;
CREATE POLICY company_branding_public_read
  ON public.company_branding
  FOR SELECT TO anon, authenticated
  USING (id = 'default');

REVOKE ALL ON public.company_branding FROM anon, authenticated;
GRANT SELECT ON public.company_branding TO anon, authenticated;

INSERT INTO public.company_branding (id)
VALUES ('default')
ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'company-branding',
  'company-branding',
  true,
  5242880,
  ARRAY['image/png', 'image/jpeg', 'image/webp']
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS company_branding_public_logo_read ON storage.objects;
CREATE POLICY company_branding_public_logo_read
  ON storage.objects
  FOR SELECT TO anon, authenticated
  USING (bucket_id = 'company-branding');
