import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";

type Brand = {
  name: string; legalName: string; shortName: string; tagline: string;
  description: string; vision: string; mission: string; values: string;
  email: string; phone: string; website: string; address: string;
  primary: string; secondary: string; accent: string;
  background: string; surface: string; text: string; muted: string;
  border: string; success: string; warning: string; danger: string;
  mode: string; logoLight: string; logoDark: string; icon: string;
  headingFont: string; bodyFont: string; radius: string; density: string;
};

const KEY = "kalexi-brand-settings-v1";

const defaults: Brand = {
  name: "Kalexi Brokerage", legalName: "Kalexi Brokerage Ltd",
  shortName: "Kalexi", tagline: "You grow, we grow",
  description: "", vision: "", mission: "", values: "",
  email: "info@kalexibrokerage.com", phone: "", website: "https://www.kalexibrokerage.com",
  address: "", primary: "#173D35", secondary: "#245B4D", accent: "#D7AA54",
  background: "#F5F7F6", surface: "#FFFFFF", text: "#172521", muted: "#65736D",
  border: "#DCE4DF", success: "#16794B", warning: "#A96508", danger: "#B42318",
  mode: "light", logoLight: "", logoDark: "", icon: "",
  headingFont: "Inter", bodyFont: "Inter", radius: "12", density: "comfortable"
};

function readBrand(): Brand {
  try {
    const saved = localStorage.getItem(KEY);
    return saved ? { ...defaults, ...JSON.parse(saved) } : defaults;
  } catch { return defaults; }
}

function applyBrand(b: Brand) {
  const root = document.documentElement;
  const vars: Record<string, string> = {
    "--brand-primary": b.primary, "--brand-secondary": b.secondary,
    "--brand-accent": b.accent, "--app-background": b.background,
    "--surface-background": b.surface, "--text-primary": b.text,
    "--text-muted": b.muted, "--border-default": b.border,
    "--status-success": b.success, "--status-warning": b.warning,
    "--status-danger": b.danger, "--brand-radius": `${b.radius}px`,
    "--brand-font-heading": b.headingFont, "--brand-font-body": b.bodyFont
  };
  Object.entries(vars).forEach(([key, value]) => root.style.setProperty(key, value));
  root.dataset.brandMode = b.mode;
  document.title = b.name || defaults.name;
}

function Field({ label, value, onChange, multiline = false, type = "text" }: {
  label: string; value: string; onChange: (v: string) => void;
  multiline?: boolean; type?: string;
}) {
  const style: React.CSSProperties = {
    width: "100%", boxSizing: "border-box", padding: "10px 12px",
    border: "1px solid var(--border-default, #DCE4DF)",
    borderRadius: 8, background: "var(--surface-background, white)",
    color: "var(--text-primary, #172521)", font: "inherit"
  };
  return <label style={{ display: "grid", gap: 6, fontSize: 13, fontWeight: 600 }}>
    {label}
    {multiline
      ? <textarea rows={3} value={value} onChange={e => onChange(e.target.value)} style={style} />
      : <input type={type} value={value} onChange={e => onChange(e.target.value)} style={style} />}
  </label>;
}


