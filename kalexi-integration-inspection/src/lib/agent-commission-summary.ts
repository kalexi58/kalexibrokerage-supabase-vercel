export type CommissionLedgerBalanceRow = {
  currency: string;
  net_payable: number;
  status: string;
};

export type CommissionPayoutBalanceRow = {
  amount: number;
  currency: string;
  status: string;
};

export type CommissionCurrencyBalance = {
  currency: string;
  netPayable: number;
  pending: number;
  approved: number;
  paid: number;
  outstanding: number;
  available: number;
};

function toCents(amount: number): number {
  if (!Number.isFinite(amount) || amount < 0) {
    throw new Error("Commission balances contain an invalid amount.");
  }
  const cents = Math.round(amount * 100);
  if (!Number.isSafeInteger(cents)) {
    throw new Error("Commission balance exceeds the supported accounting range.");
  }
  return cents;
}

export function calculateCommissionCurrencyBalances(
  commissions: CommissionLedgerBalanceRow[],
  payouts: CommissionPayoutBalanceRow[],
): CommissionCurrencyBalance[] {
  const totals = new Map<
    string,
    { netPayable: number; pending: number; approved: number; paid: number }
  >();
  const getTotals = (currency: string) => {
    const current = totals.get(currency);
    if (current) return current;
    const created = { netPayable: 0, pending: 0, approved: 0, paid: 0 };
    totals.set(currency, created);
    return created;
  };

  for (const commission of commissions) {
    if (commission.status === "void") continue;
    if (commission.status !== "available") {
      throw new Error(`Unsupported commission ledger status: ${commission.status}`);
    }
    getTotals(commission.currency).netPayable += toCents(Number(commission.net_payable));
  }

  for (const payout of payouts) {
    const amount = toCents(Number(payout.amount));
    const currencyTotals = getTotals(payout.currency);
    if (payout.status === "requested") currencyTotals.pending += amount;
    else if (payout.status === "approved") currencyTotals.approved += amount;
    else if (payout.status === "paid") currencyTotals.paid += amount;
    else if (payout.status !== "rejected") {
      throw new Error(`Unsupported commission payout status: ${payout.status}`);
    }
  }

  return Array.from(totals, ([currency, amounts]) => {
    const outstanding = Math.max(0, amounts.netPayable - amounts.paid);
    const available = Math.max(0, outstanding - amounts.pending - amounts.approved);
    return {
      currency,
      netPayable: amounts.netPayable / 100,
      pending: amounts.pending / 100,
      approved: amounts.approved / 100,
      paid: amounts.paid / 100,
      outstanding: outstanding / 100,
      available: available / 100,
    };
  }).sort((left, right) => left.currency.localeCompare(right.currency));
}
