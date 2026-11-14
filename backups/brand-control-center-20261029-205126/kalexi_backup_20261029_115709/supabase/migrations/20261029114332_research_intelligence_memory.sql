-- Kalexi persistent research intelligence memory.
-- Facts are stored with provenance and explicit review status.
CREATE TABLE IF NOT EXISTS public.research_intelligence_memory (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    case_id uuid REFERENCES public.research_cases(id) ON DELETE SET NULL,
    memory_type text NOT NULL DEFAULT 'research_note'
        CHECK (memory_type IN (
            'entity', 'relationship', 'research_note',
            'source_finding', 'investigator_correction'
        )),
    subject text NOT NULL,
    content text NOT NULL,
    source_url text,
    source_title text,
    confidence numeric(4,3)
        CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1)),
    verification_status text NOT NULL DEFAULT 'unverified'
        CHECK (verification_status IN (
            'unverified', 'needs_review', 'corroborated',
            'verified', 'disputed', 'rejected'
        )),
    reviewed_by uuid,
    reviewed_at timestamptz,
    created_by uuid NOT NULL DEFAULT auth.uid(),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS research_intelligence_memory_subject_idx
    ON public.research_intelligence_memory (lower(subject));

CREATE INDEX IF NOT EXISTS research_intelligence_memory_case_idx
    ON public.research_intelligence_memory (case_id, created_at DESC);

CREATE INDEX IF NOT EXISTS research_intelligence_memory_status_idx
    ON public.research_intelligence_memory (verification_status, created_at DESC);

ALTER TABLE public.research_intelligence_memory ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS research_memory_read ON public.research_intelligence_memory;
CREATE POLICY research_memory_read
ON public.research_intelligence_memory
FOR SELECT TO authenticated
USING (public.has_permission(auth.uid(), 'research.view'));

DROP POLICY IF EXISTS research_memory_insert ON public.research_intelligence_memory;
CREATE POLICY research_memory_insert
ON public.research_intelligence_memory
FOR INSERT TO authenticated
WITH CHECK (
    auth.uid() = created_by
    AND public.has_permission(auth.uid(), 'research.create')
);

DROP POLICY IF EXISTS research_memory_update ON public.research_intelligence_memory;
CREATE POLICY research_memory_update
ON public.research_intelligence_memory
FOR UPDATE TO authenticated
USING (public.has_permission(auth.uid(), 'research.edit'))
WITH CHECK (public.has_permission(auth.uid(), 'research.edit'));

REVOKE ALL ON public.research_intelligence_memory FROM anon;
GRANT SELECT, INSERT, UPDATE ON public.research_intelligence_memory TO authenticated;
GRANT ALL ON public.research_intelligence_memory TO service_role;
