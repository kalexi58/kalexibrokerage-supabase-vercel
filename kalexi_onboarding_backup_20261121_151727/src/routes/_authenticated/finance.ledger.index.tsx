import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { AppShell, PageHeader } from "@/components/AppShell";
import { useSession } from "@/hooks/useSession";
import { allows } from "@/lib/rbac";
import { EmptyState, NoAccess, Panel, StatusPill } from "@/components/records";
import { CURRENCIES, formatDate, formatMoney } from "@/lib/records";
import {
  calculateJournalTotals,
  type JournalLineDraft,
} from "@/lib/finance-accounting";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/finance/ledger/")({
  head: () => ({
    meta: [
      { title: "General Ledger — Kalexi Brokerage" },
      { name: "description", content: "Chart of accounts and balanced journal entries." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: FinanceLedgerPage,
});

const ACCOUNT_TYPES = ["asset", "liability", "equity", "income", "expense"] as const;
const INITIAL_LINES: JournalLineDraft[] = [
  { accountId: "", currency: "UGX", debit: "", credit: "", exchangeRate: "1" },
  { accountId: "", currency: "UGX", debit: "", credit: "", exchangeRate: "1" },
];

type Account = {
  id: string;
  account_code: string;
  name: string;
  account_type: string;
  is_active: boolean;
  is_system: boolean;
};

function FinanceLedgerPage() {
  const { data: session } = useSession();
  const access = session?.access;
  const qc = useQueryClient();
  const canView = allows(access, "finance.view");
  const canCreate = allows(access, "finance.create");
  const canConfigure = allows(access, "finance.configure");
  const [journalOpen, setJournalOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [journalSourceKey, setJournalSourceKey] = useState(() => `manual:${crypto.randomUUID()}`);
  const [entryDate, setEntryDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [description, setDescription] = useState("");
  const [lines, setLines] = useState<JournalLineDraft[]>(INITIAL_LINES);
  const [accountCode, setAccountCode] = useState("");
  const [accountName, setAccountName] = useState("");
  const [accountType, setAccountType] = useState<(typeof ACCOUNT_TYPES)[number]>("asset");
  const [expandedEntry, setExpandedEntry] = useState<string | null>(null);

  const settings = useQuery({
    queryKey: ["finance-settings"],
    enabled: canView,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("finance_settings")
        .select("base_currency")
        .eq("singleton", true)
        .single();
      if (error) throw error;
      return data;
    },
  });

  const accounts = useQuery({
    queryKey: ["finance-accounts"],
    enabled: canView,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("finance_accounts")
        .select("id, account_code, name, account_type, is_active, is_system")
        .order("account_code");
      if (error) throw error;
      return (data ?? []) as Account[];
    },
  });

  const entries = useQuery({
    queryKey: ["finance-journals"],
    enabled: canView,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("finance_journal_entries")
        .select(
          "id, journal_ref, entry_date, description, status, base_currency, base_total, source_type, source_id, created_by, created_at, review_note",
        )
        .order("created_at", { ascending: false })
        .limit(300);
      if (error) throw error;
      return data ?? [];
    },
  });

  const journalIds = (entries.data ?? []).map((entry) => entry.id);
  const journalLines = useQuery({
    queryKey: ["finance-journal-lines", journalIds.join(",")],
    enabled: canView && journalIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("finance_journal_lines")
        .select(
          "id, journal_id, line_number, account_id, description, currency, debit, credit, exchange_rate, base_debit, base_credit",
        )
        .in("journal_id", journalIds)
        .order("line_number");
      if (error) throw error;
      return data ?? [];
    },
  });

  const balances = useQuery({
    queryKey: ["finance-account-balances"],
    enabled: canView,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("finance_account_balances");
      if (error) throw error;
      return data ?? [];
    },
  });

  const createJournal = useMutation({
    mutationFn: async () => {
      if (!settings.data) throw new Error("Finance base currency is not available. Refresh before submitting.");
      const baseCurrency = settings.data.base_currency;
      const totals = calculateJournalTotals(lines, baseCurrency);
      if (totals.error) throw new Error(totals.error);
      if (!description.trim()) throw new Error("Journal description is required.");
      const journalLines = lines.map((line) => ({
        account_id: line.accountId,
        currency: line.currency,
        debit: Number(line.debit || 0),
        credit: Number(line.credit || 0),
        exchange_rate: Number(line.exchangeRate || (line.currency === baseCurrency ? "1" : "")),
      }));
      const { error } = await supabase.rpc("create_finance_journal", {
        _entry_date: entryDate,
        _description: description.trim(),
        _lines: journalLines,
        _source_key: journalSourceKey,
        _source_type: "manual",
        _source_id: null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Journal submitted for independent approval.");
      setJournalOpen(false);
      setLines(INITIAL_LINES);
      setDescription("");
      setJournalSourceKey(`manual:${crypto.randomUUID()}`);
      void qc.invalidateQueries({ queryKey: ["finance-journals"] });
      void qc.invalidateQueries({ queryKey: ["finance-account-balances"] });
      void qc.invalidateQueries({ queryKey: ["finance-approval-journals"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const createAccount = useMutation({
    mutationFn: async () => {
      if (!session) throw new Error("Your session expired. Sign in again.");
      if (!/^[A-Z0-9._-]{2,30}$/i.test(accountCode.trim())) {
        throw new Error("Account code must be 2–30 letters, numbers, dots, underscores or hyphens.");
      }
      if (!accountName.trim()) throw new Error("Account name is required.");
      const { error } = await supabase.from("finance_accounts").insert({
        account_code: accountCode.trim().toUpperCase(),
        name: accountName.trim(),
        account_type: accountType,
        created_by: session.userId,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Chart-of-account entry created.");
      setAccountCode("");
      setAccountName("");
      setAccountOpen(false);
      void qc.invalidateQueries({ queryKey: ["finance-accounts"] });
      void qc.invalidateQueries({ queryKey: ["finance-account-balances"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const reverseJournal = useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) => {
      const { error } = await supabase.rpc("reverse_finance_journal", {
        _journal_id: id,
        _reason: reason,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Reversal submitted for independent approval.");
      void qc.invalidateQueries({ queryKey: ["finance-journals"] });
      void qc.invalidateQueries({ queryKey: ["finance-journal-lines"] });
      void qc.invalidateQueries({ queryKey: ["finance-approval-journals"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  if (!canView) {
    return (
      <AppShell>
        <PageHeader title="General ledger" />
        <NoAccess module="Finance" />
      </AppShell>
    );
  }

  const baseCurrency = settings.data?.base_currency ?? "UGX";
  const totals = calculateJournalTotals(lines, baseCurrency);

  return (
    <AppShell>
      <PageHeader
        title="General ledger"
        description={`Chart of accounts and posted journal balances in ${baseCurrency}. Submitted entries do not affect balances until independently approved.`}
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" asChild><Link to="/finance">Finance overview</Link></Button>
            <Button variant="outline" asChild><Link to="/finance/approvals">Approvals</Link></Button>
            {canConfigure ? <Button variant="outline" onClick={() => setAccountOpen(true)}>Add account</Button> : null}
            {canCreate ? (
              <Button disabled={settings.isLoading || settings.isError} onClick={() => setJournalOpen(true)}>
                New journal
              </Button>
            ) : null}
          </div>
        }
      />

      {settings.isError || accounts.isError || entries.isError || balances.isError ? (
        <p className="mb-4 rounded-md border border-destructive/40 p-3 text-sm text-destructive">
          Some accounting records could not be loaded. Refresh the page or contact Finance.
        </p>
      ) : null}
      <p className="mb-4 rounded-md border bg-muted/30 p-3 text-xs text-muted-foreground">
        Balances include posted journals only. Transaction, invoice, commission, asset and liability
        records are not automatically journaled yet, so this is not a complete company balance sheet.
      </p>

      <div className="grid gap-5 xl:grid-cols-2">
        <Panel title="Chart of accounts">
          {accounts.isLoading || balances.isLoading ? (
            <p className="text-sm text-muted-foreground">Loading account balances…</p>
          ) : (accounts.data ?? []).length === 0 ? (
            <EmptyState title="No accounts configured" />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="px-2 py-2">Code</th>
                    <th className="px-2 py-2">Account</th>
                    <th className="px-2 py-2">Type</th>
                    <th className="px-2 py-2 text-right">Posted balance</th>
                  </tr>
                </thead>
                <tbody>
                  {(accounts.data ?? []).map((account) => {
                    const balance = balances.data?.find((item) => item.account_id === account.id);
                    return (
                      <tr key={account.id} className="border-t">
                        <td className="px-2 py-2 font-mono text-xs">{account.account_code}</td>
                        <td className="px-2 py-2">
                          {account.name}
                          {!account.is_active ? <span className="ml-2 text-xs text-muted-foreground">Inactive</span> : null}
                        </td>
                        <td className="px-2 py-2 capitalize">{account.account_type}</td>
                        <td className="px-2 py-2 text-right">
                          {formatMoney(balance?.balance ?? 0, balance?.base_currency ?? baseCurrency)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Panel>

        <Panel title="Journal entries">
          {entries.isLoading ? (
            <p className="text-sm text-muted-foreground">Loading journals…</p>
          ) : (entries.data ?? []).length === 0 ? (
            <EmptyState
              title="No journal entries yet"
              hint="Create a balanced entry; it will remain outside account balances until another authorized user approves it."
            />
          ) : (
            <div className="space-y-2">
              {(entries.data ?? []).map((entry) => {
                const entryLines = (journalLines.data ?? []).filter((line) => line.journal_id === entry.id);
                const isExpanded = expandedEntry === entry.id;
                return (
                  <div key={entry.id} className="rounded-md border">
                    <button
                      type="button"
                      className="flex w-full flex-wrap items-center justify-between gap-3 p-3 text-left"
                      onClick={() => setExpandedEntry(isExpanded ? null : entry.id)}
                    >
                      <span>
                        <span className="block text-sm font-medium">{entry.journal_ref} · {entry.description}</span>
                        <span className="text-xs text-muted-foreground">
                          {formatDate(entry.entry_date)} · {entry.source_type ?? "manual"}
                        </span>
                      </span>
                      <span className="flex items-center gap-2">
                        <StatusPill value={entry.status} />
                        <span className="text-sm font-medium">{formatMoney(entry.base_total, entry.base_currency)}</span>
                      </span>
                    </button>
                    {isExpanded ? (
                      <div className="border-t p-3">
                        {entry.review_note ? (
                          <p className="mb-2 text-xs text-muted-foreground">Review note: {entry.review_note}</p>
                        ) : null}
                        <div className="space-y-1">
                          {entryLines.map((line) => {
                            const account = accounts.data?.find((item) => item.id === line.account_id);
                            return (
                              <div key={line.id} className="grid grid-cols-2 gap-3 text-xs sm:grid-cols-4">
                                <span>{account ? `${account.account_code} · ${account.name}` : "Unknown account"}</span>
                                <span>{line.description ?? "—"}</span>
                                <span>Dr {formatMoney(line.debit, line.currency)}</span>
                                <span>Cr {formatMoney(line.credit, line.currency)}</span>
                              </div>
                            );
                          })}
                        </div>
                        {entry.status === "posted" && entry.source_type !== "reversal" && canCreate ? (
                          <Button
                            className="mt-3"
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              const reason = window.prompt(`Why are you reversing ${entry.journal_ref}?`);
                              if (reason?.trim()) reverseJournal.mutate({ id: entry.id, reason: reason.trim() });
                            }}
                          >
                            Submit reversal
                          </Button>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          )}
        </Panel>
      </div>

      <Dialog open={accountOpen} onOpenChange={setAccountOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add chart-of-account entry</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1">
              <Label>Account code</Label>
              <Input value={accountCode} onChange={(event) => setAccountCode(event.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Account name</Label>
              <Input value={accountName} onChange={(event) => setAccountName(event.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Account type</Label>
              <Select value={accountType} onValueChange={(value) => setAccountType(value as typeof accountType)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ACCOUNT_TYPES.map((type) => <SelectItem key={type} value={type}>{type}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <Button className="w-full" disabled={createAccount.isPending} onClick={() => createAccount.mutate()}>
              Create account
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={journalOpen} onOpenChange={setJournalOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-5xl">
          <DialogHeader><DialogTitle>New balanced journal</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label>Entry date</Label>
                <Input type="date" value={entryDate} onChange={(event) => setEntryDate(event.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>Description</Label>
                <Input value={description} onChange={(event) => setDescription(event.target.value)} />
              </div>
            </div>
            <div className="space-y-3">
              {lines.map((line, index) => (
                <div key={index} className="grid gap-2 rounded-md border p-3 sm:grid-cols-6">
                  <div className="space-y-1 sm:col-span-2">
                    <Label>Account</Label>
                    <Select
                      value={line.accountId}
                      onValueChange={(value) => setLines((current) => current.map((item, i) => i === index ? { ...item, accountId: value } : item))}
                    >
                      <SelectTrigger><SelectValue placeholder="Select account" /></SelectTrigger>
                      <SelectContent>
                        {(accounts.data ?? []).filter((account) => account.is_active).map((account) => (
                          <SelectItem key={account.id} value={account.id}>
                            {account.account_code} · {account.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label>Currency</Label>
                    <Select
                      value={line.currency}
                      onValueChange={(value) => setLines((current) => current.map((item, i) => i === index ? { ...item, currency: value, exchangeRate: value === baseCurrency ? "1" : "" } : item))}
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{CURRENCIES.map((code) => <SelectItem key={code} value={code}>{code}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label>Debit</Label>
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      value={line.debit}
                      onChange={(event) => setLines((current) => current.map((item, i) => i === index ? { ...item, debit: event.target.value, credit: event.target.value ? "" : item.credit } : item))}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>Credit</Label>
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      value={line.credit}
                      onChange={(event) => setLines((current) => current.map((item, i) => i === index ? { ...item, credit: event.target.value, debit: event.target.value ? "" : item.debit } : item))}
                    />
                  </div>
                  {line.currency !== baseCurrency ? (
                    <div className="space-y-1">
                      <Label>Rate to {baseCurrency}</Label>
                      <Input
                        type="number"
                        min="0"
                        step="0.00000001"
                        value={line.exchangeRate}
                        onChange={(event) => setLines((current) => current.map((item, i) => i === index ? { ...item, exchangeRate: event.target.value } : item))}
                      />
                    </div>
                  ) : null}
                  {lines.length > 2 ? (
                    <Button
                      className="sm:col-span-full sm:justify-self-end"
                      size="sm"
                      variant="ghost"
                      onClick={() => setLines((current) => current.filter((_, i) => i !== index))}
                    >
                      Remove line
                    </Button>
                  ) : null}
                </div>
              ))}
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <Button
                type="button"
                variant="outline"
                disabled={lines.length >= 200}
                onClick={() => setLines((current) => [...current, { accountId: "", currency: baseCurrency, debit: "", credit: "", exchangeRate: "1" }])}
              >
                Add line{lines.length >= 200 ? " (limit reached)" : ""}
              </Button>
              <p className={`text-sm ${totals.error ? "text-destructive" : "text-muted-foreground"}`}>
                Dr {formatMoney(totals.baseDebits, baseCurrency)} · Cr {formatMoney(totals.baseCredits, baseCurrency)}
                {totals.error ? ` · ${totals.error}` : " · Balanced"}
              </p>
            </div>
            <p className="text-xs text-muted-foreground">
              Exchange rates are stored with each line. Submission is not posting: a different authorized reviewer must approve it.
            </p>
            <Button
              className="w-full"
              disabled={createJournal.isPending || !totals.balanced || !description.trim()}
              onClick={() => createJournal.mutate()}
            >
              Submit journal for approval
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
