import { useEffect } from "react";

const BRAND_KEY = "kalexi-brand-settings-v2";

type BrandSettings = {
  companyName?: string;
  legalName?: string;
  shortName?: string;
  tagline?: string;
  description?: string;
  vision?: string;
  mission?: string;
  values?: string;
  email?: string;
  phone?: string;
  website?: string;
  address?: string;
  primary?: string;
  secondary?: string;
  accent?: string;
  background?: string;
  surface?: string;
  text?: string;
  muted?: string;
  border?: string;
  success?: string;
  warning?: string;
  danger?: string;
  logo?: string;
  mode?: string;
};

const defaults: Required<Omit<BrandSettings,
  "logo" | "description" | "vision" | "mission" | "values" |
  "email" | "phone" | "website" | "address"
>> = {
  companyName: "Kalexi Brokerage",
  legalName: "Kalexi Brokerage Ltd",
  shortName: "Kalexi",
  tagline: "You grow, we grow",
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
  mode: "light",
};

function readBrand(): BrandSettings {
  try {
    return {
      ...defaults,
      ...JSON.parse(localStorage.getItem(BRAND_KEY) || "{}"),
    };
  } catch {
    return defaults;
  }
}

function hexToHsl(hex: string): string {
  const clean = /^#[0-9a-fA-F]{6}$/.test(hex) ? hex.slice(1) : "ffffff";
  const r = parseInt(clean.slice(0, 2), 16) / 255;
  const g = parseInt(clean.slice(2, 4), 16) / 255;
  const b = parseInt(clean.slice(4, 6), 16) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;

  let h = 0;
  let s = 0;
  const l = (max + min) / 2;

  if (delta !== 0) {
    s = delta / (1 - Math.abs(2 * l - 1));

    switch (max) {
      case r:
        h = 60 * (((g - b) / delta) % 6);
        break;
      case g:
        h = 60 * ((b - r) / delta + 2);
        break;
      default:
        h = 60 * ((r - g) / delta + 4);
    }
  }

  if (h < 0) h += 360;

  return `${Math.round(h)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
}

function applyBrand() {
  const brand = readBrand();
  const root = document.documentElement;
  const css = root.style;

  const primary = brand.primary ?? defaults.primary;
  const secondary = brand.secondary ?? defaults.secondary;
  const accent = brand.accent ?? defaults.accent;
  const background = brand.background ?? defaults.background;
  const surface = brand.surface ?? defaults.surface;
  const text = brand.text ?? defaults.text;
  const muted = brand.muted ?? defaults.muted;
  const border = brand.border ?? defaults.border;

  const vars: Record<string, string> = {
    /* Brand Centre's direct colour values */
    "--brand-primary": primary,
    "--brand-secondary": secondary,
    "--brand-accent": accent,
    "--app-background": background,
    "--surface-background": surface,
    "--text-primary": text,
    "--text-muted": muted,
    "--border-default": border,
    "--status-success": brand.success ?? defaults.success,
    "--status-warning": brand.warning ?? defaults.warning,
    "--status-danger": brand.danger ?? defaults.danger,

    /* shadcn/Tailwind expects HSL channel values, not hexadecimal */
    "--background": hexToHsl(background),
    "--foreground": hexToHsl(text),
    "--card": hexToHsl(surface),
    "--card-foreground": hexToHsl(text),
    "--popover": hexToHsl(surface),
    "--popover-foreground": hexToHsl(text),
    "--primary": hexToHsl(primary),
    "--primary-foreground": hexToHsl("#FFFFFF"),
    "--secondary": hexToHsl(secondary),
    "--secondary-foreground": hexToHsl("#FFFFFF"),
    "--muted": hexToHsl(background),
    "--muted-foreground": hexToHsl(muted),
    "--accent": hexToHsl(accent),
    "--accent-foreground": hexToHsl(text),
    "--border": hexToHsl(border),
    "--input": hexToHsl(border),
    "--ring": hexToHsl(primary),

    /* Sidebar variables used by shadcn sidebar components */
    "--sidebar-background": hexToHsl(surface),
    "--sidebar-foreground": hexToHsl(text),
    "--sidebar-primary": hexToHsl(primary),
    "--sidebar-primary-foreground": hexToHsl("#FFFFFF"),
    "--sidebar-accent": hexToHsl(accent),
    "--sidebar-accent-foreground": hexToHsl(text),
    "--sidebar-border": hexToHsl(border),
    "--sidebar-ring": hexToHsl(primary),
  };

  Object.entries(vars).forEach(([key, value]) => css.setProperty(key, value));

  root.dataset.brandMode = brand.mode === "dark" ? "dark" : "light";
  root.style.colorScheme = brand.mode === "dark" ? "dark" : "light";

  document.body.style.backgroundColor = background;
  document.body.style.color = text;

  if (brand.companyName?.trim()) {
    document.title = `${brand.companyName} — Operations`;
  }

  let favicon = document.querySelector<HTMLLinkElement>('link[rel="icon"]');

  if (brand.logo) {
    if (!favicon) {
      favicon = document.createElement("link");
      favicon.rel = "icon";
      document.head.appendChild(favicon);
    }
    favicon.href = brand.logo;
  }

  window.dispatchEvent(
    new CustomEvent("kalexi:brand-applied", { detail: brand }),
  );
}

export function BrandGlobalSync() {
  useEffect(() => {
    applyBrand();

    const onStorage = (event: StorageEvent) => {
      if (!event.key || event.key === BRAND_KEY) applyBrand();
    };

    const onBrandChange = () => applyBrand();

    window.addEventListener("storage", onStorage);
    window.addEventListener("kalexi:brand-updated", onBrandChange);

    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("kalexi:brand-updated", onBrandChange);
    };
  }, []);

  return null;
}
