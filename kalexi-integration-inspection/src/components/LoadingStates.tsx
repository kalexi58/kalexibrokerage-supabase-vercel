import type { ReactNode } from "react";
import { AlertCircle, RefreshCw } from "lucide-react";
import { CompanyBrand } from "@/components/CompanyBrand";

export function BrandedLoadingScreen({
  message = "Preparing your workspace…",
}: {
  message?: string;
}) {
  return (
    <main
      className="flex min-h-svh items-center justify-center bg-[#f5f8fc] px-4 py-10 text-[#152641]"
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <section className="w-full max-w-md rounded-2xl border border-[#e2e9f1] bg-white p-8 text-center shadow-[0_20px_60px_#173b3b12] sm:p-10">
        <CompanyBrand className="mb-4 justify-center" markClassName="h-14 w-14" />
        <p className="text-xs font-medium tracking-[0.12em] text-[#65758b]">You Grow, We Grow.</p>
        <div
          className="mx-auto mt-8 h-1.5 max-w-xs overflow-hidden rounded-full bg-[#e8edf4]"
          role="progressbar"
          aria-label={message}
          aria-valuetext="In progress"
        >
          <span className="loading-progress-indicator block h-full w-1/3 rounded-full bg-[#244e80]" />
        </div>
        <p className="mt-4 text-sm font-semibold">{message}</p>
        <p className="mt-1 text-xs text-[#718097]">This may take a few moments.</p>
      </section>
    </main>
  );
}

export function PageLoadingState({ message = "Loading this page…" }: { message?: string }) {
  return (
    <div
      className="flex min-h-48 items-center gap-4 rounded-xl border bg-card p-5"
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <span className="h-8 w-8 shrink-0 animate-pulse rounded-md bg-muted" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{message}</p>
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted">
          <span className="loading-progress-indicator block h-full w-1/3 rounded-full bg-primary" />
        </div>
      </div>
    </div>
  );
}

export function SectionSkeleton({ lines = 3 }: { lines?: number }) {
  return (
    <div className="animate-pulse space-y-3 rounded-xl border bg-card p-5" aria-hidden="true">
      {Array.from({ length: lines }, (_, index) => (
        <div
          key={index}
          className={`h-4 rounded bg-muted ${index === lines - 1 ? "w-2/3" : "w-full"}`}
        />
      ))}
    </div>
  );
}

export function DataTableSkeleton({ rows = 5, columns = 4 }: { rows?: number; columns?: number }) {
  return (
    <div className="space-y-3 p-4" role="status" aria-label="Loading records" aria-busy="true">
      <span className="sr-only">Loading records…</span>
      {Array.from({ length: rows }, (_, row) => (
        <div
          key={row}
          className="grid gap-3"
          style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
        >
          {Array.from({ length: columns }, (_, column) => (
            <span key={column} className="h-5 animate-pulse rounded bg-muted" />
          ))}
        </div>
      ))}
    </div>
  );
}

export function OperationProgress({
  message,
  progress,
  className = "",
}: {
  message: string;
  progress?: number;
  className?: string;
}) {
  const measuredProgress =
    progress !== undefined && Number.isFinite(progress)
      ? Math.min(100, Math.max(0, progress))
      : undefined;

  return (
    <div
      className={`rounded-md border bg-muted/30 px-3 py-2.5 ${className}`}
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <div className="flex items-center justify-between gap-3 text-sm">
        <span>{message}</span>
        {measuredProgress !== undefined ? (
          <span className="tabular-nums text-muted-foreground">
            {Math.round(measuredProgress)}%
          </span>
        ) : null}
      </div>
      <div
        className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-label={message}
        {...(measuredProgress !== undefined
          ? { "aria-valuemin": 0, "aria-valuemax": 100, "aria-valuenow": measuredProgress }
          : { "aria-valuetext": "In progress" })}
      >
        {measuredProgress === undefined ? (
          <span className="loading-progress-indicator block h-full w-1/3 rounded-full bg-primary" />
        ) : (
          <span
            className="block h-full rounded-full bg-primary transition-[width] duration-200"
            style={{ width: `${measuredProgress}%` }}
          />
        )}
      </div>
    </div>
  );
}

export function FormSubmissionState({ message }: { message: string }) {
  return <OperationProgress message={message} />;
}

export function ErrorState({
  title = "Unable to load this information",
  description = "Check your connection and try again.",
  onRetry,
}: {
  title?: string;
  description?: string;
  onRetry?: () => void;
}) {
  return (
    <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4" role="alert">
      <div className="flex items-start gap-3">
        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" aria-hidden="true" />
        <div>
          <p className="text-sm font-medium">{title}</p>
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
          {onRetry ? (
            <button
              type="button"
              className="mt-3 inline-flex items-center gap-2 text-sm font-medium text-primary underline-offset-4 hover:underline"
              onClick={onRetry}
            >
              <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
              Retry
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export function DataEmptyState({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children?: ReactNode;
}) {
  return (
    <div className="px-6 py-12 text-center">
      <p className="text-sm font-medium">{title}</p>
      {description ? <p className="mt-1 text-sm text-muted-foreground">{description}</p> : null}
      {children ? <div className="mt-4">{children}</div> : null}
    </div>
  );
}
