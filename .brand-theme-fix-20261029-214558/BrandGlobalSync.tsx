import { useEffect } from "react";

const BRAND_KEY = "kalexi-brand-settings-v2";

type BrandSettings = {
  companyName?: string;
  legalName?: string;
  shortName?: string;
  tagline?: string;
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

const defaults: Required<Omit<BrandSettings, "logo">> = {
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
    const saved = localStorage.getItem(BRAND_KEY);
    return saved ? { ...defaults, ...JSON.parse(saved) } : defaults;
  } catch {
    return defaults;
  }
}

function applyGlobalBrand() {
  const brand = readBrand();
  const root = document.documentElement;

  const tokens: Record<string, string> = {
    "--brand-primary": brand.primary ?? defaults.primary,
    "--brand-secondary": brand.secondary ?? defaults.secondary,
    "--brand-accent": brand.accent ?? defaults.accent,
    "--app-background": brand.background ?? defaults.background,
    "--surface-background": brand.surface ?? defaults.surface,
    "--text-primary": brand.text ?? defaults.text,
    "--text-muted": brand.muted ?? defaults.muted,
    "--border-default": brand.border ?? defaults.border,
    "--status-success": brand.success ?? defaults.success,
    "--status-warning": brand.warning ?? defaults.warning,
    "--status-danger": brand.danger ?? defaults.danger,

    /* Connect brand settings to the common Tailwind/shadcn theme tokens. */
    "--primary": brand.primary ?? defaults.primary,
    "--ring": brand.primary ?? defaults.primary,
    "--accent": brand.accent ?? defaults.accent,
  };

  for (const [key, value] of Object.entries(tokens)) {
    root.style.setProperty(key, value);
  }

  root.dataset.brandMode = brand.mode ?? "light";
  root.style.colorScheme = brand.mode === "dark" ? "dark" : "light";

  if (brand.companyName?.trim()) {
    document.title = `${brand.companyName} — Operations`;
  }

  if (brand.logo) {
    let icon = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
    if (!icon) {
      icon = document.createElement("link");
      icon.rel = "icon";
      document.head.appendChild(icon);
    }
    icon.href = brand.logo;
  }

  window.dispatchEvent(
    new CustomEvent("kalexi:brand-updated", { detail: brand }),
  );
}

export function BrandGlobalSync() {
  useEffect(() => {
    applyGlobalBrand();

    const onStorage = (event: StorageEvent) => {
      if (!event.key || event.key === BRAND_KEY) applyGlobalBrand();
    };

    const onBrandUpdated = () => applyGlobalBrand();

    window.addEventListener("storage", onStorage);
    window.addEventListener("kalexi:brand-updated", onBrandUpdated);

    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("kalexi:brand-updated", onBrandUpdated);
    };
  }, []);

  return null;
}
