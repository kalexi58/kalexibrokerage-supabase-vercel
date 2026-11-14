import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database } from "@/integrations/supabase/types";
import { calculateCommissionCurrencyBalances } from "@/lib/agent-commission-summary";

async function admin(): Promise<SupabaseClient<Database>> {
  return (await import("@/integrations/supabase/client.server")).supabaseAdmin;
}

async function assertPerm(
  supabase: SupabaseClient<Database>,
  userId: string,
  perm: string,
) {
  const { data, error } = await supabase.rpc("has_permission", {
    _user_id: userId,
    _perm: perm,
  });

  if (error) throw new Error("Could not verify the required permission.");
  if (!data) {
    throw new Error(`Forbidden: ${perm} permission is required.`);
  }
}

const createCommissionInput = z.object({
  agentId: z.string().uuid(),
  feeTransactionId: z.string().uuid(),
  agreementReference: z.string().trim().min(3).max(200),
  withholdingTax: z
    .number()
    .finite()
    .nonnegative()
    .max(999_999_999_999.99)
    .refine((amount) => Number(amount.toFixed(2)) === amount, {
      message: "Withholding must have no more than two decimal places.",
    }),
});

export const createAgentCommission = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => createCommissionInput.parse(input))
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    const userId = context.userId;

    await assertPerm(context.supabase, userId, "finance.create");

    const db = await admin();

    // Only active agents can earn new commissions.
    const { data: agent, error: agentError } = await db
      .from("agents")
      .select("id, full_name, commission_rate, status")
      .eq("id", data.agentId)
      .maybeSingle();

    if (agentError) throw agentError;
    if (!agent) throw new Error("Agent not found.");
    if (String(agent.status).toLowerCase() !== "active") {
      throw new Error("The agent must have active status.");
    }

    const rate = Number(agent.commission_rate);

    if (!Number.isFinite(rate) || rate <= 0 || rate > 100) {
      throw new Error("The agent's stored commission rate is invalid.");
    }

    // The receipt must be a cleared, identifiable brokerage-fee receipt.
    // Ordinary cleared transactions must never generate agent commissions.
    const { data: receipt, error: receiptError } = await db
      .from("transactions")
      .select(
        "id, transaction_ref, client_id, deal_id, amount, currency, payment_reference, purpose, status, archived_at",
      )
      .eq("id", data.feeTransactionId)
      .maybeSingle();

    if (receiptError) throw receiptError;
    if (!receipt) throw new Error("Fee receipt not found.");
    if (receipt.archived_at) throw new Error("Archived receipts are not eligible.");
    if (receipt.status !== "cleared") {
      throw new Error("The brokerage-fee receipt must be cleared first.");
    }
    if (receipt.purpose !== "KALEXI_BROKERAGE_FEE_RECEIPT") {
      throw new Error(
        "This transaction is not marked as a Kalexi brokerage-fee receipt.",
      );
    }
    if (!receipt.payment_reference?.trim()) {
      throw new Error("A payment reference is required.");
    }
    if (!receipt.client_id) {
      throw new Error("The fee receipt must be linked to a referred client.");
    }

    // The selected client must actually belong to this agent.
    const { data: client, error: clientError } = await db
      .from("clients")
      .select("id, agent_id")
      .eq("id", receipt.client_id)
      .maybeSingle();

    if (clientError) throw clientError;
    if (!client || client.agent_id !== agent.id) {
      throw new Error("The receipt's client is not assigned to this agent.");
    }

    const { error } = await context.supabase.rpc("create_agent_commission", {
      _agent_id: data.agentId,
      _fee_transaction_id: data.feeTransactionId,
      _agreement_reference: data.agreementReference,
      _withholding_tax: data.withholdingTax,
    });
    if (error?.message.includes("duplicate key")) {
      throw new Error("A commission already exists for this agent and fee receipt.");
    }
    if (error) throw new Error(error.message);
    return { success: true };
  });

type AgentCommissionPayoutSummary = {
  id: string;
  amount: number;
  currency: string;
  status: string;
  created_at: string;
  processed_at: string | null;
};

type AgentCommissionLedgerSummary = Pick<
  Database["public"]["Tables"]["agent_commission_ledger"]["Row"],
  | "id"
  | "client_id"
  | "deal_id"
  | "fee_transaction_id"
  | "currency"
  | "eligible_fee_amount"
  | "gross_commission"
  | "withholding_tax"
  | "net_payable"
  | "agreement_reference"
  | "status"
  | "created_at"
>;

async function loadAgentCommissionRows(
  db: SupabaseClient<Database>,
  agentId: string,
): Promise<AgentCommissionLedgerSummary[]> {
  const rows: AgentCommissionLedgerSummary[] = [];
  const pageSize = 500;

  for (let from = 0; ; from += pageSize) {
    const { data, error } = await db
      .from("agent_commission_ledger")
      .select(
        "id, client_id, deal_id, fee_transaction_id, currency, eligible_fee_amount, gross_commission, withholding_tax, net_payable, agreement_reference, status, created_at",
      )
      .eq("agent_id", agentId)
      .order("created_at", { ascending: false })
      .range(from, from + pageSize - 1);
    if (error) {
      console.error("[agent commissions] Ledger query failed.", {
        agentId,
        from,
        pageSize,
        code: error.code,
        message: error.message,
        details: error.details,
        hint: error.hint,
      });
      throw new Error("Commission ledger could not be loaded.");
    }

    rows.push(...(data ?? []));
    if (!data || data.length < pageSize) return rows;
  }
}

