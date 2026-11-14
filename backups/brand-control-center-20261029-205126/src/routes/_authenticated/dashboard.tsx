import { DashboardCalendarSummary } from "@/components/DashboardCalendarSummary";
import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Activity,
  ArrowUpRight,
  Briefcase,
  CalendarDays,
  Download,
  RefreshCw,
  Users,
  Wallet,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { AppShell, PageHeader } from "@/components/AppShell";
import {
  BrandedLoadingScreen,
  DataEmptyState,
  ErrorState,
  SectionSkeleton,
} from "@/components/LoadingStates";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { useSession } from "@/hooks/useSession";
import { formatMoney, titleCase } from "@/lib/records";
import { allows, greeting, primaryRole, ROLE_LABEL, WORKSPACE_LABEL } from "@/lib/rbac";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Company Performance â€” Kalexi Brokerage" },
      {
        name: "description",
        content: "Financial and operational performance from Kalexi Brokerage records.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Dashboard,
});

const PAGE_SIZE = 500;
const REFRESH_INTERVAL = 60_000;
const MONTH_COUNT = 6;

type DashboardClient = Pick<Database["public"]["Tables"]["clients"]["Row"], "created_at">;
type DashboardDeal = Pick<
  Database["public"]["Tables"]["deals"]["Row"],
  "stage" | "value" | "currency" | "closed_at"
>;
type DashboardTransaction = Pick<
  Database["public"]["Tables"]["transactions"]["Row"],
  "amount" | "currency" | "status" | "occurred_on"
>;
type DashboardAuditEntry = Pick<Database["public"]["Tables"]["audit_logs"]["Row"], "actor_email">;
type DashboardAgent = Pick<
  Database["public"]["Tables"]["agents"]["Row"],
  "id" | "full_name" | "status"
>;
type DashboardReferral = Pick<Database["public"]["Tables"]["clients"]["Row"], "id" | "agent_id">;
type DashboardLinkedDeal = Pick<Database["public"]["Tables"]["deals"]["Row"], "client_id">;

interface DashboardMonth {
  key: string;
  label: string;
  newClients: number;
  closedDeals: number;
  clearedVolume: { currency: string; amount: number }[];
}

interface DashboardSummary {
  activeClients: number;
  openDeals: number | null;
  closedThisMonth: number | null;
  months: DashboardMonth[];
  currencies: string[];
  pipelineByCurrency: { currency: string; amount: number }[];
  pipelineStages: { stage: string; label: string; deals: number }[];
  staffActivity: { actor: string; actions: number }[];
  staffActivityTotal: number;
}

interface AgentPerformance {
  agents: (DashboardAgent & { referrals: number; deals: number | null })[];
}

async function collectPages<T>(
  loadPage: (
    from: number,
    to: number,
  ) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await loadPage(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    const page = data ?? [];
    rows.push(...page);
    if (page.length < PAGE_SIZE) return rows;
  }
}

function monthKey(value: string | null | undefined): string | null {
  if (!value) return null;
  const timestamp = new Date(value);
  return Number.isFinite(timestamp.getTime()) ? timestamp.toISOString().slice(0, 7) : null;
}

