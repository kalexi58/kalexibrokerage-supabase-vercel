import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { titleCase } from "@/lib/records";

const TONE: Record<string, string> = {
  active: "bg-emerald-500/10 text-emerald-600 border-emerald-500/30",
  open: "bg-emerald-500/10 text-emerald-600 border-emerald-500/30",
  approved: "bg-emerald-500/10 text-emerald-600 border-emerald-500/30",
  verified: "bg-emerald-500/10 text-emerald-600 border-emerald-500/30",
  cleared: "bg-emerald-500/10 text-emerald-600 border-emerald-500/30",
  completed: "bg-emerald-500/10 text-emerald-600 border-emerald-500/30",
  closed: "bg-primary/10 text-primary border-primary/30",
  pending: "bg-amber-500/10 text-amber-600 border-amber-500/30",
  in_review: "bg-amber-500/10 text-amber-600 border-amber-500/30",
  in_progress: "bg-amber-500/10 text-amber-600 border-amber-500/30",
  escalated: "bg-orange-500/10 text-orange-600 border-orange-500/30",
  high: "bg-orange-500/10 text-orange-600 border-orange-500/30",
  critical: "bg-destructive/10 text-destructive border-destructive/30",
  rejected: "bg-destructive/10 text-destructive border-destructive/30",
  failed: "bg-destructive/10 text-destructive border-destructive/30",
  flagged: "bg-destructive/10 text-destructive border-destructive/30",
  archived: "bg-muted text-muted-foreground border-border",
};

export function StatusPill({ value, className }: { value?: string | null; className?: string }) {
  if (!value) return <span className="text-muted-foreground">—</span>;
  const tone = TONE[value] ?? "bg-secondary text-secondary-foreground border-border";
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium",
        tone,
        className,
      )}
    >
      {titleCase(value)}
    </span>
  );
}

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="rounded-lg border border-dashed p-10 text-center">
      <p className="text-sm font-medium text-foreground">{title}</p>
      {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

export function NoAccess({ module }: { module: string }) {
  return (
    <div className="rounded-lg border border-dashed p-10 text-center">
      <p className="text-sm font-medium">Access restricted</p>
      <p className="mt-1 text-xs text-muted-foreground">
        Your role does not include access to {module}. Contact the Super Admin if this is required
        for your duties.
      </p>
    </div>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <p className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">{label}</p>
      <div className="mt-0.5 text-sm text-foreground">{children ?? "—"}</div>
    </div>
  );
}

export function Panel({
  title,
  actions,
  children,
}: {
  title?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="rounded-lg border bg-card">
      {title || actions ? (
        <header className="flex items-center justify-between gap-3 border-b px-4 py-3">
          {title ? <h2 className="text-sm font-semibold">{title}</h2> : <span />}
          {actions}
        </header>
      ) : null}
      <div className="p-4">{children}</div>
    </section>
  );
}
