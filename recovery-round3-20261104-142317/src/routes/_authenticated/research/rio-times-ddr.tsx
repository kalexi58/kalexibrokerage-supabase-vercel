import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

type ResearchCase = {
  id: string;
  case_ref: string;
  subject: string;
  research_question: string | null;
  status: string;
};

type MemoryRecord = {
  id: string;
  case_id: string | null;
  memory_type: string;
  subject: string;
  content: string;
  source_url: string | null;
  source_title: string | null;
  confidence: number | null;
  verification_status: string;
  created_at: string;
};

export const Route = createFileRoute("/_authenticated/research/rio-times-ddr")({
  component: RioTimesDDRPage,
});

function RioTimesDDRPage() {
  const [cases, setCases] = React.useState<ResearchCase[]>([]);
  const [caseId, setCaseId] = React.useState("");
  const [memories, setMemories] = React.useState<MemoryRecord[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState("");
  const [notice, setNotice] = React.useState("");

  const [summary, setSummary] = React.useState("");
  const [findings, setFindings] = React.useState("");
  const [riskAssessment, setRiskAssessment] = React.useState("");
  const [limitations, setLimitations] = React.useState("");
  const [memorySubject, setMemorySubject] = React.useState("");
  const [memoryContent, setMemoryContent] = React.useState("");
  const [sourceTitle, setSourceTitle] = React.useState("");
  const [sourceUrl, setSourceUrl] = React.useState("");
  const [memoryType, setMemoryType] = React.useState("source_finding");

  const selectedCase = cases.find((item) => item.id === caseId);

  const loadCases = React.useCallback(async () => {
    setLoading(true);
    setError("");

    const { data, error: queryError } = await supabase
      .from("research_cases")
      .select("id,case_ref,subject,research_question,status")
      .is("archived_at", null)
      .order("created_at", { ascending: false })
      .limit(300);

    if (queryError) {
      setError("Could not load research cases: " + queryError.message);
      setCases([]);
    } else {
      const rows = (data ?? []) as ResearchCase[];
      setCases(rows);
      if (!caseId && rows.length > 0) setCaseId(rows[0]?.id);
    }

    setLoading(false);
  }, [caseId]);

  const loadMemory = React.useCallback(async () => {
    if (!caseId) {
      setMemories([]);
      return;
    }

    const { data, error: queryError } = await supabase
      .from("research_intelligence_memory")
      .select("id,case_id,memory_type,subject,content,source_url,source_title,confidence,verification_status,created_at")
      .eq("case_id", caseId)
      .order("created_at", { ascending: false })
      .limit(200);

    if (queryError) {
      setError("Could not load intelligence memory: " + queryError.message);
      setMemories([]);
      return;
    }

    setMemories((data ?? []) as MemoryRecord[]);
  }, [caseId]);

  React.useEffect(() => {
    void loadCases();
  }, [loadCases]);

  React.useEffect(() => {
    void loadMemory();
  }, [loadMemory]);

  async function saveMemory(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!caseId || !memorySubject.trim() || !memoryContent.trim()) {
      setError("Choose a research case and enter a subject and finding.");
      return;
    }

    setSaving(true);
    setError("");
    setNotice("");

    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError || !authData.user) {
      setError("Your session could not be verified. Sign in again.");
      setSaving(false);
      return;
    }

    const { error: insertError } = await supabase
      .from("research_intelligence_memory")
      .insert({
        case_id: caseId,
        memory_type: memoryType,
        subject: memorySubject.trim(),
        content: memoryContent.trim(),
        source_title: sourceTitle.trim() || null,
        source_url: sourceUrl.trim() || null,
        verification_status: "needs_review",
        created_by: authData.user.id,
      });

    if (insertError) {
      setError("Could not save the intelligence record: " + insertError.message);
    } else {
      setNotice("Saved for review. It is not treated as a verified fact.");
      setMemorySubject("");
      setMemoryContent("");
      setSourceTitle("");
      setSourceUrl("");
      await loadMemory();
    }

    setSaving(false);
  }

  function printReport() {
    if (!selectedCase) {
      setError("Select a research case before generating the DDR.");
      return;
    }
    setError("");
    window.print();
  }

  return (
    <main className="mx-auto max-w-6xl space-y-6 p-4 md:p-8">
      <style>{`
        @media print {
          body { background: white !important; color: #111 !important; }
          .no-print { display: none !important; }
          .ddr-paper { box-shadow: none !important; border: 0 !important; max-width: none !important; }
          .ddr-section { break-inside: avoid; }
          a { color: #111 !important; text-decoration: underline; overflow-wrap: anywhere; }
          @page { size: A4; margin: 18mm; }
        }
      `}</style>

      <section className="no-print space-y-2">
        <p className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">
          KALEXI BROKERAGE · RESEARCH INTELLIGENCE
        </p>
        <h1 className="text-3xl font-bold">Due Diligence Report Studio</h1>
        <p className="text-muted-foreground">
          Prepare a case-linked report and preserve attributed research records.
          The Rio Times findings must have their own source links and review status.
        </p>
      </section>

      <section className="no-print rounded-xl border p-4 space-y-3">
        <label htmlFor="research-case" className="block font-medium">Research case</label>
        <select
          id="research-case"
          className="w-full rounded-md border bg-background p-3"
          value={caseId}
          onChange={(event) => setCaseId(event.target.value)}
        >
          <option value="">Select a case</option>
          {cases.map((item) => (
            <option key={item.id} value={item.id}>
              {item.case_ref} · {item.subject}
            </option>
          ))}
        </select>
        {loading && <p>Loading cases…</p>}
        <div className="grid gap-3 md:grid-cols-2">
          <label className="block text-sm">
            Executive summary
            <textarea className="mt-1 min-h-24 w-full rounded-md border bg-background p-3"
              value={summary} onChange={(e) => setSummary(e.target.value)} />
          </label>
          <label className="block text-sm">
            Findings and supporting evidence
            <textarea className="mt-1 min-h-24 w-full rounded-md border bg-background p-3"
              value={findings} onChange={(e) => setFindings(e.target.value)} />
          </label>
          <label className="block text-sm">
            Risk assessment and rationale
            <textarea className="mt-1 min-h-24 w-full rounded-md border bg-background p-3"
              value={riskAssessment} onChange={(e) => setRiskAssessment(e.target.value)} />
          </label>
          <label className="block text-sm">
            Limitations and outstanding checks
            <textarea className="mt-1 min-h-24 w-full rounded-md border bg-background p-3"
              value={limitations} onChange={(e) => setLimitations(e.target.value)} />
          </label>
        </div>
        <button type="button" onClick={printReport}
          className="rounded-md bg-primary px-4 py-3 font-semibold text-primary-foreground">
          Generate / Save DDR as PDF
        </button>
      </section>

      {error && <p role="alert" className="rounded-md border border-red-500 p-3 text-red-700">{error}</p>}
      {notice && <p role="status" className="rounded-md border p-3">{notice}</p>}

      <article className="ddr-paper mx-auto max-w-4xl space-y-6 rounded-xl border bg-white p-6 text-slate-900 shadow-sm md:p-10">
        <header className="ddr-section border-b-4 border-slate-800 pb-6">
          <p className="text-sm font-bold tracking-[0.2em]">KALEXI BROKERAGE LTD</p>
          <p className="mt-2 text-xs uppercase tracking-widest text-slate-500">Confidential · Due diligence</p>
          <h2 className="mt-8 text-4xl font-bold">Due Diligence Report</h2>
          <p className="mt-3 text-xl">{selectedCase?.subject ?? "Select a research case"}</p>
          <p className="mt-2 text-sm text-slate-600">Case reference: {selectedCase?.case_ref ?? "Not selected"}</p>
          <p className="text-sm text-slate-600">Generated: {new Date().toLocaleString()}</p>
        </header>

        <section className="ddr-section">
          <h3 className="text-xl font-bold">1. Executive Summary</h3>
          <p className="mt-2 whitespace-pre-wrap">{summary || "No executive summary entered."}</p>
        </section>

        <section className="ddr-section">
          <h3 className="text-xl font-bold">2. Research Scope</h3>
          <p className="mt-2">{selectedCase?.research_question || "Research question not recorded."}</p>
          <p className="mt-2 text-sm text-slate-600">
            This report reflects the records and analysis entered by the investigator.
            It is not a guarantee of identity, integrity, or transaction safety.
          </p>
        </section>

        <section className="ddr-section">
          <h3 className="text-xl font-bold">3. Findings and Evidence</h3>
          <p className="mt-2 whitespace-pre-wrap">{findings || "No findings entered."}</p>
        </section>

        <section className="ddr-section">
          <h3 className="text-xl font-bold">4. Risk Assessment</h3>
          <p className="mt-2 whitespace-pre-wrap">{riskAssessment || "No risk assessment entered."}</p>
        </section>

        <section className="ddr-section">
          <h3 className="text-xl font-bold">5. Intelligence Records</h3>
          {memories.length === 0 ? <p className="mt-2">No saved intelligence records for this case.</p> :
            <div className="mt-3 space-y-4">
              {memories.map((item, index) => (
                <div key={item.id} className="border-l-2 border-slate-300 pl-4">
                  <p className="font-semibold">{index + 1}. {item.subject}</p>
                  <p className="whitespace-pre-wrap">{item.content}</p>
                  <p className="mt-1 text-sm text-slate-600">
                    Status: {item.verification_status} · Type: {item.memory_type}
                  </p>
                  {item.source_title && <p className="text-sm">Source: {item.source_title}</p>}
                  {item.source_url && <p className="break-all text-sm">Source URL: {item.source_url}</p>}
                </div>
              ))}
            </div>
          }
        </section>

        <section className="ddr-section">
          <h3 className="text-xl font-bold">6. Limitations and Further Checks</h3>
          <p className="mt-2 whitespace-pre-wrap">{limitations || "No limitations recorded."}</p>
        </section>

        <footer className="ddr-section border-t pt-4 text-xs text-slate-600">
          KALEXI BROKERAGE LTD · Confidential research document.
          Verify source material independently before making transaction decisions.
          Unverified records and allegations are not proof of wrongdoing.
        </footer>
      </article>

      <section className="no-print rounded-xl border p-4 space-y-4">
        <h2 className="text-xl font-bold">Save intelligence for future research</h2>
        <p className="text-sm text-muted-foreground">
          Save a sourced note, entity, relationship, or investigator correction.
          New records enter review status and are not automatically treated as facts.
        </p>
        <form onSubmit={saveMemory} className="space-y-3">
          <label className="block text-sm">Record type
            <select className="mt-1 w-full rounded-md border bg-background p-3"
              value={memoryType} onChange={(e) => setMemoryType(e.target.value)}>
              <option value="source_finding">Source finding</option>
              <option value="entity">Person or company</option>
              <option value="relationship">Entity relationship</option>
              <option value="research_note">Research note</option>
              <option value="investigator_correction">Investigator correction</option>
            </select>
          </label>
          <label className="block text-sm">Person, company, or subject
            <input required className="mt-1 w-full rounded-md border bg-background p-3"
              value={memorySubject} onChange={(e) => setMemorySubject(e.target.value)} />
          </label>
          <label className="block text-sm">Finding or relationship details
            <textarea required className="mt-1 min-h-24 w-full rounded-md border bg-background p-3"
              value={memoryContent} onChange={(e) => setMemoryContent(e.target.value)} />
          </label>
          <label className="block text-sm">Source title
            <input className="mt-1 w-full rounded-md border bg-background p-3"
              value={sourceTitle} onChange={(e) => setSourceTitle(e.target.value)} />
          </label>
          <label className="block text-sm">Source URL
            <input type="url" className="mt-1 w-full rounded-md border bg-background p-3"
              value={sourceUrl} onChange={(e) => setSourceUrl(e.target.value)} />
          </label>
          <button disabled={saving || !caseId} type="submit"
            className="rounded-md bg-primary px-4 py-3 font-semibold text-primary-foreground disabled:opacity-50">
            {saving ? "Saving…" : "Save intelligence for review"}
          </button>
        </form>
      </section>
    </main>
  );
}
