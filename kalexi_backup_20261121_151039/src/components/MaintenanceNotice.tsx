import { Clock3, RefreshCw, Wrench } from "lucide-react";
import { CompanyBrand } from "@/components/CompanyBrand";

const DEFAULT_MESSAGE =
  "We are currently performing scheduled system maintenance to improve the reliability, security, and performance of our services.";

export function MaintenanceNotice({
  available,
  message,
  estimatedCompletionTime,
  onRetry,
  retryLabel = "Check availability",
}: {
  available: boolean;
  message?: string | null;
  estimatedCompletionTime?: string | null;
  onRetry?: () => void;
  retryLabel?: string;
}) {
  const estimate = estimatedCompletionTime ? new Date(estimatedCompletionTime) : null;
  const validEstimate = estimate && Number.isFinite(estimate.getTime());

  return (
    <main className="flex min-h-svh items-center justify-center bg-[#f6f8f7] px-4 py-8 text-[#172625]">
      <section className="w-full max-w-2xl rounded-2xl border border-[#e1e8e5] bg-white px-6 py-10 text-center shadow-[0_18px_60px_#173b3b12] sm:px-12 sm:py-14">
        <div className="mb-8 flex flex-col items-center gap-2">
          <CompanyBrand />
          <p className="text-[10px] uppercase tracking-[0.16em] text-[#71807c]">System status</p>
        </div>

        <div className="mx-auto mb-5 grid h-[74px] w-[74px] place-items-center rounded-[22px] bg-[#e6f1ef] text-[#145453]">
          <Wrench aria-hidden="true" className="h-9 w-9" strokeWidth={1.7} />
        </div>

        <h1 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">
          {available ? "System Under Maintenance" : "System Temporarily Unavailable"}
        </h1>
        <p
          className={`mx-auto mt-5 inline-flex items-center gap-2 rounded-full border px-3 py-2 text-xs font-semibold ${
            available
              ? "border-[#cde6d8] bg-[#f0faf4] text-[#226747]"
              : "border-[#eadcbf] bg-[#fff9ec] text-[#775c20]"
          }`}
          role="status"
        >
          <span
            aria-hidden="true"
            className={`h-2 w-2 rounded-full ${available ? "animate-pulse bg-[#3a9b68]" : "bg-[#c29130]"}`}
          />
          {available ? "Maintenance in progress" : "Availability check unavailable"}
        </p>

        <p className="mx-auto mt-4 max-w-xl text-sm leading-7 text-[#52615d] sm:text-base">
          {available
            ? DEFAULT_MESSAGE
            : "We are unable to verify system availability right now. Please try again shortly."}
        </p>
        {available && message?.trim() ? (
          <p className="mx-auto mt-3 max-w-xl whitespace-pre-wrap text-sm leading-6 text-[#52615d]">
            {message.trim()}
          </p>
        ) : null}
        <p className="mx-auto mt-3 max-w-lg text-sm leading-6 text-[#71807c]">
          Your access will be restored once maintenance is complete. Thank you for your patience.
        </p>

        {available && validEstimate ? (
          <p className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-[#173b3b]">
            <Clock3 aria-hidden="true" className="h-4 w-4" />
            Estimated return:{" "}
            <time dateTime={estimate.toISOString()}>
              {estimate.toLocaleString("en-GB", {
                dateStyle: "medium",
                timeStyle: "short",
              })}
            </time>
          </p>
        ) : null}

        {onRetry ? (
          <button
            type="button"
            onClick={onRetry}
            className="mx-auto mt-7 inline-flex min-h-11 items-center gap-2 rounded-lg bg-[#173b3b] px-5 text-sm font-semibold text-white transition-colors hover:bg-[#20514f] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#145453]"
          >
            <RefreshCw aria-hidden="true" className="h-4 w-4" />
            {retryLabel}
          </button>
        ) : null}

        <div className="mt-8 border-t border-[#edf0ef] pt-5 text-xs leading-6 text-[#71807c]">
          Need assistance? Contact Kalexi Brokerage Ltd
          <br />
          <a className="text-[#145453] hover:underline" href="mailto:info@kalexibrokerage.com">
            info@kalexibrokerage.com
          </a>{" "}
          ·{" "}
          <a className="text-[#145453] hover:underline" href="https://www.kalexibrokerage.com">
            www.kalexibrokerage.com
          </a>
        </div>
      </section>
    </main>
  );
}
