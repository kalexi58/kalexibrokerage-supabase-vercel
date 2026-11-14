import { describe, expect, test } from "vitest";
import { calculateCommissionCurrencyBalances } from "./agent-commission-summary";

describe("Agent commission balance summaries", () => {
  test("subtracts paid payouts once and reserves pending and approved payouts", () => {
    const balances = calculateCommissionCurrencyBalances(
      [
        { currency: "UGX", net_payable: 100_000, status: "available" },
        { currency: "UGX", net_payable: 50_000, status: "available" },
      ],
      [
        { currency: "UGX", amount: 20_000, status: "paid" },
        { currency: "UGX", amount: 10_000, status: "requested" },
        { currency: "UGX", amount: 15_000, status: "approved" },
        { currency: "UGX", amount: 5_000, status: "rejected" },
      ],
    );

    expect(balances).toEqual([
      {
        currency: "UGX",
        netPayable: 150_000,
        pending: 10_000,
        approved: 15_000,
        paid: 20_000,
        outstanding: 130_000,
        available: 105_000,
      },
    ]);
  });

  test("excludes void ledger rows and excludes rejected requests from balances", () => {
    const [balance] = calculateCommissionCurrencyBalances(
      [
        { currency: "USD", net_payable: 80.5, status: "available" },
        { currency: "USD", net_payable: 400, status: "void" },
      ],
      [{ currency: "USD", amount: 20.25, status: "rejected" }],
    );

    expect(balance).toEqual({
      currency: "USD",
      netPayable: 80.5,
      pending: 0,
      approved: 0,
      paid: 0,
      outstanding: 80.5,
      available: 80.5,
    });
  });

  test("does not produce a negative outstanding balance for old overpaid data", () => {
    const balances = calculateCommissionCurrencyBalances(
      [{ currency: "UGX", net_payable: 10, status: "available" }],
      [{ currency: "UGX", amount: 12, status: "paid" }],
    );

    expect(balances).toHaveLength(1);
    expect(balances[0]?.outstanding).toBe(0);
    expect(balances[0]?.available).toBe(0);
    expect(balances[0]?.paid).toBe(12);
  });

  test("reports unexpected database statuses rather than silently miscounting", () => {
    expect(() =>
      calculateCommissionCurrencyBalances(
        [{ currency: "UGX", net_payable: 100, status: "pending" }],
        [],
      ),
    ).toThrow("Unsupported commission ledger status: pending");
  });
});
