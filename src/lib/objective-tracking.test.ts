import { describe, expect, it } from "vitest";
import {
  calculateObjectiveProgress,
  readObjectiveKeyResults,
  type ObjectiveKeyResult,
} from "./objective-tracking";

describe("objective key-result tracking", () => {
  it("reads only valid supported targets and defaults current values", () => {
    const result = readObjectiveKeyResults([
      { metric: "clients_created", target: 20 },
      { metric: "cleared_brokerage_fees", target: 1000, current: 250 },
      { metric: "unknown_metric", target: 5 },
      { metric: "toString", target: 5 },
      { metric: "deals_completed", target: 0 },
      "legacy result",
    ]);

    expect(result).toEqual([
      { metric: "clients_created", target: 20, current: 0 },
      { metric: "cleared_brokerage_fees", target: 1000, current: 250 },
    ]);
  });

  it("averages each key-result percentage and caps completed results at 100", () => {
    const results: ObjectiveKeyResult[] = [
      { metric: "clients_created", target: 10, current: 5 },
      { metric: "deals_completed", target: 4, current: 8 },
    ];

    expect(calculateObjectiveProgress(results)).toBe(75);
    expect(calculateObjectiveProgress([])).toBeNull();
  });
});
