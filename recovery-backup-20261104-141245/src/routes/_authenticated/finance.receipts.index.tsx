import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { AppShell, PageHeader } from "@/components/AppShell";
import { useSession, logAudit } from "@/hooks/useSession";
import { allows } from "@/lib/rbac";
import { EmptyState, NoAccess, StatusPill } from "@/components/records";
import { formatDateTime, formatMoney, CURRENCIES } from "@/lib/records";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/finance/receipts/")({
  validateSearch: (search: Record<string, unknown>) => ({
    transactionId: typeof search.transactionId === "string" ? search.transactionId : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Receipts — Kalexi Brokerage" },
      { name: "description", content: "Issue and manage QR-verified payment receipts." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ReceiptsPage,
});

interface ReceiptRow {
  id: string;
  receipt_ref: string;
  verification_ref: string;
  transaction_id: string;
  issued_to: string;
  amount: number;
  currency: string;
  narrative: string | null;
  status: string;
  created_at: string;
}

function ReceiptsPage() {
  const { data: session } = useSession();
  const { transactionId } = Route.useSearch();
  const access = session?.access;
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (transactionId) setOpen(true);
  }, [transactionId]);

  const receipts = useQuery({
    queryKey: ["receipts"],
    enabled: allows(access, "finance.view"),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("receipts")
        .select("*")
        .is("archived_at", null)
        .order("created_at", { ascending: false })
        .limit(300);
      if (error) throw error;
      return (data ?? []) as ReceiptRow[];
    },
  });

  if (!allows(access, "finance.view")) {
    return (
      <AppShell>
        <PageHeader title="Receipts" />
        <NoAccess module="Finance" />
      </AppShell>
    );
  }

  const rows = receipts.data ?? [];

  return (
    <AppShell>
      <PageHeader
        title="Receipts"
        description="QR-verified receipts issued for cleared transactions."
        actions={
          <div className="flex gap-2">
            <Button variant="outline" asChild>
              <Link to="/finance">Transactions</Link>
            </Button>
            <Button variant="outline" asChild>
              <Link to="/finance/receipts/print">Print all receipts</Link>
            </Button>
            {allows(access, "finance.create") ? (
              <Button onClick={() => setOpen(true)}>Issue receipt</Button>
            ) : null}
          </div>
        }
      />

      {receipts.isLoading ? (
        <p className="text-sm text-muted-foreground">Loading receipts…</p>
      ) : receipts.isError ? (
        <p className="rounded-md border border-destructive/40 p-3 text-sm text-destructive">
          Receipts could not be loaded. Please retry the page or contact Finance.
        </p>
      ) : rows.length === 0 ? (
        <EmptyState title="No receipts issued" hint="Issue the first receipt against a transaction." />
      ) : (
        <div className="overflow-x-auto rounded-lg border bg-card">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-2">Reference</th>
                <th className="px-4 py-2">Issued to</th>
                <th className="px-4 py-2">Amount</th>
                <th className="px-4 py-2">Issued</th>
                <th className="px-4 py-2">Status</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t">
                  <td className="px-4 py-2 ref-mono text-xs">{r.receipt_ref}</td>
                  <td className="px-4 py-2">{r.issued_to}</td>
                  <td className="px-4 py-2">{formatMoney(r.amount, r.currency)}</td>
                  <td className="px-4 py-2">{formatDateTime(r.created_at)}</td>
                  <td className="px-4 py-2">
                    <StatusPill value={r.status} />
                  </td>
                  <td className="px-4 py-2">
                    <Link
                      to="/finance/receipts/$receiptId"
                      params={{ receiptId: r.id }}
                      className="text-xs text-primary hover:underline"
                    >
                      View document
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <IssueReceiptDialog
        open={open}
        onOpenChange={setOpen}
        initialTransactionId={transactionId}
        onDone={() => {
          setOpen(false);
          qc.invalidateQueries({ queryKey: ["receipts"] });
        }}
      />
    </AppShell>
  );
}

function IssueReceiptDialog({
  open,
  onOpenChange,
  initialTransactionId,
  onDone,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  initialTransactionId?: string;
  onDone: () => void;
}) {
  const { data: session } = useSession();
  const [transactionId, setTransactionId] = useState("");
  const [issuedTo, setIssuedTo] = useState("");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState("UGX");
  const [narrative, setNarrative] = useState("");

  const transactions = useQuery({
    queryKey: ["receipt-transactions"],
    enabled: open,
    queryFn: async () => {
      const { data: transactionData, error: transactionError } = await supabase
        .from("transactions")
        .select("id, transaction_ref, amount, currency, status, clients(full_name), deals(deal_ref, title)")
        .is("archived_at", null)
        .eq("status", "cleared")
        .order("created_at", { ascending: false })
        .limit(300);
      if (transactionError) {
        console.error("[receipts] failed to load cleared transactions", {
          code: transactionError.code,
          message: transactionError.message,
          details: transactionError.details,
          hint: transactionError.hint,
        });
        throw transactionError;
      }

      const { data: existingReceipts, error: receiptError } = await supabase
        .from("receipts")
        .select("transaction_id")
        .limit(5000);
      if (receiptError) {
        console.error("[receipts] failed to check existing receipts", {
          code: receiptError.code,
          message: receiptError.message,
          details: receiptError.details,
          hint: receiptError.hint,
        });
        throw receiptError;
      }

      const receiptedTransactionIds = new Set((existingReceipts ?? []).map((receipt) => receipt.transaction_id));
      return ((transactionData ?? []).filter((transaction) => !receiptedTransactionIds.has(transaction.id))) as unknown as {
        id: string;
        transaction_ref: string;
        amount: number;
        currency: string;
        status: string;
        clients: { full_name: string } | null;
        deals: { deal_ref: string; title: string } | null;
      }[];
    },
  });

  const onTransactionChange = useCallback((id: string) => {
    setTransactionId(id);
    const tx = (transactions.data ?? []).find((t) => t.id === id);
    if (tx) {
      setAmount(String(tx.amount));
      setCurrency(tx.currency);
      setIssuedTo(tx.clients?.full_name ?? "");
    }
  }, [transactions.data]);

  useEffect(() => {
    if (!open || !initialTransactionId || !transactions.data) return;
    const transaction = transactions.data.find((item) => item.id === initialTransactionId);
    if (transaction) onTransactionChange(transaction.id);
  }, [open, initialTransactionId, onTransactionChange, transactions.data]);

  const create = useMutation({
    mutationFn: async () => {
      if (!transactionId) throw new Error("Select a transaction.");
      if (!issuedTo.trim()) throw new Error("Issued to is required.");
      const transaction = (transactions.data ?? []).find((item) => item.id === transactionId);
      if (!transaction || transaction.status !== "cleared") {
        throw new Error("Only a cleared transaction can be receipted.");
      }
      if (Number(amount) !== Number(transaction.amount) || currency !== transaction.currency) {
        throw new Error("Receipt amount and currency must match the cleared transaction.");
      }
      if (!session) throw new Error("Your session expired. Sign in again to issue a receipt.");
      const { data, error } = await supabase
        .from("receipts")
        .insert({
          transaction_id: transactionId,
          issued_to: issuedTo.trim(),
          amount: Number(amount),
          currency,
          narrative: narrative || null,
          status: "issued",
          created_by: session?.userId ?? null,
        })
        .select("id, receipt_ref")
        .single();
      if (error) {
        console.error("[receipts] failed to issue receipt", {
          transactionId,
          code: error.code,
          message: error.message,
          details: error.details,
          hint: error.hint,
        });
        throw error;
      }
      if (session) {
        await logAudit({
          actorId: session.userId,
          actorEmail: session.email,
          action: "receipt.issued",
          entityType: "receipts",
          entityId: data.id,
          newValue: { receipt_ref: data.receipt_ref },
        });
      }
      return data;
    },
    onSuccess: () => {
      toast.success("Receipt issued.");
      setTransactionId("");
      setIssuedTo("");
      setAmount("");
      setNarrative("");
      onDone();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Issue receipt</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Transaction</Label>
            <Select value={transactionId} onValueChange={onTransactionChange}>
              <SelectTrigger>
                <SelectValue placeholder="Select transaction" />
              </SelectTrigger>
              <SelectContent>
                {(transactions.data ?? []).map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.transaction_ref} · {t.deals?.deal_ref ?? "No deal"} · {t.clients?.full_name ?? "—"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {transactions.isError ? (
              <p className="text-xs text-destructive">Cleared transactions could not be loaded.</p>
            ) : null}
          </div>
          <div className="space-y-2">
            <Label>Issued to</Label>
            <Input value={issuedTo} onChange={(e) => setIssuedTo(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Amount</Label>
              <Input type="number" value={amount} readOnly />
            </div>
            <div className="space-y-2">
              <Label>Currency</Label>
              <Select value={currency} disabled>
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
            <Label>Narrative</Label>
            <Textarea value={narrative} onChange={(e) => setNarrative(e.target.value)} />
          </div>
          <Button className="w-full" disabled={create.isPending} onClick={() => create.mutate()}>
            {create.isPending ? "Issuing…" : "Issue receipt"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
