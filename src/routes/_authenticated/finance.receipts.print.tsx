import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { supabase } from "@/integrations/supabase/client";
import { AppShell, PageHeader } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { KalexiMark } from "@/components/KalexiMark";
import { formatMoney } from "@/lib/records";

export const Route = createFileRoute("/_authenticated/finance/receipts/print")({
  head: () => ({
    meta: [
      { title: "Print All Receipts — Kalexi Brokerage" },
      { name: "description", content: "Print every QR-verified Kalexi receipt in one batch." },
      { property: "og:title", content: "Print All Receipts — Kalexi Brokerage" },
      { property: "og:description", content: "Batch printing of QR-verified receipts." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: PrintAll,
});

type R = { id: string; receipt_ref: string; verification_ref: string; issued_to: string; amount: number; currency: string; narrative: string | null; created_at: string };

function PrintAll() {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [qrs, setQrs] = useState<Record<string, string>>({});
  const q = useQuery({
    queryKey: ["receipts-print", from, to],
    queryFn: async () => {
      let query = supabase.from("receipts").select("id, receipt_ref, verification_ref, issued_to, amount, currency, narrative, created_at").is("archived_at", null).order("created_at", { ascending: true }).limit(1000);
      if (from) query = query.gte("created_at", `${from}T00:00:00Z`);
      if (to) query = query.lte("created_at", `${to}T23:59:59Z`);
      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as R[];
    },
  });
  useEffect(() => {
    const rows = q.data ?? [];
    void Promise.all(rows.map(async (r) => [r.id, await QRCode.toDataURL(`${window.location.origin}/verify/${r.verification_ref}`, { margin: 1, width: 180 })] as const)).then((e) => setQrs(Object.fromEntries(e)));
  }, [q.data]);
  const rows = q.data ?? [];
  return (
    <AppShell>
      <div className="print:hidden">
        <PageHeader title="Print all receipts" description={`${rows.length} receipt(s) ready to print, one per page.`} actions={<div className="flex gap-2"><Button variant="outline" asChild><Link to="/finance/receipts" search={{ transactionId: undefined }}>Back</Link></Button><Button disabled={!rows.length} onClick={() => window.print()}>Print / save PDF</Button></div>} />
        <div className="mb-6 flex flex-wrap gap-3"><label className="text-sm">From<Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></label><label className="text-sm">To<Input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></label></div>
      </div>
      {q.isLoading ? <p className="text-sm text-muted-foreground">Loading receipts…</p> : null}
      <div className="space-y-8 print:space-y-0">
        {rows.map((r) => (
          <article key={r.id} className="mx-auto max-w-[820px] break-after-page rounded-lg border bg-card p-10 print:border-0">
            <header className="flex items-start justify-between gap-6 border-b pb-6">
              <div className="flex items-center gap-3"><KalexiMark className="h-11 w-11" /><div><p className="font-display text-lg font-semibold">KALEXI BROKERAGE LTD</p><p className="text-xs text-muted-foreground">Brokerage · Facilitation · Advisory</p></div></div>
              <div className="text-right"><p className="label-caps">Payment Receipt</p><p className="ref-mono mt-1 text-xs">{r.receipt_ref}</p></div>
            </header>
            <section className="grid gap-8 py-8 sm:grid-cols-[minmax(0,1fr)_180px]">
              <dl className="space-y-3 text-sm">
                <div className="flex gap-4"><dt className="w-32 text-muted-foreground">Issued to</dt><dd className="font-medium">{r.issued_to}</dd></div>
                <div className="flex gap-4"><dt className="w-32 text-muted-foreground">Amount</dt><dd className="font-medium">{formatMoney(r.amount, r.currency)}</dd></div>
                <div className="flex gap-4"><dt className="w-32 text-muted-foreground">Date issued</dt><dd className="font-medium">{new Date(r.created_at).toLocaleString()}</dd></div>
                {r.narrative ? <div className="flex gap-4"><dt className="w-32 text-muted-foreground">Narrative</dt><dd>{r.narrative}</dd></div> : null}
              </dl>
              <div className="text-center">{qrs[r.id] ? <img src={qrs[r.id]} alt={`QR for ${r.receipt_ref}`} className="mx-auto h-40 w-40" /> : null}<p className="ref-mono mt-1 break-all text-[10px] text-muted-foreground">{r.verification_ref}</p></div>
            </section>
            <footer className="border-t pt-4 text-xs text-muted-foreground">This receipt confirms the above payment was received by Kalexi Brokerage Ltd. Verify via the QR reference above.</footer>
          </article>
        ))}
      </div>
    </AppShell>
  );
}