// LOGO_PALETTE_GENERATOR_V1
function logoPaletteFromImage(image: HTMLImageElement) {
  const canvas = document.createElement("canvas");
  canvas.width = 120;
  canvas.height = 120;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("Could not analyse the logo.");

  context.drawImage(image, 0, 0, 120, 120);
  const pixels = context.getImageData(0, 0, 120, 120).data;
  const counts = new Map<string, number>();

  for (let i = 0; i < pixels.length; i += 16) {
    if (pixels[i + 3] < 200) continue;

    const r = Math.min(255, Math.round(pixels[i] / 32) * 32);
    const g = Math.min(255, Math.round(pixels[i + 1] / 32) * 32);
    const b = Math.min(255, Math.round(pixels[i + 2] / 32) * 32);

    // Ignore near-white and near-black background pixels.
    const brightness = (r + g + b) / 3;
    if (brightness > 245 || brightness < 18) continue;

    const hex = "#" + [r, g, b]
      .map(v => v.toString(16).padStart(2, "0"))
      .join("")
      .toUpperCase();

    counts.set(hex, (counts.get(hex) || 0) + 1);
  }

  const ranked = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([hex]) => hex);

  const unique: string[] = [];
  for (const hex of ranked) {
    const rgb = hex.match(/[A-F0-9]{2}/gi)!.map(v => parseInt(v, 16));
    const sufficientlyDifferent = unique.every(existing => {
      const other = existing.match(/[A-F0-9]{2}/gi)!.map(v => parseInt(v, 16));
      const distance = Math.sqrt(
        Math.pow(rgb[0] - other[0], 2) +
        Math.pow(rgb[1] - other[1], 2) +
        Math.pow(rgb[2] - other[2], 2)
      );
      return distance > 55;
    });

    if (sufficientlyDifferent) unique.push(hex);
    if (unique.length >= 8) break;
  }

  if (!unique.length) throw new Error("No usable colours were found in the logo.");

  const saturation = (hex: string) => {
    const [r, g, b] = hex.match(/[A-F0-9]{2}/gi)!.map(v => parseInt(v, 16) / 255);
    return Math.max(r, g, b) - Math.min(r, g, b);
  };

  const primary = [...unique].sort((a, b) => {
    const score = (hex: string) => {
      const [r, g, bl] = hex.match(/[A-F0-9]{2}/gi)!.map(v => parseInt(v, 16));
      return saturation(hex) * 2 - ((r + g + bl) / 765);
    };
    return score(b) - score(a);
  })[0];

  const secondary = unique.find(c => c !== primary) || "#245B4D";
  const accent = unique.find(c =>
    c !== primary && c !== secondary && saturation(c) > 0.25
  ) || "#D7AA54";

  return {
    primary,
    secondary,
    accent,
    background: "#F5F7F6",
    surface: "#FFFFFF",
    text: "#172521",
    muted: "#65736D",
    border: "#DCE4DF",
    coloursFound: unique
  };
}
function BrandControlCenter() {
  const [brand, setBrand] = React.useState<Brand>(defaults);
  const [draft, setDraft] = React.useState<Brand>(defaults);
  const [notice, setNotice] = React.useState("");
  const [loaded, setLoaded] = React.useState(false);
  const [confirmReset, setConfirmReset] = React.useState(false);
  const [logoPaletteNotice, setLogoPaletteNotice] = React.useState("");
  const [logoPaletteBusy, setLogoPaletteBusy] = React.useState(false);

  React.useEffect(() => {
    const saved = readBrand();
    setBrand(saved);
    setDraft(saved);
    applyBrand(saved);
    setLoaded(true);
  }, []);

  const update = (key: keyof Brand, value: string) =>
    setDraft(previous => ({ ...previous, [key]: value }));

  const save = () => {
    try {
      localStorage.setItem(KEY, JSON.stringify(draft));
      localStorage.setItem("kalexi-brand-settings-v2", JSON.stringify({
        companyName: draft.name,
        legalName: draft.legalName,
        shortName: draft.shortName,
        tagline: draft.tagline,
        description: draft.description,
        vision: draft.vision,
        mission: draft.mission,
        values: draft.values,
        email: draft.email,
        phone: draft.phone,
        website: draft.website,
        address: draft.address,
        primary: draft.primary,
        secondary: draft.secondary,
        accent: draft.accent,
        background: draft.background,
        surface: draft.surface,
        text: draft.text,
        muted: draft.muted,
        border: draft.border,
        success: draft.success,
        warning: draft.warning,
        danger: draft.danger,
        logo: draft.logoLight || draft.icon || "",
        mode: draft.mode
      }));
      setBrand({ ...draft });
      applyBrand(draft);
      setNotice("Brand settings saved in this browser.");
    } catch {
      setNotice("Could not save. Browser storage may be full.");
    }
  };

  const cancel = () => {
    setDraft({ ...brand });
    applyBrand(brand);
    setNotice("Unsaved changes discarded.");
  };

  const preview = () => {
    applyBrand(draft);
    setNotice("Preview active. Save to keep these settings in this browser.");
  };

  const reset = () => {
    localStorage.removeItem(KEY);
    setDraft({ ...defaults });
    setBrand({ ...defaults });
    applyBrand(defaults);
    setConfirmReset(false);
    setNotice("Default brand restored in this browser.");
  };

  const upload = (key: "logoLight" | "logoDark" | "icon", file?: File) => {
    if (!file) return;
    if (!["image/png", "image/jpeg", "image/webp", "image/svg+xml"].includes(file.type)) {
      setNotice("Use PNG, JPEG, WebP or SVG images.");
      return;
    }
    if (file.size > 1024 * 1024) {
      setNotice("Each brand image must be 1 MB or smaller.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => update(key, String(reader.result || ""));
    reader.onerror = () => setNotice("Image could not be read.");
    reader.readAsDataURL(file);
  };

  async function generateLogoPalette(file?: File) {
    if (!file) return;

    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
      setLogoPaletteNotice("Choose a PNG, JPEG, or WebP logo.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setLogoPaletteNotice("Logo must be 5 MB or smaller.");
      return;
    }

    setLogoPaletteBusy(true);
    setLogoPaletteNotice("Analysing logo colours...");

    const objectUrl = URL.createObjectURL(file);
    try {
      const image = new Image();
      const loadedImage = new Promise<void>((resolve, reject) => {
        image.onload = () => resolve();
        image.onerror = () => reject(new Error("The logo could not be opened."));
      });
      image.src = objectUrl;
      await loadedImage;

      const palette = logoPaletteFromImage(image);

      setDraft(previous => ({
        ...previous,
        primary: palette.primary,
        secondary: palette.secondary,
        accent: palette.accent,
        background: palette.background,
        surface: palette.surface,
        text: palette.text,
        muted: palette.muted,
        border: palette.border
      }));

      setLogoPaletteNotice(
        `Generated ${palette.coloursFound.length} colours. Review the preview, then select Save brand.`
      );
    } catch (error) {
      setLogoPaletteNotice(error instanceof Error ? error.message : "Could not analyse the logo.");
    } finally {
      URL.revokeObjectURL(objectUrl);
      setLogoPaletteBusy(false);
    }
  }
  const section: React.CSSProperties = {
    border: "1px solid var(--border-default, #DCE4DF)",
    background: "var(--surface-background, white)",
    borderRadius: 14, padding: 20, display: "grid", gap: 16
  };
  const grid: React.CSSProperties = {
    display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 14
  };
  const button = (primary = false): React.CSSProperties => ({
    padding: "10px 14px", borderRadius: 9, border: "1px solid var(--border-default, #DCE4DF)",
    background: primary ? "var(--brand-primary, #173D35)" : "var(--surface-background, white)",
    color: primary ? "#FFFFFF" : "var(--text-primary, #172521)",
    cursor: "pointer", fontWeight: 650
  });

  if (!loaded) return <div style={{ padding: 24 }}>Loading brand settings…</div>;

  return <main style={{
    padding: "clamp(16px,3vw,32px)", display: "grid", gap: 20,
    color: "var(--text-primary, #172521)", background: "var(--app-background, #F5F7F6)",
    fontFamily: "var(--brand-font-body, Inter, sans-serif)"
  }}>
    <header style={{ display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap", alignItems: "center" }}>
      <div>
        <div style={{ color: "var(--brand-secondary)", fontSize: 12, fontWeight: 800, letterSpacing: 1 }}>ADMINISTRATION</div>
        <h1 style={{ margin: "8px 0", fontFamily: "var(--brand-font-heading, Inter, sans-serif)" }}>Brand Control Center</h1>
        <p style={{ margin: 0, color: "var(--text-muted)" }}>Manage your company identity and visual system from one place.</p>
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button style={button()} onClick={cancel}>Cancel</button>
        <button style={button()} onClick={preview}>Preview</button>
        <button style={button(true)} onClick={save}>Save brand</button>
      </div>
    </header>

    {notice && <div role="status" style={{ padding: 12, borderRadius: 8, background: "var(--surface-background)", border: "1px solid var(--border-default)" }}>{notice}</div>}

    {/* LOGO_PALETTE_GENERATOR_V1 */}
    <section style={section}>
      <div>
        <h2 style={{ margin: 0 }}>Generate theme from logo</h2>
        <p style={{ margin: "6px 0 0", color: "var(--text-muted)", fontSize: 13 }}>
          Upload the company logo to generate primary, secondary, accent and neutral colours.
          The generated values populate the existing brand settings.
        </p>
      </div>

      <label style={{
        display: "grid", gap: 10, padding: 18,
        border: "2px dashed var(--border-default)", borderRadius: 12,
        cursor: logoPaletteBusy ? "wait" : "pointer",
        background: "var(--app-background)"
      }}>
        <strong>{logoPaletteBusy ? "Analysing logo..." : "Choose company logo"}</strong>
        <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
          PNG, JPEG or WebP. Maximum 5 MB.
        </span>
        <input
          type="file"
          accept="image/png,image/jpeg,image/webp"
          disabled={logoPaletteBusy}
          onChange={event => {
            const file = event.currentTarget.files?.[0];
            void generateLogoPalette(file);
            event.currentTarget.value = "";
          }}
        />
      </label>

      {logoPaletteNotice && (
        <p role="status" style={{ margin: 0, fontSize: 13 }}>
          {logoPaletteNotice}
        </p>
      )}

      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit,minmax(110px,1fr))",
        gap: 10
      }}>
        {[
          ["Primary", draft.primary],
          ["Secondary", draft.secondary],
          ["Accent", draft.accent],
          ["Background", draft.background],
          ["Surface", draft.surface],
          ["Text", draft.text]
        ].map(([label, colour]) => (
          <div key={label} style={{
            overflow: "hidden", border: "1px solid var(--border-default)",
            borderRadius: 9, background: "var(--surface-background)"
          }}>
            <div style={{ height: 42, background: colour }} />
            <div style={{ padding: 8, fontSize: 12 }}>
              <strong>{label}</strong>
              <div>{colour}</div>
            </div>
          </div>
        ))}
      </div>

      <p style={{ margin: 0, color: "var(--text-muted)", fontSize: 12 }}>
        This creates a starting palette. Check contrast and readability before saving.
        Use Save brand to store it in this browser.
      </p>
    </section>
    <section style={section}>
      <h2 style={{ margin: 0 }}>Live brand preview</h2>
      <div style={{ borderRadius: `${draft.radius}px`, border: `1px solid ${draft.border}`, overflow: "hidden", background: draft.surface }}>
        <div style={{ padding: 18, background: draft.primary, color: "#FFFFFF", display: "flex", alignItems: "center", gap: 14 }}>
          {draft.logoLight
            ? <img src={draft.logoLight} alt="Company logo" style={{ maxWidth: 150, maxHeight: 48, objectFit: "contain" }} />
            : <div style={{ width: 42, height: 42, borderRadius: 10, display: "grid", placeItems: "center", background: draft.accent, color: draft.primary, fontWeight: 900 }}>{draft.shortName.slice(0, 2).toUpperCase()}</div>}
          <div><strong style={{ fontSize: 19 }}>{draft.name}</strong><div style={{ opacity: .85, fontSize: 13 }}>{draft.tagline}</div></div>
        </div>
        <div style={{ padding: 20, background: draft.background, color: draft.text }}>
          <div style={{ color: draft.secondary, fontWeight: 700, fontSize: 12 }}>BRAND SAMPLE</div>
          <h3>{draft.vision || "Your company vision appears here"}</h3>
          <p style={{ color: draft.muted }}>{draft.description || "Your company description appears here."}</p>
          <button style={{ ...button(true), background: draft.primary }}>Primary action</button>
          <span style={{ marginLeft: 12, color: draft.accent, fontWeight: 800 }}>Accent colour</span>
        </div>
      </div>
    </section>

    {/* LOGO_PALETTE_GENERATOR_V1 */}
    <section style={section}>
      <div>
        <h2 style={{ margin: 0 }}>Generate theme from logo</h2>
        <p style={{ margin: "6px 0 0", color: "var(--text-muted)", fontSize: 13 }}>
          Upload the company logo to generate primary, secondary, accent and neutral colours.
          The generated values populate the existing brand settings.
        </p>
      </div>

      <label style={{
        display: "grid", gap: 10, padding: 18,
        border: "2px dashed var(--border-default)", borderRadius: 12,
        cursor: logoPaletteBusy ? "wait" : "pointer",
        background: "var(--app-background)"
      }}>
        <strong>{logoPaletteBusy ? "Analysing logo..." : "Choose company logo"}</strong>
        <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
          PNG, JPEG or WebP. Maximum 5 MB.
        </span>
        <input
          type="file"
          accept="image/png,image/jpeg,image/webp"
          disabled={logoPaletteBusy}
          onChange={event => {
            const file = event.currentTarget.files?.[0];
            void generateLogoPalette(file);
            event.currentTarget.value = "";
          }}
        />
      </label>

      {logoPaletteNotice && (
        <p role="status" style={{ margin: 0, fontSize: 13 }}>
          {logoPaletteNotice}
        </p>
      )}

      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit,minmax(110px,1fr))",
        gap: 10
      }}>
        {[
          ["Primary", draft.primary],
          ["Secondary", draft.secondary],
          ["Accent", draft.accent],
          ["Background", draft.background],
          ["Surface", draft.surface],
          ["Text", draft.text]
        ].map(([label, colour]) => (
          <div key={label} style={{
            overflow: "hidden", border: "1px solid var(--border-default)",
            borderRadius: 9, background: "var(--surface-background)"
          }}>
            <div style={{ height: 42, background: colour }} />
            <div style={{ padding: 8, fontSize: 12 }}>
              <strong>{label}</strong>
              <div>{colour}</div>
            </div>
          </div>
        ))}
      </div>

      <p style={{ margin: 0, color: "var(--text-muted)", fontSize: 12 }}>
        This creates a starting palette. Check contrast and readability before saving.
        Use Save brand to store it in this browser.
      </p>
    </section>
    <section style={section}>
      <h2 style={{ margin: 0 }}>Company identity</h2>
      <div style={grid}>
        {([
          ["name", "Display name"], ["legalName", "Legal company name"],
          ["shortName", "Short name"], ["tagline", "Tagline"],
          ["email", "Contact email"], ["phone", "Phone"],
          ["website", "Website"], ["address", "Office address"]
        ] as [keyof Brand, string][]).map(([key, label]) =>
          <Field key={key} label={label} value={draft[key]} onChange={v => update(key, v)} />
        )}
      </div>
      {([
        ["description", "Company description"], ["vision", "Vision statement"],
        ["mission", "Mission statement"], ["values", "Core values"]
      ] as [keyof Brand, string][]).map(([key, label]) =>
        <Field key={key} label={label} multiline value={draft[key]} onChange={v => update(key, v)} />
      )}
    </section>

    {/* LOGO_PALETTE_GENERATOR_V1 */}
    <section style={section}>
      <div>
        <h2 style={{ margin: 0 }}>Generate theme from logo</h2>
        <p style={{ margin: "6px 0 0", color: "var(--text-muted)", fontSize: 13 }}>
          Upload the company logo to generate primary, secondary, accent and neutral colours.
          The generated values populate the existing brand settings.
        </p>
      </div>

      <label style={{
        display: "grid", gap: 10, padding: 18,
        border: "2px dashed var(--border-default)", borderRadius: 12,
        cursor: logoPaletteBusy ? "wait" : "pointer",
        background: "var(--app-background)"
      }}>
        <strong>{logoPaletteBusy ? "Analysing logo..." : "Choose company logo"}</strong>
        <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
          PNG, JPEG or WebP. Maximum 5 MB.
        </span>
        <input
          type="file"
          accept="image/png,image/jpeg,image/webp"
          disabled={logoPaletteBusy}
          onChange={event => {
            const file = event.currentTarget.files?.[0];
            void generateLogoPalette(file);
            event.currentTarget.value = "";
          }}
        />
      </label>

      {logoPaletteNotice && (
        <p role="status" style={{ margin: 0, fontSize: 13 }}>
          {logoPaletteNotice}
        </p>
      )}

      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit,minmax(110px,1fr))",
        gap: 10
      }}>
        {[
          ["Primary", draft.primary],
          ["Secondary", draft.secondary],
          ["Accent", draft.accent],
          ["Background", draft.background],
          ["Surface", draft.surface],
          ["Text", draft.text]
        ].map(([label, colour]) => (
          <div key={label} style={{
            overflow: "hidden", border: "1px solid var(--border-default)",
            borderRadius: 9, background: "var(--surface-background)"
          }}>
            <div style={{ height: 42, background: colour }} />
            <div style={{ padding: 8, fontSize: 12 }}>
              <strong>{label}</strong>
              <div>{colour}</div>
            </div>
          </div>
        ))}
      </div>

      <p style={{ margin: 0, color: "var(--text-muted)", fontSize: 12 }}>
        This creates a starting palette. Check contrast and readability before saving.
        Use Save brand to store it in this browser.
      </p>
    </section>
    <section style={section}>
      <h2 style={{ margin: 0 }}>Visual identity</h2>
      <div style={grid}>
        {([
          ["primary", "Primary colour"], ["secondary", "Secondary colour"],
          ["accent", "Accent colour"], ["background", "Page background"],
          ["surface", "Card and surface"], ["text", "Main text"],
          ["muted", "Muted text"], ["border", "Border"],
          ["success", "Success"], ["warning", "Warning"], ["danger", "Error"]
        ] as [keyof Brand, string][]).map(([key, label]) =>
          <label key={key} style={{ display: "grid", gap: 8, fontSize: 13, fontWeight: 600 }}>
            {label}
            <div style={{ display: "flex", gap: 8 }}>
              <input aria-label={`${label} picker`} type="color" value={draft[key]} onChange={e => update(key, e.target.value)} style={{ width: 46, height: 40, padding: 2 }} />
              <input aria-label={`${label} hexadecimal value`} value={draft[key]} pattern="^#[0-9a-fA-F]{6}$" onChange={e => update(key, e.target.value)} style={{ minWidth: 0, width: "100%", padding: 8, border: "1px solid var(--border-default)", borderRadius: 8 }} />
            </div>
          </label>
        )}
      </div>
      <div style={grid}>
        <label style={{ display: "grid", gap: 6 }}>Appearance
          <select value={draft.mode} onChange={e => update("mode", e.target.value)} style={{ padding: 10, borderRadius: 8 }}>
            <option value="light">Light</option><option value="dark">Dark preference</option>
          </select>
        </label>
        <label style={{ display: "grid", gap: 6 }}>Heading font
          <select value={draft.headingFont} onChange={e => update("headingFont", e.target.value)} style={{ padding: 10, borderRadius: 8 }}>
            {["Inter", "Arial", "Georgia", "Verdana", "Trebuchet MS"].map(x => <option key={x}>{x}</option>)}
          </select>
        </label>
        <label style={{ display: "grid", gap: 6 }}>Body font
          <select value={draft.bodyFont} onChange={e => update("bodyFont", e.target.value)} style={{ padding: 10, borderRadius: 8 }}>
            {["Inter", "Arial", "Georgia", "Verdana", "Trebuchet MS"].map(x => <option key={x}>{x}</option>)}
          </select>
        </label>
        <Field label="Corner radius (px)" type="number" value={draft.radius} onChange={v => update("radius", String(Math.max(0, Math.min(24, Number(v) || 0))))} />
        <label style={{ display: "grid", gap: 6 }}>Interface density
          <select value={draft.density} onChange={e => update("density", e.target.value)} style={{ padding: 10, borderRadius: 8 }}>
            <option value="comfortable">Comfortable</option><option value="compact">Compact</option>
          </select>
        </label>
      </div>
      <div style={grid}>
        {([
          ["logoLight", "Logo for light backgrounds"], ["logoDark", "Logo for dark backgrounds"],
          ["icon", "Square app icon"]
        ] as ["logoLight" | "logoDark" | "icon", string][]).map(([key, label]) =>
          <label key={key} style={{ display: "grid", gap: 8, fontSize: 13, fontWeight: 600 }}>
            {label}
            <input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" onChange={e => upload(key, e.target.files?.[0])} />
            {draft[key] && <img src={draft[key]} alt={label} style={{ maxWidth: 150, maxHeight: 65, objectFit: "contain" }} />}
          </label>
        )}
      </div>
    </section>

    {/* LOGO_PALETTE_GENERATOR_V1 */}
    <section style={section}>
      <div>
        <h2 style={{ margin: 0 }}>Generate theme from logo</h2>
        <p style={{ margin: "6px 0 0", color: "var(--text-muted)", fontSize: 13 }}>
          Upload the company logo to generate primary, secondary, accent and neutral colours.
          The generated values populate the existing brand settings.
        </p>
      </div>

      <label style={{
        display: "grid", gap: 10, padding: 18,
        border: "2px dashed var(--border-default)", borderRadius: 12,
        cursor: logoPaletteBusy ? "wait" : "pointer",
        background: "var(--app-background)"
      }}>
        <strong>{logoPaletteBusy ? "Analysing logo..." : "Choose company logo"}</strong>
        <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
          PNG, JPEG or WebP. Maximum 5 MB.
        </span>
        <input
          type="file"
          accept="image/png,image/jpeg,image/webp"
          disabled={logoPaletteBusy}
          onChange={event => {
            const file = event.currentTarget.files?.[0];
            void generateLogoPalette(file);
            event.currentTarget.value = "";
          }}
        />
      </label>

      {logoPaletteNotice && (
        <p role="status" style={{ margin: 0, fontSize: 13 }}>
          {logoPaletteNotice}
        </p>
      )}

      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit,minmax(110px,1fr))",
        gap: 10
      }}>
        {[
          ["Primary", draft.primary],
          ["Secondary", draft.secondary],
          ["Accent", draft.accent],
          ["Background", draft.background],
          ["Surface", draft.surface],
          ["Text", draft.text]
        ].map(([label, colour]) => (
          <div key={label} style={{
            overflow: "hidden", border: "1px solid var(--border-default)",
            borderRadius: 9, background: "var(--surface-background)"
          }}>
            <div style={{ height: 42, background: colour }} />
            <div style={{ padding: 8, fontSize: 12 }}>
              <strong>{label}</strong>
              <div>{colour}</div>
            </div>
          </div>
        ))}
      </div>

      <p style={{ margin: 0, color: "var(--text-muted)", fontSize: 12 }}>
        This creates a starting palette. Check contrast and readability before saving.
        Use Save brand to store it in this browser.
      </p>
    </section>
    <section style={section}>
      <h2 style={{ margin: 0 }}>Manage settings</h2>
      <p style={{ color: "var(--text-muted)", margin: 0 }}>Settings are currently stored in this browser only.</p>
      {!confirmReset
        ? <button style={button()} onClick={() => setConfirmReset(true)}>Restore default brand</button>
        : <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <span>Replace the saved browser settings with defaults?</span>
            <button style={button(true)} onClick={reset}>Confirm reset</button>
            <button style={button()} onClick={() => setConfirmReset(false)}>Keep settings</button>
          </div>}
    </section>
  </main>;
}

export const Route = createFileRoute("/_authenticated/brand/control-center")({
  component: BrandControlCenter
});

