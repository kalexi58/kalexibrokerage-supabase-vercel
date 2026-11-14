import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";

type Brand = {
  companyName: string;
  legalName: string;
  shortName: string;
  tagline: string;
  description: string;
  vision: string;
  mission: string;
  values: string;
  email: string;
  phone: string;
  website: string;
  address: string;
  primary: string;
  secondary: string;
  accent: string;
  background: string;
  surface: string;
  text: string;
  muted: string;
  border: string;
  success: string;
  warning: string;
  danger: string;
  logo: string;
  mode: string;
};

type Template = {
  id: string;
  name: string;
  category: string;
  departments: string[];
  filename: string;
  mime: string;
  size: number;
  data: string;
  status: string;
  version: number;
  createdAt: string;
};

const BRAND_KEY = "kalexi-brand-settings-v2";
const TEMPLATE_KEY = "kalexi-document-templates-v2";

const defaults: Brand = {
  companyName: "Kalexi Brokerage",
  legalName: "Kalexi Brokerage Ltd",
  shortName: "Kalexi",
  tagline: "You grow, we grow",
  description: "",
  vision: "",
  mission: "",
  values: "",
  email: "info@kalexibrokerage.com",
  phone: "",
  website: "https://www.kalexibrokerage.com",
  address: "",
  primary: "#173D35",
  secondary: "#245B4D",
  accent: "#D7AA54",
  background: "#F5F7F6",
  surface: "#FFFFFF",
  text: "#172521",
  muted: "#65736D",
  border: "#DCE4DF",
  success: "#16794B",
  warning: "#A96508",
  danger: "#B42318",
  logo: "",
  mode: "light"
};

const departments = [
  "All departments",
  "Administration",
  "Brokerage",
  "Compliance",
  "Research",
  "Verification",
  "Finance",
  "Operations",
  "Human Resources",
  "Legal"
];

function loadBrand(): Brand {
  try {
    return { ...defaults, ...JSON.parse(localStorage.getItem(BRAND_KEY) || "{}") };
  } catch {
    return { ...defaults };
  }
}

function applyBrand(b: Brand) {
  const root = document.documentElement;
  const tokens: Record<string, string> = {
    "--brand-primary": b.primary,
    "--brand-secondary": b.secondary,
    "--brand-accent": b.accent,
    "--app-background": b.background,
    "--surface-background": b.surface,
    "--text-primary": b.text,
    "--text-muted": b.muted,
    "--border-default": b.border,
    "--status-success": b.success,
    "--status-warning": b.warning,
    "--status-danger": b.danger
  };

  Object.entries(tokens).forEach(([key, value]) => {
    root.style.setProperty(key, value);
  });

  root.dataset.brandMode = b.mode;
  document.title = b.companyName || defaults.companyName;

  let favicon = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
  if (b.logo) {
    if (!favicon) {
      favicon = document.createElement("link");
      favicon.rel = "icon";
      document.head.appendChild(favicon);
    }
    favicon.href = b.logo;
  }
}

function loadTemplates(): Template[] {
  try {
    return JSON.parse(localStorage.getItem(TEMPLATE_KEY) || "[]");
  } catch {
    return [];
  }
}

function Field(props: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  multiline?: boolean;
  type?: string;
}) {
  const control: React.CSSProperties = {
    width: "100%",
    minWidth: 0,
    boxSizing: "border-box",
    padding: "10px 12px",
    border: "1px solid var(--border-default, #DCE4DF)",
    borderRadius: 8,
    background: "var(--surface-background, #fff)",
    color: "var(--text-primary, #172521)",
    font: "inherit"
  };

  return (
    <label style={{ display: "grid", gap: 6, fontSize: 13, fontWeight: 600 }}>
      {props.label}
      {props.multiline ? (
        <textarea
          rows={3}
          value={props.value}
          onChange={e => props.onChange(e.target.value)}
          style={control}
        />
      ) : (
        <input
          type={props.type || "text"}
          value={props.value}
          onChange={e => props.onChange(e.target.value)}
          style={control}
        />
      )}
    </label>
  );
}

