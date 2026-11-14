CREATE TABLE IF NOT EXISTS public.research_external_sources (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    provider text NOT NULL DEFAULT 'UBC',
    source_url text NOT NULL UNIQUE,
    title text NOT NULL DEFAULT '',
    publisher text NOT NULL DEFAULT 'Uganda Broadcasting Corporation',
    published_at timestamptz,
    retrieved_at timestamptz NOT NULL DEFAULT now(),
    article_text text NOT NULL DEFAULT '',
    description text NOT NULL DEFAULT '',
    media jsonb NOT NULL DEFAULT '[]'::jsonb,
    search_query text NOT NULL DEFAULT '',
    review_status text NOT NULL DEFAULT 'unreviewed'
        CHECK (review_status IN ('unreviewed','reviewed','excluded')),
    created_by uuid REFERENCES auth.users(id),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.research_external_entities (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    source_id uuid NOT NULL REFERENCES public.research_external_sources(id) ON DELETE CASCADE,
    entity_name text NOT NULL,
    entity_type text NOT NULL DEFAULT 'person_or_organisation',
    evidence_context text NOT NULL DEFAULT '',
    extraction_method text NOT NULL DEFAULT 'automated_candidate',
    review_status text NOT NULL DEFAULT 'needs_review'
        CHECK (review_status IN ('needs_review','confirmed','rejected')),
    created_by uuid REFERENCES auth.users(id),
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (source_id, entity_name)
);

CREATE INDEX IF NOT EXISTS research_external_sources_retrieved_idx
    ON public.research_external_sources(retrieved_at DESC);

CREATE INDEX IF NOT EXISTS research_external_entities_name_idx
    ON public.research_external_entities(lower(entity_name));

ALTER TABLE public.research_external_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.research_external_entities ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS research_external_sources_view
    ON public.research_external_sources;
CREATE POLICY research_external_sources_view
    ON public.research_external_sources FOR SELECT TO authenticated
    USING (public.has_permission(auth.uid(), 'research.view'));

DROP POLICY IF EXISTS research_external_entities_view
    ON public.research_external_entities;
CREATE POLICY research_external_entities_view
    ON public.research_external_entities FOR SELECT TO authenticated
    USING (public.has_permission(auth.uid(), 'research.view'));

REVOKE ALL ON public.research_external_sources FROM anon;
REVOKE ALL ON public.research_external_entities FROM anon;
GRANT SELECT ON public.research_external_sources TO authenticated;
GRANT SELECT ON public.research_external_entities TO authenticated;
GRANT ALL ON public.research_external_sources TO service_role;
GRANT ALL ON public.research_external_entities TO service_role;
