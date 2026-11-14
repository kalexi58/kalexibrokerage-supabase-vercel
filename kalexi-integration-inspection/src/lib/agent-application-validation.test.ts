import { describe, expect, test } from "vitest";
import {
  expectedApplicationUpdatedAtSchema,
  updateAgentApplicationSchema,
} from "./agent-application-validation";

const validApplicationUpdate = {
  id: "c2c6e7dc-c665-45d7-98bd-a88da0c8b3cb",
  expectedUpdatedAt: "2026-11-04T10:27:00.123456+00:00",
  full_name: "Alex Agent",
  phone: "+256700000000",
  email: "alex@example.com",
  date_of_birth: "",
  gender: "",
  nationality: "",
  address: "",
  district: "",
  village: "",
  occupation: "",
  id_type: "National ID",
  id_number: "CM0000000000",
  payment_method: "Mobile Money",
  payment_provider: "",
  payment_account_name: "",
  payment_account_number: "",
};

describe("agent application update validation", () => {
  test("accepts Supabase ISO timestamps with UTC offsets and fractional seconds", () => {
    expect(
      expectedApplicationUpdatedAtSchema.parse(validApplicationUpdate.expectedUpdatedAt),
    ).toBe(validApplicationUpdate.expectedUpdatedAt);
    expect(
      updateAgentApplicationSchema.parse(validApplicationUpdate).expectedUpdatedAt,
    ).toBe(validApplicationUpdate.expectedUpdatedAt);
  });

  test.each([null, undefined, "", "not-a-date", "2026-11-04T10:27:00"])(
    "rejects missing or invalid concurrency timestamps: %s",
    (timestamp) => {
      expect(expectedApplicationUpdatedAtSchema.safeParse(timestamp).success).toBe(false);
      expect(
        updateAgentApplicationSchema.safeParse({
          ...validApplicationUpdate,
          expectedUpdatedAt: timestamp,
        }).success,
      ).toBe(false);
    },
  );

  test("normalizes optional empty fields before the update payload is stored", () => {
    const parsed = updateAgentApplicationSchema.parse(validApplicationUpdate);
    expect(parsed.date_of_birth).toBeNull();
    expect(parsed.address).toBeNull();
    expect(parsed.payment_provider).toBeNull();
  });
});
