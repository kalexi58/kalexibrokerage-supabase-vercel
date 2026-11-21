import { supabase } from "@/integrations/supabase/client";
import { logAudit } from "@/hooks/useSession";

export const SECTORS = [
  "Real Estate & Land",
  "Minerals & Mining",
  "Agriculture & Produce",
  "Vehicles & Machinery",
  "Construction & Materials",
  "Logistics & Transport",
  "Energy & Fuel",
  "Finance & Investment",
  "Trade & Commodities",
  "Services & Consultancy",
  "Other",
] as const;

export const CURRENCIES = ["UGX", "USD", "EUR", "GBP", "KES", "TZS"] as const;

export const DEAL_STAGES = [
  "sourced",
  "registered",
  "verified",
  "kyc",
  "risk_check",
  "matched",
  "deal_open",
  "due_diligence",
  "documentation",
  "negotiation",
  "facilitation",
  "transaction",
  "closed",
  "archived",
] as const;

export type DealStage = (typeof DEAL_STAGES)[number];

export const DEAL_STAGE_LABEL: Record<DealStage, string> = {
  sourced: "Sourced",
  registered: "Registered",
  verified: "Verified",
  kyc: "KYC",
  risk_check: "Risk Check",
  matched: "Matched",
  deal_open: "Deal Opened",
  due_diligence: "Due Diligence",
  documentation: "Documentation",
  negotiation: "Negotiation",
  facilitation: "Facilitation",
  transaction: "Transaction",
  closed: "Closed",
  archived: "Archived",
};

export function formatMoney(amount: number | null | undefined, currency = "UGX") {
  if (amount === null || amount === undefined) return "—";
  return `${currency} ${Number(amount).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

export function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function formatDateTime(value: string | null | undefined) {
  if (!value) return "—";
  return new Date(value).toLocaleString(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function titleCase(value: string | null | undefined) {
  if (!value) return "—";
  return value.replace(/[_-]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export type ArchivableTable =
  | "clients"
  | "client_requirements"
  | "opportunities"
  | "deals"
  | "verifications"
  | "risk_cases"
  | "research_cases"
  | "documents"
  | "media"
  | "transactions"
  | "receipts"
  | "invoices"
  | "objectives"
  | "projects"
  | "forms"
  | "commissions"
  | "invoices"
  | "opportunity_matches"
  | "communications"
  | "tasks";

/** Archive a record: flags the row, writes the company archive register entry and audit trail. */
export async function archiveRecord(input: {
  table: ArchivableTable;
  id: string;
  entityRef?: string | null;
  title?: string | null;
  previousStatus?: string | null;
  reason: string;
  actorId: string;
  actorEmail?: string | null;
}) {
  const now = new Date().toISOString();
  const { error: updateError } = await supabase
    .from(input.table)
    .update({
      archived_at: now,
      archived_by: input.actorId,
      archive_reason: input.reason,
      status: "archived",
    } as never)
    .eq("id", input.id);
  if (updateError) throw updateError;

  const { error: archiveError } = await supabase.from("archive_records").insert({
    entity_type: input.table,
    entity_id: input.id,
    entity_ref: input.entityRef ?? null,
    title: input.title ?? null,
    previous_status: input.previousStatus ?? null,
    reason: input.reason,
    archived_by: input.actorId,
    created_by: input.actorId,
    state: "archived",
  });
  if (archiveError) throw archiveError;

  await logAudit({
    actorId: input.actorId,
    actorEmail: input.actorEmail ?? null,
    action: "record.archived",
    entityType: input.table,
    entityId: input.id,
    newValue: { reason: input.reason },
  });
}

/** Restore a previously archived record. */
export async function restoreRecord(input: {
  archiveId: string;
  table: ArchivableTable;
  entityId: string;
  restoreStatus?: string;
  reason: string;
  actorId: string;
  actorEmail?: string | null;
}) {
  const now = new Date().toISOString();
  const { error: updateError } = await supabase
    .from(input.table)
    .update({
      archived_at: null,
      archived_by: null,
      archive_reason: null,
      status: input.restoreStatus ?? "active",
    } as never)
    .eq("id", input.entityId);
  if (updateError) throw updateError;

  const { error: archiveError } = await supabase
    .from("archive_records")
    .update({
      state: "restored",
      restored_by: input.actorId,
      restored_at: now,
      restore_reason: input.reason,
    })
    .eq("id", input.archiveId);
  if (archiveError) throw archiveError;

  await logAudit({
    actorId: input.actorId,
    actorEmail: input.actorEmail ?? null,
    action: "record.restored",
    entityType: input.table,
    entityId: input.entityId,
    newValue: { reason: input.reason },
  });
}