async function fetchDashboardSummary({
  canViewDeals,
  canViewFinance,
  canViewAudit,
}: {
  canViewDeals: boolean;
  canViewFinance: boolean;
  canViewAudit: boolean;
}): Promise<DashboardSummary> {
  const now = new Date();
  const currentMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const firstMonth = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - MONTH_COUNT + 1, 1),
  );
  const firstMonthIso = firstMonth.toISOString();
  const currentMonthKey = currentMonth.toISOString().slice(0, 7);

  const [clientCount, clients, deals, transactions, auditEntries] = await Promise.all([
    supabase.from("clients").select("id", { count: "exact", head: true }).is("archived_at", null),
    collectPages<DashboardClient>((from, to) =>
      supabase
        .from("clients")
        .select("created_at")
        .is("archived_at", null)
        .gte("created_at", firstMonthIso)
        .order("created_at", { ascending: true })
        .range(from, to),
    ),
    canViewDeals
      ? collectPages<DashboardDeal>((from, to) =>
          supabase
            .from("deals")
            .select("stage, value, currency, closed_at")
            .is("archived_at", null)
            .range(from, to),
        )
      : Promise.resolve([] as DashboardDeal[]),
    canViewFinance
      ? collectPages<DashboardTransaction>((from, to) =>
          supabase
            .from("transactions")
            .select("amount, currency, status, occurred_on")
            .is("archived_at", null)
            .gte("occurred_on", firstMonthIso.slice(0, 10))
            .order("occurred_on", { ascending: true })
            .range(from, to),
        )
      : Promise.resolve([] as DashboardTransaction[]),
    canViewAudit
      ? collectPages<DashboardAuditEntry>((from, to) =>
          supabase
            .from("audit_logs")
            .select("actor_email, action")
            .gte("created_at", new Date(Date.now() - 30 * 86_400_000).toISOString())
            .order("created_at", { ascending: false })
            .range(from, to),
        )
      : Promise.resolve([] as DashboardAuditEntry[]),
  ]);

  if (clientCount.error) throw clientCount.error;

  const months: DashboardMonth[] = Array.from({ length: MONTH_COUNT }, (_, index) => {
    const date = new Date(
      Date.UTC(
        currentMonth.getUTCFullYear(),
        currentMonth.getUTCMonth() - MONTH_COUNT + 1 + index,
        1,
      ),
    );
    const key = date.toISOString().slice(0, 7);
    return {
      key,
      label: date.toLocaleDateString(undefined, { month: "short" }),
      newClients: 0,
      closedDeals: 0,
      clearedVolume: [],
    };
  });
  const monthByKey = new Map(months.map((month) => [month.key, month]));

  for (const client of clients) {
    const key = monthKey(client.created_at);
    const month = key ? monthByKey.get(key) : undefined;
    if (month) month.newClients += 1;
  }

  const currentOpenDeals = deals.filter(
    (deal) => !["closed", "archived"].includes(deal.stage.toLowerCase()),
  );
  const stageCounts = new Map<string, number>();
  const pipelineTotals = new Map<string, number>();
  for (const deal of currentOpenDeals) {
    stageCounts.set(deal.stage, (stageCounts.get(deal.stage) ?? 0) + 1);
    if (deal.value !== null) {
      pipelineTotals.set(
        deal.currency,
        (pipelineTotals.get(deal.currency) ?? 0) + Number(deal.value),
      );
    }
  }

  let closedThisMonth = 0;
  for (const deal of deals) {
    if (deal.stage.toLowerCase() !== "closed") continue;
    const key = monthKey(deal.closed_at);
    if (key === currentMonthKey) closedThisMonth += 1;
    const month = key ? monthByKey.get(key) : undefined;
    if (month) month.closedDeals += 1;
  }

  const monthlyCurrencyTotals = new Map<string, Map<string, number>>();
  for (const transaction of transactions) {
    if (transaction.status !== "cleared") continue;
    const key = monthKey(transaction.occurred_on);
    if (!key) continue;
    const month = monthByKey.get(key);
    if (!month) continue;
    const totals = monthlyCurrencyTotals.get(key) ?? new Map<string, number>();
    totals.set(
      transaction.currency,
      (totals.get(transaction.currency) ?? 0) + Number(transaction.amount),
    );
    monthlyCurrencyTotals.set(key, totals);
  }
  for (const month of months) {
    month.clearedVolume = Array.from(
      monthlyCurrencyTotals.get(month.key) ?? [],
      ([currency, amount]) => ({
        currency,
        amount,
      }),
    );
  }

  const currencyTotals = new Map<string, number>();
  for (const month of months) {
    for (const volume of month.clearedVolume) {
      currencyTotals.set(
        volume.currency,
        (currencyTotals.get(volume.currency) ?? 0) + volume.amount,
      );
    }
  }

  const staffCounts = new Map<string, number>();
  for (const entry of auditEntries) {
    const actor = entry.actor_email ?? "System / service";
    staffCounts.set(actor, (staffCounts.get(actor) ?? 0) + 1);
  }
  const orderedStages = Array.from(stageCounts, ([stage, count]) => ({
    stage,
    label: titleCase(stage),
    deals: count,
  })).sort((left, right) => right.deals - left.deals);
  const pipelineStages = orderedStages.slice(0, 7);
  const otherStageCount = orderedStages.slice(7).reduce((total, stage) => total + stage.deals, 0);
  if (otherStageCount) {
    pipelineStages.push({ stage: "other", label: "Other stages", deals: otherStageCount });
  }

  return {
    activeClients: clientCount.count ?? 0,
    openDeals: canViewDeals ? currentOpenDeals.length : null,
    closedThisMonth: canViewDeals ? closedThisMonth : null,
    months,
    currencies: Array.from(currencyTotals.entries())
      .sort((left, right) => right[1] - left[1])
      .map(([currency]) => currency),
    pipelineByCurrency: Array.from(pipelineTotals, ([currency, amount]) => ({
      currency,
      amount,
    })).sort((left, right) => right.amount - left.amount),
    pipelineStages,
    staffActivity: Array.from(staffCounts, ([actor, actions]) => ({ actor, actions }))
      .sort((left, right) => right.actions - left.actions)
      .slice(0, 5),
    staffActivityTotal: auditEntries.length,
  };
}

