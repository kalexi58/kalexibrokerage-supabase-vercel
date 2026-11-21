ALTER TABLE public.opportunities
ADD COLUMN IF NOT EXISTS website_published boolean NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS website_published_at timestamptz;

CREATE TABLE IF NOT EXISTS public.website_enquiries (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name text NOT NULL,
    email text,
    phone text,
    interest text,
    message text NOT NULL,
    source_page text,
    opportunity_id uuid REFERENCES public.opportunities(id) ON DELETE SET NULL,
    status text NOT NULL DEFAULT 'new',
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_website_enquiries_created
ON public.website_enquiries(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_website_enquiries_status
ON public.website_enquiries(status);

CREATE INDEX IF NOT EXISTS idx_opportunities_website_published
ON public.opportunities(website_published, website_published_at DESC);

ALTER TABLE public.website_enquiries ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON public.website_enquiries TO authenticated;
GRANT ALL ON public.website_enquiries TO service_role;

DROP POLICY IF EXISTS "Website enquiry staff view" ON public.website_enquiries;

CREATE POLICY "Website enquiry staff view"
ON public.website_enquiries
FOR SELECT TO authenticated
USING (public.has_permission(auth.uid(), 'opportunities.view'));

