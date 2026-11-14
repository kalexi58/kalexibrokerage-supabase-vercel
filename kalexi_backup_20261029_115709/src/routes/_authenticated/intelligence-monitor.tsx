import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

type Activity = {
  id: string;
  task_type: string;
  status: string;
  title: string;
  details: string | null;
  source_name: string | null;
  source_url: string | null;
  items_found: number;
  items_saved: number;
  created_at: string;
  finished_at: string | null;
};

type Result = {
  id: string;
  kind: string;
  title: string;
  detail: string;
  table: string;
};

export const Route = createFileRoute("/_authenticated/intelligence-monitor")({
  component: IntelligenceMonitor,
});

function IntelligenceMonitor() {
  const [query, setQuery] = useState("");
  const [activities, setActivities] = useState<Activity[]>([]);
  const [results, setResults] = useState<Result[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [lastSearch, setLastSearch] = useState("");
  const [totalFound, setTotalFound] = useState(0);
  const [successfulSearches, setSuccessfulSearches] = useState(0);
  const [sourceCoverage, setSourceCoverage] = useState(0);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("intelligence_activity")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(100);

      if (error) throw error;
      const rows = (data ?? []) as Activity[];
      setActivities(rows);
      setTotalFound(rows.reduce((n, a) => n + (a.items_found || 0), 0));
      setSuccessfulSearches(rows.filter(a => a.status === "completed").length);
      setSourceCoverage(new Set(rows.map(a => a.source_name).filter(Boolean)).size);
    } catch (e) {
      setMessage("Activity log unavailable. Apply the new SQL migration in Supabase, then reload. " +
        (e instanceof Error ? e.message : String(e)));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const channel = supabase.channel("kalexi-intelligence-activity")
      .on("postgres_changes", {
        event: "*", schema: "public", table: "intelligence_activity"
      }, () => { void refresh(); })
      .subscribe();
    const timer = window.setInterval(() => { void refresh(); }, 15000);
    return () => {
      window.clearInterval(timer);
      void supabase.removeChannel(channel);
    };
  }, [refresh]);

  const search = async () => {
    const term = query.trim();
    if (!term) {
      setMessage("Enter a name, company, phone number, case reference or document keyword.");
      return;
    }

    setBusy(true);
    setMessage("");
    setResults([]);
    setLastSearch(term);
    const started = new Date().toISOString();
    let found: Result[] = [];
    const errors: string[] = [];

    const logStart = await supabase.from("intelligence_activity").insert({
      task_type: "internal_search",
      status: "running",
      title: `Searching internal records: ${term}`,
      details: "Checking permitted Kalexi internal datasets.",
      items_found: 0,
      items_saved: 0,
      started_at: started,
    }).select("id").maybeSingle();

    const logId = logStart.data?.id as string | undefined;

    const searches: Array<{
      table: string;
      label: string;
      select: string;
      columns: string[];
      permission: string;
    }> = [
      { table: "clients", label: "Client", select: "id,client_ref,full_name,company_name,phone,email",
        columns: ["full_name", "company_name", "phone", "email", "client_ref"], permission: "clients.view" },
      { table: "companies", label: "Company", select: "id,name,registration_number,country,status",
        columns: ["name", "registration_number", "country"], permission: "clients.view" },
      { table: "contacts", label: "Contact", select: "id,full_name,role,phone,email,company_id",
        columns: ["full_name", "role", "phone", "email"], permission: "clients.view" },
      { table: "risk_cases", label: "Risk case", select: "id,case_ref,case_kind,subject_name,subject_company,subject_phone,subject_email,subject_identifier,severity,status",
        columns: ["case_ref", "case_kind", "subject_name", "subject_company", "subject_phone", "subject_email", "subject_identifier"], permission: "risk.view" },
      { table: "research_cases", label: "Research case", select: "id,case_ref,subject,related_party,status,research_question",
        columns: ["case_ref", "subject", "related_party", "research_question"], permission: "research.view" },
      { table: "opportunities", label: "Opportunity", select: "id,opportunity_ref,title,owner_name,owner_contact",
        columns: ["opportunity_ref", "title", "owner_name", "owner_contact"], permission: "opportunities.view" },
      { table: "documents", label: "Document", select: "id,document_ref,title,document_type,verification_status,status",
        columns: ["document_ref", "title", "document_type"], permission: "documents.view" },
    ];

    for (const item of searches) {
      try {
        const { data, error } = await supabase.from(item.table as never)
          .select(item.select)
          .or(item.columns.map(c => `${c}.ilike.%${term.replace(/[%_,]/g, " ")}%`).join(","))
          .limit(20);
        if (error) {
          errors.push(`${item.label}: ${error.message}`);
          continue;
        }
        for (const raw of (data ?? []) as unknown as Record<string, unknown>[]) {
          const title = String(raw.full_name ?? raw.subject_name ?? raw.subject ??
            raw.name ?? raw.title ?? raw.case_ref ?? raw.client_ref ?? raw.document_ref ?? "Record");
          const detail = Object.entries(raw)
            .filter(([k, v]) => k !== "id" && v !== null && v !== undefined)
            .map(([k, v]) => `${k.replaceAll("_", " ")}: ${String(v)}`)
            .slice(0, 5).join(" · ");
          found.push({
            id: String(raw.id ?? `${item.table}-${found.length}`),
            kind: item.label,
            title,
            detail,
            table: item.table,
          });
        }
      } catch (e) {
        errors.push(`${item.label}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    setResults(found);
    const finishStatus = found.length ? "completed" : (errors.length ? "failed" : "completed");
    const detail = `Search term: ${term}. Matched ${found.length} records. ` +
      (errors.length ? `Unavailable/failed datasets: ${errors.join(" | ")}` :
        "All configured internal searches returned without a query error.");

    if (logId) {
      await supabase.from("intelligence_activity").update({
        status: finishStatus,
        title: `Internal search finished: ${term}`,
        details: detail,
        items_found: found.length,
        items_saved: 0,
        finished_at: new Date().toISOString(),
      }).eq("id", logId);
    } else {
      await supabase.from("intelligence_activity").insert({
        task_type: "internal_search",
        status: finishStatus,
        title: `Internal search: ${term}`,
        details: detail,
        items_found: found.length,
        finished_at: new Date().toISOString(),
      });
    }

    setMessage(
      `${found.length} matching records found. ` +
      (errors.length ? `${errors.length} dataset(s) could not be searched. Check permissions and column names.` :
        "Internal search finished.")
    );
    setBusy(false);
    await refresh();
  };

  const completed = activities.filter(a => a.status === "completed").length;
  const failed = activities.filter(a => a.status === "failed").length;
  const running = activities.filter(a => a.status === "running").length;
  const reviewed = activities.filter(a => a.status === "needs_review").length;
  const completionRate = activities.length
    ? Math.round((completed / activities.length) * 100) : 0;

  const intelligenceLevel = useMemo(() => {
    if (!activities.length) return { label: "Not measured yet", color: "#64748b" };
    if (completionRate >= 90 && failed === 0) return { label: "Stable operations", color: "#15803d" };
    if (completionRate >= 70) return { label: "Operational, needs improvement", color: "#a16207" };
    return { label: "Limited or unreliable", color: "#b91c1c" };
  }, [activities.length, completionRate, failed]);

  return (
    <main style={{ padding: 24, maxWidth: 1400, margin: "0 auto", color: "var(--foreground, #172033)" }}>
      <header style={{ display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap", alignItems: "center" }}>
        <div>
          <div style={{ fontSize: 12, letterSpacing: 2, color: "#64748b" }}>KALEXI BROKERAGE · RESEARCH OPERATIONS</div>
          <h1 style={{ fontSize: 30, fontWeight: 750, margin: "8px 0" }}>Intelligence Monitor</h1>
          <p style={{ margin: 0, color: "#64748b" }}>Search internal records and observe actual research activity.</p>
        </div>
        <button onClick={() => void refresh()} style={buttonStyle}>↻ Refresh status</button>
      </header>

      <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 12, marginTop: 24 }}>
        <Metric title="Records matched" value={totalFound} note="Across logged searches" />
        <Metric title="Completed tasks" value={completed} note="Logged activity records" />
        <Metric title="Tasks running" value={running} note="Currently marked running" />
        <Metric title="Failed tasks" value={failed} note="Tasks requiring investigation" />
        <Metric title="Sources seen" value={sourceCoverage} note="Distinct recorded source labels" />
        <Metric title="Review queue" value={reviewed} note="Tasks marked for review" />
      </section>

      <section style={panelStyle}>
        <h2 style={headingStyle}>Internal Intelligence Search</h2>
        <p style={{ color: "#64748b", marginTop: 0 }}>Search across the datasets your account is permitted to read.</p>
        <form onSubmit={e => { e.preventDefault(); void search(); }}
          style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <input value={query} onChange={e => setQuery(e.target.value)}
            placeholder="Name, company, phone, case reference, document..."
            style={{ flex: "1 1 300px", padding: 13, border: "1px solid #cbd5e1", borderRadius: 8, minWidth: 0 }} />
          <button disabled={busy} style={{ ...buttonStyle, opacity: busy ? .6 : 1 }}>
            {busy ? "Searching..." : "Search records"}
          </button>
        </form>
        {busy && <p role="status">Processing: checking permitted internal datasets…</p>}
        {message && <p role="status" style={{ background: "#f1f5f9", padding: 12, borderRadius: 8, overflowWrap: "anywhere" }}>{message}</p>}
        {lastSearch && <p style={{ color: "#64748b" }}>Last query: <strong>{lastSearch}</strong></p>}
        <div style={{ display: "grid", gap: 10, marginTop: 12 }}>
          {results.map(r => (
            <article key={`${r.table}-${r.id}`} style={{ border: "1px solid #e2e8f0", borderRadius: 9, padding: 13 }}>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                <strong>{r.title}</strong><span style={tagStyle}>{r.kind}</span>
              </div>
              <p style={{ color: "#64748b", marginBottom: 0, overflowWrap: "anywhere" }}>{r.detail}</p>
              <small style={{ color: "#64748b" }}>Dataset: {r.table}</small>
            </article>
          ))}
        </div>
      </section>

      <section style={panelStyle}>
        <h2 style={headingStyle}>System learning and activity</h2>
        <p style={{ color: "#64748b" }}>
          This monitor measures logged operations. It does not claim that the AI trained a new model.
          Findings must be verified before being treated as facts.
        </p>
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <strong>Operational status:</strong>
          <span style={{ color: intelligenceLevel.color, fontWeight: 700 }}>{intelligenceLevel.label}</span>
          <span style={{ color: "#64748b" }}>Completion rate: {completionRate}%</span>
        </div>
        <div style={{ height: 10, background: "#e2e8f0", borderRadius: 99, overflow: "hidden", marginTop: 12 }}>
          <div style={{ height: "100%", width: `${completionRate}%`, background: intelligenceLevel.color, transition: "width .3s" }} />
        </div>
        <div style={{ display: "grid", gap: 10, marginTop: 18 }}>
          {activities.map(a => (
            <article key={a.id} style={{ border: "1px solid #e2e8f0", borderRadius: 9, padding: 13 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                <strong>{a.title}</strong>
                <span style={tagStyle}>{a.status.toUpperCase()}</span>
              </div>
              <p style={{ marginBottom: 5, overflowWrap: "anywhere" }}>{a.details || "No additional details."}</p>
              <small style={{ color: "#64748b" }}>
                {a.task_type} · Found {a.items_found} · Saved {a.items_saved} · {new Date(a.created_at).toLocaleString()}
              </small>
              {a.source_url && <div><a href={a.source_url} target="_blank" rel="noreferrer">Open source</a></div>}
            </article>
          ))}
          {!activities.length && !loading && <p>No activity has been logged yet. Run a search to create the first activity record.</p>}
          {loading && <p>Refreshing activity log…</p>}
        </div>
      </section>
    </main>
  );
}

function Metric({ title, value, note }: { title: string; value: number; note: string }) {
  return <section style={{ ...panelStyle, margin: 0 }}>
    <div style={{ color: "#64748b", fontSize: 13 }}>{title}</div>
    <div style={{ fontSize: 29, fontWeight: 750, marginTop: 7 }}>{value}</div>
    <div style={{ color: "#64748b", fontSize: 12, marginTop: 5 }}>{note}</div>
  </section>;
}

const panelStyle: React.CSSProperties = {
  background: "var(--card, #fff)", border: "1px solid #e2e8f0",
  borderRadius: 12, padding: 18, marginTop: 18,
};
const headingStyle: React.CSSProperties = { fontSize: 19, fontWeight: 700, marginTop: 0 };
const buttonStyle: React.CSSProperties = {
  background: "#123c55", color: "#fff", border: 0, padding: "12px 16px",
  borderRadius: 8, cursor: "pointer", fontWeight: 650,
};
const tagStyle: React.CSSProperties = {
  fontSize: 11, padding: "4px 8px", borderRadius: 99,
  background: "#e2e8f0", color: "#334155", fontWeight: 700,
};
