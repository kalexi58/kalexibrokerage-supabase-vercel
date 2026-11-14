import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { AppShell, PageHeader } from "@/components/AppShell";
import { useSession } from "@/hooks/useSession";
import { allows } from "@/lib/rbac";
import { EmptyState, NoAccess, StatusPill } from "@/components/records";
import { formatDateTime, formatMoney, CURRENCIES } from "@/lib/records";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Panel } from "@/components/records";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/finance/approvals/")({
  head: () => ({
    meta: [
      { title: "Finance Approvals — Kalexi Brokerage" },
      { name: "description", content: "Review finance transactions and journal entries." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: FinanceApprovalsPage,
});

type ApprovalTransaction = {
  id: string;
  transaction_ref: string;
  amount: number;
  currency: string;
  purpose: string;
  payment_method: string | null;
  payment_reference: string | null;
  created_by: string | null;
  created_at: string;
  approval_note: string | null;
  deals: { title: string } | null;
};

type JournalEntry = {
  id: string;
  journal_ref: string;
  entry_date: string;
  description: string;
  base_currency: string;
  base_total: number;
  created_by: string | null;
  created_at: string;
};

type JournalLine = {
  id: string;
  journal_id: string;
  line_number: number;
  account_id: string;
  description: string | null;
  currency: string;
  debit: number;
  credit: number;
  base_debit: number;
  base_credit: number;
};

function FinanceApprovalsPage() {
  const { data: session } = useSession();
  const access = session?.access;
  const qc = useQueryClient();
  const canView = allows(access, "finance.view");
  const canApprove = allows(access, "finance.approve");
  const canConfigure = allows(access, "finance.configure");
  const [roleKey, setRoleKey] = useState("");
  const [currency, setCurrency] = useState("*");
  const [maxAmount, setMaxAmount] = useState("");

  const transactions = useQuery({
    queryKey: ["finance-approval-transactions"],
    enabled: canView,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("transactions")
        .select(
          "id, transaction_ref, amount, currency, purpose, payment_method, payment_reference, created_by, created_at, approval_note, deals(title)",
        )
        .eq("approval_status", "pending")
        .is("archived_at", null)
        .order("created_at", { ascending: true })
        .limit(300);
      if (error) throw error;
      return (data ?? []) as unknown as ApprovalTransaction[];
    },
  });


  const journalLines = useQuery({
    queryKey: ["finance-approval-journal-lines", journalIds.join(",")],
    enabled: canView && journalIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("finance_journal_lines")
        .select(
          "id, journal_id, line_number, account_id, description, currency, debit, credit, base_debit, base_credit",
        )
        .in("journal_id", journalIds)
        .order("line_number");
      if (error) throw error;
      return (data ?? []) as JournalLine[];
    },
  });

  const journalAccounts = useQuery({
    queryKey: ["finance-approval-accounts"],
    enabled: canView && journalIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("finance_accounts")
        .select("id, account_code, name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const journals = useQuery({
    queryKey: ["finance-approval-journals"],
    enabled: canView,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("finance_journal_entries")
        .select("id, journal_ref, entry_date, description, base_currency, base_total, created_by, created_at")
        .eq("status", "pending_approval")
        .order("created_at", { ascending: true })
        .limit(300);
      if (error) throw error;
      return (data ?? []) as JournalEntry[];
    },
  });

  const journalIds = (journals.data ?? []).map((entry) => entry.id);

  const roles = useQuery({
    queryKey: ["finance-approver-roles"],
    enabled: canConfigure,
    queryFn: async () => {
      const { data: rolePermissions, error: permissionsError } = await supabase
        .from("role_permissions")
        .select("role_key")
        .eq("permission", "finance.approve");
      if (permissionsError) throw permissionsError;
      const keys = [...new Set((rolePermissions ?? []).map((row) => row.role_key))];
      if (keys.length === 0) return [];
      const { data, error } = await supabase.from("roles").select("key, label").in("key", keys);
      if (error) throw error;
      return data ?? [];
    },
  });

  const limits = useQuery({
    queryKey: ["finance-approval-limits"],
    enabled: canConfigure,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("finance_approval_limits")
        .select("id, role_key, currency, max_amount, updated_at")
        .order("role_key")
        .order("currency");
      if (error) throw error;
      return data ?? [];
    },
  });

  const reviewTransaction = useMutation({
    mutationFn: async ({
      id,
      decision,
      note,
    }: {
      id: string;
      decision: "approved" | "rejected" | "changes_requested";
      note?: string;
    }) => {
      const { error } = await supabase.rpc("review_finance_transaction", {
        _transaction_id: id,
        _decision: decision,
        _note: note ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Transaction review recorded.");
      void qc.invalidateQueries({ queryKey: ["finance-approval-transactions"] });
      void qc.invalidateQueries({ queryKey: ["transactions"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const reviewJournal = useMutation({
    mutationFn: async ({
      id,
      decision,
      note,
    }: {
      id: string;
      decision: "approved" | "rejected" | "changes_requested";
      note?: string;
    }) => {
      const { error } = await supabase.rpc("review_finance_journal_entry", {
        _journal_id: id,
        _decision: decision,
        _note: note ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Journal review recorded.");
      void qc.invalidateQueries({ queryKey: ["finance-approval-journals"] });
      void qc.invalidateQueries({ queryKey: ["finance-journals"] });
      void qc.invalidateQueries({ queryKey: ["finance-account-balances"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const saveLimit = useMutation({
    mutationFn: async () => {
      if (!session) throw new Error("Your session expired. Sign in again.");
      if (!roleKey) throw new Error("Select an approver role.");
      const amount = maxAmount.trim() ? Number(maxAmount) : null;
      if (amount !== null && (!Number.isFinite(amount) || amount < 0)) {
        throw new Error("Approval limits must be zero or a positive amount.");
      }
      if (currency === "*" && amount !== null) {
        throw new Error("Set a currency-specific limit; a numeric limit cannot safely cover different currencies.");
      }
      if (limits.isError || limits.isLoading) {
        throw new Error("Approval limits are not available. Refresh before saving.");
      }
      const existing = limits.data?.find(
        (limit) => limit.role_key === roleKey && limit.currency === currency,
      );
      const result = existing
        ? await supabase
            .from("finance_approval_limits")
            .update({ max_amount: amount, updated_by: session.userId })
            .eq("id", existing.id)
        : await supabase.from("finance_approval_limits").insert({
            role_key: roleKey,
            currency,
            max_amount: amount,
            created_by: session.userId,
          });
      const { error } = result;
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Approval limit saved.");
      setMaxAmount("");
      void qc.invalidateQueries({ queryKey: ["finance-approval-limits"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  if (!canView) {
    return (
      <AppShell>
        <PageHeader title="Finance approvals" />
        <NoAccess module="Finance" />
      </AppShell>
    );
  }

  function getReviewNote(decision: "rejected" | "changes_requested") {
    const note = window.prompt(
      decision === "rejected" ? "Why is this request being rejected?" : "What changes are required?",
    );
    if (note === null) return null;
    if (note.trim().length < 3) {
      toast.error("Enter a reason with at least three characters.");
      return null;
    }
    return note.trim();
  }

  return (
    <AppShell>
      <PageHeader
        title="Finance approvals"
        description="Review requests separately from the payment status. Approval never records a payment."
        actions={
          <Button variant="outline" asChild>
            <Link to="/finance">Finance overview</Link>
          </Button>
        }
      />

      {transactions.isError || journals.isError || journalLines.isError || journalAccounts.isError ? (
        <p className="mb-4 rounded-md border border-destructive/40 p-3 text-sm text-destructive">
          Some approval requests or journal details could not be loaded. Refresh the page or contact Finance.
        </p>
      ) : null}

      <div className="space-y-5">
        <Panel title={`Transactions awaiting review (${transactions.data?.length ?? 0})`}>
          {transactions.isLoading ? (
            <p className="text-sm text-muted-foreground">Loading transaction approvals…</p>
          ) : (transactions.data ?? []).length === 0 ? (
            <EmptyState title="No transactions awaiting review" />
          ) : (
            <div className="space-y-2">
              {(transactions.data ?? []).map((transaction) => {
                const isSubmitter = transaction.created_by === session?.userId;
                return (
                  <div
                    key={transaction.id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-md border p-3"
                  >
                    <div className="min-w-[220px]">
                      <p className="text-sm font-medium">
                        {transaction.transaction_ref} · {formatMoney(transaction.amount, transaction.currency)}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {transaction.purpose}
                        {transaction.deals?.title ? ` · ${transaction.deals.title}` : ""}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {transaction.payment_method ?? "Payment method not recorded"}
                        {transaction.payment_reference ? ` · Ref: ${transaction.payment_reference}` : ""}
                      </p>
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        Submitted {formatDateTime(transaction.created_at)}
                        {transaction.approval_note ? ` · ${transaction.approval_note}` : ""}
                      </p>
                    </div>
                    {canApprove ? (
                      <div className="flex flex-wrap gap-2">
                        <Button
                          size="sm"
                          disabled={isSubmitter || reviewTransaction.isPending}
                          onClick={() =>
                            reviewTransaction.mutate({ id: transaction.id, decision: "approved" })
                          }
                        >
                          Approve
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={isSubmitter || reviewTransaction.isPending}
                          onClick={() => {
                            const note = getReviewNote("changes_requested");
                            if (note) {
                              reviewTransaction.mutate({
                                id: transaction.id,
                                decision: "changes_requested",
                                note,
                              });
                            }
                          }}
                        >
                          Request changes
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          disabled={isSubmitter || reviewTransaction.isPending}
                          onClick={() => {
                            const note = getReviewNote("rejected");
                            if (note) {
                              reviewTransaction.mutate({
                                id: transaction.id,
                                decision: "rejected",
                                note,
                              });
                            }
                          }}
                        >
                          Reject
                        </Button>
                        {isSubmitter ? (
                          <span className="self-center text-xs text-muted-foreground">
                            You submitted this request.
                          </span>
                        ) : null}
                      </div>
                    ) : (
                      <StatusPill value="pending" />
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </Panel>

        <Panel title={`Journal entries awaiting review (${journals.data?.length ?? 0})`}>
          {journals.isLoading ? (
            <p className="text-sm text-muted-foreground">Loading journal approvals…</p>
          ) : (journals.data ?? []).length === 0 ? (
            <EmptyState title="No journal entries awaiting review" />
          ) : (
            <div className="space-y-2">
              {(journals.data ?? []).map((entry) => {
                const isSubmitter = entry.created_by === session?.userId;
                const entryLines = (journalLines.data ?? []).filter((line) => line.journal_id === entry.id);
                const canReview = !journalLines.isLoading
                  && !journalLines.isError
                  && !journalAccounts.isLoading
                  && !journalAccounts.isError
                  && entryLines.length >= 2;
                return (
                  <div key={entry.id} className="rounded-md border p-3">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium">
                        {entry.journal_ref} · {formatMoney(entry.base_total, entry.base_currency)}
                      </p>
                      <p className="text-xs text-muted-foreground">{entry.description}</p>
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        Entry date {entry.entry_date} · Submitted {formatDateTime(entry.created_at)}
                      </p>
                    </div>
                    {canApprove ? (
                      <div className="flex flex-wrap gap-2">
                        <Button
                          size="sm"
                          disabled={isSubmitter || reviewJournal.isPending || !canReview}
                          onClick={() => reviewJournal.mutate({ id: entry.id, decision: "approved" })}
                        >
                          Approve & post
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={isSubmitter || reviewJournal.isPending || !canReview}
                          onClick={() => {
                            const note = getReviewNote("changes_requested");
                            if (note) {
                              reviewJournal.mutate({
                                id: entry.id,
                                decision: "changes_requested",
                                note,
                              });
                            }
                          }}
                        >
                          Request changes
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          disabled={isSubmitter || reviewJournal.isPending || !canReview}
                          onClick={() => {
                            const note = getReviewNote("rejected");
                            if (note) {
                              reviewJournal.mutate({ id: entry.id, decision: "rejected", note });
                            }
                          }}
                        >
                          Reject
                        </Button>
                        {isSubmitter ? (
                          <span className="self-center text-xs text-muted-foreground">
                            You submitted this journal.
                          </span>
                        ) : null}
                      </div>
                    ) : (
                      <StatusPill value="pending" />
                    )}
                    </div>
                    <div className="mt-3 border-t pt-3">
                      <p className="mb-2 text-xs font-medium">Journal lines</p>
                      {journalLines.isLoading || journalAccounts.isLoading ? (
                        <p className="text-xs text-muted-foreground">Loading journal details…</p>
                      ) : entryLines.length === 0 ? (
                        <p className="text-xs text-destructive">No journal lines were found. Review is disabled.</p>
                      ) : (
                        <div className="space-y-1">
                          {entryLines.map((line) => {
                            const account = journalAccounts.data?.find((item) => item.id === line.account_id);
                            return (
                              <div key={line.id} className="grid gap-1 text-xs sm:grid-cols-4">
                                <span>{account ? `${account.account_code} · ${account.name}` : "Unknown account"}</span>
                                <span>{line.description ?? "—"}</span>
                                <span>
                                  Dr {formatMoney(line.debit, line.currency)}
                                  {line.currency !== entry.base_currency
                                    ? ` (${formatMoney(line.base_debit, entry.base_currency)})`
                                    : ""}
                                </span>
                                <span>
                                  Cr {formatMoney(line.credit, line.currency)}
                                  {line.currency !== entry.base_currency
                                    ? ` (${formatMoney(line.base_credit, entry.base_currency)})`
                                    : ""}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Panel>

        {canConfigure ? (
          <Panel title="Approval limits">
            <p className="mb-4 text-xs text-muted-foreground">
              Limits apply per approver role and currency. Leave the amount empty for unlimited authority.
              A finite limit must name one currency. Approval is still restricted to a different person than the submitter.
            </p>
            {roles.isError || limits.isError ? (
              <p className="mb-3 text-sm text-destructive">Approval settings could not be loaded.</p>
            ) : null}
            <div className="grid gap-3 md:grid-cols-4">
              <div className="space-y-1">
                <Label>Approver role</Label>
                <Select value={roleKey} onValueChange={setRoleKey}>
                  <SelectTrigger><SelectValue placeholder="Select role" /></SelectTrigger>
                  <SelectContent>
                    {(roles.data ?? []).map((role) => (
                      <SelectItem key={role.key} value={role.key}>{role.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Currency</Label>
                <Select value={currency} onValueChange={setCurrency}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="*">All currencies</SelectItem>
                    {CURRENCIES.map((code) => <SelectItem key={code} value={code}>{code}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Maximum approval amount</Label>
                <Input
                  type="number"
                  min="0"
                  value={maxAmount}
                  onChange={(event) => setMaxAmount(event.target.value)}
                  placeholder="Blank = unlimited"
                />
              </div>
              <div className="flex items-end">
                <Button className="w-full" disabled={saveLimit.isPending || !roleKey} onClick={() => saveLimit.mutate()}>
                  Save limit
                </Button>
              </div>
            </div>
            <div className="mt-4 space-y-2">
              {(limits.data ?? []).map((limit) => {
                const role = roles.data?.find((item) => item.key === limit.role_key);
                return (
                  <div key={limit.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3 text-sm">
                    <span>{role?.label ?? limit.role_key} · {limit.currency === "*" ? "All currencies" : limit.currency}</span>
                    <span>{limit.max_amount === null ? "Unlimited" : formatMoney(limit.max_amount, limit.currency)}</span>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setRoleKey(limit.role_key);
                        setCurrency(limit.currency);
                        setMaxAmount(limit.max_amount === null ? "" : String(limit.max_amount));
                      }}
                    >
                      Edit
                    </Button>
                  </div>
                );
              })}
            </div>
          </Panel>
        ) : null}
      </div>
    </AppShell>
  );
}
