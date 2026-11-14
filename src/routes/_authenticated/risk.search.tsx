import "./risk.search.css";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

type Item = {
  id?: string;
  title?: string;
  name?: string;
  subject?: string;
  subject_name?: string;
  company_name?: string;
  case_ref?: string;
  report_ref?: string;
  source_title?: string;
  source_name?: string;
  source_url?: string;
  url?: string;
  link?: string;
  description?: string;
  requirement?: string;
  archive_reason?: string | null;
  archived_at?: string | null;
  content?: string;
  findings?: string;
  research_question?: string;
  verification_status?: string;
  status?: string;
  severity?: string;
  created_at?: string;
  updated_at?: string;
  [key: string]: any;
};

type Activity = {
  id: string;
  title?: string;
  task_type?: string;
  status?: string;
  details?: string;
  source_name?: string;
  source_url?: string;
  items_found?: number;
  items_saved?: number;
  created_at?: string;
  finished_at?: string;
};

const db: any = supabase;

function textOf(item: Item): string {
  return [
    item.title, item.name, item.subject, item.subject_name, item.company_name,
    item.case_ref, item.report_ref, item.description, item.content, item.findings,
    item.research_question, item.source_title, item.source_name, item.requirement,
    item.archive_reason
  ].filter(Boolean).join(" ");
}

function safeDate(value?: string) {
  if (!value) return "Date unavailable";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function getRows(value: any): Item[] {
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.results)) return value.results;
  if (Array.isArray(value?.items)) return value.items;
  if (Array.isArray(value?.sources)) return value.sources;
  if (Array.isArray(value?.data)) return value.data;
  if (Array.isArray(value?.data?.results)) return value.data.results;
  if (Array.isArray(value?.data?.items)) return value.data.items;
  if (Array.isArray(value?.data?.sources)) return value.data.sources;
  return [];
}

function getErrorMessage(error: any) {
  return error?.message || error?.error_description || String(error || "Unknown error");
}

function Panel({ title, children }: { title: string; children: any }) {
  return (
    <section className="rounded-xl border bg-background p-3 min-w-0 max-h-[calc(100dvh-18rem)] overflow-y-auto">
      <h2 className="font-semibold text-sm mb-2">{title}</h2>
      {children}
    </section>
  );
}

function ItemCard({
  item, kind, onOpen
}: {
  item: Item; kind: string; onOpen: (item: Item, kind: string) => void
}) {
  const title = item.title || item.subject || item.subject_name ||
    item.name || item.company_name || item.case_ref || item.report_ref || "Untitled record";
  const url = item.source_url || item.url || item.link;
  const status = item.verification_status || item.status || "Not verified";
  return (
    <article className="rounded-lg border p-3 space-y-2">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="font-medium break-words">{title}</div>
        <span className="text-xs rounded-full border px-2 py-1">{status}</span>
      </div>
      {item.case_ref && <div className="text-xs text-muted-foreground">Reference: {item.case_ref}</div>}
      {item.description && <p className="text-sm whitespace-pre-wrap break-words">{item.description}</p>}
      {item.requirement && <p className="text-sm whitespace-pre-wrap break-words"><span className="font-medium">Requirement:</span> {item.requirement}</p>}
      {item.archived_at && (
        <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-2 text-xs">
          Archived on {safeDate(item.archived_at)}
          {item.archive_reason ? <p className="mt-1">Reason: {item.archive_reason}</p> : null}
        </div>
      )}
      {item.content && <p className="text-sm whitespace-pre-wrap break-words">{item.content}</p>}
      {item.findings && <p className="text-sm whitespace-pre-wrap break-words">{item.findings}</p>}
      {item.research_question && <p className="text-sm whitespace-pre-wrap break-words">{item.research_question}</p>}
      {item.severity && <div className="text-xs">Severity: {item.severity}</div>}
      {item["published_at"] && <div className="text-xs text-muted-foreground">Published: {safeDate(item["published_at"])}</div>}
      {item["extraction_status"] && <div className="text-xs text-muted-foreground">Page extraction: {String(item["extraction_status"]).replace(/_/g, " ")}</div>}
      {url && (
        <a href={url} target="_blank" rel="noreferrer" className="text-sm underline break-all">
          Open original source
        </a>
      )}
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
        <span>{kind} | {safeDate(item.created_at || item.updated_at)}</span>
        <button className="ri-button" type="button" onClick={() => onOpen(item, kind)}>Open finding</button>
      </div>
    </article>
  );
}