function BrandPage() {
  const [brand, setBrand] = React.useState<Brand>(defaults);
  const [draft, setDraft] = React.useState<Brand>(defaults);
  const [tab, setTab] = React.useState("identity");
  const [message, setMessage] = React.useState("");
  const [templates, setTemplates] = React.useState<Template[]>([]);
  const [templateName, setTemplateName] = React.useState("");
  const [category, setCategory] = React.useState("General");
  const [assigned, setAssigned] = React.useState<string[]>(["All departments"]);
  const [file, setFile] = React.useState<File | null>(null);
  const [search, setSearch] = React.useState("");
  const [loaded, setLoaded] = React.useState(false);
  const [confirmReset, setConfirmReset] = React.useState(false);

  React.useEffect(() => {
    const current = loadBrand();
    setBrand(current);
    setDraft(current);
    setTemplates(loadTemplates());
    applyBrand(current);
    setLoaded(true);
  }, []);

  const update = (key: keyof Brand, value: string) => {
    setDraft(previous => ({ ...previous, [key]: value }));
  };

  const saveBrand = () => {
    if (!draft.companyName.trim()) {
      setMessage("Company display name is required.");
      return;
    }

    const hexFields: (keyof Brand)[] = [
      "primary", "secondary", "accent", "background", "surface",
      "text", "muted", "border", "success", "warning", "danger"
    ];

    for (const key of hexFields) {
      if (!/^#[0-9a-fA-F]{6}$/.test(draft[key])) {
        setMessage(`Invalid colour for ${key}. Use a six-digit hexadecimal colour.`);
        return;
      }
    }

    try {
      localStorage.setItem(BRAND_KEY, JSON.stringify(draft));
      setBrand({ ...draft });
      applyBrand(draft);
      setMessage("Brand settings saved in this browser.");
    } catch {
      setMessage("Unable to save settings. Browser storage may be full.");
    }
  };

  const saveTemplates = (next: Template[]) => {
    try {
      localStorage.setItem(TEMPLATE_KEY, JSON.stringify(next));
      setTemplates(next);
      return true;
    } catch {
      setMessage("Template storage is full. Try a smaller file.");
      return false;
    }
  };

  const uploadLogo = (image?: File) => {
    if (!image) return;

    if (!["image/png", "image/jpeg", "image/webp", "image/svg+xml"].includes(image.type)) {
      setMessage("Logo must be PNG, JPEG, WebP or SVG.");
      return;
    }

    if (image.size > 1024 * 1024) {
      setMessage("Logo must be 1 MB or smaller.");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => update("logo", String(reader.result || ""));
    reader.onerror = () => setMessage("Could not read logo.");
    reader.readAsDataURL(image);
  };

  const importTemplate = () => {
    if (!file || !templateName.trim()) {
      setMessage("Enter a template name and select a file.");
      return;
    }

    if (!/\.(pdf|docx|doc|txt)$/i.test(file.name)) {
      setMessage("Supported template formats: PDF, DOCX, DOC and TXT.");
      return;
    }

    if (file.size > 1_000_000) {
      setMessage("This browser-based version accepts files up to 1 MB.");
      return;
    }

    const reader = new FileReader();

    reader.onerror = () => setMessage("Unable to read template file.");

    reader.onload = () => {
      const item: Template = {
        id: crypto.randomUUID(),
        name: templateName.trim(),
        category,
        departments: assigned,
        filename: file.name,
        mime: file.type || "application/octet-stream",
        size: file.size,
        data: String(reader.result || ""),
        status: "Active",
        version: 1,
        createdAt: new Date().toISOString()
      };

      if (saveTemplates([item, ...templates])) {
        setTemplateName("");
        setFile(null);
        setMessage("Template imported.");
      }
    };

    reader.readAsDataURL(file);
  };

  const downloadTemplate = (item: Template) => {
    const link = document.createElement("a");
    link.href = item.data;
    link.download = item.filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
  };

  const button = (primary = false): React.CSSProperties => ({
    padding: "10px 14px",
    borderRadius: 8,
    border: "1px solid var(--border-default, #DCE4DF)",
    background: primary ? "var(--brand-primary, #173D35)" : "var(--surface-background, #fff)",
    color: primary ? "#fff" : "var(--text-primary, #172521)",
    cursor: "pointer",
    fontWeight: 650
  });

  const panel: React.CSSProperties = {
    padding: 20,
    display: "grid",
    gap: 16,
    border: "1px solid var(--border-default, #DCE4DF)",
    borderRadius: 12,
    background: "var(--surface-background, #fff)"
  };

  const grid: React.CSSProperties = {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))",
    gap: 14
  };

  if (!loaded) return <main style={{ padding: 24 }}>Loading Brand Centre…</main>;

  const filteredTemplates = templates.filter(t =>
    `${t.name} ${t.category} ${t.filename}`.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <main style={{
      display: "grid",
      alignContent: "start",
      gap: 20,
      padding: "clamp(16px, 3vw, 32px)",
      background: "var(--app-background, #F5F7F6)",
      color: "var(--text-primary, #172521)",
      minHeight: "100vh",
      fontFamily: "Inter, Arial, sans-serif"
    }}>
      <header>
        <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: 1, color: "var(--brand-secondary)" }}>
          ADMINISTRATION / CONFIGURATION
        </div>
        <h1 style={{ marginBottom: 6 }}>Brand Centre</h1>
        <p style={{ color: "var(--text-muted)", marginTop: 0 }}>
          Manage your company identity, application appearance and document templates.
        </p>
      </header>

      {message && (
        <div role="status" style={{ ...panel, padding: 12 }}>
          {message}
          <button style={button()} onClick={() => setMessage("")}>Dismiss</button>
        </div>
      )}

      <nav aria-label="Brand Centre sections" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {[
          ["identity", "Company identity"],
          ["appearance", "Colours and appearance"],
          ["templates", "Document templates"]
        ].map(([value, label]) => (
          <button
            key={value}
            style={{
              ...button(tab === value),
              borderColor: tab === value ? "var(--brand-primary)" : "var(--border-default)"
            }}
            onClick={() => setTab(value)}
          >
            {label}
          </button>
        ))}
      </nav>

      {tab !== "templates" && (
        <section style={panel}>
          <h2 style={{ margin: 0 }}>Live preview</h2>
          <div style={{ overflow: "hidden", border: "1px solid var(--border-default)", borderRadius: 12 }}>
            <div style={{
              padding: 18,
              display: "flex",
              alignItems: "center",
              gap: 12,
              background: draft.primary,
              color: "#fff"
            }}>
              {draft.logo ? (
                <img src={draft.logo} alt="Brand logo" style={{ maxWidth: 120, maxHeight: 48, objectFit: "contain" }} />
              ) : (
                <div style={{
                  padding: 12,
                  borderRadius: 8,
                  background: draft.accent,
                  color: draft.primary,
                  fontWeight: 900
                }}>{draft.shortName.slice(0, 2).toUpperCase()}</div>
              )}
              <div>
                <strong style={{ fontSize: 20 }}>{draft.companyName}</strong>
                <div>{draft.tagline}</div>
              </div>
            </div>
            <div style={{ padding: 20, background: draft.background, color: draft.text }}>
              <h3>{draft.vision || "Your vision statement"}</h3>
              <p style={{ color: draft.muted }}>{draft.description || "Company description preview."}</p>
              <button style={{ ...button(true), background: draft.primary }}>Primary action</button>
              <span style={{ marginLeft: 12, color: draft.accent }}>Accent colour</span>
            </div>
          </div>

          {tab === "identity" ? (
            <>
              <h2>Company identity</h2>
              <div style={grid}>
                {([
                  ["companyName", "Company display name"],
                  ["legalName", "Legal company name"],
                  ["shortName", "Short name"],
                  ["tagline", "Tagline"],
                  ["email", "Contact email"],
                  ["phone", "Phone number"],
                  ["website", "Website"],
                  ["address", "Office address"]
                ] as [keyof Brand, string][]).map(([key, label]) => (
                  <Field key={key} label={label} value={draft[key]} onChange={v => update(key, v)} />
                ))}
              </div>
              {([
                ["description", "Company description"],
                ["vision", "Vision statement"],
                ["mission", "Mission statement"],
                ["values", "Core values"]
              ] as [keyof Brand, string][]).map(([key, label]) => (
                <Field key={key} label={label} value={draft[key]} multiline onChange={v => update(key, v)} />
              ))}
            </>
          ) : (
            <>
              <h2>Visual identity</h2>
              <div style={grid}>
                {([
                  ["primary", "Primary"],
                  ["secondary", "Secondary"],
                  ["accent", "Accent"],
                  ["background", "Page background"],
                  ["surface", "Cards and surfaces"],
                  ["text", "Main text"],
                  ["muted", "Muted text"],
                  ["border", "Borders"],
                  ["success", "Success"],
                  ["warning", "Warning"],
                  ["danger", "Error"]
                ] as [keyof Brand, string][]).map(([key, label]) => (
                  <label key={key} style={{ display: "grid", gap: 6, fontSize: 13, fontWeight: 600 }}>
                    {label}
                    <div style={{ display: "flex", gap: 8 }}>
                      <input
                        type="color"
                        aria-label={`${label} colour picker`}
                        value={draft[key]}
                        onChange={e => update(key, e.target.value)}
                      />
                      <input
                        aria-label={`${label} hex value`}
                        value={draft[key]}
                        onChange={e => update(key, e.target.value)}
                        style={{ ...{ minWidth: 0, width: "100%" }, padding: 8, borderRadius: 8, border: "1px solid var(--border-default)" }}
                      />
                    </div>
                  </label>
                ))}
              </div>

              <label style={{ display: "grid", gap: 6 }}>
                Appearance preference
                <select value={draft.mode} onChange={e => update("mode", e.target.value)} style={{ padding: 10 }}>
                  <option value="light">Light</option>
                  <option value="dark">Dark</option>
                </select>
              </label>

              <label style={{ display: "grid", gap: 8 }}>
                Company logo
                <input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" onChange={e => uploadLogo(e.target.files?.[0])} />
                <span style={{ color: "var(--text-muted)", fontSize: 12 }}>PNG, JPEG, WebP or SVG, maximum 1 MB.</span>
              </label>
            </>
          )}

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button style={button(true)} onClick={saveBrand}>Save brand settings</button>
            <button style={button()} onClick={() => {
              setDraft({ ...brand });
              applyBrand(brand);
              setMessage("Unsaved edits discarded.");
            }}>Cancel edits</button>
            <button style={button()} onClick={() => {
              applyBrand(draft);
              setMessage("Preview applied in this browser. Save to persist it.");
            }}>Preview changes</button>
            <button style={button()} onClick={() => setConfirmReset(true)}>Restore defaults</button>
          </div>

          {confirmReset && (
            <div style={{ border: "1px solid var(--status-danger)", padding: 14, borderRadius: 8 }}>
              Restore default settings? This replaces the saved brand in this browser.
              <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                <button style={button(true)} onClick={() => {
                  try {
                    localStorage.removeItem(BRAND_KEY);
                    setBrand({ ...defaults });
                    setDraft({ ...defaults });
                    applyBrand(defaults);
                    setMessage("Default settings restored.");
                  } catch {
                    setMessage("Could not restore defaults.");
                  }
                  setConfirmReset(false);
                }}>Confirm reset</button>
                <button style={button()} onClick={() => setConfirmReset(false)}>Keep current settings</button>
              </div>
            </div>
          )}
        </section>
      )}

      {tab === "templates" && (
        <>
          <section style={panel}>
            <h2 style={{ margin: 0 }}>Import document template</h2>
            <p style={{ margin: 0, color: "var(--text-muted)" }}>
              Add company-approved templates and assign them to departments.
            </p>
            <Field label="Template name" value={templateName} onChange={setTemplateName} />
            <label style={{ display: "grid", gap: 6 }}>
              Document category
              <select value={category} onChange={e => setCategory(e.target.value)} style={{ padding: 10 }}>
                {["General", "Due diligence", "Verification", "Risk report", "Contract", "Invoice", "Client onboarding", "Compliance", "Internal memo", "Other"].map(x => <option key={x}>{x}</option>)}
              </select>
            </label>
            <fieldset style={{ border: "1px solid var(--border-default)", borderRadius: 8 }}>
              <legend>Departments permitted to use the template</legend>
              <div style={grid}>
                {departments.map(department => (
                  <label key={department} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <input
                      type="checkbox"
                      checked={assigned.includes(department)}
                      onChange={() => setAssigned(previous => {
                        if (department === "All departments") return ["All departments"];
                        const rest = previous.filter(x => x !== "All departments");
                        const next = rest.includes(department)
                          ? rest.filter(x => x !== department)
                          : [...rest, department];
                        return next.length ? next : ["All departments"];
                      })}
                    />
                    {department}
                  </label>
                ))}
              </div>
            </fieldset>
            <label style={{ display: "grid", gap: 6 }}>
              Import PDF, DOCX, DOC or TXT
              <input type="file" accept=".pdf,.docx,.doc,.txt" onChange={e => setFile(e.target.files?.[0] || null)} />
            </label>
            <button style={button(true)} onClick={importTemplate}>Import template</button>
          </section>

          <section style={panel}>
            <h2 style={{ margin: 0 }}>Template library ({templates.length})</h2>
            <input style={{ padding: 10, border: "1px solid var(--border-default)", borderRadius: 8 }} value={search} onChange={e => setSearch(e.target.value)} placeholder="Search templates…" />
            {filteredTemplates.length === 0 && <p>No templates imported yet.</p>}
            {filteredTemplates.map(item => (
              <article key={item.id} style={{ padding: 14, border: "1px solid var(--border-default)", borderRadius: 8, display: "grid", gap: 10 }}>
                <strong>{item.name}</strong>
                <span style={{ color: "var(--text-muted)", fontSize: 13 }}>
                  {item.filename} · {item.category} · Version {item.version} · {item.status}
                </span>
                <span style={{ fontSize: 13 }}>Departments: {item.departments.join(", ")}</span>
                <span style={{ fontSize: 12, color: "var(--text-muted)" }}>{new Date(item.createdAt).toLocaleString()}</span>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  <button style={button(true)} onClick={() => downloadTemplate(item)}>Download original</button>
                  <button style={button()} onClick={() => saveTemplates(templates.map(t => t.id === item.id ? { ...t, status: t.status === "Active" ? "Archived" : "Active" } : t))}>
                    {item.status === "Active" ? "Archive" : "Reactivate"}
                  </button>
                  <button style={button()} onClick={() => {
                    if (confirm(`Delete template "${item.name}"?`)) {
                      saveTemplates(templates.filter(t => t.id !== item.id));
                    }
                  }}>Delete</button>
                </div>
              </article>
            ))}
          </section>
        </>
      )}

      <footer style={{ ...panel, color: "var(--text-muted)", fontSize: 12 }}>
        This implementation stores settings and templates in this browser. It does not yet synchronize through Supabase, enforce department permissions on the server, or automatically reformat imported documents.
      </footer>
    </main>
  );
}

export const Route = createFileRoute("/_authenticated/brand")({
  component: BrandPage
});
