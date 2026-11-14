import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/intelligence-monitor")({
  component: IntelligenceMonitor,
});

function IntelligenceMonitor() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<any[]>([]);
  const [activity, setActivity] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("Ready");

  async function loadActivity() {
    const { data, error } = await supabase
      .from("intelligence_activity")
      .select("id,title,status,details,items_found,created_at")
      .order("created_at", { ascending: false })
      .limit(30);

    if (error) {
      setMessage("Activity log: " + error.message);
      return;
    }
    setActivity(data ?? []);
  }

  useEffect(() => {
    void loadActivity();
    const timer = window.setInterval(() => void loadActivity(), 5000);
    return () => window.clearInterval(timer);
  }, []);

  async function search() {
    const term = query.trim();
    if (term.length < 2) {
      setMessage("Enter at least two characters.");
      return;
    }

    setBusy(true);
    setResults([]);
    setMessage("Searching internal records...");
    const found: any[] = [];
    const errors: string[] = [];

    const sources = [
      {
        table: "clients",
        label: "Clients",
        columns: ["full_name", "company_name", "phone", "email", "client_ref"],
        select: "id,client_ref,full_name,company_name,phone,email",
      },
      {
        table: "companies",
        label: "Companies",
        columns: ["name", "registration_number", "country"],
        select: "id,name,registration_number,country,status",
      },
      {
        table: "contacts",
        label: "Contacts",
        columns: ["full_name", "role", "phone", "email"],
        select: "id,full_name,role,phone,email",
      },
      {
        table: "risk_cases",
        label: "Risk cases",
        columns: ["case_ref", "subject_name", "subject_company", "subject_phone", "subject_email"],
        select: "id,case_ref,subject_name,subject_company,subject_phone,subject_email,severity,status",
      },
      {
        table: "research_cases",
        label: "Research cases",
        columns: ["case_ref", "subject", "related_party", "research_question"],
        select: "id,case_ref,subject,related_party,research_question,status",
      },
      {
        table: "opportunities",
        label: "Opportunities",
        columns: ["opportunity_ref", "title", "owner_name", "owner_contact"],
        select: "id,opportunity_ref,title,owner_name,owner_contact",
      },
      {
        table: "documents",
        label: "Documents",
        columns: ["document_ref", "title", "document_type"],
        select: "id,document_ref,title,document_type,verification_status,status",
      },
    ];

    const safeTerm = term.replace(/[%_,]/g, " ");
    for (const source of sources) {
      try {
        const { data, error } = await supabase
          .from(source.table as any)
          .select(source.select)
          .or(source.columns.map(c => `${c}.ilike.%${safeTerm}%`).join(","))
          .limit(15);

        if (error) {
          errors.push(`${source.label}: ${error.message}`);
          continue;
        }

        for (const row of data ?? []) {
          const r = row as Record<string, any>;
          found.push({
            id: r.id,
            type: source.label,
            title: r.full_name || r.subject_name || r.subject || r.name ||
              r.title || r.case_ref || r.client_ref || r.document_ref || "Record",
            details: Object.entries(r)
              .filter(([key, value]) => key !== "id" && value != null)
              .map(([key, value]) => `${key.replaceAll("_", " ")}: ${value}`)
              .slice(0, 5).join(" · "),
          });
        }
      } catch (e) {
        errors.push(`${source.label}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    setResults(found);
    setBusy(false);
    setMessage(
      `${found.length} matching records found.` +
      (errors.length ? ` Some searches failed: ${errors.join(" | ")}` : "")
    );

    // Record activity if this account has permission to insert it.
    const { error: logError } = await supabase.from("intelligence_activity").insert({
      task_type: "internal_search",
      status: errors.length ? "needs_review" : "completed",
      title: `Internal search: ${term}`,
      details: errors.length ? errors.join(" | ") : "Internal search completed.",
      items_found: found.length,
      items_saved: 0,
      finished_at: new Date().toISOString(),
    });

    if (logError) {
      setMessage(old => old + " Activity logging failed: " + logError.message);
    }
    await loadActivity();
  }

  return (
    <main style={{ maxWidth: 1200, margin: "0 auto", padding: 24, color: "#172033" }}>
      <p style={{ color: "#64748b", letterSpacing: 2 }}>KALEXI BROKERAGE</p>
      <h1 style={{ fontSize: 30, fontWeight: 750 }}>Intelligence Monitor</h1>
      <p>Internal records search, research activity and operational progress.</p>

      <form onSubmit={e => { e.preventDefault(); void search(); }}
        style={{ display: "flex", gap: 8, flexWrap: "wrap", margin: "24px 0" }}>
        <input value={query} onChange={e => setQuery(e.target.value)}
          placeholder="Search name, company, phone, case or document"
          style={{ flex: "1 1 300px", padding: 13, border: "1px solid #cbd5e1", borderRadius: 8 }} />
        <button disabled={busy} style={{ padding: "12px 20px", background: "#123c55", color: "white", border: 0, borderRadius: 8 }}>
          {busy ? "Searching..." : "Search"}
        </button>
      </form>

      <p role="status" style={{ background: "#f1f5f9", padding: 12, borderRadius: 8, overflowWrap: "anywhere" }}>{message}</p>

      <h2>Search results ({results.length})</h2>
      {results.map((r, i) => (
        <article key={`${r.type}-${r.id}-${i}`} style={{ border: "1px solid #e2e8f0", borderRadius: 8, padding: 14, marginBottom: 10 }}>
          <strong>{r.title}</strong>
          <p style={{ color: "#64748b" }}>{r.type}</p>
          <p>{r.details}</p>
        </article>
      ))}

      <h2 style={{ marginTop: 32 }}>System activity and learning log</h2>
      <p style={{ color: "#64748b" }}>
        This log shows recorded operations, not AI model training. A search alone does not teach the model new knowledge.
      </p>
      {activity.map(a => (
        <article key={a.id} style={{ border: "1px solid #e2e8f0", borderRadius: 8, padding: 14, marginBottom: 10 }}>
          <strong>{a.title}</strong> · {a.status}
          <p>{a.details}</p>
          <small>{a.items_found} records · {new Date(a.created_at).toLocaleString()}</small>
        </article>
      ))}
      {!activity.length && <p>No activity recorded yet, or the account cannot read the activity table.</p>}
    </main>
  );
}
