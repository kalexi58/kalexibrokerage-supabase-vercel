import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { AppShell, PageHeader } from "@/components/AppShell";
import { useSession } from "@/hooks/useSession";
import { allows } from "@/lib/rbac";
import { EmptyState, NoAccess, StatusPill } from "@/components/records";
import { formatMoney, titleCase } from "@/lib/records";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Slider } from "@/components/ui/slider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/matches/")({
  head: () => ({
    meta: [
      { title: "Matches — Kalexi Brokerage" },
      { name: "description", content: "Review and action suggested matches between client requirements and opportunities." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: MatchesPage,
});

interface MatchRow {
  id: string;
  requirement_id: string;
  opportunity_id: string;
  score: number;
  reasons: string[];
  status: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  client_requirements: {
    requirement_ref: string;
    title: string;
    sector: string;
    budget_min: number | null;
    budget_max: number | null;
    currency: string | null;
  } | null;
  opportunities: {
    opportunity_ref: string;
    title: string;
    sector: string;
    price: number | null;
    owner_name: string | null;
  } | null;
}

function MatchesPage() {
  const { data: session } = useSession();
  const access = session?.access;
  const qc = useQueryClient();
  const [status, setStatus] = useState("all");
  const [minScore, setMinScore] = useState(0);

  const matches = useQuery({
    queryKey: ["opportunity-matches", status],
    enabled: allows(access, "requirements.view"),
    queryFn: async () => {
      let query = supabase
        .from("opportunity_matches")
        .select(
          "id, requirement_id, opportunity_id, score, reasons, status, reviewed_by, reviewed_at, client_requirements(requirement_ref, title, sector, budget_min, budget_max, currency), opportunities(opportunity_ref, title, sector, price, owner_name)",
        )
        .is("archived_at", null)
        .order("score", { ascending: false })
        .limit(300);
      if (status !== "all") query = query.eq("status", status);
      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as unknown as MatchRow[];
    },
  });

  const updateStatus = useMutation({
    mutationFn: async ({ id, next }: { id: string; next: string }) => {
      if (!session) throw new Error("No session");
      const { error } = await supabase
        .from("opportunity_matches")
        .update({
          status: next,
          reviewed_by: session.userId,
          reviewed_at: new Date().toISOString(),
        })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Match updated");
      qc.invalidateQueries({ queryKey: ["opportunity-matches"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!allows(access, "requirements.view")) {
    return (
      <AppShell>
        <PageHeader title="Matches" />
        <NoAccess module="Matches" />
      </AppShell>
    );
  }

  const rows = (matches.data ?? []).filter((m) => m.score >= minScore);

  return (
    <AppShell>
      <PageHeader
        title="Matches"
        description="Requirement-to-opportunity matches, ranked by score, ready to review and action."
      />

      <div className="mb-4 flex flex-wrap items-center gap-6">
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-48"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="suggested">Suggested</SelectItem>
            <SelectItem value="accepted">Accepted</SelectItem>
            <SelectItem value="rejected">Rejected</SelectItem>
          </SelectContent>
        </Select>
        <div className="flex min-w-[220px] items-center gap-3">
          <span className="text-xs text-muted-foreground">Min score {minScore}</span>
          <Slider
            className="w-40"
            value={[minScore]}
            max={100}
            step={5}
            onValueChange={(v) => setMinScore(v[0] ?? 0)}
          />
        </div>
      </div>

      {matches.isLoading ? (
        <p className="text-sm text-muted-foreground">Loading matches…</p>
      ) : rows.length === 0 ? (
        <EmptyState title="No matches found" hint="Adjust filters or generate matches from a requirement." />
      ) : (
        <div className="space-y-3">
          {rows.map((m) => (
            <Card key={m.id} className="p-4 shadow-[var(--shadow-panel)]">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="inline-flex items-center rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">
                      Score {m.score}
                    </span>
                    <StatusPill value={m.status} />
                  </div>
                  <div className="mt-2 grid gap-2 sm:grid-cols-2">
                    <div>
                      <p className="text-[11px] uppercase tracking-[0.1em] text-muted-foreground">Requirement</p>
                      {m.client_requirements ? (
                        <Link
                          to="/requirements/$requirementId"
                          params={{ requirementId: m.requirement_id }}
                          className="text-sm font-medium hover:underline"
                        >
                          {m.client_requirements.requirement_ref} — {m.client_requirements.title}
                        </Link>
                      ) : (
                        <p className="text-sm">—</p>
                      )}
                      {m.client_requirements ? (
                        <p className="text-xs text-muted-foreground">
                          {m.client_requirements.sector} ·{" "}
                          {formatMoney(m.client_requirements.budget_min, m.client_requirements.currency ?? "UGX")}–
                          {formatMoney(m.client_requirements.budget_max, m.client_requirements.currency ?? "UGX")}
                        </p>
                      ) : null}
                    </div>
                    <div>
                      <p className="text-[11px] uppercase tracking-[0.1em] text-muted-foreground">Opportunity</p>
                      {m.opportunities ? (
                        <Link
                          to="/opportunities/$opportunityId"
                          params={{ opportunityId: m.opportunity_id }}
                          className="text-sm font-medium hover:underline"
                        >
                          {m.opportunities.opportunity_ref} — {m.opportunities.title}
                        </Link>
                      ) : (
                        <p className="text-sm">—</p>
                      )}
                      {m.opportunities ? (
                        <p className="text-xs text-muted-foreground">
                          {m.opportunities.sector} · {formatMoney(m.opportunities.price)} ·{" "}
                          {m.opportunities.owner_name ?? "—"}
                        </p>
                      ) : null}
                    </div>
                  </div>
                  {m.reasons?.length ? (
                    <ul className="mt-2 list-inside list-disc text-xs text-muted-foreground">
                      {m.reasons.map((r, i) => (
                        <li key={i}>{r}</li>
                      ))}
                    </ul>
                  ) : null}
                </div>

                <div className="flex shrink-0 flex-col items-end gap-2">
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={m.status === "accepted"}
                      onClick={() => updateStatus.mutate({ id: m.id, next: "accepted" })}
                    >
                      Accept
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={m.status === "rejected"}
                      onClick={() => updateStatus.mutate({ id: m.id, next: "rejected" })}
                    >
                      Reject
                    </Button>
                  </div>
                  <Button asChild size="sm" variant="ghost">
                    <Link to="/deals/new">Open deal</Link>
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </AppShell>
  );
}
