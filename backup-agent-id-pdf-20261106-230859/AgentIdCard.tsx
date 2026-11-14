import { useEffect, useRef, useState } from "react";
import JsBarcode from "jsbarcode";
import QRCode from "qrcode";
import { useQuery } from "@tanstack/react-query";
import { DEFAULT_AGENT_ID_THEME } from "@/lib/agent-id-theme";
import { getAgentIdTheme } from "@/lib/agents.functions";
import { useSession } from "@/hooks/useSession";
import { KalexiMark } from "@/components/KalexiMark";

export interface CardAgent {
  full_name: string;
  agent_code: string;
  district: string | null;
  village?: string | null;
  phone: string;
  referral_code: string;
  verification_token: string;
  issued_at: string;
  expires_at: string;
  status: string;
  designation?: string;
  company_phone?: string | null;
}

const fmt = (date: string) =>
  new Date(date).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });

export function AgentIdCard({
  agent: a,
  photoUrl,
  signatureUrl,
}: {
  agent: CardAgent;
  photoUrl?: string | null;
  signatureUrl?: string | null;
}) {
  const [qr, setQr] = useState("");
  const [qrError, setQrError] = useState(false);
  const barcodeRef = useRef<SVGSVGElement>(null);
  const session = useSession();
  const themeQuery = useQuery({
    queryKey: ["agent-id-theme", session.data?.userId],
    enabled: !!session.data?.userId,
    queryFn: () => getAgentIdTheme(),
  });
  const theme = themeQuery.data?.theme ?? DEFAULT_AGENT_ID_THEME;
  const authorizedSignatureUrl = themeQuery.data?.authorizedSignatureUrl ?? signatureUrl;

  useEffect(() => {
    let cancelled = false;
    setQr("");
    setQrError(false);
    void QRCode.toDataURL(
      `${window.location.origin}/agent/verify/${encodeURIComponent(a.verification_token)}`,
      { errorCorrectionLevel: "H", margin: 1, width: 260 },
    )
      .then((url) => {
        if (!cancelled) setQr(url);
      })
      .catch((error: unknown) => {
        console.error("[Agent ID] Could not generate verification QR code.", error);
        if (!cancelled) setQrError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [a.verification_token]);

  useEffect(() => {
    if (!barcodeRef.current) return;
    try {
      JsBarcode(barcodeRef.current, a.agent_code, {
        format: "CODE128",
        displayValue: true,
        font: "monospace",
        fontSize: 10,
        height: 28,
        margin: 0,
        width: 1.4,
      });
    } catch (error) {
      console.error("[Agent ID] Could not generate agent ID barcode.", error);
    }
  }, [a.agent_code]);

  return (
    <div
      className="agent-id-set flex flex-wrap gap-6"
      style={{ gridTemplateColumns: `repeat(2, ${theme.widthMm}mm)` }}
    >
      <style>{`
/* KALEXI_AGENT_ID_TWO_PAGE_PRINT */

@media print {
  @page {
    size: A4 portrait;
    margin: 12mm;
  }

  html, body {
    margin: 0 !important;
    padding: 0 !important;
  }

  .agent-id-set {
    display: block !important;
    position: static !important;
    width: 100% !important;
    height: auto !important;
    overflow: visible !important;
    gap: 0 !important;
  }

  .agent-id-set > .agent-id {
    display: flex !important;
    position: relative !important;
    float: none !important;
    clear: both !important;
    margin: 0 auto !important;
    box-shadow: none !important;
    break-inside: avoid !important;
    page-break-inside: avoid !important;
    print-color-adjust: exact !important;
    -webkit-print-color-adjust: exact !important;
  }

  .agent-id-set > .agent-id-front {
    break-after: page !important;
    page-break-after: always !important;
  }

  .agent-id-set > .agent-id-back {
    break-before: page !important;
    page-break-before: always !important;
  }

  .no-print {
    display: none !important;
  }
}
`}</style>
<article
        className="agent-id agent-id-front border shadow-[var(--shadow-panel)]"
        style={{
          backgroundColor: theme.background,
          color: theme.text,
          width: `min(100%, ${theme.widthMm}mm)`,
          height: `${theme.heightMm}mm`,
          aspectRatio: "auto",
          borderRadius: `${theme.radiusMm}mm`,
          fontFamily: theme.fontFamily,
        }}
      >
        <header
          className="flex items-center gap-2.5 px-3 py-2"
          style={{ backgroundColor: theme.accent, color: theme.accentText }}
        >
          <KalexiMark className="h-8 w-8 shrink-0" />
          <div className="min-w-0">
            <p className="truncate font-display text-[11px] font-semibold">Kalexi Brokerage Ltd</p>
            <p className="truncate text-[8px] font-semibold uppercase tracking-wide opacity-85">
              Digital Agent Program (DAP)
            </p>
          </div>
          <span className="ml-auto shrink-0 rounded-full border border-current/30 px-2 py-1 text-[7px] font-bold uppercase">
            {a.status}
          </span>
        </header>

        <div className="flex min-h-0 flex-1 gap-3 px-3 py-2.5">
          <div className="w-[64px] shrink-0">
            {photoUrl ? (
              <img
                src={photoUrl}
                alt={a.full_name}
                className="h-[79px] w-[64px] rounded object-cover"
              />
            ) : (
              <div
                className="flex h-[79px] w-[64px] items-center justify-center rounded text-2xl font-semibold"
                style={{ backgroundColor: theme.accent, color: theme.accentText }}
              >
                {a.full_name.slice(0, 1).toUpperCase()}
              </div>
            )}
            {authorizedSignatureUrl ? (
              <img
                src={authorizedSignatureUrl}
                alt="Authorised signature"
                className="mt-1 h-5 w-full object-contain"
              />
            ) : (
              <div className="mt-1 h-5 border-b" style={{ borderColor: theme.accent }} />
            )}
            <p className="mt-0.5 text-center text-[6px] opacity-75">Authorised signature</p>
          </div>

          <div className="min-w-0 flex-1">
            <p className="truncate font-display text-[13px] font-bold leading-tight">
              {a.full_name}
            </p>
            <p className="mt-0.5 truncate text-[8px] font-semibold" style={{ color: theme.accent }}>
              {a.designation ?? "Digital Agent"}
            </p>
            <dl className="mt-2 grid grid-cols-2 gap-x-2 gap-y-1.5 text-[8px] leading-tight">
              {[
                ["Agent ID", a.agent_code],
                ["Region", a.district ?? "â€”"],
                ["Issued", fmt(a.issued_at)],
                ["Expires", fmt(a.expires_at)],
              ].map(([label, value]) => (
                <div key={label} className="min-w-0">
                  <dt className="text-[6px] uppercase opacity-70">{label}</dt>
                  <dd className="truncate font-semibold">{value}</dd>
                </div>
              ))}
              {theme.customFields.slice(0, 2).map((field) => (
                <div key={field.label} className="min-w-0">
                  <dt className="truncate text-[6px] uppercase opacity-70">{field.label}</dt>
                  <dd className="truncate font-semibold">{field.value}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>

        <footer
          className="flex items-center justify-between border-t px-3 py-1.5 text-[7px] font-semibold uppercase tracking-wide"
          style={{ borderColor: `${theme.accent}66`, color: theme.accent }}
        >
          <span>Official agent identification</span>
          <span>Property of Kalexi</span>
        </footer>
      </article>

      <article
        className="agent-id agent-id-back border shadow-[var(--shadow-panel)]"
        style={{
          backgroundColor: theme.background,
          color: theme.text,
          width: `min(100%, ${theme.widthMm}mm)`,
          height: `${theme.heightMm}mm`,
          aspectRatio: "auto",
          borderRadius: `${theme.radiusMm}mm`,
          fontFamily: theme.fontFamily,
        }}
      >
        <header
          className="px-3 py-2 text-[9px] font-bold uppercase tracking-wide"
          style={{ backgroundColor: theme.accent, color: theme.accentText }}
        >
          Agent verification &amp; authorisation
        </header>
        <div className="flex min-h-0 flex-1 gap-2.5 px-3 py-2">
          <div className="w-[74px] shrink-0 text-center">
            {qr ? (
              <img src={qr} alt="Scan to verify agent status" className="h-[72px] w-[72px]" />
            ) : (
              <div
                aria-label={qrError ? "QR code unavailable" : "Generating QR code"}
                className="flex h-[72px] w-[72px] items-center justify-center text-[7px]"
                style={{ backgroundColor: `${theme.accent}18` }}
              >
                {qrError ? "QR unavailable" : "Generatingâ€¦"}
              </div>
            )}
            <p className="mt-0.5 text-[7px]">Scan to verify</p>
          </div>
          <div className="min-w-0 flex-1 text-[6px] leading-tight">
            <p className="font-semibold">Referral: {a.referral_code}</p>
            {theme.customFields.slice(2).map((field) => (
              <p key={field.label} className="mt-0.5 break-words">
                <span className="font-semibold">{field.label}:</span> {field.value}
              </p>
            ))}
            <p className="mt-0.5 break-words">info@kalexibrokerage.com</p>
            <p>www.kalexibrokerage.com</p>
            <p>{a.company_phone || "Contact: official company email"}</p>
            <p
              className="mt-1.5 border-t pt-1.5 font-semibold"
              style={{ borderColor: `${theme.accent}66` }}
            >
              {theme.authorizationMessage}
            </p>
            <p className="mt-0.5">
              The holder may not collect money, sign contracts or make commitments. Pay only to
              official company accounts.
            </p>
            <p className="mt-0.5">{theme.ifFoundMessage}</p>
            {theme.showCorporateSeal ? (
              <div className="mt-1 flex justify-end">
                <div
                  aria-label={`Corporate seal: ${theme.corporateSealText}`}
                  className="grid h-8 w-8 place-content-center rounded-full border-2 text-center text-[5px] font-bold uppercase"
                  style={{ borderColor: theme.accent, color: theme.accent }}
                >
                  <span>Seal</span>
                  <span className="line-clamp-2 max-w-6 break-words">{theme.corporateSealText}</span>
                </div>
              </div>
            ) : null}
          </div>
        </div>
        <div
          className="flex items-center justify-between border-t px-3 py-1"
          style={{ borderColor: `${theme.accent}66` }}
        >
          <svg
            ref={barcodeRef}
            role="img"
            aria-label={`Code 128 barcode for agent ${a.agent_code}`}
            className="h-[30px] max-w-[145px]"
          />
          <p className="max-w-[110px] text-right text-[6px] opacity-75">
            Company property Â· Valid only while active and before expiry.
          </p>
        </div>
      </article>

      {themeQuery.isError ? (
        <p className="no-print basis-full text-xs text-destructive">
          Could not load the shared ID theme. Showing the default colors.
        </p>
      ) : null}
      <p className="no-print basis-full text-xs text-muted-foreground">
        ID-1 card size: 85.60 Ã— 53.98 mm. Print at 100% / actual size for physical dimensions.
      </p>
    </div>
  );
}

