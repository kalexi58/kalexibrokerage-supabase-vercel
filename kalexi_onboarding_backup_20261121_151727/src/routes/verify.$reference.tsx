import { createFileRoute, useParams } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { verifyDocument } from "@/lib/auth.functions";
import { KalexiMark } from "@/components/KalexiMark";

export const Route = createFileRoute("/verify/$reference")({
  head: () => ({
    meta: [
      { title: "Document Verification — Kalexi Brokerage" },
      {
        name: "description",
        content: "Verify the authenticity of a document issued by Kalexi Brokerage Ltd.",
      },
      { property: "og:title", content: "Document Verification — Kalexi Brokerage" },
      {
        property: "og:description",
        content: "Verify the authenticity of a document issued by Kalexi Brokerage Ltd.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: VerifyPage,
});

function VerifyPage() {
  const { reference } = useParams({ from: "/verify/$reference" });

  const result = useQuery({
    queryKey: ["verify", reference],
    queryFn: () => verifyDocument({ data: { reference } }),
  });

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-16">
      <div className="w-full max-w-md rounded-lg border bg-card p-8 shadow-[var(--shadow-panel)]">
        <div className="flex items-center gap-3 border-b pb-5">
          <KalexiMark className="h-10 w-10" />
          <div>
            <p className="font-display text-base font-semibold tracking-tight">KALEXI BROKERAGE LTD</p>
            <p className="text-xs text-muted-foreground">Document verification</p>
          </div>
        </div>

        <div className="pt-6">
          {result.isLoading ? (
            <p className="text-sm text-muted-foreground">Verifying…</p>
          ) : result.data?.valid ? (
            <>
              <p className="inline-flex rounded-full bg-success/15 px-3 py-1 text-xs font-medium text-success">
                Authentic document
              </p>
              <dl className="mt-5 space-y-3 text-sm">
                <Row k="Document" v={result.data.documentType} />
                <Row k="Reference" v={result.data.reference} />
                <Row k="Status" v={result.data.status} />
                <Row k="Issued" v={new Date(result.data.issuedAt).toLocaleDateString()} />
                <Row k="Registered by" v={result.data.officer.fullName} />
                <Row k="Officer designation" v={result.data.officer.jobTitle} />
                <Row k="Department" v={result.data.officer.department} />
              </dl>
              <p className="mt-6 text-xs text-muted-foreground">
                This confirms the document was issued by Kalexi Brokerage Ltd. No client details are
                disclosed on this page.
              </p>
            </>
          ) : (
            <>
              <p className="inline-flex rounded-full bg-destructive/15 px-3 py-1 text-xs font-medium text-destructive">
                Not recognised
              </p>
              <p className="mt-4 text-sm text-muted-foreground">
                No document matching this reference was issued by Kalexi Brokerage Ltd. Treat it as
                unverified.
              </p>
            </>
          )}
        </div>
      </div>
    </main>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex gap-4">
      <dt className="w-24 shrink-0 text-muted-foreground">{k}</dt>
      <dd className="font-medium">{v}</dd>
    </div>
  );
}
