import { describe, expect, test } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { OperationProgress } from "./LoadingStates";

describe("operation progress", () => {
  test("uses an indeterminate indicator without inventing a percentage", () => {
    const html = renderToStaticMarkup(<OperationProgress message="Retrieving dashboard data…" />);

    expect(html).toContain("Retrieving dashboard data…");
    expect(html).toContain('aria-valuetext="In progress"');
    expect(html).not.toContain("aria-valuenow");
    expect(html).not.toContain("%");
  });

  test("shows only supplied measurable progress and clamps it to a valid range", () => {
    const html = renderToStaticMarkup(
      <OperationProgress message="Uploading document…" progress={42.4} />,
    );

    expect(html).toContain("42%");
    expect(html).toContain('aria-valuenow="42.4"');
    expect(html).toContain("width:42.4%");
  });
});
