import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell, PageHeader } from "@/components/AppShell";
import { useSession } from "@/hooks/useSession";
import { allows } from "@/lib/rbac";
import { EmptyState, NoAccess, StatusPill } from "@/components/records";
import {
  DEAL_STAGES,
  DEAL_STAGE_LABEL,
  SECTORS,
  formatDate,
  formatMoney,
  type DealStage,
} from "@/lib/records";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/deals/")({
  head: () => ({
    meta: [
      { title: "Deal Pipeline — Kalexi Brokerage" },
      {
        name: "description",
        content: "Track every brokered deal from sourcing through to closure and archive.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: DealsPage,
});

interface DealRow {
  id: string;
  deal_ref: string;
  title: string;
  sector: string;
  stage: string;
  status: string;
  value: number | null;
  currency: string;
  expected_close: string | null;
  clients: { full_name: string } | null;
}

const BOARD_STAGES = DEAL_STAGES.filter((s) => s !== "archived");

function DealsPage() {
  const { data: session } = useSession();
  const access = session?.access;
  const [term, setTerm] = useState("");
  const [sector, setSector] = useState("all");
  const [view, setView] = useState<"board" | "list">("board");

  const deals = useQuery({
    queryKey: ["deals", term, sector],
    enabled: allows(access, "deals.view"),
    queryFn: async () => {
      let query = supabase
        .from("deals")
        .select(
          "id, deal_ref, title, sector, stage, status, value, currency, expected_close, clients(full_name)",
        )
        .is("archived_at", null)
        .order("created_at", { ascending: false })
        .limit(300);
      if (sector !== "all") query = query.eq("sector", sector);
      const q = term.trim();
      if (q) query = query.or(`deal_ref.ilike.%${q}%,title.ilike.%${q}%`);
      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as unknown as DealRow[];
    },
  });

  if (!allows(access, "deals.view")) {
    return (
      <AppShell>
        <PageHeader title="Deal pipeline" />
        <NoAccess module="Deals" />
      </AppShell>
    );
  }

  const rows = deals.data ?? [];
  const totalValue = rows.reduce((sum, d) => sum + Number(d.value ?? 0), 0);

  return (
    <AppShell>
      <PageHeader
        title="Deal pipeline"
        description="SOURCE → REGISTER → VERIFY → KYC → RISK → MATCH → DEAL → DUE DILIGENCE → DOCUMENT → NEGOTIATE → FACILITATE → TRANSACT → CLOSE."
        actions={
          allows(access, "deals.create") ? (
            <Button asChild>
              <Link to="/deals/new">New deal</Link>
            </Button>
          ) : null
        }
      />

      <div className="mb-5 grid gap-3 sm:grid-cols-3">
        <div className="rounded-lg border bg-card p-4">
          <p className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">Open deals</p>
          <p className="mt-1 text-2xl font-semibold">{rows.length}</p>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <p className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
            Pipeline value
          </p>
          <p className="mt-1 text-2xl font-semibold">{formatMoney(totalValue, "UGX")}</p>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <p className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">Closed</p>
          <p className="mt-1 text-2xl font-semibold">
            {rows.filter((d) => d.stage === "closed").length}
          </p>
        </div>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Input
          className="max-w-xs"
          placeholder="Search reference or title"
          value={term}
          onChange={(e) => setTerm(e.target.value)}
        />
        <Select value={sector} onValueChange={setSector}>
          <SelectTrigger className="w-56">
            <SelectValue placeholder="Sector" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All sectors</SelectItem>
            {SECTORS.map((s) => (
              <SelectItem key={s} value={s}>
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="ml-auto flex rounded-md border p-0.5">
          {(["board", "list"] as const).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`rounded px-3 py-1 text-xs capitalize ${
                view === v ? "bg-primary text-primary-foreground" : "text-muted-foreground"
              }`}
            >
              {v}
            </button>
          ))}
        </div>
      </div>

      {deals.isLoading ? (
        <p className="text-sm text-muted-foreground">Loading pipeline…</p>
      ) : rows.length === 0 ? (
        <EmptyState
          title="No deals in the pipeline"
          hint="Open a deal from a matched requirement or create one directly."
        />
      ) : view === "board" ? (
        <div className="flex gap-3 overflow-x-auto pb-4">
          {BOARD_STAGES.map((stage) => {
            const stageDeals = rows.filter((d) => d.stage === stage);
            return (
              <div key={stage} className="w-64 shrink-0 rounded-lg border bg-muted/30">
                <header className="flex items-center justify-between border-b px-3 py-2">
                  <span className="text-xs font-semibold">
                    {DEAL_STAGE_LABEL[stage as DealStage]}
                  </span>
                  <span className="text-[11px] text-muted-foreground">{stageDeals.length}</span>
                </header>
                <div className="space-y-2 p-2">
                  {stageDeals.map((d) => (
                    <Link
                      key={d.id}
                      to="/deals/$dealId"
                      params={{ dealId: d.id }}
                      className="block rounded-md border bg-card p-3 hover:border-primary/50"
                    >
                      <p className="ref-mono text-[11px] text-muted-foreground">{d.deal_ref}</p>
                      <p className="mt-0.5 line-clamp-2 text-sm font-medium">{d.title}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {d.clients?.full_name ?? "Unassigned client"}
                      </p>
                      <p className="mt-1 text-xs font-medium text-primary">
                        {formatMoney(d.value, d.currency)}
                      </p>
                    </Link>
                  ))}
                  {stageDeals.length === 0 ? (
                    <p className="px-1 py-3 text-[11px] text-muted-foreground">No deals</p>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border bg-card">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-2">Reference</th>
                <th className="px-4 py-2">Deal</th>
                <th className="px-4 py-2">Client</th>
                <th className="px-4 py-2">Stage</th>
                <th className="px-4 py-2">Value</th>
                <th className="px-4 py-2">Expected close</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((d) => (
                <tr key={d.id} className="border-t">
                  <td className="px-4 py-2">
                    <Link
                      to="/deals/$dealId"
                      params={{ dealId: d.id }}
                      className="ref-mono text-xs text-primary hover:underline"
                    >
                      {d.deal_ref}
                    </Link>
                  </td>
                  <td className="px-4 py-2">{d.title}</td>
                  <td className="px-4 py-2">{d.clients?.full_name ?? "—"}</td>
                  <td className="px-4 py-2">
                    <StatusPill value={d.stage} />
                  </td>
                  <td className="px-4 py-2">{formatMoney(d.value, d.currency)}</td>
                  <td className="px-4 py-2">{formatDate(d.expected_close)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </AppShell>
  );
}
