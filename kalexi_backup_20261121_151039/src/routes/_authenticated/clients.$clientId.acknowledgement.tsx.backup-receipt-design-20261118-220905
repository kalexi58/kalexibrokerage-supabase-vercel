import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useRef } from "react";
import JsBarcode from "jsbarcode";
import QRCode from "qrcode";
import { supabase } from "@/integrations/supabase/client";
import { AppShell, PageHeader } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { KalexiMark } from "@/components/KalexiMark";
import { ErrorState } from "@/components/LoadingStates";

export const Route = createFileRoute("/_authenticated/clients/$clientId/acknowledgement")({
  head: () => ({
    meta: [
      { title: "Registration Acknowledgement — Kalexi Brokerage" },
      {
        name: "description",
        content: "Printable QR-verified client registration acknowledgement.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Acknowledgement,
});

function Acknowledgement() {
  const { clientId } = useParams({ from: "/_authenticated/clients/$clientId/acknowledgement" });
  const [qr, setQr] = useState<string | null>(null);
  const barcodeRef = useRef<SVGSVGElement>(null);

  const client = useQuery({
    queryKey: ["client-ack", clientId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clients")
        .select(
          "client_ref, verification_ref, full_name, phone, company_name, client_type, sector, requirement, created_at, photo_path",
        )
        .eq("id", clientId)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      if (!data.photo_path) return { ...data, photo_url: null };
      const { data: photoData, error: photoError } = await supabase.storage
        .from("client-photos")
        .createSignedUrl(data.photo_path, 600);
      if (photoError) throw photoError;
      return { ...data, photo_url: photoData.signedUrl };
    },
  });

  const verificationRef = client.data?.verification_ref;

  useEffect(() => {
    if (!verificationRef || typeof window === "undefined") return;
    const url = `${window.location.origin}/verify/${verificationRef}`;
    void QRCode.toDataURL(url, {
      margin: 1,
      width: 220,
      color: { dark: "#0b1b34", light: "#ffffff" },
    })
      .then(setQr)
      .catch((error: unknown) => {
        console.error("[clients] Could not create the verification QR code.", error);
        setQr(null);
      });
  }, [verificationRef]);


  useEffect(() => {
    if (!client.data?.client_ref || !barcodeRef.current) return;
    try {
      JsBarcode(barcodeRef.current, client.data.client_ref, {
        format: "CODE128",
        displayValue: true,
        font: "monospace",
        fontSize: 10,
        height: 34,
        margin: 0,
        width: 1.4,
      });
    } catch (error) {
      console.error("[clients] Could not create the client barcode.", error);
    }
  }, [client.data?.client_ref]);

  if (!client.data) {
    return (
      <AppShell>
        {client.isError ? (
          <ErrorState
            title="Acknowledgement could not be retrieved"
            description="Check your access and connection, then retry."
            onRetry={() => void client.refetch()}
          />
        ) : (
          <p className="text-sm text-muted-foreground">Loading document…</p>
        )}
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
              <p className="font-display text-lg font-semibold tracking-tight">
                KALEXI BROKERAGE LTD
              </p>
              <p className="text-xs text-muted-foreground">Brokerage · Facilitation · Advisory</p>
            </div>
          </div>
          <div className="text-right">
            <p className="label-caps">Document</p>
            <p className="text-sm font-medium">Client Registration Acknowledgement</p>
            <p className="ref-mono mt-1 text-xs">{c.client_ref}</p>
          </div>
        </header>

        <section className="grid gap-8 py-8 sm:grid-cols-[minmax(0,1fr)_240px]">
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

          <div className="space-y-4 text-center">
            {c.photo_url ? (
              <img
                src={c.photo_url}
                alt={`${c.full_name} profile`}
                className="mx-auto h-24 w-24 rounded-lg border object-cover"
              />
            ) : null}
            <div>
              {qr ? (
                <img
                  src={qr}
                  alt={`Public verification QR code for ${c.client_ref}`}
                  className="mx-auto h-24 w-24"
                />
              ) : (
                <div className="mx-auto h-24 w-24 rounded border border-dashed" />
              )}
              <p className="mt-1 text-[10px] text-muted-foreground">
                Public document verification
              </p>
            </div>
            
            <svg
              ref={barcodeRef}
              className="mx-auto max-w-full"
              aria-label={`Barcode for ${c.client_ref}`}
            />
          </div>
        </section>

        <footer className="border-t pt-6 text-xs leading-relaxed text-muted-foreground">
          This acknowledgement confirms that the above party has been officially registered in the
          records of Kalexi Brokerage Ltd. It is not a contract, offer, valuation or guarantee of
          any transaction. The acknowledgement verification QR is for public authenticity checks;
          the separate staff profile QR requires an authenticated Kalexi account.
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
