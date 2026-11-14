import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { supabase } from "@/integrations/supabase/client";
import { AppShell, PageHeader } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { KalexiMark } from "@/components/KalexiMark";

export const Route = createFileRoute("/_authenticated/clients/$clientId/acknowledgement")({
  head: () => ({
    meta: [
      { title: "Registration Acknowledgement — Kalexi Brokerage" },
      { name: "description", content: "Printable QR-verified client registration acknowledgement." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Acknowledgement,
});

function Acknowledgement() {
  const { clientId } = useParams({ from: "/_authenticated/clients/$clientId/acknowledgement" });
  const [qr, setQr] = useState<string | null>(null);

  const client = useQuery({
    queryKey: ["client-ack", clientId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clients")
        .select("client_ref, verification_ref, full_name, phone, company_name, client_type, sector, requirement, created_at")
        .eq("id", clientId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const verificationRef = client.data?.verification_ref;

  useEffect(() => {
    if (!verificationRef || typeof window === "undefined") return;
    const url = `${window.location.origin}/verify/${verificationRef}`;
    void QRCode.toDataURL(url, { margin: 1, width: 220, color: { dark: "#0b1b34", light: "#ffffff" } }).then(
      setQr,
    );
  }, [verificationRef]);

  if (!client.data) {
    return (
      <AppShell>
        <p className="text-sm text-muted-foreground">Loading document…</p>
      </AppShell>
    );
  }

  const c = client.data;

  return (
    <AppShell>
      <div className="print:hidden">
        <PageHeader
          title="Registration acknowledgement"
          description="Issue this to the client as proof of official registration."
          actions={
            <div className="flex gap-2">
              <Button variant="outline" asChild>
                <Link to="/clients/$clientId" params={{ clientId }}>
                  Client record
                </Link>
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
            <p className="text-sm font-medium">Client Registration Acknowledgement</p>
            <p className="ref-mono mt-1 text-xs">{c.client_ref}</p>
          </div>
        </header>

        <section className="grid gap-8 py-8 sm:grid-cols-[minmax(0,1fr)_200px]">
          <dl className="space-y-3 text-sm">
            <Row k="Client name" v={c.full_name} />
            <Row k="Company" v={c.company_name ?? "—"} />
            <Row k="Phone" v={c.phone} />
            <Row k="Client type" v={c.client_type} />
            <Row k="Sector" v={c.sector} />
            <Row k="Date registered" v={new Date(c.created_at).toLocaleString()} />
            <div>
              <dt className="label-caps">Stated requirement</dt>
              <dd className="mt-1 whitespace-pre-wrap">{c.requirement}</dd>
            </div>
          </dl>

          <div className="text-center">
            {qr ? (
              <img src={qr} alt={`Verification QR code for ${c.client_ref}`} className="mx-auto h-[180px] w-[180px]" />
            ) : (
              <div className="mx-auto h-[180px] w-[180px] rounded border border-dashed" />
            )}
            <p className="mt-2 text-xs text-muted-foreground">Scan to verify authenticity</p>
            <p className="ref-mono mt-1 text-[10px] break-all text-muted-foreground">{c.verification_ref}</p>
          </div>
        </section>

        <footer className="border-t pt-6 text-xs leading-relaxed text-muted-foreground">
          This acknowledgement confirms that the above party has been officially registered in the
          records of Kalexi Brokerage Ltd. It is not a contract, offer, valuation or guarantee of any
          transaction. Verification of this document is available only through the QR reference above.
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
