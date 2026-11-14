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
): AgentIdTheme {
  const defaults: AgentIdTheme = {
    ...DEFAULT_AGENT_ID_THEME,
    ...(isHexColor(accent) ? { accent } : {}),
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
    };
  } catch {
    console.error("[Agent ID] Invalid saved theme; using defaults.");
    return defaults;
  }
}
