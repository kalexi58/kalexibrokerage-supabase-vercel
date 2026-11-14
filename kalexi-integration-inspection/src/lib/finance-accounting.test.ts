import { describe, expect, test } from "vitest";
import { calculateJournalTotals, groupAmountsByCurrency } from "./finance-accounting";

describe("Finance currency summaries", () => {
  test("keeps currencies separate and sums to two decimal places", () => {
    expect(
      groupAmountsByCurrency([
        { currency: "UGX", amount: 10.1 },
        { currency: "USD", amount: 4.25 },
        { currency: "UGX", amount: 0.2 },
      ]),
    ).toEqual([
      { currency: "UGX", amount: 10.3 },
      { currency: "USD", amount: 4.25 },
    ]);
  });

  test("rejects invalid financial currency or amount values", () => {
    expect(() => groupAmountsByCurrency([{ currency: "US", amount: 1 }])).toThrow(
      "Unsupported currency code",
    );
    expect(() => groupAmountsByCurrency([{ currency: "USD", amount: Number.NaN }])).toThrow(
      "finite numbers",
    );
  });
});

describe("Balanced journal validation", () => {
  test("balances lines after converting a foreign currency at the entered rate", () => {
    expect(
      calculateJournalTotals(
        [
          {
            accountId: "cash",
            currency: "USD",
            debit: "10",
            credit: "0",
            exchangeRate: "3700",
          },
          {
            accountId: "income",
            currency: "UGX",
            debit: "0",
            credit: "37000",
            exchangeRate: "1",
          },
        ],
        "UGX",
      ),
    ).toEqual({
      balanced: true,
      baseCurrency: "UGX",
      baseDebits: 37000,
      baseCredits: 37000,
      error: null,
    });
  });

  test("rejects unbalanced entries and dual-sided lines", () => {
    const unbalanced = calculateJournalTotals(
      [
        { accountId: "cash", currency: "UGX", debit: "100", credit: "0", exchangeRate: "1" },
        { accountId: "income", currency: "UGX", debit: "0", credit: "99", exchangeRate: "1" },
      ],
      "UGX",
    );
    expect(unbalanced.balanced).toBe(false);
    expect(unbalanced.error).toContain("must balance");

    const dualSided = calculateJournalTotals(
      [
        { accountId: "cash", currency: "UGX", debit: "100", credit: "100", exchangeRate: "1" },
        { accountId: "income", currency: "UGX", debit: "0", credit: "100", exchangeRate: "1" },
      ],
      "UGX",
    );
    expect(dualSided.error).toContain("exactly one positive debit or credit");
  });

  test("requires an explicit exchange rate for foreign currency", () => {
    const result = calculateJournalTotals(
      [
        { accountId: "cash", currency: "USD", debit: "1", credit: "0", exchangeRate: "" },
        { accountId: "income", currency: "UGX", debit: "0", credit: "1", exchangeRate: "1" },
      ],
      "UGX",
    );
    expect(result.error).toContain("exchange rate");
  });

  test("caps a journal at 200 lines", () => {
    const line = {
      accountId: "cash",
      currency: "UGX",
      debit: "1",
      credit: "0",
      exchangeRate: "1",
    };
    const result = calculateJournalTotals(
      [...Array.from({ length: 200 }, () => line), { ...line, debit: "0", credit: "1" }],
      "UGX",
    );
    expect(result.error).toContain("200 lines");
  });
});
