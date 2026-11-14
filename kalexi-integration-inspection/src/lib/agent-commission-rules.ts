export type AgentCommissionCalculation = {
  eligibleFeeAmount: number;
  commissionRate: number;
  grossCommission: number;
  withholdingTax: number;
  netPayable: number;
  currency: string;
};

/**
 * Pure calculation only.
 * This function does not verify payment, authorize a user,
 * create a database record, or initiate a payout.
 */
export function calculateAgentCommission(input: {
  eligibleFeeAmount: number;
  commissionRate: number;
  withholdingTax?: number;
  currency?: string;
}): AgentCommissionCalculation {
  const {
    eligibleFeeAmount,
    commissionRate,
    withholdingTax = 0,
    currency = "UGX",
  } = input;

  if (!Number.isFinite(eligibleFeeAmount) || eligibleFeeAmount <= 0) {
    throw new Error("Eligible collected brokerage fee must be greater than zero.");
  }

  if (!Number.isFinite(commissionRate) || commissionRate < 0 || commissionRate > 100) {
    throw new Error("Commission rate must be between 0 and 100.");
  }

  if (!Number.isFinite(withholdingTax) || withholdingTax < 0) {
    throw new Error("Withholding tax cannot be negative.");
  }

  const grossCommission = Math.round(
    (eligibleFeeAmount * commissionRate / 100) * 100,
  ) / 100;

  const roundedTax = Math.round(withholdingTax * 100) / 100;

  if (roundedTax > grossCommission) {
    throw new Error("Withholding tax cannot exceed gross commission.");
  }

  return {
    eligibleFeeAmount,
    commissionRate,
    grossCommission,
    withholdingTax: roundedTax,
    netPayable: Math.round((grossCommission - roundedTax) * 100) / 100,
    currency,
  };
}
