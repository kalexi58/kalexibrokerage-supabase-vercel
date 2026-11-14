import React from "react";

export type GalleryTheme = {
  name: string;
  description: string;
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
  mode: "light" | "dark";
};

const themes: GalleryTheme[] = [
  {
    name: "Corporate Clarity",
    description: "Bright and easy to read",
    primary: "#2457C5", secondary: "#183B78", accent: "#0E9F8A",
    background: "#F4F7FC", surface: "#FFFFFF", text: "#182230",
    muted: "#5B6678", border: "#DCE3ED", success: "#16805D",
    warning: "#A86408", danger: "#C03945", mode: "light",
  },
  {
    name: "Executive Night",
    description: "Dark workspace with clear contrast",
    primary: "#8CB4FF", secondary: "#263D63", accent: "#48D6B5",
    background: "#101827", surface: "#192437", text: "#F3F6FC",
    muted: "#B3C0D3", border: "#34435A", success: "#54D6A1",
    warning: "#FFD166", danger: "#FF7C87", mode: "dark",
  },
  {
    name: "Emerald Ledger",
    description: "Finance-inspired green",
    primary: "#087F5B", secondary: "#075B43", accent: "#D5A72D",
    background: "#F3F8F5", surface: "#FFFFFF", text: "#172B23",
    muted: "#566B61", border: "#D7E5DC", success: "#087F5B",
    warning: "#9A6700", danger: "#B42332", mode: "light",
  },
  {
    name: "Premium Graphite",
    description: "Charcoal with silver neutrals",
    primary: "#39485D", secondary: "#202B3A", accent: "#C69C55",
    background: "#F2F4F7", surface: "#FFFFFF", text: "#1C2531",
    muted: "#586474", border: "#D7DCE3", success: "#267653",
    warning: "#986515", danger: "#B8323C", mode: "light",
  },
  {
    name: "Ocean Intelligence",
    description: "Blue and teal workspace",
    primary: "#087EAD", secondary: "#155E75", accent: "#13B8A6",
    background: "#F1F8FB", surface: "#FFFFFF", text: "#14303B",
    muted: "#526D78", border: "#D5E5EB", success: "#087F5B",
    warning: "#9A6700", danger: "#B42332", mode: "light",
  },
  {
    name: "High Contrast",
    description: "Strong text and visible borders",
    primary: "#003CC5", secondary: "#001F68", accent: "#006B50",
    background: "#FFFFFF", surface: "#FFFFFF", text: "#111111",
    muted: "#333333", border: "#777777", success: "#006B3C",
    warning: "#794500", danger: "#B00020", mode: "light",
  },
  {
    name: "Modern Slate",
    description: "Neutral, contemporary appearance",
    primary: "#475569", secondary: "#334155", accent: "#6366F1",
    background: "#F5F6F8", surface: "#FFFFFF", text: "#172033",
    muted: "#596579", border: "#D9DEE7", success: "#15803D",
    warning: "#A16207", danger: "#B91C1C", mode: "light",
  },
  {
    name: "Warm Professional",
    description: "Warm neutrals and copper accents",
    primary: "#8B4A2F", secondary: "#613321", accent: "#C17B42",
    background: "#FAF6F1", surface: "#FFFFFF", text: "#2D241F",
    muted: "#6D5D53", border: "#E7DCD1", success: "#28734B",
    warning: "#95600B", danger: "#B52B38", mode: "light",
  },
];

type Props = {
  onPreview: (theme: GalleryTheme) => void;
  onApply: (theme: GalleryTheme) => void;
};

export default function ThemeGallery({ onPreview, onApply }: Props) {
  return (
    <section className="kalexi-theme-gallery">
      <header className="kalexi-theme-heading">
        <div>
          <p className="kalexi-theme-eyebrow">APPEARANCE WORKSPACE</p>
          <h2>Theme Studio</h2>
          <p>Compare dashboard colours before choosing a theme.</p>
        </div>
        <span className="kalexi-theme-count">{themes.length} themes</span>
      </header>

      <div className="kalexi-theme-grid">
        {themes.map((theme) => (
          <article className="kalexi-theme-card" key={theme.name}>
            <div className="kalexi-theme-preview" style={{
              background: theme.background, color: theme.text,
              borderColor: theme.border
            }}>
              <aside className="kalexi-theme-sidebar" style={{
                background: theme.secondary
              }}>
                <span style={{ background: theme.accent }} />
                <i /><i /><i /><i />
              </aside>
              <div className="kalexi-theme-dashboard">
                <div className="kalexi-theme-topline">
                  <i style={{ background: theme.text }} />
                  <i style={{ background: theme.border }} />
                </div>
                <div className="kalexi-theme-kpis">
                  {[theme.primary, theme.accent, theme.secondary].map((c) => (
                    <span key={c} style={{
                      background: theme.surface, borderColor: theme.border
                    }}>
                      <i style={{ background: theme.muted }} />
                      <b style={{ background: c }} />
                    </span>
                  ))}
                </div>
                <div className="kalexi-theme-chart" style={{
                  background: theme.surface, borderColor: theme.border
                }}>
                  <svg viewBox="0 0 180 45" role="img" aria-label="Example chart">
                    <path d="M0 35 L25 28 L47 31 L69 16 L93 22 L116 8 L141 15 L163 3 L180 7"
                      fill="none" stroke={theme.primary} strokeWidth="3"
                      strokeLinecap="round" strokeLinejoin="round" />
                    <path d="M0 42 L25 36 L47 39 L69 28 L93 32 L116 20 L141 25 L163 15 L180 18"
                      fill="none" stroke={theme.accent} strokeWidth="2"
                      strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
                <div className="kalexi-theme-table">
                  <i style={{ background: theme.muted }} />
                  <i style={{ background: theme.border }} />
                  <i style={{ background: theme.border }} />
                </div>
              </div>
            </div>

            <div className="kalexi-theme-swatches">
              {[theme.primary, theme.secondary, theme.accent,
                theme.background, theme.surface, theme.text].map((c) => (
                <span key={c} style={{ background: c }} title={c} />
              ))}
            </div>
            <div className="kalexi-theme-card-copy">
              <h3>{theme.name}</h3>
              <p>{theme.description}</p>
              <small>{theme.mode === "dark" ? "Dark mode" : "Light mode"}</small>
            </div>
            <div className="kalexi-theme-actions">
              <button type="button" onClick={() => onPreview(theme)}>Preview</button>
              <button type="button" onClick={() => onApply(theme)}>Use theme</button>
            </div>
          </article>
        ))}
      </div>
      <p className="kalexi-theme-footnote">
        Select Use theme, then save in Brand Control Center to keep your selection.
      </p>
    </section>
  );
}
