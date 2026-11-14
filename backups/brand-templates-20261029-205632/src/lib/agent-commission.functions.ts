import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { calculateAgentCommission } from "@/lib/agent-commission-rules";

async function admin() {
  return (await import("@/integrations/supabase/client.server")).supabaseAdmin;
}

async function assertPerm(supabase: any, userId: string, perm: string) {
  const { data, error } = await supabase.rpc("has_permission", {
    _user_id: userId,
    _perm: perm,
  });

  if (error || !data) {
    throw new Error("Forbidden: finance.create permission is required.");
  }
}

const createCommissionInput = z.object({
  agentId: z.string().uuid(),
  feeTransactionId: z.string().uuid(),
  agreementReference: z.string().trim().min(3).max(200),
});

export const createAgentCommission = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => createCommissionInput.parse(input))
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }: any) => {
    const userId = context.userId as string;
    const email = (context.email ?? null) as string | null;

    await assertPerm(context.supabase, userId, "finance.create");

    const db: any = await admin();

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

    // Existing agreements remain in force. This reference must identify
    // the applicable, accepted commission agreement or policy.
    const calculation = calculateAgentCommission({
      eligibleFeeAmount: Number(receipt.amount),
      commissionRate: rate,
      currency: receipt.currency || "UGX",
    });

    const { data: ledgerEntry, error: insertError } = await db
      .from("agent_commission_ledger")
      .insert({
        agent_id: agent.id,
        client_id: receipt.client_id,
        deal_id: receipt.deal_id,
        fee_transaction_id: receipt.id,
        currency: calculation.currency,
        eligible_fee_amount: calculation.eligibleFeeAmount,
        commission_rate: calculation.commissionRate,
        gross_commission: calculation.grossCommission,
        withholding_tax: calculation.withholdingTax,
        net_payable: calculation.netPayable,
        agreement_reference: data.agreementReference,
        calculation_notes:
          "Calculated from a cleared brokerage-fee receipt. Tax withholding remains subject to verification.",
        status: "pending",
        created_by: userId,
      })
      .select(
        "id, agent_id, fee_transaction_id, eligible_fee_amount, commission_rate, gross_commission, withholding_tax, net_payable, currency, status, agreement_reference, created_at",
      )
      .single();

    if (insertError?.code === "23505") {
      throw new Error(
        "A commission already exists for this agent and fee receipt.",
      );
    }
    if (insertError) throw insertError;

    // Record the event for audit purposes. Never initiate a payout here.
    const { error: auditError } = await db.from("audit_logs").insert({
      actor_id: userId,
      actor_email: email,
      action: "agent.commission.created",
      entity_type: "agent_commission_ledger",
      entity_id: ledgerEntry.id,
      new_value: {
        agent_id: agent.id,
        agent_name: agent.full_name,
        fee_transaction_id: receipt.id,
        transaction_ref: receipt.transaction_ref,
        eligible_fee_amount: calculation.eligibleFeeAmount,
        commission_rate: calculation.commissionRate,
        gross_commission: calculation.grossCommission,
        currency: calculation.currency,
        status: "pending",
      },
    });

    if (auditError) {
      // Avoid silently leaving a commission without its audit record.
      await db
        .from("agent_commission_ledger")
        .delete()
        .eq("id", ledgerEntry.id);

      throw new Error("Commission audit logging failed. No commission was retained.");
    }

    return {
      success: true,
      commission: ledgerEntry,
    };
  });