async function fetchAgentPerformance(canViewDeals: boolean): Promise<AgentPerformance> {
  const [agents, referrals, linkedDeals] = await Promise.all([
    collectPages<DashboardAgent>((from, to) =>
      supabase
        .from("agents")
        .select("id, full_name, status")
        .order("full_name", { ascending: true })
        .range(from, to),
    ),
    collectPages<DashboardReferral>((from, to) =>
      supabase
        .from("clients")
        .select("id, agent_id")
        .is("archived_at", null)
        .not("agent_id", "is", null)
        .range(from, to),
    ),
    canViewDeals
      ? collectPages<DashboardLinkedDeal>((from, to) =>
          supabase
            .from("deals")
            .select("client_id")
            .is("archived_at", null)
            .not("client_id", "is", null)
            .range(from, to),
        )
      : Promise.resolve([] as DashboardLinkedDeal[]),
  ]);

  const agentByClient = new Map(
    referrals.flatMap((client) => (client.agent_id ? [[client.id, client.agent_id] as const] : [])),
  );
  const referralCounts = new Map<string, number>();
  for (const agentId of agentByClient.values()) {
    referralCounts.set(agentId, (referralCounts.get(agentId) ?? 0) + 1);
  }
  const dealCounts = new Map<string, number>();
  if (canViewDeals) {
    for (const deal of linkedDeals) {
      const agentId = deal.client_id ? agentByClient.get(deal.client_id) : undefined;
      if (agentId) dealCounts.set(agentId, (dealCounts.get(agentId) ?? 0) + 1);
    }
  }

  return {
    agents: agents
      .map((agent) => ({
        ...agent,
        referrals: referralCounts.get(agent.id) ?? 0,
        deals: canViewDeals ? (dealCounts.get(agent.id) ?? 0) : null,
      }))
      .sort((left, right) => right.referrals - left.referrals),
  };
}

function csvCell(value: string | number): string {
  const text = String(value);
  const safeText = /^[=+\-@]/.test(text) ? `'${text}` : text;
  return `"${safeText.replace(/"/g, '""')}"`;
}

