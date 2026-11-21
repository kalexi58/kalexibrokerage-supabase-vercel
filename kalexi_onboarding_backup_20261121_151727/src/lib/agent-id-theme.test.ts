import { describe, expect, test } from "vitest";
import { DEFAULT_AGENT_ID_THEME, parseAgentIdTheme } from "./agent-id-theme";

describe("Agent ID theme", () => {
  test("keeps up to four valid custom card fields", () => {
    const theme = parseAgentIdTheme(
      JSON.stringify({
        customFields: [
          { label: "Department", value: "Brokerage" },
          { label: "Office", value: "Kampala" },
          { label: "Email", value: "agent@example.com" },
          { label: "Website", value: "kalexibrokerage.com" },
          { label: "Ignored", value: "Extra field" },
          { label: "", value: "Missing label" },
        ],
      }),
    );

    expect(theme.customFields).toHaveLength(4);
    expect(theme.customFields[0]).toEqual({ label: "Department", value: "Brokerage" });
    expect(theme.customFields[3]).toEqual({ label: "Website", value: "kalexibrokerage.com" });
  });

  test("uses empty custom fields for old saved themes", () => {
    expect(parseAgentIdTheme('{"background":"#ffffff"}').customFields).toEqual(
      DEFAULT_AGENT_ID_THEME.customFields,
    );
  });
});