function RiskSearchPage() {
  const [query, setQuery] = useState("");
  const [activeTab, setActiveTab] = useState<"results" | "reports" | "learning">("results");
  const [busy, setBusy] = useState(false);
  const [stage, setStage] = useState("");
  const [internalResults, setInternalResults] = useState<Item[]>([]);
  const [externalResults, setExternalResults] = useState<Item[]>([]);
  const [oldReports, setOldReports] = useState<Item[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [selected, setSelected] = useState<Item[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [searchTime, setSearchTime] = useState("");
  const [reportTitle, setReportTitle] = useState("");
  const [reportSummary, setReportSummary] = useState("");
  const [reportAssessment, setReportAssessment] = useState("");
  const [reportStatus, setReportStatus] = useState("Preliminary assessment");
  const [historyQuery, setHistoryQuery] = useState("");
  const [learningLoading, setLearningLoading] = useState(false);
  const [readingItem, setReadingItem] = useState<Item | null>(null);
  const [readingKind, setReadingKind] = useState("");
  const [readingContent, setReadingContent] = useState<any>(null);
  const [readingBusy, setReadingBusy] = useState(false);
  const [readingError, setReadingError] = useState("");

  const completedCount = internalResults.length + externalResults.length;
  const reviewedCount = selected.filter(x =>
    ["verified", "corroborated"].includes(String(x.verification_status || "").toLowerCase())
  ).length;

  const reportItems = useMemo(() => {
    const all = [...internalResults, ...externalResults, ...selected];
    const seen = new Set<string>();
    return all.filter((item, index) => {
      const key = String(item.id || item.source_url || item.url || item.case_ref || textOf(item) || index);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [internalResults, externalResults, selected]);

  async function loadActivities() {
    setLearningLoading(true);
    try {
      const { data, error } = await db
        .from("intelligence_activity")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      setActivities((data || []) as Activity[]);
    } catch (error: any) {
      setErrors(prev => [...prev, "Learning history: " + getErrorMessage(error)]);
    } finally {
      setLearningLoading(false);
    }
  }

  async function searchInternal(term: string) {
    const tables: Array<{ table: string; select: string; label: string; fields: string[] }> = [
      { table: "risk_cases", select: "id,case_ref,case_kind,subject_name,subject_company,subject_phone,subject_email,subject_identifier,severity,status,description,allegation,verified_finding,created_at", label: "Risk cases", fields: ["subject_name", "subject_company", "subject_phone", "subject_email", "subject_identifier", "case_ref", "description"] },
      { table: "clients", select: "id,client_ref,full_name,company_name,phone,email,requirement,status,archived_at,archive_reason,created_at", label: "Clients", fields: ["full_name", "company_name", "phone", "email", "client_ref", "requirement", "archive_reason"] },
      { table: "companies", select: "id,name,registration_number,country,address,status,notes,created_at", label: "Companies", fields: ["name", "registration_number", "country", "address", "notes"] },
      { table: "contacts", select: "id,full_name,role,phone,email,notes,company_id,created_at", label: "Contacts", fields: ["full_name", "role", "phone", "email", "notes"] },
      { table: "opportunities", select: "id,opportunity_ref,title,owner_name,owner_contact,description,status,created_at", label: "Opportunities", fields: ["opportunity_ref", "title", "owner_name", "owner_contact", "description"] },
      { table: "research_cases", select: "id,case_ref,subject,related_party,status,research_question,findings,notes,sources,created_at,updated_at", label: "Research cases", fields: ["case_ref", "subject", "related_party", "research_question", "findings", "notes"] },
      { table: "documents", select: "id,document_ref,title,document_type,parent_type,parent_id,verification_status,status,created_at", label: "Documents", fields: ["document_ref", "title", "document_type", "parent_type", "verification_status"] }
    ];

    const results: Item[] = [];
    const failures: string[] = [];
    for (const dataset of tables) {
      setStage("Searching Kalexi " + dataset.label.toLowerCase() + "...");
      try {
        const safe = term.replace(/[%_,]/g, " ").trim();
        const or = dataset.fields.map(field => `${field}.ilike.%${safe}%`).join(",");
        const { data, error } = await db.from(dataset.table)
          .select(dataset.select)
          .or(or)
          .limit(30);
        if (error) throw error;
        for (const row of (data || [])) {
          const label =
            dataset.table === "clients" && row.archived_at
              ? "Archived client"
              : dataset.label;
          results.push({ ...row, _kind: label });
        }
      } catch (error: any) {
        failures.push(dataset.label + ": " + getErrorMessage(error));
      }
    }
    setInternalResults(results);
    if (failures.length) setErrors(prev => [...prev, ...failures]);
    return results;
  }

  async function searchExternal(term: string) {
    setStage("Searching public web sources...");
    const results: Item[] = [];
    const failures: string[] = [];
    const functions = [
      { name: "external-research-search", label: "Public web search" },
      { name: "rio-times-research-search", label: "The Rio Times" }
    ];

    for (const fn of functions) {
      setStage("Querying " + fn.label + "...");
      try {
        const { data, error } = await db.functions.invoke(fn.name, {
          body: { query: term, search_query: term, subject: term, limit: 15 }
        });
        if (error) throw error;
        const rows = getRows(data);
        for (const row of rows) {
          results.push({
            ...row,
            _kind: fn.label,
            source_name: row.source_name || row.source_title || fn.label,
            source_url: row.source_url || row.url || row.link || ""
          });
        }
        if (!rows.length && data?.error) failures.push(fn.label + ": " + data.error);
      } catch (error: any) {
        failures.push(fn.label + ": " + getErrorMessage(error));
      }
    }

    const unique = new Map<string, Item>();
    for (const item of results) {
      const key = String(item.source_url || item.url || item.title || item.name || JSON.stringify(item));
      if (!unique.has(key)) unique.set(key, item);
    }
    setExternalResults([...unique.values()]);
    if (failures.length) setErrors(prev => [...prev, ...failures]);
    return [...unique.values()];
  }

  async function searchOldReports(term: string) {
    setStage("Searching previous reports...");
    const found: Item[] = [];
    const safe = term.replace(/[%_,]/g, " ").trim();

    try {
      const { data, error } = await db.from("research_cases")
        .select("id,case_ref,subject,related_party,status,research_question,findings,notes,sources,created_at,updated_at")
        .or(`subject.ilike.%${safe}%,related_party.ilike.%${safe}%,case_ref.ilike.%${safe}%,research_question.ilike.%${safe}%,findings.ilike.%${safe}%,notes.ilike.%${safe}%`)
        .order("updated_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      found.push(...(data || []).map((x: Item) => ({ ...x, _kind: "Previous report" })));
    } catch (error: any) {
      setErrors(prev => [...prev, "Previous reports: " + getErrorMessage(error)]);
    }

    try {
      const { data, error } = await db.from("research_intelligence_memory")
        .select("id,case_id,memory_type,subject,content,source_url,source_title,confidence,verification_status,created_at")
        .or(`subject.ilike.%${safe}%,content.ilike.%${safe}%,source_title.ilike.%${safe}%`)
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      found.push(...(data || []).map((x: Item) => ({
        ...x, title: x.subject || x.source_title, description: x.content,
        _kind: "Intelligence memory"
      })));
    } catch (error: any) {
      setErrors(prev => [...prev, "Saved intelligence memory: " + getErrorMessage(error)]);
    }

    setOldReports(found);
    return found;
  }

  async function recordActivity(title: string, status: string, details: string, found: number, saved: number) {
    try {
      const payload = {
        task_type: "unified_intelligence_search",
        status,
        title,
        details,
        source_name: "Kalexi internal database and external public sources",
        items_found: found,
        items_saved: saved,
        finished_at: status === "completed" || status === "failed" ? new Date().toISOString() : null
      };
      const { error } = await db.from("intelligence_activity").insert(payload);
      if (error) console.warn("Activity log was not saved:", error.message);
    } catch (error) {
      console.warn("Activity logging unavailable:", error);
    }
  }

  async function runSearch(event?: any) {
    event?.preventDefault();
    const term = query.trim();
    if (!term || busy) return;

    setBusy(true);
    setStage("Preparing investigation...");
    setErrors([]);
    setInternalResults([]);
    setExternalResults([]);
    setSearchTime(new Date().toISOString());
    setReportTitle("Due Diligence Report: " + term);
    const started = Date.now();

    await recordActivity("Investigation: " + term, "running", "Internal, external, and historical searches started.", 0, 0);

    try {
      const outcomes = await Promise.allSettled([
        searchInternal(term),
        searchExternal(term),
        searchOldReports(term)
      ]);
      const internal = outcomes[0].status === "fulfilled" ? outcomes[0].value : [];
      const external = outcomes[1].status === "fulfilled" ? outcomes[1].value : [];
      const reports = outcomes[2].status === "fulfilled" ? outcomes[2].value : [];
      const total = internal.length + external.length + reports.length;
      await recordActivity(
        "Investigation: " + term,
        "completed",
        `Finished in ${Math.round((Date.now() - started) / 1000)} seconds. Internal records: ${internal.length}; external sources: ${external.length}; previous reports/memory: ${reports.length}.`,
        total,
        0
      );
      setStage("Search completed. Review and verify the evidence.");
      setActiveTab("results");
    } catch (error: any) {
      setStage("Search completed with errors.");
      setErrors(prev => [...prev, getErrorMessage(error)]);
      await recordActivity("Investigation: " + term, "failed", getErrorMessage(error), 0, 0);
    } finally {
      setBusy(false);
      await loadActivities();
    }
  }

  function addToReport(item: Item, kind: string) {
    const enriched = { ...item, _kind: kind };
    setSelected(prev => {
      const key = String(enriched.id || enriched.source_url || enriched.url || textOf(enriched));
      if (prev.some(x => String(x.id || x.source_url || x.url || textOf(x)) === key)) return prev;
      return [...prev, enriched];
    });
  }

  async function openItem(item: Item, kind: string) {
    addToReport(item, kind);
    setReadingItem(item);
    setReadingKind(kind);
    setReadingContent(null);
    setReadingError("");
    setReadingBusy(false);

    setReportSummary(prev => prev || "This report summarizes the evidence located during the investigation. Findings remain subject to independent verification.");

    const urlValue = item.source_url || item.url || item.link;
    const url = typeof urlValue === "string" ? urlValue.trim() : "";

    if (!url || !/^https?:\/\//i.test(url) || kind.toLowerCase().includes("internal") ||
        ["risk cases", "clients", "companies", "contacts", "opportunities", "documents", "historical record"].some(x => kind.toLowerCase().includes(x))) {
      setReadingContent({
        title: item.title || item.subject_name || item.name || item.company_name || item.case_ref || "Internal finding",
        source_url: url,
        content: [
          item.description && `Description:\n${item.description}`,
          item.findings && `Findings:\n${item.findings}`,
          item["verified_finding"] && `Recorded verified finding:\n${item["verified_finding"]}`,
          item["allegation"] && `Recorded allegation (not proof):\n${item["allegation"]}`,
          item["notes"] && `Notes:\n${item["notes"]}`,
          item.content && `Content:\n${item.content}`,
          item.research_question && `Research question:\n${item.research_question}`,
        ].filter(Boolean).join("\n\n") || "No readable text is stored on this record. Review the source record and linked documents.",
        verification_status: item.verification_status || item.status || "needs_review",
        retrieved_at: new Date().toISOString(),
        published_at: item["published_at"] || null,
        description: item.description || ""
      });
      return;
    }

    setReadingBusy(true);
    try {
      const { data, error } = await db.functions.invoke("external-research-read", {
        body: { url }
      });
      if (error) {
    let detail = error.message || "Reader request failed.";
    const context = (error as { context?: unknown }).context;

    if (context instanceof Response) {
        try {
            const body = await context.clone().text();
            const code = context.headers.get("sb-error-code");
            detail = [
                `HTTP ${context.status}`,
                code ? `Code: ${code}` : "",
                body ? `Response: ${body.slice(0, 700)}` : ""
            ].filter(Boolean).join(" | ");
        } catch {
            detail = `${detail} (Response details could not be read.)`;
        }
    }

    throw new Error(detail);
}
      if (!data?.success) throw new Error(data?.error || "The source could not be read.");
      setReadingContent(data);
    } catch (error: any) {
      setReadingError(error?.message || "Unable to read this source. Check that the Edge Function is deployed to the correct Supabase project.");
      setReadingContent({
        title: item.title || item.subject || "External finding",
        source_url: url,
        description: item.description || item["snippet"] || "",
        content: item.content || item.findings || item.description || item["snippet"] || "The search result has no article text available yet.",
        verification_status: item.verification_status || "needs_review",
        published_at: item["published_at"] || null
      });
    } finally {
      setReadingBusy(false);
    }
  }

  function generatePdf() {
    setReportTitle(prev => prev || "Kalexi Due Diligence Report: " + query);
    setTimeout(() => window.print(), 100);
  }

  useEffect(() => {
    void loadActivities();
    const channel = db.channel("kalexi-intelligence-activity")
      .on("postgres_changes", {
        event: "*", schema: "public", table: "intelligence_activity"
      }, (payload: any) => {
        const row = payload.new as Activity;
        if (row?.id) setActivities(prev => [row, ...prev.filter(x => x.id !== row.id)].slice(0, 100));
      }).subscribe();
    const interval = setInterval(() => void loadActivities(), 20000);
    return () => {
      clearInterval(interval);
      void db.removeChannel(channel);
    };
  }, []);

  const filteredReports = useMemo(() => {
    const term = historyQuery.trim().toLowerCase();
    if (!term) return oldReports;
    return oldReports.filter(item => textOf(item).toLowerCase().includes(term));
  }, [oldReports, historyQuery]);

  const internalCount = internalResults.length;
  const externalCount = externalResults.length;
  const reportCount = oldReports.length;

  return (
    <div className="risk-intelligence-shell w-full overflow-hidden flex flex-col min-h-0"
      style={{ height: "calc(100dvh - 7rem)", maxHeight: "calc(100dvh - 7rem)" }}>
      <style>{`
        .risk-intelligence-shell { min-height: 440px; gap: .25rem; }
        .risk-intelligence-shell .ri-scroll { padding: .25rem .35rem .5rem .1rem; }
        .risk-intelligence-shell .ri-scroll > div { align-items: start; }
        .risk-intelligence-shell section.rounded-xl { box-shadow: 0 1px 2px rgba(15,23,42,.04); }
        .risk-intelligence-shell article.rounded-lg { background: hsl(var(--card)); transition: border-color .15s ease, box-shadow .15s ease; }
        .risk-intelligence-shell article.rounded-lg:hover { border-color: hsl(var(--primary) / .35); box-shadow: 0 3px 12px rgba(15,23,42,.06); }
        .risk-intelligence-shell .ri-tab-active { box-shadow: inset 0 -2px 0 hsl(var(--primary)); }
        @media (max-width: 1279px) { .risk-intelligence-shell section.rounded-xl { max-height: none; } }
        .ri-scroll { min-height: 0; overflow-y: auto; overscroll-behavior: contain; scrollbar-gutter: stable; }
        .ri-no-scroll { overflow: hidden; }
        .ri-field { width:100%; border:1px solid hsl(var(--border)); background:hsl(var(--background)); border-radius:.6rem; padding:.65rem .75rem; color:inherit; }
        .ri-button { border:1px solid hsl(var(--border)); border-radius:.6rem; padding:.55rem .8rem; font-size:.875rem; }
        .ri-primary { background:hsl(var(--primary)); color:hsl(var(--primary-foreground)); border-color:transparent; }
        .ri-tab-active { background:hsl(var(--accent)); font-weight:600; }
        @media print {
          body * { visibility:hidden !important; }
          #kalexi-print-report, #kalexi-print-report * { visibility:visible !important; }
          #kalexi-print-report { position:absolute; inset:0; width:100%; padding:24px; overflow:visible !important; color:#111 !important; background:#fff !important; }
          .no-print { display:none !important; }
        }
      `}</style>

      <header className="ri-no-scroll shrink-0 border-b pb-3 mb-3 space-y-3 no-print">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <button className="ri-button" onClick={() => {
              if (window.history.length > 1) window.history.back();
              else window.location.assign("/risk");
            }}>Back</button>
            <div className="min-w-0">
              <h1 className="text-xl font-bold">Kalexi Intelligence</h1>
              <p className="text-xs text-muted-foreground">Internal records | Public web | Historical reports | Evidence review</p>
            </div>
          </div>
          <button className="ri-button ri-primary" onClick={generatePdf} disabled={!query.trim()}>
            Generate report / PDF
          </button>
        </div>

        <form onSubmit={runSearch} className="flex gap-2">
          <input className="ri-field min-w-0 flex-1" value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search a person, company, phone, registration number, keyword or location..."
            aria-label="Search intelligence" />
          <button className="ri-button ri-primary shrink-0" disabled={busy || !query.trim()}>
            {busy ? "Searching..." : "Search all"}
          </button>
        </form>

        <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
          <span className="text-muted-foreground">{stage || "Ready for investigation"} {searchTime ? " | " + safeDate(searchTime) : ""}</span>
          <div className="flex gap-3">
            <span>Internal: <b>{internalCount}</b></span>
            <span>External: <b>{externalCount}</b></span>
            <span>Old reports: <b>{reportCount}</b></span>
          </div>
        </div>

        <nav className="flex flex-wrap gap-2">
          <button className={"ri-button " + (activeTab === "results" ? "ri-tab-active" : "")} onClick={() => setActiveTab("results")}>Search results</button>
          <button className={"ri-button " + (activeTab === "reports" ? "ri-tab-active" : "")} onClick={() => setActiveTab("reports")}>Old reports & memory</button>
          <button className={"ri-button " + (activeTab === "learning" ? "ri-tab-active" : "")} onClick={() => { setActiveTab("learning"); void loadActivities(); }}>Learning history</button>
          <button className="ri-button" onClick={() => { setSelected([]); setReportSummary(""); setReportAssessment(""); }}>Clear report selection</button>
        </nav>
      </header>

      {errors.length > 0 && (
        <div className="shrink-0 mb-2 rounded-lg border border-amber-500/50 p-2 text-xs no-print">
          <div className="font-semibold mb-1">Some sources did not return results</div>
          <div className="max-h-16 overflow-y-auto space-y-1">
            {errors.slice(-8).map((error, index) => <div key={index} className="break-words">{error}</div>)}
          </div>
          <button className="underline mt-1" onClick={() => setErrors([])}>Dismiss errors</button>
        </div>
      )}

      <main className="ri-scroll flex-1 min-h-0 pr-1">
        {activeTab === "results" && (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-3 pb-3">
            <Panel title={`External intelligence | ${externalCount}`}>
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground">Public web results and The Rio Times. Open original sources to validate claims.</p>
                {externalResults.length === 0 && <p className="text-sm text-muted-foreground">No external results yet. Run a search. If the functions are unavailable, the error panel above will show why.</p>}
                {externalResults.map((item, index) => <ItemCard key={String(item.id || item.source_url || item.url || index)} item={item} kind={item["_kind"] || "External source"} onOpen={openItem} />)}
              </div>
            </Panel>

            <Panel title={`Kalexi internal records | ${internalCount}`}>
              <div className="space-y-2">
                {internalResults.length === 0 && <p className="text-sm text-muted-foreground">Internal client, company, contact, risk, opportunity, document and research records appear here.</p>}
                {internalResults.map((item, index) => <ItemCard key={String(item.id || index)} item={item} kind={item["_kind"] || "Internal record"} onOpen={openItem} />)}
              </div>
            </Panel>

            <Panel title="Evidence selected for report">
              <div className="space-y-2">
                <div className="text-xs text-muted-foreground">{selected.length} selected | {reviewedCount} marked verified/corroborated</div>
                {selected.length === 0 && <p className="text-sm text-muted-foreground">Use "Add to report" on a finding to include it in the generated report.</p>}
                {selected.map((item, index) => <ItemCard key={String(item.id || item.source_url || index)} item={item} kind={item["_kind"] || "Selected evidence"} onOpen={openItem} />)}
              </div>
            </Panel>

            <Panel title="Research learning signals">
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div className="rounded-lg border p-3"><div className="text-xs text-muted-foreground">Internal records</div><div className="text-2xl font-semibold">{internalCount}</div></div>
                <div className="rounded-lg border p-3"><div className="text-xs text-muted-foreground">External sources</div><div className="text-2xl font-semibold">{externalCount}</div></div>
                <div className="rounded-lg border p-3"><div className="text-xs text-muted-foreground">Past reports/memory</div><div className="text-2xl font-semibold">{reportCount}</div></div>
                <div className="rounded-lg border p-3"><div className="text-xs text-muted-foreground">Selected evidence</div><div className="text-2xl font-semibold">{selected.length}</div></div>
              </div>
              <p className="text-xs text-muted-foreground mt-3">These are measured search results, not model-training claims. Persistent knowledge grows only when records are saved and reviewed under Kalexi's access rules.</p>
              <button className="ri-button mt-3" onClick={() => { setActiveTab("learning"); void loadActivities(); }}>View activity history</button>
            </Panel>
          </div>
        )}

        {activeTab === "reports" && (
          <div className="space-y-3 pb-3">
            <Panel title="Search previous reports and saved intelligence">
              <form className="flex gap-2" onSubmit={e => { e.preventDefault(); if (query.trim()) void searchOldReports(query.trim()); }}>
                <input className="ri-field min-w-0 flex-1" value={historyQuery}
                  onChange={e => setHistoryQuery(e.target.value)}
                  placeholder="Filter loaded reports by subject, company or findings..." />
                <button className="ri-button" type="button" onClick={() => void searchOldReports(query.trim() || historyQuery.trim())}>Load reports</button>
              </form>
              <p className="text-xs text-muted-foreground mt-2">Use "Load reports" with the main search term to retrieve old research cases and saved intelligence memory.</p>
            </Panel>
            <div className="space-y-2">
              {filteredReports.map((item, index) => <ItemCard key={String(item.id || index)} item={item} kind={item["_kind"] || "Historical record"} onOpen={openItem} />)}
              {filteredReports.length === 0 && <p className="text-sm text-muted-foreground p-3">No loaded reports match this filter. Enter a subject in the main search box and press Search all or Load reports.</p>}
            </div>
          </div>
        )}

        {activeTab === "learning" && (
          <div className="space-y-3 pb-3">
            <Panel title="What Kalexi is learning from investigations">
              <p className="text-sm">This history records actual search jobs and their outcomes. It does not claim that the underlying AI model is retrained. Source findings should be reviewed before they are promoted to verified intelligence.</p>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-3">
                <div className="border rounded-lg p-3"><div className="text-xs text-muted-foreground">Tasks shown</div><div className="text-2xl font-semibold">{activities.length}</div></div>
                <div className="border rounded-lg p-3"><div className="text-xs text-muted-foreground">Completed</div><div className="text-2xl font-semibold">{activities.filter(x => x.status === "completed").length}</div></div>
                <div className="border rounded-lg p-3"><div className="text-xs text-muted-foreground">Needs review</div><div className="text-2xl font-semibold">{activities.filter(x => x.status === "needs_review").length}</div></div>
                <div className="border rounded-lg p-3"><div className="text-xs text-muted-foreground">Failed</div><div className="text-2xl font-semibold">{activities.filter(x => x.status === "failed").length}</div></div>
              </div>
              <button className="ri-button mt-3" onClick={() => void loadActivities()}>{learningLoading ? "Refreshing..." : "Refresh history"}</button>
            </Panel>
            <div className="space-y-2">
              {activities.map((activity, index) => (
                <article key={activity.id || index} className="border rounded-lg p-3">
                  <div className="flex flex-wrap justify-between gap-2">
                    <b className="break-words">{activity.title || activity.task_type || "Intelligence task"}</b>
                    <span className="text-xs border rounded-full px-2 py-1">{activity.status || "unknown"}</span>
                  </div>
                  <p className="text-sm mt-1 whitespace-pre-wrap break-words">{activity.details || "No task details recorded."}</p>
                  <div className="text-xs text-muted-foreground mt-2">
                    {safeDate(activity.created_at)} | Found: {activity.items_found ?? 0} | Saved: {activity.items_saved ?? 0}
                  </div>
                  {activity.source_url && <a className="text-sm underline break-all" href={activity.source_url} target="_blank" rel="noreferrer">Open source</a>}
                </article>
              ))}
              {!activities.length && <p className="text-sm text-muted-foreground p-3">No activity records are visible. Check that the intelligence_activity migration was applied and your account has the required permissions.</p>}
            </div>
          </div>
        )}
      </main>

      {readingItem && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/70 p-3 sm:p-6 no-print"
          role="dialog" aria-modal="true" aria-label="Finding details">
          <section className="w-full max-w-4xl max-h-[90dvh] overflow-hidden rounded-2xl border bg-background text-foreground shadow-2xl flex flex-col">
            <header className="flex items-start justify-between gap-4 border-b p-5">
              <div className="min-w-0">
                <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Kalexi Intelligence · Finding review</div>
                <h2 className="mt-2 text-xl font-semibold break-words">
                  {readingContent?.title || readingItem.title || readingItem.subject_name || readingItem.name || readingItem.company_name || readingItem.case_ref || "Finding details"}
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">{readingKind}</p>
              </div>
              <button type="button" className="ri-button shrink-0" onClick={() => { setReadingItem(null); setReadingContent(null); setReadingError(""); }}>Close</button>
            </header>

            <div className="ri-scroll min-h-0 flex-1 space-y-4 p-5">
              {readingBusy && <div className="rounded-lg border p-4 text-sm">Retrieving the public webpage and extracting readable content…</div>}
              {readingError && <div className="rounded-lg border border-amber-500/50 bg-amber-500/5 p-3 text-sm break-words">{readingError}</div>}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="rounded-lg border p-3">
                  <div className="text-xs text-muted-foreground">Review status</div>
                  <div className="mt-1 font-medium">{readingContent?.verification_status || readingItem.verification_status || readingItem.status || "Needs review"}</div>
                </div>
                <div className="rounded-lg border p-3">
                  <div className="text-xs text-muted-foreground">Publication date</div>
                  <div className="mt-1 font-medium">{readingContent?.published_at || readingItem["published_at"] || "Not available from source"}</div>
                </div>
              </div>

              {readingContent?.description && (
                <section>
                  <h3 className="mb-2 font-semibold">Summary from source</h3>
                  <p className="whitespace-pre-wrap break-words text-sm leading-6">{readingContent.description}</p>
                </section>
              )}

              <section>
                <h3 className="mb-2 font-semibold">Readable finding content</h3>
                <div className="rounded-xl border p-4 text-sm leading-7 whitespace-pre-wrap break-words">
                  {readingContent?.content || readingItem.description || readingItem.findings || readingItem.research_question || "No readable content is available for this finding."}
                </div>
              </section>

              {readingContent?.notice && (
                <p className="rounded-lg border border-amber-500/40 p-3 text-xs leading-5">{readingContent.notice}</p>
              )}

              {(readingContent?.source_url || readingItem.source_url || readingItem.url || readingItem.link) && (
                <section>
                  <h3 className="mb-2 font-semibold">Original source</h3>
                  <a className="break-all text-sm underline" href={readingContent?.source_url || readingItem.source_url || readingItem.url || readingItem.link} target="_blank" rel="noreferrer">
                    {readingContent?.source_url || readingItem.source_url || readingItem.url || readingItem.link}
                  </a>
                </section>
              )}

              <p className="text-xs leading-5 text-muted-foreground">
                Retrieved content is evidence for review, not automatic proof. Confirm identity, dates, context and corroboration before treating any claim as verified.
              </p>
            </div>

            <footer className="flex flex-wrap justify-between gap-2 border-t p-4">
              <button type="button" className="ri-button" onClick={() => {
                const text = [
                  readingContent?.title || "Finding",
                  `Type: ${readingKind}`,
                  `Status: ${readingContent?.verification_status || "Needs review"}`,
                  `Source: ${readingContent?.source_url || ""}`,
                  readingContent?.description || "",
                  readingContent?.content || "",
                  "Note: Unverified until independently corroborated."
                ].join("\n\n");
                void navigator.clipboard?.writeText(text);
              }}>Copy finding text</button>
              <button type="button" className="ri-button ri-primary" onClick={() => {
                if (readingItem) addToReport(readingItem, readingKind);
                setReadingItem(null);
              }}>Keep in report evidence</button>
            </footer>
          </section>
        </div>
      )}
      <footer className="shrink-0 border-t mt-2 pt-2 text-xs text-muted-foreground no-print">
        Kalexi Brokerage | Evidence-led research | Treat allegations as unverified until corroborated
      </footer>

      <div id="kalexi-print-report" className="hidden print:!block">
        <div className="hidden print:!block">
          <h1 className="text-2xl font-bold">{reportTitle || "Kalexi Due Diligence Report"}</h1>
          <p>Kalexi Brokerage | Confidential due-diligence working document</p>
          <p>Subject searched: {query || "Not specified"}</p>
          <p>Generated: {new Date().toLocaleString()}</p>
          <p>Assessment status: {reportStatus}</p>
          <hr className="my-4" />
          <h2 className="text-lg font-bold">Executive summary</h2>
          <textarea className="ri-field my-2 no-print" value={reportSummary} onChange={e => setReportSummary(e.target.value)} placeholder="Write the executive summary before generating the PDF..." />
          <p className="whitespace-pre-wrap">{reportSummary || "No executive summary supplied. Review the evidence below before relying on this report."}</p>
          <h2 className="text-lg font-bold mt-4">Risk assessment</h2>
          <p className="whitespace-pre-wrap">{reportAssessment || "No final risk conclusion entered. Do not infer that absence of findings means low risk."}</p>
          <h2 className="text-lg font-bold mt-4">Evidence and source records</h2>
          <p>Internal results: {internalCount} | External results: {externalCount} | Historical reports/memory: {reportCount}</p>
          {reportItems.map((item, index) => (
            <div key={String(item.id || item.source_url || index)} className="border-b py-3">
              <b>{index + 1}. {item.title || item.subject || item.subject_name || item.name || item.company_name || item.case_ref || "Evidence item"}</b>
              <p>Record type: {item["_kind"] || "Finding"} | Status: {item.verification_status || item.status || "Not verified"}</p>
              {item.description && <p>{item.description}</p>}
              {item.content && <p>{item.content}</p>}
              {item.findings && <p>{item.findings}</p>}
              {item["verified_finding"] && <p>Verified finding field: {item["verified_finding"]}</p>}
              {item["allegation"] && <p>Allegation field: {item["allegation"]}</p>}
              {(item.source_url || item.url || item.link) && <p>Source: {item.source_url || item.url || item.link}</p>}
              <p>Record date: {safeDate(item.created_at || item.updated_at)}</p>
            </div>
          ))}
          <h2 className="text-lg font-bold mt-4">Limitations and verification</h2>
          <p>Public-source findings may be incomplete, outdated, misidentified, or unverified. Similar names do not establish identity. Allegations are not facts. Independently confirm identity, source authenticity, dates, and legal status before acting on this report.</p>
        </div>
      </div>
    </div>
  );
}

export const Route = createFileRoute("/_authenticated/risk/search")({
  component: RiskSearchPage,
});
