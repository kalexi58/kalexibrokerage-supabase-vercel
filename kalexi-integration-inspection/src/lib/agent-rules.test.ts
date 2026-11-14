import { describe, expect, test } from "vitest";
import { approximateReward, validAgent, agentPermissions } from "./agent-rules";
describe("Agent rules", () => {
  test("100 tokens approximate UGX 100000", () => { expect(approximateReward(100)).toBe(100000); expect(approximateReward(25)).toBe(25000); });
  test("expired cards cannot be used", () => expect(validAgent("active", "2020-01-01", new Date("2026-10-15"))).toBe(false));
  test("unverified agents have no approved referral permissions", () => expect(agentPermissions("pending", "2099-01-01")).toEqual([]));
  test("suspended and revoked cards are invalid", () => { expect(validAgent("suspended", "2099-01-01")).toBe(false); expect(validAgent("revoked", "2099-01-01")).toBe(false); });
});