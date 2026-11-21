import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
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
      { title: "Registration Acknowledgement â€” Kalexi Brokerage" },
      {
        name: "description",
        content: "Printable, publicly verifiable client registration acknowledgement.",
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
      width: 280,
      errorCorrectionLevel: "H",
      color: { dark: "#102B50", light: "#ffffff" },
    })
      .then(setQr)
      .catch((error: unknown) => {
        console.error("[clients] Could not create the public verification QR code.", error);
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
        fontSize: 11,
        textMargin: 5,
        height: 42,
        margin: 0,
        width: 1.6,
        lineColor: "#102B50",
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
          <p className="text-sm text-muted-foreground">Loading documentâ€¦</p>
        )}
      </AppShell>
    );
  }

  const c = client.data;
  const registeredAt = new Date(c.created_at);
  const dateText = Number.isNaN(registeredAt.getTime())
    ? "Not available"
    : registeredAt.toLocaleDateString("en-UG", {
        day: "2-digit",
        month: "long",
        year: "numeric",
      });
  const timeText = Number.isNaN(registeredAt.getTime())
    ? ""
    : registeredAt.toLocaleTimeString("en-UG", { hour: "2-digit", minute: "2-digit" });

  return (
    <AppShell>
      <style>{`
        @page { size: A4 portrait; margin: 12mm; }
        @media print {
          html, body { background: #fff !important; }
          body { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
          .ack-print-root { width: 100% !important; max-width: none !important; margin: 0 !important; padding: 0 !important; }
          .ack-paper { box-shadow: none !important; border: 1px solid #d7dee8 !important; border-radius: 0 !important; }
          .ack-no-break { break-inside: avoid; page-break-inside: avoid; }
        }
      `}</style>

      <div className="print:hidden">
        <PageHeader
          title="Registration acknowledgement"
          description="Review the document, then print or save it as a PDF for the client."
          actions={
            <div className="flex flex-wrap gap-2">
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

      <main className="ack-print-root mx-auto w-full max-w-[820px] px-2 pb-8 sm:px-0">
        <article className="ack-paper relative overflow-hidden rounded-xl border border-slate-200 bg-white text-slate-800 shadow-xl">
          <div className="h-2 bg-[#102B50]" />
          <div className="h-[3px] bg-[#C5A15B]" />

          <div className="p-6 sm:p-10">
            <header className="flex flex-col justify-between gap-5 border-b border-slate-200 pb-6 sm:flex-row sm:items-start">
              <div className="flex items-center gap-3">
                <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 p-1">
                  <KalexiMark className="h-11 w-11" />
                </div>
                <div>
                  <p className="text-lg font-extrabold tracking-[0.12em] text-[#102B50]">
                    KALEXI BROKERAGE LTD
                  </p>
                  <p className="mt-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-[#9A783D]">
                    Brokerage Â· Facilitation Â· Advisory
                  </p>
                  <p className="mt-2 text-xs text-slate-500">Making the transaction secure is our mission.</p>
                </div>
              </div>
              <div className="sm:text-right">
                <span className="inline-flex rounded-full border border-[#D8C49A] bg-[#FBF8F0] px-3 py-1 text-[9px] font-bold uppercase tracking-[0.18em] text-[#87672F]">
                  Official client record
                </span>
                <h1 className="mt-3 text-xl font-bold leading-tight text-[#102B50]">
                  REGISTRATION
                  <br />
                  ACKNOWLEDGEMENT
                </h1>
                <p className="mt-2 font-mono text-xs font-semibold tracking-wide text-slate-600">
                  {c.client_ref}
                </p>
              </div>
            </header>

            <section className="mt-6 grid gap-4 rounded-lg border border-slate-200 bg-slate-50 p-4 sm:grid-cols-3">
              <Meta label="Registration date" value={dateText} />
              <Meta label="Time recorded" value={timeText || "Not available"} />
              <Meta label="Record reference" value={c.client_ref} mono />
            </section>

            <section className="mt-8">
              <SectionTitle number="01" title="Client information" />
              <div className="mt-4 grid gap-5 sm:grid-cols-[1fr_112px]">
                <div className="grid gap-x-8 gap-y-4 sm:grid-cols-2">
                  <Detail label="Full name" value={c.full_name} />
                  <Detail label="Phone number" value={c.phone} />
                  <Detail label="Company / organisation" value={c.company_name || "Not provided"} />
                  <Detail label="Client classification" value={c.client_type || "Not provided"} />
                  <Detail label="Sector" value={c.sector || "Not provided"} />
                </div>
                {c.photo_url ? (
                  <img
                    src={c.photo_url}
                    alt={`Client profile for ${c.full_name}`}
                    className="mx-auto h-28 w-28 rounded-lg border border-slate-200 object-cover"
                  />
                ) : (
                  <div className="mx-auto flex h-28 w-28 items-center justify-center rounded-lg border border-dashed border-slate-300 bg-slate-50 text-center text-[10px] text-slate-400">
                    Client photo
                    <br />
                    not supplied
                  </div>
                )}
              </div>
            </section>

            <section className="mt-8 ack-no-break">
              <SectionTitle number="02" title="Stated requirement" />
              <div className="mt-4 min-h-20 rounded-lg border border-slate-200 bg-white p-4">
                <p className="whitespace-pre-wrap text-sm leading-7 text-slate-700">
                  {c.requirement?.trim() || "No requirement was recorded at the time of registration."}
                </p>
              </div>
            </section>

            <section className="mt-8 ack-no-break">
              <SectionTitle number="03" title="Public document verification" />
              <div className="mt-4 grid gap-5 rounded-xl border border-[#D8C49A] bg-[#FBF9F4] p-5 sm:grid-cols-[1fr_150px] sm:items-center">
                <div>
                  <p className="text-sm font-bold text-[#102B50]">Verify this acknowledgement</p>
                  <p className="mt-2 text-xs leading-6 text-slate-600">
                    Scan the QR code using a phone camera to open Kalexi Brokerageâ€™s public document verification page. The QR code does not link to an employee profile or the internal Kalexi system.
                  </p>
                  <p className="mt-3 break-all font-mono text-[10px] text-slate-500">
                    Verification reference: {c.verification_ref || "Not available"}
                  </p>
                  {!verificationRef ? (
                    <p className="mt-2 text-xs font-semibold text-red-700">
                      A public verification reference has not been generated for this record.
                    </p>
                  ) : null}
                </div>
                <div className="mx-auto flex h-[142px] w-[142px] items-center justify-center rounded-lg border border-slate-200 bg-white p-2">
                  {qr ? (
                    <img src={qr} alt={`Public verification QR code for ${c.client_ref}`} className="h-full w-full" />
                  ) : (
                    <span className="text-center text-[10px] text-slate-400">QR unavailable</span>
                  )}
                </div>
              </div>
            </section>

            <section className="mt-7 flex flex-col items-center border-y border-slate-200 py-4">
              <p className="mb-2 text-[9px] font-bold uppercase tracking-[0.2em] text-slate-500">
                Client record barcode
              </p>
              <svg ref={barcodeRef} className="max-w-full" aria-label={`Barcode for ${c.client_ref}`} />
            </section>

            <section className="mt-7 grid gap-8 sm:grid-cols-2 ack-no-break">
              <div>
                <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-slate-500">For Kalexi Brokerage Ltd</p>
                <div className="mt-10 border-b border-slate-400" />
                <p className="mt-2 text-xs font-semibold text-slate-700">Authorised officer</p>
              </div>
              <div>
                <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-slate-500">Client acknowledgement</p>
                <div className="mt-10 border-b border-slate-400" />
                <p className="mt-2 text-xs font-semibold text-slate-700">Client signature</p>
              </div>
            </section>

            <footer className="mt-8 border-t-2 border-[#102B50] pt-4">
              <p className="text-[10px] leading-5 text-slate-600">
                This document confirms that the above party has been recorded in the client registration records of Kalexi Brokerage Ltd. Registration does not constitute a contract, offer, valuation, proof of funds, transaction approval or guarantee of a transaction. All transactions remain subject to applicable verification, due diligence, compliance checks and written agreements.
              </p>
              <div className="mt-4 flex flex-col justify-between gap-1 text-[9px] font-medium text-slate-500 sm:flex-row">
                <span>info@kalexibrokerage.com Â· www.kalexibrokerage.com</span>
                <span>KALEXI BROKERAGE LTD Â· CLIENT DOCUMENT</span>
              </div>
            </footer>
          </div>
          <div className="h-1 bg-[#C5A15B]" />
        </article>
      </main>
    </AppShell>
  );
}

function SectionTitle({ number, title }: { number: string; title: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-[#102B50] text-[10px] font-bold text-white">
        {number}
      </span>
      <h2 className="text-sm font-bold uppercase tracking-[0.12em] text-[#102B50]">{title}</h2>
    </div>
  );
}

function Meta({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="min-w-0">
      <p className="text-[9px] font-bold uppercase tracking-[0.16em] text-slate-500">{label}</p>
      <p className={`mt-1 break-words text-xs font-semibold text-[#102B50] ${mono ? "font-mono" : ""}`}>
        {value}
      </p>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 border-b border-slate-100 pb-2">
      <p className="text-[9px] font-bold uppercase tracking-[0.14em] text-slate-500">{label}</p>
      <p className="mt-1 break-words text-sm font-semibold text-slate-800">{value}</p>
    </div>
  );
}
