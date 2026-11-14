export const AGENT_ID_THEME_ID = "a11d1d00-0000-4000-8000-000000000001";

export interface AgentIdTheme {
  background: string;
  accent: string;
  text: string;
  accentText: string;
}

export const DEFAULT_AGENT_ID_THEME: AgentIdTheme = {
  background: "#ffffff",
  accent: "#173b3b",
  text: "#172525",
  accentText: "#ffffff",
};

const isHexColor = (value: unknown): value is string =>
  typeof value === "string" && /^#[0-9a-fA-F]{6}$/.test(value);

export function parseAgentIdTheme(
  body: string | null | undefined,
  accent?: string | null,
): AgentIdTheme {
  if (!body) {
    return {
      ...DEFAULT_AGENT_ID_THEME,
      ...(isHexColor(accent) ? { accent } : {}),
    };
  }
  try {
    const data: unknown = JSON.parse(body);
    if (!data || typeof data !== "object") return DEFAULT_AGENT_ID_THEME;
    const values = data as Record<string, unknown>;
    return {
      background: isHexColor(values["background"])
        ? values["background"]
        : DEFAULT_AGENT_ID_THEME.background,
      accent: isHexColor(values["accent"])
        ? values["accent"]
        : isHexColor(accent)
          ? accent
          : DEFAULT_AGENT_ID_THEME.accent,
      text: isHexColor(values["text"]) ? values["text"] : DEFAULT_AGENT_ID_THEME.text,
      accentText: isHexColor(values["accentText"])
        ? values["accentText"]
        : DEFAULT_AGENT_ID_THEME.accentText,
    };
  } catch {
    console.error("[Agent ID] Saved theme is not valid JSON; using default colors.");
    return DEFAULT_AGENT_ID_THEME;
  }
}
