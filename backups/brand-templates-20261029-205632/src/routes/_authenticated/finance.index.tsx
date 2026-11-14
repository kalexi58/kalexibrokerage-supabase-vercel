import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { AppShell, PageHeader } from "@/components/AppShell";
import { useSession, logAudit } from "@/hooks/useSession";
import { allows } from "@/lib/rbac";
import { EmptyState, NoAccess, StatusPill } from "@/components/records";
import { archiveRecord, formatDate, formatMoney, titleCase, CURRENCIES } from "@/lib/records";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { DataTableSkeleton, ErrorState } from "@/components/LoadingStates";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/finance/")({
  head: () => ({
    meta: [
      { title: "Transactions — Kalexi Brokerage" },
      {
        name: "description",
        content: "Track transactions, invoices and commissions across every deal.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: FinancePage,
});

const TX_STATUSES = ["pending", "cleared", "failed", "archived"];
const INVOICE_STATUSES = ["pending", "paid", "overdue", "cancelled", "archived"];
const COMMISSION_STATUSES = ["pending", "approved", "paid", "archived"];

interface TxRow {
  id: string;
  transaction_ref: string;
  client_id: string | null;
  deal_id: string | null;
  amount: number;
  currency: string;
  payment_method: string | null;
  payment_reference: string | null;
  purpose: string;
  commission_amount: number | null;
  occurred_on: string;
  status: string;
  clients: { full_name: string } | null;
  deals: { title: string } | null;
}

interface InvoiceRow {
  id: string;
  invoice_ref: string;
  client_id: string | null;
  deal_id: string | null;
  amount: number;
  currency: string;
  due_date: string | null;
  narrative: string | null;
  status: string;
  clients: { full_name: string } | null;
  deals: { title: string } | null;
}

interface CommissionRow {
  id: string;
  deal_id: string;
  transaction_id: string | null;
  rate: number | null;
  amount: number;
  currency: string;
  beneficiary: string | null;
  narrative: string | null;
  status: string;
  deals: { title: string } | null;
}

function useClientsAndDeals(enabled: boolean) {
  const clients = useQuery({
    queryKey: ["finance-clients"],
    enabled,
    queryFn: async () => {
      const { data } = await supabase
        .from("clients")
        .select("id, client_ref, full_name")
        .is("archived_at", null)
        .limit(500);
      return data ?? [];
    },
  });
  const deals = useQuery({
    queryKey: ["finance-deals"],
    enabled,
    queryFn: async () => {
      const { data } = await supabase
        .from("deals")
        .select("id, deal_ref, title")
        .is("archived_at", null)
        .limit(500);
      return data ?? [];
    },
  });
  return { clients: clients.data ?? [], deals: deals.data ?? [] };
}

function FinancePage() {
  const { data: session } = useSession();
  const access = session?.access;
  const qc = useQueryClient();
  const [tab, setTab] = useState("transactions");
  const [status, setStatus] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [txOpen, setTxOpen] = useState(false);
  const [invOpen, setInvOpen] = useState(false);
  const [comOpen, setComOpen] = useState(false);

  const canView = allows(access, "finance.view");
  const canCreate = allows(access, "finance.create");
  const canEdit = allows(access, "finance.edit");

  const transactions = useQuery({
    queryKey: ["transactions", status, from, to],
    enabled: canView,
    queryFn: async () => {
      let query = supabase
        .from("transactions")
        .select(
          "id, transaction_ref, client_id, deal_id, amount, currency, payment_method, payment_reference, purpose, commission_amount, occurred_on, status, clients(full_name), deals(title)",
        )
        .is("archived_at", null)
        .order("occurred_on", { ascending: false })
        .limit(300);
      if (status !== "all") query = query.eq("status", status);
      if (from) query = query.gte("occurred_on", from);
      if (to) query = query.lte("occurred_on", to);
      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as unknown as TxRow[];
    },
  });

  const invoices = useQuery({
    queryKey: ["invoices", status, from, to],
    enabled: canView,
    queryFn: async () => {
      let query = supabase
        .from("invoices")
        .select(
          "id, invoice_ref, client_id, deal_id, amount, currency, due_date, narrative, status, clients(full_name), deals(title)",
        )
        .is("archived_at", null)
        .order("created_at", { ascending: false })
        .limit(300);
      if (status !== "all") query = query.eq("status", status);
      if (from) query = query.gte("due_date", from);
      if (to) query = query.lte("due_date", to);
      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as unknown as InvoiceRow[];
    },
  });

  const commissions = useQuery({
    queryKey: ["commissions", status],
    enabled: canView,
    queryFn: async () => {
      let query = supabase
        .from("commissions")
        .select(
          "id, deal_id, transaction_id, rate, amount, currency, beneficiary, narrative, status, deals(title)",
        )
        .is("archived_at", null)
        .order("created_at", { ascending: false })
        .limit(300);
      if (status !== "all") query = query.eq("status", status);
      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as unknown as CommissionRow[];
    },
  });

  const setTxStatus = useMutation({
    mutationFn: async ({ id, value }: { id: string; value: string }) => {
      const { error } = await supabase.from("transactions").update({ status: value }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Transaction status updated.");
      qc.invalidateQueries({ queryKey: ["transactions"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const setInvoiceStatus = useMutation({
    mutationFn: async ({ id, value }: { id: string; value: string }) => {
      const { error } = await supabase.from("invoices").update({ status: value }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Invoice status updated.");
      qc.invalidateQueries({ queryKey: ["invoices"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const setCommissionStatus = useMutation({
    mutationFn: async ({ id, value }: { id: string; value: string }) => {
      const { error } = await supabase.from("commissions").update({ status: value }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Commission status updated.");
      qc.invalidateQueries({ queryKey: ["commissions"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  async function archiveRow(
    table: "transactions" | "invoices" | "commissions",
    id: string,
    ref: string,
  ) {
    const reason = window.prompt("Reason for archiving this record?");
    if (!reason || !session) return;
    try {
      await archiveRecord({
        table,
        id,
        entityRef: ref,
        title: ref,
        reason,
        actorId: session.userId,
        actorEmail: session.email,
      });
      toast.success("Record archived.");
      qc.invalidateQueries({ queryKey: [table] });
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  if (!canView) {
    return (
      <AppShell>
        <PageHeader title="Transactions" />
        <NoAccess module="Finance" />
      </AppShell>
    );
  }

  const txRows = transactions.data ?? [];
  const invRows = invoices.data ?? [];
  const comRows = commissions.data ?? [];

  const totalReceived = txRows
    .filter((t) => t.status === "cleared")
    .reduce((sum, t) => sum + Number(t.amount ?? 0), 0);
  const commissionEarned = comRows
    .filter((c) => c.status !== "archived")
    .reduce((sum, c) => sum + Number(c.amount ?? 0), 0);
  const outstandingInvoices = invRows
    .filter((i) => i.status === "pending" || i.status === "overdue")
    .reduce((sum, i) => sum + Number(i.amount ?? 0), 0);

  return (
    <AppShell>
      <PageHeader
        title="Transactions"
        description="Financial movements, invoices and commissions across every brokered deal."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" asChild>
              <Link to="/finance/receipts">Receipts</Link>
            </Button>
          </div>
        }
      />

      <div className="mb-5 grid gap-3 sm:grid-cols-3">
        <div className="rounded-lg border bg-card p-4">
          <p className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
            Total received
          </p>
          <p className="mt-1 text-2xl font-semibold">{formatMoney(totalReceived, "UGX")}</p>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <p className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
            Commission earned
          </p>
          <p className="mt-1 text-2xl font-semibold">{formatMoney(commissionEarned, "UGX")}</p>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <p className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
            Outstanding invoices
          </p>
          <p className="mt-1 text-2xl font-semibold">{formatMoney(outstandingInvoices, "UGX")}</p>
        </div>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <TabsList>
            <TabsTrigger value="transactions">Transactions</TabsTrigger>
            <TabsTrigger value="invoices">Invoices</TabsTrigger>
            <TabsTrigger value="commissions">Commissions</TabsTrigger>
          </TabsList>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              {(tab === "transactions"
                ? TX_STATUSES
                : tab === "invoices"
                  ? INVOICE_STATUSES
                  : COMMISSION_STATUSES
              ).map((s) => (
                <SelectItem key={s} value={s}>
                  {titleCase(s)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {tab !== "commissions" ? (
            <>
              <Input
                type="date"
                className="w-40"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
              />
              <Input
                type="date"
                className="w-40"
                value={to}
                onChange={(e) => setTo(e.target.value)}
              />
            </>
          ) : null}
          <div className="ml-auto">
            {canCreate && tab === "transactions" ? (
              <Button onClick={() => setTxOpen(true)}>New transaction</Button>
            ) : null}
            {canCreate && tab === "invoices" ? (
              <Button onClick={() => setInvOpen(true)}>New invoice</Button>
            ) : null}
            {canCreate && tab === "commissions" ? (
              <Button onClick={() => setComOpen(true)}>New commission</Button>
            ) : null}
          </div>
        </div>

        <TabsContent value="transactions">
          {transactions.isLoading ? (
            <DataTableSkeleton rows={5} columns={8} />
          ) : transactions.isError ? (
            <ErrorState
              title="Transactions could not be retrieved"
              onRetry={() => void transactions.refetch()}
            />
          ) : txRows.length === 0 ? (
            <EmptyState title="No transactions recorded" hint="Create the first transaction." />
          ) : (
            <div className="overflow-x-auto rounded-lg border bg-card">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-4 py-2">Reference</th>
                    <th className="px-4 py-2">Client / Deal</th>
                    <th className="px-4 py-2">Purpose</th>
                    <th className="px-4 py-2">Amount</th>
                    <th className="px-4 py-2">Commission</th>
                    <th className="px-4 py-2">Date</th>
                    <th className="px-4 py-2">Status</th>
                    <th className="px-4 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {txRows.map((t) => (
                    <tr key={t.id} className="border-t">
                      <td className="px-4 py-2 ref-mono text-xs">{t.transaction_ref}</td>
                      <td className="px-4 py-2">
                        {t.clients?.full_name ?? "—"}
                        <p className="text-xs text-muted-foreground">{t.deals?.title ?? ""}</p>
                      </td>
                      <td className="px-4 py-2">{t.purpose}</td>
                      <td className="px-4 py-2">{formatMoney(t.amount, t.currency)}</td>
                      <td className="px-4 py-2">{formatMoney(t.commission_amount, t.currency)}</td>
                      <td className="px-4 py-2">{formatDate(t.occurred_on)}</td>
                      <td className="px-4 py-2">
                        {canEdit ? (
                          <Select
                            value={t.status}
                            onValueChange={(v) => setTxStatus.mutate({ id: t.id, value: v })}
                          >
                            <SelectTrigger className="h-8 w-32 text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {TX_STATUSES.map((s) => (
                                <SelectItem key={s} value={s}>
                                  {titleCase(s)}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : (
                          <StatusPill value={t.status} />
                        )}
                      </td>
                      <td className="px-4 py-2">
                        {allows(access, "finance.edit") ? (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => archiveRow("transactions", t.id, t.transaction_ref)}
                          >
                            Archive
                          </Button>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </TabsContent>

        <TabsContent value="invoices">
          {invoices.isLoading ? (
            <DataTableSkeleton rows={5} columns={6} />
          ) : invoices.isError ? (
            <ErrorState
              title="Invoices could not be retrieved"
              onRetry={() => void invoices.refetch()}
            />
          ) : invRows.length === 0 ? (
            <EmptyState title="No invoices recorded" hint="Create the first invoice." />
          ) : (
            <div className="overflow-x-auto rounded-lg border bg-card">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-4 py-2">Reference</th>
                    <th className="px-4 py-2">Client / Deal</th>
                    <th className="px-4 py-2">Amount</th>
                    <th className="px-4 py-2">Due date</th>
                    <th className="px-4 py-2">Status</th>
                    <th className="px-4 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {invRows.map((i) => (
                    <tr key={i.id} className="border-t">
                      <td className="px-4 py-2 ref-mono text-xs">{i.invoice_ref}</td>
                      <td className="px-4 py-2">
                        {i.clients?.full_name ?? "—"}
                        <p className="text-xs text-muted-foreground">{i.deals?.title ?? ""}</p>
                      </td>
                      <td className="px-4 py-2">{formatMoney(i.amount, i.currency)}</td>
                      <td className="px-4 py-2">{formatDate(i.due_date)}</td>
                      <td className="px-4 py-2">
                        {canEdit ? (
                          <Select
                            value={i.status}
                            onValueChange={(v) => setInvoiceStatus.mutate({ id: i.id, value: v })}
                          >
                            <SelectTrigger className="h-8 w-32 text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {INVOICE_STATUSES.map((s) => (
                                <SelectItem key={s} value={s}>
                                  {titleCase(s)}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : (
                          <StatusPill value={i.status} />
                        )}
                      </td>
                      <td className="px-4 py-2">
                        {allows(access, "finance.edit") ? (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => archiveRow("invoices", i.id, i.invoice_ref)}
                          >
                            Archive
                          </Button>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </TabsContent>

        <TabsContent value="commissions">
          {commissions.isLoading ? (
            <DataTableSkeleton rows={5} columns={6} />
          ) : commissions.isError ? (
            <ErrorState
              title="Commissions could not be retrieved"
              onRetry={() => void commissions.refetch()}
            />
          ) : comRows.length === 0 ? (
            <EmptyState title="No commissions recorded" hint="Create the first commission entry." />
          ) : (
            <div className="overflow-x-auto rounded-lg border bg-card">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-4 py-2">Deal</th>
                    <th className="px-4 py-2">Beneficiary</th>
                    <th className="px-4 py-2">Rate</th>
                    <th className="px-4 py-2">Amount</th>
                    <th className="px-4 py-2">Status</th>
                    <th className="px-4 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {comRows.map((c) => (
                    <tr key={c.id} className="border-t">
                      <td className="px-4 py-2">{c.deals?.title ?? "—"}</td>
                      <td className="px-4 py-2">{c.beneficiary ?? "—"}</td>
                      <td className="px-4 py-2">{c.rate ? `${c.rate}%` : "—"}</td>
                      <td className="px-4 py-2">{formatMoney(c.amount, c.currency)}</td>
                      <td className="px-4 py-2">
                        {canEdit ? (
                          <Select
                            value={c.status}
                            onValueChange={(v) =>
                              setCommissionStatus.mutate({ id: c.id, value: v })
                            }
                          >
                            <SelectTrigger className="h-8 w-32 text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {COMMISSION_STATUSES.map((s) => (
                                <SelectItem key={s} value={s}>
                                  {titleCase(s)}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : (
                          <StatusPill value={c.status} />
                        )}
                      </td>
                      <td className="px-4 py-2">
                        {allows(access, "finance.edit") ? (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() =>
                              archiveRow("commissions", c.id, c.deals?.title ?? "commission")
                            }
                          >
                            Archive
                          </Button>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </TabsContent>
      </Tabs>

      <NewTransactionDialog
        open={txOpen}
        onOpenChange={setTxOpen}
        onDone={() => {
          setTxOpen(false);
          qc.invalidateQueries({ queryKey: ["transactions"] });
        }}
      />
      <NewInvoiceDialog
        open={invOpen}
        onOpenChange={setInvOpen}
        onDone={() => {
          setInvOpen(false);
          qc.invalidateQueries({ queryKey: ["invoices"] });
        }}
      />
      <NewCommissionDialog
        open={comOpen}
        onOpenChange={setComOpen}
        onDone={() => {
          setComOpen(false);
          qc.invalidateQueries({ queryKey: ["commissions"] });
        }}
      />
    </AppShell>
  );
}

function NewTransactionDialog({
  open,
  onOpenChange,
  onDone,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onDone: () => void;
}) {
  const { data: session } = useSession();
  const { clients, deals } = useClientsAndDeals(open);
  const [clientId, setClientId] = useState("");
  const [dealId, setDealId] = useState("");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState("UGX");
  const [paymentMethod, setPaymentMethod] = useState("");
  const [paymentReference, setPaymentReference] = useState("");
  const [purpose, setPurpose] = useState("");
  const [commissionAmount, setCommissionAmount] = useState("");
  const [occurredOn, setOccurredOn] = useState(() => new Date().toISOString().slice(0, 10));

  const create = useMutation({
    mutationFn: async () => {
      if (!purpose.trim()) throw new Error("Purpose is required.");
      if (!amount) throw new Error("Amount is required.");
      const { data, error } = await supabase
        .from("transactions")
        .insert({
          client_id: clientId || null,
          deal_id: dealId || null,
          amount: Number(amount),
          currency,
          payment_method: paymentMethod || null,
          payment_reference: paymentReference || null,
          purpose: purpose.trim(),
          commission_amount: commissionAmount ? Number(commissionAmount) : null,
          occurred_on: occurredOn,
          status: "pending",
          created_by: session?.userId ?? null,
        })
        .select("id, transaction_ref")
        .single();
      if (error) throw error;
      if (session) {
        await logAudit({
          actorId: session.userId,
          actorEmail: session.email,
          action: "transaction.created",
          entityType: "transactions",
          entityId: data.id,
          newValue: { transaction_ref: data.transaction_ref },
        });
      }
      return data;
    },
    onSuccess: () => {
      toast.success("Transaction recorded.");
      setClientId("");
      setDealId("");
      setAmount("");
      setPaymentMethod("");
      setPaymentReference("");
      setPurpose("");
      setCommissionAmount("");
      onDone();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>New transaction</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Client</Label>
            <Select value={clientId} onValueChange={setClientId}>
              <SelectTrigger>
                <SelectValue placeholder="Select client (optional)" />
              </SelectTrigger>
              <SelectContent>
                {clients.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.full_name} · {c.client_ref}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Deal</Label>
            <Select value={dealId} onValueChange={setDealId}>
              <SelectTrigger>
                <SelectValue placeholder="Select deal (optional)" />
              </SelectTrigger>
              <SelectContent>
                {deals.map((d) => (
                  <SelectItem key={d.id} value={d.id}>
                    {d.title} · {d.deal_ref}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Purpose</Label>
            <Input value={purpose} onChange={(e) => setPurpose(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Amount</Label>
              <Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Currency</Label>
              <Select value={currency} onValueChange={setCurrency}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CURRENCIES.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Payment method</Label>
              <Input value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Payment reference</Label>
              <Input
                value={paymentReference}
                onChange={(e) => setPaymentReference(e.target.value)}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Commission amount</Label>
              <Input
                type="number"
                value={commissionAmount}
                onChange={(e) => setCommissionAmount(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Date occurred</Label>
              <Input
                type="date"
                value={occurredOn}
                onChange={(e) => setOccurredOn(e.target.value)}
              />
            </div>
          </div>
          <Button className="w-full" disabled={create.isPending} onClick={() => create.mutate()}>
            {create.isPending ? "Saving…" : "Record transaction"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function NewInvoiceDialog({
  open,
  onOpenChange,
  onDone,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onDone: () => void;
}) {
  const { data: session } = useSession();
  const { clients, deals } = useClientsAndDeals(open);
  const [clientId, setClientId] = useState("");
  const [dealId, setDealId] = useState("");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState("UGX");
  const [dueDate, setDueDate] = useState("");
  const [narrative, setNarrative] = useState("");

  const create = useMutation({
    mutationFn: async () => {
      if (!amount) throw new Error("Amount is required.");
      const { data, error } = await supabase
        .from("invoices")
        .insert({
          client_id: clientId || null,
          deal_id: dealId || null,
          amount: Number(amount),
          currency,
          due_date: dueDate || null,
          narrative: narrative || null,
          status: "pending",
          created_by: session?.userId ?? null,
        })
        .select("id, invoice_ref")
        .single();
      if (error) throw error;
      if (session) {
        await logAudit({
          actorId: session.userId,
          actorEmail: session.email,
          action: "invoice.created",
          entityType: "invoices",
          entityId: data.id,
          newValue: { invoice_ref: data.invoice_ref },
        });
      }
      return data;
    },
    onSuccess: () => {
      toast.success("Invoice created.");
      setClientId("");
      setDealId("");
      setAmount("");
      setDueDate("");
      setNarrative("");
      onDone();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>New invoice</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Client</Label>
            <Select value={clientId} onValueChange={setClientId}>
              <SelectTrigger>
                <SelectValue placeholder="Select client (optional)" />
              </SelectTrigger>
              <SelectContent>
                {clients.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.full_name} · {c.client_ref}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Deal</Label>
            <Select value={dealId} onValueChange={setDealId}>
              <SelectTrigger>
                <SelectValue placeholder="Select deal (optional)" />
              </SelectTrigger>
              <SelectContent>
                {deals.map((d) => (
                  <SelectItem key={d.id} value={d.id}>
                    {d.title} · {d.deal_ref}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Amount</Label>
              <Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Currency</Label>
              <Select value={currency} onValueChange={setCurrency}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CURRENCIES.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-2">
            <Label>Due date</Label>
            <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Narrative</Label>
            <Textarea value={narrative} onChange={(e) => setNarrative(e.target.value)} />
          </div>
          <Button className="w-full" disabled={create.isPending} onClick={() => create.mutate()}>
            {create.isPending ? "Saving…" : "Create invoice"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function NewCommissionDialog({
  open,
  onOpenChange,
  onDone,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onDone: () => void;
}) {
  const { data: session } = useSession();
  const { deals } = useClientsAndDeals(open);
  const [dealId, setDealId] = useState("");
  const [transactionId, setTransactionId] = useState("");
  const [rate, setRate] = useState("");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState("UGX");
  const [beneficiary, setBeneficiary] = useState("");
  const [narrative, setNarrative] = useState("");

  const transactions = useQuery({
    queryKey: ["commission-transactions", dealId],
    enabled: open && !!dealId,
    queryFn: async () => {
      const { data } = await supabase
        .from("transactions")
        .select("id, transaction_ref")
        .eq("deal_id", dealId)
        .is("archived_at", null)
        .limit(200);
      return data ?? [];
    },
  });

  const create = useMutation({
    mutationFn: async () => {
      if (!dealId) throw new Error("Select a deal.");
      if (!amount) throw new Error("Amount is required.");
      const { data, error } = await supabase
        .from("commissions")
        .insert({
          deal_id: dealId,
          transaction_id: transactionId || null,
          rate: rate ? Number(rate) : null,
          amount: Number(amount),
          currency,
          beneficiary: beneficiary || null,
          narrative: narrative || null,
          status: "pending",
          created_by: session?.userId ?? null,
        })
        .select("id")
        .single();
      if (error) throw error;
      if (session) {
        await logAudit({
          actorId: session.userId,
          actorEmail: session.email,
          action: "commission.created",
          entityType: "commissions",
          entityId: data.id,
        });
      }
      return data;
    },
    onSuccess: () => {
      toast.success("Commission recorded.");
      setDealId("");
      setTransactionId("");
      setRate("");
      setAmount("");
      setBeneficiary("");
      setNarrative("");
      onDone();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>New commission</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Deal</Label>
            <Select value={dealId} onValueChange={setDealId}>
              <SelectTrigger>
                <SelectValue placeholder="Select deal" />
              </SelectTrigger>
              <SelectContent>
                {deals.map((d) => (
                  <SelectItem key={d.id} value={d.id}>
                    {d.title} · {d.deal_ref}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Transaction</Label>
            <Select value={transactionId} onValueChange={setTransactionId}>
              <SelectTrigger>
                <SelectValue placeholder="Select transaction (optional)" />
              </SelectTrigger>
              <SelectContent>
                {(transactions.data ?? []).map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.transaction_ref}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Rate (%)</Label>
              <Input type="number" value={rate} onChange={(e) => setRate(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Amount</Label>
              <Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Currency</Label>
              <Select value={currency} onValueChange={setCurrency}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CURRENCIES.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Beneficiary</Label>
              <Input value={beneficiary} onChange={(e) => setBeneficiary(e.target.value)} />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Narrative</Label>
            <Textarea value={narrative} onChange={(e) => setNarrative(e.target.value)} />
          </div>
          <Button className="w-full" disabled={create.isPending} onClick={() => create.mutate()}>
            {create.isPending ? "Saving…" : "Record commission"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
