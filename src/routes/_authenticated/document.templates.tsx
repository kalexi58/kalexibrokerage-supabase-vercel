import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";

type Template = {
  id: string; name: string; category: string; departments: string[];
  filename: string; type: string; size: number; data: string;
  createdAt: string; status: string; version: number;
};

const KEY = "kalexi-document-templates-v1";
const DEPARTMENTS = ["All departments", "Administration", "Brokerage", "Compliance", "Research", "Verification", "Finance", "Operations", "Human Resources", "Legal"];

function readTemplates(): Template[] {
  try { return JSON.parse(localStorage.getItem(KEY) || "[]"); } catch { return []; }
}

function DocumentTemplates() {
  const [items, setItems] = React.useState<Template[]>([]);
  const [name, setName] = React.useState("");
  const [category, setCategory] = React.useState("General");
  const [departments, setDepartments] = React.useState<string[]>(["All departments"]);
  const [file, setFile] = React.useState<File | null>(null);
  const [query, setQuery] = React.useState("");
  const [filter, setFilter] = React.useState("All");
  const [notice, setNotice] = React.useState("");

  React.useEffect(() => setItems(readTemplates()), []);

  const persist = (next: Template[]) => {
    try {
      localStorage.setItem(KEY, JSON.stringify(next));
      setItems(next);
      return true;
    } catch {
      setNotice("Browser storage is full. Remove a large template and try again.");
      return false;
    }
  };

  const upload = async () => {
    if (!file || !name.trim()) {
      setNotice("Enter a template name and choose a file.");
      return;
    }
    const supported = [
      "application/pdf",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/msword",
      "text/plain"
    ];
    if (!supported.includes(file.type) && !/\.(pdf|docx|doc|txt)$/i.test(file.name)) {
      setNotice("Supported formats: PDF, DOCX, DOC and TXT.");
      return;
    }
    if (file.size > 1_500_000) {
      setNotice("For this browser-based version, files must be 1.5 MB or smaller.");
      return;
    }
    const reader = new FileReader();
    reader.onerror = () => setNotice("Could not read the selected file.");
    reader.onload = () => {
      const entry: Template = {
        id: crypto.randomUUID(), name: name.trim(), category, departments,
        filename: file.name, type: file.type || "application/octet-stream",
        size: file.size, data: String(reader.result || ""),
        createdAt: new Date().toISOString(), status: "Active", version: 1
      };
      const next = [entry, ...items];
      if (persist(next)) {
        setName(""); setFile(null);
        setNotice("Template imported into this browser.");
      }
    };
    reader.readAsDataURL(file);
  };

  const download = (item: Template) => {
    const a = document.createElement("a");
    a.href = item.data; a.download = item.filename;
    document.body.appendChild(a); a.click(); a.remove();
  };

  const toggleDepartment = (department: string) => {
    setDepartments(previous => {
      if (department === "All departments") return ["All departments"];
      const next = previous.filter(x => x !== "All departments");
      const updated = next.includes(department) ? next.filter(x => x !== department) : [...next, department];
      return updated.length ? updated : ["All departments"];
    });
  };

  const updateItem = (id: string, changes: Partial<Template>) =>
    persist(items.map(item => item.id === id ? { ...item, ...changes } : item));

  const panel: React.CSSProperties = {
    background: "var(--surface-background, white)", color: "var(--text-primary, #172521)",
    border: "1px solid var(--border-default, #DCE4DF)", borderRadius: 14,
    padding: 20, display: "grid", gap: 14
  };
  const input: React.CSSProperties = {
    boxSizing: "border-box", width: "100%", padding: "10px 12px",
    border: "1px solid var(--border-default, #DCE4DF)", borderRadius: 8,
    background: "var(--surface-background, white)", color: "var(--text-primary, #172521)"
  };
  const button = (primary = false): React.CSSProperties => ({
    padding: "9px 13px", borderRadius: 8, cursor: "pointer", fontWeight: 650,
    border: "1px solid var(--border-default, #DCE4DF)",
    background: primary ? "var(--brand-primary, #173D35)" : "var(--surface-background, white)",
    color: primary ? "white" : "var(--text-primary, #172521)"
  });

  const visible = items.filter(item =>
    `${item.name} ${item.filename} ${item.category}`.toLowerCase().includes(query.toLowerCase()) &&
    (filter === "All" || item.status === filter)
  );

  return <main style={{
    minHeight: "100vh", padding: "clamp(16px,3vw,32px)", display: "grid", gap: 20,
    alignContent: "start", background: "var(--app-background, #F5F7F6)",
    color: "var(--text-primary, #172521)", fontFamily: "var(--brand-font-body, Inter, sans-serif)"
  }}>
    <header>
      <div style={{ color: "var(--brand-secondary)", fontSize: 12, fontWeight: 800, letterSpacing: 1 }}>DOCUMENT GOVERNANCE</div>
      <h1 style={{ marginBottom: 8 }}>Document Template Center</h1>
      <p style={{ color: "var(--text-muted)", marginTop: 0 }}>Import company templates, assign departments and manage active versions.</p>
    </header>

    {notice && <div role="status" style={{ ...panel, padding: 12 }}>{notice}</div>}

    <section style={panel}>
      <h2 style={{ margin: 0 }}>Import a template</h2>
      <label style={{ display: "grid", gap: 6 }}>Template name
        <input value={name} onChange={e => setName(e.target.value)} style={input} placeholder="e.g. Client Due Diligence Report" />
      </label>
      <label style={{ display: "grid", gap: 6 }}>Category
        <select value={category} onChange={e => setCategory(e.target.value)} style={input}>
          {["General", "Due diligence", "Client onboarding", "Verification", "Risk report", "Contract", "Invoice", "Internal memo", "Compliance", "Other"].map(x => <option key={x}>{x}</option>)}
        </select>
      </label>
      <fieldset style={{ border: "1px solid var(--border-default)", borderRadius: 8, padding: 12 }}>
        <legend>Departments allowed to use this template</legend>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 10 }}>
          {DEPARTMENTS.map(department => <label key={department} style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input type="checkbox" checked={departments.includes(department)} onChange={() => toggleDepartment(department)} />
            {department}
          </label>)}
        </div>
      </fieldset>
      <label style={{ display: "grid", gap: 6 }}>Template file (PDF, DOCX, DOC or TXT)
        <input type="file" accept=".pdf,.docx,.doc,.txt" onChange={e => setFile(e.target.files?.[0] || null)} />
      </label>
      {file && <div style={{ color: "var(--text-muted)", fontSize: 13 }}>{file.name} · {(file.size / 1024).toFixed(1)} KB</div>}
      <div><button style={button(true)} onClick={upload}>Import template</button></div>
    </section>

    <section style={panel}>
      <h2 style={{ margin: 0 }}>Template library ({items.length})</h2>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 10 }}>
        <input value={query} onChange={e => setQuery(e.target.value)} style={input} placeholder="Search templates…" />
        <select value={filter} onChange={e => setFilter(e.target.value)} style={input}>
          <option>All</option><option>Active</option><option>Archived</option>
        </select>
      </div>
      {visible.length === 0 && <p style={{ color: "var(--text-muted)" }}>No templates found. Import your first company template above.</p>}
      {visible.map(item => <article key={item.id} style={{
        border: "1px solid var(--border-default)", borderRadius: 10, padding: 14,
        display: "grid", gap: 10, minWidth: 0
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div style={{ minWidth: 0 }}>
            <strong>{item.name}</strong>
            <div style={{ color: "var(--text-muted)", fontSize: 13, marginTop: 5 }}>
              {item.filename} · {item.category} · Version {item.version}
            </div>
          </div>
          <span style={{ color: item.status === "Active" ? "var(--status-success)" : "var(--text-muted)", fontWeight: 700 }}>{item.status}</span>
        </div>
        <div style={{ fontSize: 13 }}>Departments: {item.departments.join(", ")}</div>
        <div style={{ color: "var(--text-muted)", fontSize: 12 }}>
          Imported {new Date(item.createdAt).toLocaleString()} · {(item.size / 1024).toFixed(1)} KB
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button style={button(true)} onClick={() => download(item)}>Download original</button>
          <button style={button()} onClick={() => updateItem(item.id, {
            status: item.status === "Active" ? "Archived" : "Active"
          })}>{item.status === "Active" ? "Archive" : "Reactivate"}</button>
          <button style={button()} onClick={() => {
            if (confirm(`Delete "${item.name}" from this browser?`)) persist(items.filter(x => x.id !== item.id));
          }}>Delete</button>
        </div>
      </article>)}
    </section>

    <section style={{ ...panel, color: "var(--text-muted)", fontSize: 13 }}>
      Current limitation: templates and department assignments are stored in this browser, not securely shared through Supabase. Department selection is not server-enforced access control. Imported files remain original files; this page does not edit DOCX/PDF content or automatically generate branded reports from them.
    </section>
  </main>;
}

export const Route = createFileRoute("/_authenticated/document/templates")({
  component: DocumentTemplates
});
