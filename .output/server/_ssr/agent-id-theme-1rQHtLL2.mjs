//#region node_modules/.nitro/vite/services/ssr/assets/agent-id-theme-1rQHtLL2.js
var AGENT_ID_THEME_ID = "a11d1d00-0000-4000-8000-000000000001";
var DEFAULT_AGENT_ID_THEME = {
	background: "#ffffff",
	accent: "#173b3b",
	text: "#172525",
	accentText: "#ffffff"
};
var isHexColor = (value) => typeof value === "string" && /^#[0-9a-fA-F]{6}$/.test(value);
function parseAgentIdTheme(body, accent) {
	if (!body) return {
		...DEFAULT_AGENT_ID_THEME,
		...isHexColor(accent) ? { accent } : {}
	};
	try {
		const data = JSON.parse(body);
		if (!data || typeof data !== "object") return DEFAULT_AGENT_ID_THEME;
		const values = data;
		return {
			background: isHexColor(values["background"]) ? values["background"] : DEFAULT_AGENT_ID_THEME.background,
			accent: isHexColor(values["accent"]) ? values["accent"] : isHexColor(accent) ? accent : DEFAULT_AGENT_ID_THEME.accent,
			text: isHexColor(values["text"]) ? values["text"] : DEFAULT_AGENT_ID_THEME.text,
			accentText: isHexColor(values["accentText"]) ? values["accentText"] : DEFAULT_AGENT_ID_THEME.accentText
		};
	} catch {
		console.error("[Agent ID] Saved theme is not valid JSON; using default colors.");
		return DEFAULT_AGENT_ID_THEME;
	}
}
//#endregion
export { DEFAULT_AGENT_ID_THEME as n, parseAgentIdTheme as r, AGENT_ID_THEME_ID as t };