async function loadAgentCommissionPayouts(
  db: SupabaseClient<Database>,
  agentId: string,
): Promise<AgentCommissionPayoutSummary[]> {
  const rows: AgentCommissionPayoutSummary[] = [];
  const pageSize = 500;

  for (let from = 0; ; from += pageSize) {
    const { data, error } = await db
      .from("agent_commission_payouts")
      .select("id, amount, currency, status, created_at, processed_at")
      .eq("agent_id", agentId)
      .order("created_at", { ascending: false })
      .range(from, from + pageSize - 1);
    if (error) {
      console.error("[agent commissions] Payout query failed.", {
        agentId,
        from,
        pageSize,
        code: error.code,
        message: error.message,
        details: error.details,
        hint: error.hint,
      });
      throw new Error("Commission payouts could not be loaded.");
    }

    rows.push(...(data ?? []));
    if (!data || data.length < pageSize) return rows;
  }
}

export type AgentCommissionPayoutRecord = AgentCommissionPayoutSummary & {
  agent_id: string;
  processed_by: string | null;
  agents: {
    full_name: string;
    agent_code: string;
    phone: string;
    application_id: string | null;
  } | null;
  payment: {
    payment_method: string | null;
    payment_provider: string | null;
    payment_account_name: string | null;
    payment_account_number: string | null;
  } | null;
};

export const getMyAgentCommissionSummary = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const db = await admin();
    const { data: agent, error: agentError } = await db
      .from("agents")
      .select("id")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (agentError) {
      console.error("[agent commissions] Could not resolve the signed-in agent.", {
        userId: context.userId,
        code: agentError.code,
        message: agentError.message,
        details: agentError.details,
        hint: agentError.hint,
      });
      throw new Error("Your agent account could not be loaded.");
    }
    if (!agent) return { balances: [], payouts: [], commissions: [] };

    const [commissionRows, payoutRows] = await Promise.all([
      loadAgentCommissionRows(db, agent.id),
      loadAgentCommissionPayouts(db, agent.id),
    ]);

    let balances;
    try {
      balances = calculateCommissionCurrencyBalances(commissionRows, payoutRows);
    } catch (error) {
      console.error("[agent commissions] Could not calculate commission balances.", {
        agentId: agent.id,
        error,
      });
      throw new Error("Commission balances could not be calculated.");
    }

    return {
      balances,
      payouts: payoutRows.slice(0, 100),
      commissions: commissionRows.slice(0, 20),
    };
  });

export const requestAgentCommissionPayout = createServerFn({ method: "POST" })
    .inputValidator((input: unknown) =>
      z.object({
        currency: z.string().regex(/^[A-Z]{3}$/),
        amount: z.number().finite().positive().max(999_999_999_999.99),
      }).parse(input),
    )
    .middleware([requireSupabaseAuth])
    .handler(async ({ data, context }) => {
      const { error } = await context.supabase.rpc("request_agent_commission_payout", {
        _currency: data.currency,
        _amount: data.amount,
      });
      if (error) throw new Error(error.message);
      return { success: true };
    });

export const getAgentCommissionPayouts = createServerFn({ method: "POST" })
    .middleware([requireSupabaseAuth])
    .handler(async ({ context }) => {
      await assertPerm(context.supabase, context.userId, "agents.view");
      const db = await admin();
      const { data: payouts, error } = await db
        .from("agent_commission_payouts")
        .select("*, agents(full_name, agent_code, phone, application_id)")
        .order("created_at", { ascending: false })
        .limit(300);
      if (error) throw error;

      const payoutRows = payouts ?? [];
      const applicationIds = payoutRows.flatMap((payout) =>
        payout.agents?.application_id ? [payout.agents.application_id] : [],
      );
      const { data: applications, error: applicationsError } = applicationIds.length
        ? await db
            .from("agent_applications")
            .select("id, payment_method, payment_provider, payment_account_name, payment_account_number")
            .in("id", applicationIds)
        : { data: [], error: null };
      if (applicationsError) throw applicationsError;

      return payoutRows.map((payout): AgentCommissionPayoutRecord => ({
        ...payout,
        payment: applications?.find(
          (application: { id: string }) => application.id === payout.agents?.application_id,
        ) ?? null,
      }));
    });

export const processAgentCommissionPayout = createServerFn({ method: "POST" })
    .inputValidator((input: unknown) =>
      z
        .object({
          id: z.string().uuid(),
          status: z.enum(["approved", "paid", "rejected"]),
        })
        .parse(input),
    )
    .middleware([requireSupabaseAuth])
    .handler(async ({ data, context }) => {
      const { error } = await context.supabase.rpc("set_agent_commission_payout_status", {
        _payout_id: data.id,
        _next_status: data.status,
      });
      if (error) throw new Error(error.message);
      return { success: true };
    });
