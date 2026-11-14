import { describe, expect, test } from "vitest";
import { canProcessRedemption } from "./redemption-rules";
describe("Redemption review", () => {
  test("requested rewards can be approved", () => expect(canProcessRedemption("requested", "approved")).toBe(true));
  test("payment requires approval", () => { expect(canProcessRedemption("requested", "paid")).toBe(false); expect(canProcessRedemption("approved", "paid")).toBe(true); });
  test("paid and rejected requests cannot be processed twice", () => { expect(canProcessRedemption("paid", "rejected")).toBe(false); expect(canProcessRedemption("rejected", "approved")).toBe(false); });
});