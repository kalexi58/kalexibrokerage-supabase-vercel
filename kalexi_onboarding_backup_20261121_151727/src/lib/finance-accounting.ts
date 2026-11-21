export interface CurrencyAmount {
  currency: string;
  amount: number;
}

export function groupAmountsByCurrency(
  entries: readonly CurrencyAmount[],
): CurrencyAmount[] {
  const totals = new Map<string, number>();
  for (const entry of entries) {
    const amount = Number(entry.amount);
    if (!Number.isFinite(amount)) {
      throw new Error("Finance amounts must be finite numbers.");
    }
    const currency = entry.currency.trim().toUpperCase();
    if (!/^[A-Z]{3}$/.test(currency)) {
      throw new Error(`Unsupported currency code: ${entry.currency}`);
    }
    const cents = Math.round(amount * 100);
    totals.set(currency, (totals.get(currency) ?? 0) + cents);
  }
  return [...totals.entries()]
    .map(([currency, cents]) => ({ currency, amount: cents / 100 }))
    .sort((a, b) => a.currency.localeCompare(b.currency));
}

export interface JournalLineDraft {
  accountId: string;
  currency: string;
  debit: string;
  credit: string;
  exchangeRate: string;
}

export interface JournalTotals {
  balanced: boolean;
  baseCurrency: string;
  baseDebits: number;
  baseCredits: number;
  error: string | null;
}

export function calculateJournalTotals(
  lines: readonly JournalLineDraft[],
  baseCurrency: string,
): JournalTotals {
  const currency = baseCurrency.trim().toUpperCase();
  const totals: JournalTotals = {
    balanced: false,
    baseCurrency: currency,
    baseDebits: 0,
    baseCredits: 0,
    error: null,
  };
  if (!/^[A-Z]{3}$/.test(currency)) {
    totals.error = "Base currency must be a three-letter currency code.";
    return totals;
  }
  if (lines.length < 2) {
    totals.error = "A journal must contain at least two lines.";
    return totals;
  }
  if (lines.length > 200) {
    totals.error = "A journal cannot contain more than 200 lines.";
    return totals;
  }

  let debitCents = 0;
  let creditCents = 0;
  for (const line of lines) {
    if (!line.accountId) {
      totals.error = "Select an account for every journal line.";
      return totals;
    }
    const lineCurrency = line.currency.trim().toUpperCase();
    if (!/^[A-Z]{3}$/.test(lineCurrency)) {
      totals.error = "Every journal line needs a valid currency.";
      return totals;
    }
    const debit = Number(line.debit || 0);
    const credit = Number(line.credit || 0);
    const rate = Number(line.exchangeRate || (lineCurrency === currency ? "1" : ""));
    if (
      !Number.isFinite(debit) ||
      !Number.isFinite(credit) ||
      debit < 0 ||
      credit < 0 ||
      Math.round(debit * 100) / 100 !== debit ||
      Math.round(credit * 100) / 100 !== credit ||
      (debit > 0) === (credit > 0)
    ) {
      totals.error = "Each line needs exactly one positive debit or credit to two decimals.";
      return totals;
    }
    if (!Number.isFinite(rate) || rate <= 0 || Math.round(rate * 1e8) / 1e8 !== rate) {
      totals.error = "Enter a positive exchange rate to eight decimals.";
      return totals;
    }
    if (lineCurrency === currency && rate !== 1) {
      totals.error = "Base-currency lines must use an exchange rate of 1.";
      return totals;
    }

    const lineDebitCents = Math.round(debit * rate * 100);
    const lineCreditCents = Math.round(credit * rate * 100);
    if ((debit > 0 && lineDebitCents === 0) || (credit > 0 && lineCreditCents === 0)) {
      totals.error = "Every journal line must have a positive base-currency value.";
      return totals;
    }
    debitCents += lineDebitCents;
    creditCents += lineCreditCents;
  }

  totals.baseDebits = debitCents / 100;
  totals.baseCredits = creditCents / 100;
  totals.balanced = debitCents > 0 && debitCents === creditCents;
  if (!totals.balanced) totals.error = "Base-currency debits and credits must balance.";
  return totals;
}