function downloadReport(summary: DashboardSummary) {
  const rows = [["Month", "New clients", "Deals closed", "Currency", "Cleared transaction volume"]];
  for (const month of summary.months) {
    if (month.clearedVolume.length === 0) {
      rows.push([month.key, String(month.newClients), String(month.closedDeals), "", ""]);
      continue;
    }
    for (const volume of month.clearedVolume) {
      rows.push([
        month.key,
        String(month.newClients),
        String(month.closedDeals),
        volume.currency,
        String(volume.amount),
      ]);
    }
  }

  const csv = rows.map((row) => row.map(csvCell).join(",")).join("\r\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `kalexi-performance-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

function MetricCard({
  label,
  value,
  detail,
  icon: Icon,
}: {
  label: string;
  value: string;
  detail: string;
  icon: LucideIcon;
}) {
  return (
    <Card className="overflow-hidden shadow-[var(--shadow-panel)]">
      <CardContent className="flex items-start justify-between gap-4 p-5">
        <div className="min-w-0">
          <p className="label-caps">{label}</p>
          <p className="mt-3 truncate font-display text-3xl font-semibold tracking-tight">
            {value}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
        </div>
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
          <Icon aria-hidden="true" className="h-5 w-5" />
        </span>
      </CardContent>
    </Card>
  );
}

function Dashboard() {
  const sessionQuery = useSession();
  const session = sessionQuery.data;
  const access = session?.access;
  const queryClient = useQueryClient();
  const [currency, setCurrency] = useState("");

  const canViewClients = allows(access, "clients.view");
  const canViewDeals = allows(access, "deals.view");
  const canViewFinance = allows(access, "finance.view");
  const canViewAgents = allows(access, "agents.view");
  const canViewAudit = allows(access, "audit.view");
  const role = primaryRole(session?.roles ?? []);

  const summary = useQuery({
    queryKey: [
      "dashboard-performance",
      session?.userId,
      canViewDeals,
      canViewFinance,
      canViewAudit,
    ],
    enabled: canViewClients,
    queryFn: () => fetchDashboardSummary({ canViewDeals, canViewFinance, canViewAudit }),
    refetchInterval: REFRESH_INTERVAL,
  });
  const agents = useQuery({
    queryKey: ["agent-impact"],
    enabled: canViewAgents,
    queryFn: () => fetchAgentPerformance(canViewDeals),
    refetchInterval: REFRESH_INTERVAL,
  });

  useEffect(() => {
    if (!session?.userId || !canViewClients) return;

    const refreshDashboard = () => {
      void queryClient.invalidateQueries({ queryKey: ["dashboard-performance"] });
      if (canViewAgents) void queryClient.invalidateQueries({ queryKey: ["agent-impact"] });
    };

    let channel = supabase
      .channel(`dashboard-performance-${session.userId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "clients" }, refreshDashboard);

    if (canViewDeals) {
      channel = channel.on(
        "postgres_changes",
        { event: "*", schema: "public", table: "deals" },
        refreshDashboard,
      );
    }

    if (canViewFinance) {
      channel = channel.on(
        "postgres_changes",
        { event: "*", schema: "public", table: "transactions" },
        refreshDashboard,
      );
    }
    if (canViewAgents) {
      channel = channel.on(
        "postgres_changes",
        { event: "*", schema: "public", table: "agents" },
        refreshDashboard,
      );
    }
    if (canViewAudit) {
      channel = channel.on(
        "postgres_changes",
        { event: "*", schema: "public", table: "audit_logs" },
        refreshDashboard,
      );
    }

    void channel.subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [
    canViewAgents,
    canViewAudit,
    canViewClients,
    canViewDeals,
    canViewFinance,
    queryClient,
    session?.userId,
  ]);

  if (sessionQuery.isPending) {
    return <BrandedLoadingScreen message="Verifying your session and permissionsâ€¦" />;
  }

  if (sessionQuery.isError) {
    return (
      <AppShell>
        <ErrorState
          title="Unable to verify your workspace"
          description="Your session or permissions could not be retrieved. No records have been changed."
          onRetry={() => void sessionQuery.refetch()}
        />
      </AppShell>
    );
  }

  const data = summary.data;
  const selectedCurrency =
    currency && data?.currencies.includes(currency) ? currency : (data?.currencies[0] ?? "UGX");
  const currentMonth = data?.months.at(-1);
  const previousMonth = data?.months.at(-2);
  const currentVolume =
    currentMonth?.clearedVolume.find((item) => item.currency === selectedCurrency)?.amount ?? 0;
  const previousVolume =
    previousMonth?.clearedVolume.find((item) => item.currency === selectedCurrency)?.amount ?? 0;
  const reportRows =
    data?.months.map((month) => ({
      ...month,
      clearedVolume:
        month.clearedVolume.find((item) => item.currency === selectedCurrency)?.amount ?? 0,
    })) ?? [];
  const activityRows = data?.months ?? [];

  if (!canViewClients) {
    return (
      <AppShell>
        <PageHeader
          title="Company performance"
          description="Your current role does not include dashboard access."
        />
      <DashboardCalendarSummary />

        <p className="rounded-xl border bg-card p-5 text-sm text-muted-foreground">
          Ask an administrator to grant the Clients â€” View permission to access the company
          dashboard.
        </p>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <PageHeader
        title="Company performance"
        description={`${greeting()}, ${session?.profile?.full_name?.split(" ")[0] ?? "there"}. ${
          role ? WORKSPACE_LABEL[role] : "Company overview"
        } Â· ${session?.roles.map((item) => ROLE_LABEL[item]).join(", ") || "No role assigned"}`}
        actions={
          <div className="flex items-center gap-2">
            {allows(access, "admin.users") || allows(access, "admin.roles") ? (
              <Button asChild variant="outline">
                <Link to="/admin">Administration</Link>
              </Button>
            ) : null}
            {data && canViewFinance ? (
              <Button variant="outline" onClick={() => downloadReport(data)}>
                <Download aria-hidden="true" className="mr-2 h-4 w-4" />
                Download report
              </Button>
            ) : null}
            <Button
              variant="outline"
              disabled={summary.isFetching}
              onClick={() => {
                void summary.refetch();
                if (canViewAgents) void agents.refetch();
              }}
            >
              <RefreshCw
                aria-hidden="true"
                className={`mr-2 h-4 w-4 ${summary.isFetching ? "animate-spin" : ""}`}
              />
              {summary.isFetching ? "Updatingâ€¦" : "Refresh"}
            </Button>
          </div>
        }
      />

      <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card px-4 py-3 text-sm">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Activity aria-hidden="true" className="h-4 w-4 text-primary" />
          <span>Live record updates with a one-minute refresh fallback</span>
        </div>
        <span className="text-xs text-muted-foreground" aria-live="polite">
          {summary.dataUpdatedAt
            ? `Updated ${new Date(summary.dataUpdatedAt).toLocaleTimeString()}`
            : "Waiting for the first update"}
        </span>
      </div>

      {summary.isError ? (
        <ErrorState
          title="Company performance could not be loaded"
          description="The dashboard could not retrieve one or more permitted data sets. No records have been changed."
          onRetry={() => void summary.refetch()}
        />
      ) : summary.isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[0, 1, 2, 3].map((item) => (
            <SectionSkeleton key={item} lines={2} />
          ))}
        </div>
      ) : data ? (
        <>
          <section
            aria-label="Company performance indicators"
            className={`grid gap-4 sm:grid-cols-2 ${
              canViewFinance ? "xl:grid-cols-4" : canViewDeals ? "xl:grid-cols-3" : "xl:grid-cols-2"
            }`}
          >
            <MetricCard
              label="Active clients"
              value={data.activeClients.toLocaleString()}
              detail="Current, non-archived records"
              icon={Users}
            />
            {canViewDeals ? (
              <>
                <MetricCard
                  label="Open deal pipeline"
                  value={(data.openDeals ?? 0).toLocaleString()}
                  detail="Deals still in progress"
                  icon={Briefcase}
                />
                <MetricCard
                  label="Deals closed this month"
                  value={(data.closedThisMonth ?? 0).toLocaleString()}
                  detail="Based on recorded close dates"
                  icon={CalendarDays}
                />
              </>
            ) : null}
            {canViewFinance ? (
              <MetricCard
                label={`Cleared volume Â· ${selectedCurrency}`}
                value={formatMoney(currentVolume, selectedCurrency)}
                detail="This month; not converted across currencies"
                icon={Wallet}
              />
            ) : null}
          </section>

          <section
            className={`mt-6 grid gap-5 ${
              canViewDeals ? "xl:grid-cols-[1.45fr_1fr]" : "xl:grid-cols-1"
            }`}
          >
            <Card className="shadow-[var(--shadow-panel)]">
              <CardContent className="p-5 sm:p-6">
                <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 className="font-display text-lg font-semibold">Business activity</h2>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {canViewDeals
                        ? "New clients and completed deals by month"
                        : "New client registrations by month"}
                    </p>
                  </div>
                  <span className="rounded-full border px-3 py-1 text-xs text-muted-foreground">
                    Last 6 months
                  </span>
                </div>
                {activityRows.some(
                  (month) => month.newClients || (canViewDeals && month.closedDeals),
                ) ? (
                  <div
                    className="h-[290px] w-full"
                    role="img"
                    aria-label={
                      canViewDeals
                        ? "Monthly client and closed-deal activity chart"
                        : "Monthly client registration chart"
                    }
                  >
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart
                        data={activityRows}
                        margin={{ top: 8, right: 8, left: -18, bottom: 0 }}
                      >
                        <CartesianGrid
                          strokeDasharray="3 3"
                          vertical={false}
                          stroke="var(--border)"
                        />
                        <XAxis dataKey="label" tickLine={false} axisLine={false} />
                        <YAxis allowDecimals={false} tickLine={false} axisLine={false} width={36} />
                        <Tooltip />
                        <Legend />
                        <Area
                          type="monotone"
                          dataKey="newClients"
                          name="New clients"
                          stroke="#145453"
                          fill="#145453"
                          fillOpacity={0.12}
                          strokeWidth={2}
                        />
                        {canViewDeals ? (
                          <Area
                            type="monotone"
                            dataKey="closedDeals"
                            name="Deals closed"
                            stroke="#5b8def"
                            fill="#5b8def"
                            fillOpacity={0.1}
                            strokeWidth={2}
                          />
                        ) : null}
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <DataEmptyState
                    title="No activity recorded yet"
                    description="New client and deal activity will appear here as records are added."
                  />
                )}
              </CardContent>
            </Card>

            {canViewDeals ? (
              <Card className="shadow-[var(--shadow-panel)]">
                <CardContent className="p-5 sm:p-6">
                  <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h2 className="font-display text-lg font-semibold">Deal pipeline</h2>
                      <p className="mt-1 text-sm text-muted-foreground">
                        Active deals by current workflow stage
                      </p>
                    </div>
                    <Button asChild variant="ghost" size="sm">
                      <Link to="/deals">
                        View deals <ArrowUpRight aria-hidden="true" className="ml-1 h-4 w-4" />
                      </Link>
                    </Button>
                  </div>
                  {data.pipelineStages.length ? (
                    <div
                      className="h-[290px] w-full"
                      role="img"
                      aria-label="Active deals grouped by workflow stage"
                    >
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart
                          data={data.pipelineStages}
                          layout="vertical"
                          margin={{ top: 4, right: 16, left: 8, bottom: 4 }}
                        >
                          <CartesianGrid
                            strokeDasharray="3 3"
                            horizontal={false}
                            stroke="var(--border)"
                          />
                          <XAxis
                            type="number"
                            allowDecimals={false}
                            tickLine={false}
                            axisLine={false}
                          />
                          <YAxis
                            type="category"
                            dataKey="label"
                            width={108}
                            tickLine={false}
                            axisLine={false}
                            tick={{ fontSize: 11 }}
                          />
                          <Tooltip />
                          <Bar
                            dataKey="deals"
                            name="Open deals"
                            fill="#145453"
                            radius={[0, 5, 5, 0]}
                          />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  ) : (
                    <DataEmptyState
                      title="No open deals"
                      description="New pipeline records will appear here."
                    >
                      <Button asChild variant="outline" className="mt-4">
                        <Link to="/deals">Open deal pipeline</Link>
                      </Button>
                    </DataEmptyState>
                  )}
                  {data.pipelineByCurrency.length ? (
                    <div className="mt-4 border-t pt-4">
                      <p className="label-caps">Open pipeline value Â· by currency</p>
                      <div className="mt-2 flex flex-wrap gap-x-5 gap-y-2">
                        {data.pipelineByCurrency.map((item) => (
                          <p key={item.currency} className="text-sm font-semibold">
                            {formatMoney(item.amount, item.currency)}
                          </p>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </CardContent>
              </Card>
            ) : null}
          </section>

          {canViewFinance ? (
            <section className="mt-5">
              <Card className="shadow-[var(--shadow-panel)]">
                <CardContent className="p-5 sm:p-6">
                  <div className="mb-4 flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <h2 className="font-display text-lg font-semibold">Financial performance</h2>
                      <p className="mt-1 text-sm text-muted-foreground">
                        Cleared transactions only. Values remain in their recorded currencies.
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-3">
                      {data.currencies.length > 1 ? (
                        <label className="flex items-center gap-2 text-sm">
                          <span className="text-muted-foreground">Currency</span>
                          <select
                            aria-label="Financial chart currency"
                            value={selectedCurrency}
                            onChange={(event) => setCurrency(event.target.value)}
                            className="min-h-10 rounded-md border bg-background px-3"
                          >
                            {data.currencies.map((item) => (
                              <option key={item} value={item}>
                                {item}
                              </option>
                            ))}
                          </select>
                        </label>
                      ) : null}
                      <Button asChild variant="outline" size="sm">
                        <Link to="/finance">
                          Transactions <ArrowUpRight aria-hidden="true" className="ml-1 h-4 w-4" />
                        </Link>
                      </Button>
                    </div>
                  </div>
                  {data.currencies.length ? (
                    <>
                      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
                        <div>
                          <p className="label-caps">Cleared volume this month</p>
                          <p className="mt-1 font-display text-2xl font-semibold">
                            {formatMoney(currentVolume, selectedCurrency)}
                          </p>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          Previous month: {formatMoney(previousVolume, selectedCurrency)}
                        </p>
                      </div>
                      <div
                        className="h-[280px] w-full"
                        role="img"
                        aria-label={`Monthly cleared transaction volume in ${selectedCurrency}`}
                      >
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart
                            data={reportRows}
                            margin={{ top: 8, right: 8, left: 8, bottom: 0 }}
                          >
                            <CartesianGrid
                              strokeDasharray="3 3"
                              vertical={false}
                              stroke="var(--border)"
                            />
                            <XAxis dataKey="label" tickLine={false} axisLine={false} />
                            <YAxis
                              tickLine={false}
                              axisLine={false}
                              width={72}
                              tickFormatter={(value: number) =>
                                new Intl.NumberFormat(undefined, {
                                  notation: "compact",
                                  maximumFractionDigits: 1,
                                }).format(value)
                              }
                            />
                            <Tooltip
                              formatter={(value) => [
                                formatMoney(Number(value), selectedCurrency),
                                "Cleared",
                              ]}
                            />
                            <Bar
                              dataKey="clearedVolume"
                              name="Cleared volume"
                              fill="#5b8def"
                              radius={[5, 5, 0, 0]}
                            />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </>
                  ) : (
                    <DataEmptyState
                      title="No cleared transactions in this period"
                      description="Cleared transaction totals will appear here when financial records are recorded."
                    >
                      <Button asChild variant="outline" className="mt-4">
                        <Link to="/finance">View transactions</Link>
                      </Button>
                    </DataEmptyState>
                  )}
                </CardContent>
              </Card>
            </section>
          ) : null}

          <section className="mt-5 grid gap-5 xl:grid-cols-2">
            {canViewAgents ? (
              <Card className="shadow-[var(--shadow-panel)]">
                <CardContent className="p-5 sm:p-6">
                  <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h2 className="font-display text-lg font-semibold">Agent performance</h2>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {canViewDeals
                          ? "Client referrals and deals linked to those clients"
                          : "Client referrals linked to each agent"}
                      </p>
                    </div>
                    <Button asChild variant="ghost" size="sm">
                      <Link to="/agents">
                        Agent programme <ArrowUpRight aria-hidden="true" className="ml-1 h-4 w-4" />
                      </Link>
                    </Button>
                  </div>
                  {agents.isError ? (
                    <ErrorState
                      title="Agent performance could not be loaded"
                      description="Your agent permissions remain unchanged."
                      onRetry={() => void agents.refetch()}
                    />
                  ) : agents.isLoading ? (
                    <SectionSkeleton lines={4} />
                  ) : agents.data?.agents.length ? (
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[360px] text-sm">
                        <thead className="text-left text-muted-foreground">
                          <tr>
                            <th className="pb-2 font-medium">Agent</th>
                            <th className="pb-2 text-right font-medium">Referrals</th>
                            {canViewDeals ? (
                              <th className="pb-2 text-right font-medium">Linked deals</th>
                            ) : null}
                          </tr>
                        </thead>
                        <tbody>
                          {agents.data.agents.slice(0, 6).map((agent) => (
                            <tr key={agent.id} className="border-t">
                              <td className="py-3 pr-3">
                                <Link
                                  to="/agents/$agentId"
                                  params={{ agentId: agent.id }}
                                  className="font-medium underline-offset-2 hover:underline"
                                >
                                  {agent.full_name}
                                </Link>
                                <p className="mt-0.5 text-xs text-muted-foreground">
                                  {titleCase(agent.status)}
                                </p>
                              </td>
                              <td className="py-3 text-right tabular-nums">{agent.referrals}</td>
                              {canViewDeals ? (
                                <td className="py-3 text-right tabular-nums">{agent.deals}</td>
                              ) : null}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <DataEmptyState
                      title="No agent activity recorded"
                      description={
                        canViewDeals
                          ? "Referral and linked-deal activity will appear here."
                          : "Referral activity will appear here."
                      }
                    />
                  )}
                </CardContent>
              </Card>
            ) : null}

            {canViewAudit ? (
              <Card className="shadow-[var(--shadow-panel)]">
                <CardContent className="p-5 sm:p-6">
                  <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h2 className="font-display text-lg font-semibold">Staff activity</h2>
                      <p className="mt-1 text-sm text-muted-foreground">
                        Actions recorded in the audit trail Â· last 30 days
                      </p>
                    </div>
                    <Button asChild variant="ghost" size="sm">
                      <Link to="/admin/audit">
                        Audit trail <ArrowUpRight aria-hidden="true" className="ml-1 h-4 w-4" />
                      </Link>
                    </Button>
                  </div>
                  {data.staffActivityTotal ? (
                    <div className="space-y-4">
                      {data.staffActivity.map((item) => {
                        const share = Math.round((item.actions / data.staffActivityTotal) * 100);
                        return (
                          <div key={item.actor}>
                            <div className="mb-1.5 flex items-center justify-between gap-3 text-sm">
                              <span className="truncate font-medium">{item.actor}</span>
                              <span className="shrink-0 text-muted-foreground">
                                {item.actions} {item.actions === 1 ? "action" : "actions"}
                              </span>
                            </div>
                            <div
                              className="h-2 overflow-hidden rounded-full bg-muted"
                              role="img"
                              aria-label={`${share}% of the displayed audit events`}
                            >
                              <div
                                className="h-full rounded-full bg-primary"
                                style={{ width: `${share}%` }}
                              />
                            </div>
                          </div>
                        );
                      })}
                      <p className="border-t pt-3 text-xs leading-5 text-muted-foreground">
                        Audit counts reflect actions logged by the application, not hours worked or
                        work quality. {data.staffActivityTotal} recent audit entries are included.
                      </p>
                    </div>
                  ) : (
                    <DataEmptyState
                      title="No staff activity recorded"
                      description="Audited application actions from the last 30 days will appear here."
                    />
                  )}
                </CardContent>
              </Card>
            ) : null}
          </section>
        </>
      ) : null}
    </AppShell>
  );
}
