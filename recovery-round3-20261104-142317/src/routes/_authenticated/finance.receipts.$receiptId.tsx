import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { supabase } from "@/integrations/supabase/client";
import { AppShell, PageHeader } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { KalexiMark } from "@/components/KalexiMark";
import { formatMoney } from "@/lib/records";

export const Route = createFileRoute("/_authenticated/finance/receipts/$receiptId")({
  head: () => ({
    meta: [
      { title: "Receipt — Kalexi Brokerage" },
      { name: "description", content: "Printable QR-verified payment receipt." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ReceiptDocument,
});

function ReceiptDocument() {
  const { receiptId } = useParams({ from: "/_authenticated/finance/receipts/$receiptId" });
  const [qr, setQr] = useState<string | null>(null);

  const receipt = useQuery({
    queryKey: ["receipt-doc", receiptId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("receipts")
        .select(
          "receipt_ref, verification_ref, issued_to, amount, currency, narrative, status, created_at, transactions(transaction_ref, purpose, occurred_on)",
        )
        .eq("id", receiptId)
        .maybeSingle();
      if (error) throw error;
      return data as unknown as {
        receipt_ref: string;
        verification_ref: string;
        issued_to: string;
        amount: number;
        currency: string;
        narrative: string | null;
        status: string;
        created_at: string;
        transactions: { transaction_ref: string; purpose: string; occurred_on: string } | null;
      } | null;
    },
  });

  const verificationRef = receipt.data?.verification_ref;

  useEffect(() => {
    if (!verificationRef || typeof window === "undefined") return;
    const url = `${window.location.origin}/verify/${verificationRef}`;
    void QRCode.toDataURL(url, { margin: 1, width: 220, color: { dark: "#0b1b34", light: "#ffffff" } }).then(
      setQr,
    );
  }, [verificationRef]);

  if (!receipt.data) {
    return (
      <AppShell>
        <p className="text-sm text-muted-foreground">Loading document…</p>
      </AppShell>
    );
  }

  const r = receipt.data;

  return (
    <AppShell>
      <div className="print:hidden">
        <PageHeader
          title="Payment receipt"
          description="Issue this to the payer as proof of payment."
          actions={
            <div className="flex gap-2">
              <Button variant="outline" asChild>
                <Link to="/finance/receipts" search={{}}>Receipts</Link>
              </Button>
              <Button onClick={() => window.print()}>Print / save PDF</Button>
            </div>
          }
        />
      </div>

      <article className="mx-auto max-w-[820px] rounded-lg border bg-card p-10 shadow-[var(--shadow-panel)] print:border-0 print:shadow-none">
        <header className="flex items-start justify-between gap-6 border-b pb-6">
          <div className="flex items-center gap-3">
            <KalexiMark className="h-11 w-11" />
            <div>
              <p className="font-display text-lg font-semibold tracking-tight">KALEXI BROKERAGE LTD</p>
              <p className="text-xs text-muted-foreground">Brokerage · Facilitation · Advisory</p>
            </div>
          </div>
          <div className="text-right">
            <p className="label-caps">Document</p>
            <p className="text-sm font-medium">Payment Receipt</p>
            <p className="ref-mono mt-1 text-xs">{r.receipt_ref}</p>
          </div>
        </header>

        <section className="grid gap-8 py-8 sm:grid-cols-[minmax(0,1fr)_200px]">
          <dl className="space-y-3 text-sm">
            <Row k="Issued to" v={r.issued_to} />
            <Row k="Amount" v={formatMoney(r.amount, r.currency)} />
            <Row k="Related transaction" v={r.transactions?.transaction_ref ?? "—"} />
            <Row k="Purpose" v={r.transactions?.purpose ?? "—"} />
            <Row k="Date issued" v={new Date(r.created_at).toLocaleString()} />
            {r.narrative ? (
              <div>
                <dt className="label-caps">Narrative</dt>
                <dd className="mt-1 whitespace-pre-wrap">{r.narrative}</dd>
              </div>
            ) : null}
          </dl>

          <div className="text-center">
            {qr ? (
              <img src={qr} alt={`Verification QR code for ${r.receipt_ref}`} className="mx-auto h-[180px] w-[180px]" />
            ) : (
              <div className="mx-auto h-[180px] w-[180px] rounded border border-dashed" />
            )}
            <p className="mt-2 text-xs text-muted-foreground">Scan to verify authenticity</p>
            <p className="ref-mono mt-1 text-[10px] break-all text-muted-foreground">{r.verification_ref}</p>
          </div>
        </section>

        <footer className="border-t pt-6 text-xs leading-relaxed text-muted-foreground">
          This receipt confirms the above payment was received by Kalexi Brokerage Ltd. It is not a
          contract, offer, valuation or guarantee of any transaction. Verification of this document is
          available only through the QR reference above.
        </footer>
      </article>
    </AppShell>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex gap-4">
      <dt className="w-36 shrink-0 text-muted-foreground">{k}</dt>
      <dd className="font-medium">{v}</dd>
    </div>
  );
}
