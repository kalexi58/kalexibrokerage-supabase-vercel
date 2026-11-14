export const AGENT_ID_THEME_ID = "a11d1d00-0000-4000-8000-000000000001";

export interface AgentIdTheme {
  background: string;
  accent: string;
  text: string;
  accentText: string;
  widthMm: number;
  heightMm: number;
  radiusMm: number;
  fontFamily: string;
  showCorporateSeal: boolean;
  corporateSealText: string;
  ifFoundMessage: string;
  authorizationMessage: string;
  authorizedSignaturePath: string | null;
  customFields: { label: string; value: string }[];
}

export const DEFAULT_AGENT_ID_THEME: AgentIdTheme = {
  background: "#ffffff",
  accent: "#173b3b",
  text: "#172525",
  accentText: "#ffffff",
  widthMm: 85.6,
  heightMm: 53.98,
  radiusMm: 2,
  fontFamily: "Arial, sans-serif",
  showCorporateSeal: true,
  corporateSealText: "Kalexi Official",
  ifFoundMessage: "If found, return to Kalexi Brokerage Ltd.",
  authorizationMessage: "Authorised for client referrals only.",
  authorizedSignaturePath: null,
  customFields: [],
};

const isHexColor = (value: unknown): value is string =>
  typeof value === "string" && /^#[0-9a-fA-F]{6}$/.test(value);

const boundedNumber = (
  value: unknown,
  fallback: number,
  min: number,
  max: number,
): number =>
  typeof value === "number" && Number.isFinite(value)
    ? Math.min(max, Math.max(min, value))
    : fallback;

const boundedText = (value: unknown, fallback: string, maxLength: number): string => {
  if (typeof value !== "string") return fallback;
  const text = value.trim().slice(0, maxLength);
  return text || fallback;
};

const ALLOWED_FONTS = [
  "Arial, sans-serif",
  "Georgia, serif",
  "'Trebuchet MS', sans-serif",
  "'Times New Roman', serif",
  "Verdana, sans-serif",
] as const;

export function parseAgentIdTheme(
  body: string | null | undefined,
  accent?: string | null,
  authorizedSignaturePath?: string | null,
): AgentIdTheme {
  const signaturePath =
    typeof authorizedSignaturePath === "string" &&
    /^brand-templates\/agent-id\/signature-[0-9a-f-]{36}\.(jpg|png|webp)$/i.test(
      authorizedSignaturePath,
    )
      ? authorizedSignaturePath
      : null;
  const defaults: AgentIdTheme = {
    ...DEFAULT_AGENT_ID_THEME,
    ...(isHexColor(accent) ? { accent } : {}),
    authorizedSignaturePath: signaturePath,
  };

  if (!body) return defaults;

  try {
    const data: unknown = JSON.parse(body);
    if (!data || typeof data !== "object" || Array.isArray(data)) return defaults;

    const values = data as Record<string, unknown>;
    const font = values["fontFamily"];

    return {
      background: isHexColor(values["background"]) ? values["background"] : defaults.background,
      accent: isHexColor(values["accent"]) ? values["accent"] : defaults.accent,
      text: isHexColor(values["text"]) ? values["text"] : defaults.text,
      accentText: isHexColor(values["accentText"]) ? values["accentText"] : defaults.accentText,
      widthMm: boundedNumber(values["widthMm"], defaults.widthMm, 50, 150),
      heightMm: boundedNumber(values["heightMm"], defaults.heightMm, 30, 100),
      radiusMm: boundedNumber(values["radiusMm"], defaults.radiusMm, 0, 10),
      fontFamily:
        typeof font === "string" && (ALLOWED_FONTS as readonly string[]).includes(font)
          ? font
          : defaults.fontFamily,
      showCorporateSeal:
        typeof values["showCorporateSeal"] === "boolean"
          ? values["showCorporateSeal"]
          : defaults.showCorporateSeal,
      corporateSealText: boundedText(
        values["corporateSealText"],
        defaults.corporateSealText,
        40,
      ),
      ifFoundMessage: boundedText(values["ifFoundMessage"], defaults.ifFoundMessage, 120),
      authorizationMessage: boundedText(
        values["authorizationMessage"],
        defaults.authorizationMessage,
        160,
      ),
      authorizedSignaturePath: defaults.authorizedSignaturePath,
      customFields: Array.isArray(values["customFields"])
        ? values["customFields"]
            .flatMap((field) => {
              if (!field || typeof field !== "object" || Array.isArray(field)) return [];
              const entry = field as Record<string, unknown>;
              if (typeof entry["label"] !== "string" || typeof entry["value"] !== "string") {
                return [];
              }
              const label = entry["label"].trim().slice(0, 24);
              const value = entry["value"].trim().slice(0, 48);
              return label && value ? [{ label, value }] : [];
            })
            .slice(0, 4)
        : defaults.customFields,
    };
  } catch {
    console.error("[Agent ID] Invalid saved theme; using defaults.");
    return defaults;
  }
}
