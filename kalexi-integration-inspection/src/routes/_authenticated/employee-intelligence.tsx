import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Activity, Building2, CircleDollarSign, ClipboardCheck, Users } from "lucide-react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AppShell, PageHeader } from "@/components/AppShell";
import { ErrorState, SectionSkeleton } from "@/components/LoadingStates";
import { StaffAvatar } from "@/components/StaffAvatar";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { useSession } from "@/hooks/useSession";
import { allows } from "@/lib/rbac";
import { formatMoney } from "@/lib/records";

export const Route = createFileRoute("/_authenticated/employee-intelligence")({
  head: () => ({
    meta: [
      { title: "Employee Intelligence — Kalexi Brokerage" },
      {
        name: "description",
        content: "Employee profiles and database-backed performance indicators.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: EmployeeIntelligence,
});

type Period = "day" | "week" | "month" | "quarter" | "year";
type Profile = Pick<
  Database["public"]["Tables"]["profiles"]["Row"],
  "id" | "full_name" | "email" | "department" | "job_title" | "photo_url" | "status" | "created_at"
>;
type Role = Pick<Database["public"]["Tables"]["user_roles"]["Row"], "user_id" | "role">;
type ClientActivity = Pick<
  Database["public"]["Tables"]["clients"]["Row"],
  "registered_by" | "created_at"
>;
type PropertyActivity = Pick<
  Database["public"]["Tables"]["properties"]["Row"],
  "assigned_to" | "created_by" | "created_at"
>;
type TransactionActivity = Pick<
  Database["public"]["Tables"]["transactions"]["Row"],
  "created_by" | "occurred_on" | "status" | "amount" | "commission_amount" | "currency"
>;
type TaskActivity = Pick<
  Database["public"]["Tables"]["tasks"]["Row"],
  "assigned_to" | "updated_at" | "status"
>;

interface EmployeeMetrics extends Profile {
  roles: string[];
  clientsHandled: number;
  propertiesHandled: number;
  transactionsHandled: number;
  completedTransactions: number;
  tasksCompleted: number;
  revenue: Map<string, number>;
  commission: Map<string, number>;
}

function periodBounds(period: Period, now = new Date()) {
  const start = new Date(now);
  if (period === "day") start.setHours(0, 0, 0, 0);
  if (period === "week") {
    start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
  }
  if (period === "month") {
    start.setDate(1);
    start.setHours(0, 0, 0, 0);
  }
  if (period === "quarter") {
    start.setMonth(Math.floor(start.getMonth() / 3) * 3, 1);
    start.setHours(0, 0, 0, 0);
  }
  if (period === "year") {
    start.setMonth(0, 1);
    start.setHours(0, 0, 0, 0);
  }
  return { start: start.toISOString(), end: now.toISOString() };
}

function withinPeriod(value: string, start: string, end: string) {
  const timestamp = new Date(value).getTime();
  return timestamp >= new Date(start).getTime() && timestamp <= new Date(end).getTime();
}

async function fetchEmployeeMetrics(
  permissions: { clients: boolean; properties: boolean; finance: boolean; tasks: boolean },
  period: Period,
): Promise<EmployeeMetrics[]> {
  const { start, end } = periodBounds(period);
  const results = await Promise.all([
    supabase
      .from("profiles")
      .select("id, full_name, email, department, job_title, photo_url, status, created_at")
      .order("full_name"),
    supabase.from("user_roles").select("user_id, role"),
    permissions.clients
      ? supabase
          .from("clients")
          .select("registered_by, created_at")
          .is("archived_at", null)
          .gte("created_at", start)
          .lte("created_at", end)
      : Promise.resolve({ data: [], error: null }),
    permissions.properties
      ? supabase
          .from("properties")
          .select("assigned_to, created_by, created_at")
          .is("archived_at", null)
          .gte("created_at", start)
          .lte("created_at", end)
      : Promise.resolve({ data: [], error: null }),
    permissions.finance
      ? supabase
          .from("transactions")
          .select("created_by, occurred_on, status, amount, commission_amount, currency")
          .is("archived_at", null)
          .gte("occurred_on", start.slice(0, 10))
          .lte("occurred_on", end.slice(0, 10))
      : Promise.resolve({ data: [], error: null }),
    permissions.tasks
      ? supabase
          .from("tasks")
          .select("assigned_to, updated_at, status")
          .is("archived_at", null)
          .gte("updated_at", start)
          .lte("updated_at", end)
      : Promise.resolve({ data: [], error: null }),
  ]);
  for (const result of results) {
    if (result.error) throw result.error;
  }

  const profiles = (results[0].data ?? []) as Profile[];
  const roles = (results[1].data ?? []) as Role[];
  const clients = (results[2].data ?? []) as ClientActivity[];
  const properties = (results[3].data ?? []) as PropertyActivity[];
  const transactions = (results[4].data ?? []) as TransactionActivity[];
  const tasks = (results[5].data ?? []) as TaskActivity[];

  const byId = new Map(
    profiles.map((profile) => [
      profile.id,
      {
        ...profile,
        roles: roles.filter((role) => role.user_id === profile.id).map((role) => role.role),
        clientsHandled: 0,
        propertiesHandled: 0,
        transactionsHandled: 0,
        completedTransactions: 0,
        tasksCompleted: 0,
        revenue: new Map<string, number>(),
        commission: new Map<string, number>(),
      } satisfies EmployeeMetrics,
    ]),
  );

  for (const client of clients) {
    if (client.registered_by) {
      const employee = byId.get(client.registered_by);
      if (employee) employee.clientsHandled += 1;
    }
  }
  for (const property of properties) {
    const employeeId = property.assigned_to ?? property.created_by;
    const employee = byId.get(employeeId);
    if (employee) employee.propertiesHandled += 1;
  }
  for (const transaction of transactions) {
    if (!transaction.created_by) continue;
    const employee = byId.get(transaction.created_by);
    if (!employee) continue;
    employee.transactionsHandled += 1;
    if (transaction.status.toLowerCase() !== "cleared") continue;
    employee.completedTransactions += 1;
    employee.revenue.set(
      transaction.currency,
      (employee.revenue.get(transaction.currency) ?? 0) + Number(transaction.amount),
    );
    if (transaction.commission_amount !== null) {
      employee.commission.set(
        transaction.currency,
        (employee.commission.get(transaction.currency) ?? 0) +
          Number(transaction.commission_amount),
      );
    }
  }
  for (const task of tasks) {
    if (
      !task.assigned_to ||
      !["completed", "complete", "done"].includes(task.status.toLowerCase())
    ) {
      continue;
    }
    if (!withinPeriod(task.updated_at, start, end)) continue;
    const employee = byId.get(task.assigned_to);
    if (employee) employee.tasksCompleted += 1;
  }

  return Array.from(byId.values()).sort(
    (left, right) =>
      right.completedTransactions - left.completedTransactions ||
      right.tasksCompleted - left.tasksCompleted ||
      right.clientsHandled - left.clientsHandled ||
      left.full_name.localeCompare(right.full_name),
  );
}

const PERIOD_LABEL: Record<Period, string> = {
  day: "Today",
  week: "This week",
  month: "This month",
  quarter: "This quarter",
  year: "This year",
};

function EmployeeIntelligence() {
  const { data: session } = useSession();
  const [period, setPeriod] = useState<Period>("month");
  const [department, setDepartment] = useState("all");
  const [selectedEmployee, setSelectedEmployee] = useState("");
  const access = session?.access;
  const authorized = allows(access, "admin.users");
  const canViewClients = allows(access, "clients.view");
  const canViewProperties = allows(access, "properties.view");
  const canViewFinance = allows(access, "finance.view");
  const canViewTasks = allows(access, "tasks.view");

  const query = useQuery({
    queryKey: [
      "employee-intelligence",
      period,
      session?.userId,
      canViewClients,
      canViewProperties,
      canViewFinance,
      canViewTasks,
    ],
    enabled: authorized,
    queryFn: () =>
      fetchEmployeeMetrics(
        {
          clients: canViewClients,
          properties: canViewProperties,
          finance: canViewFinance,
          tasks: canViewTasks,
        },
        period,
      ),
  });
  const employees = useMemo(() => query.data ?? [], [query.data]);
  const departments = useMemo(
    () =>
      Array.from(
        new Set(
          employees
            .map((employee) => employee.department)
            .filter((value): value is string => !!value),
        ),
      ).sort(),
    [employees],
  );
  const visible = employees.filter(
    (employee) => department === "all" || employee.department === department,
  );
  const selected = visible.find((employee) => employee.id === selectedEmployee) ?? visible[0];
  const chartData = visible.slice(0, 10).map((employee, index) => ({
    rank: index + 1,
    name: employee.full_name,
    completedTransactions: employee.completedTransactions,
    tasksCompleted: employee.tasksCompleted,
    clientsHandled: employee.clientsHandled,
  }));
  const activeCount = visible.filter((employee) => employee.status === "active").length;
  const transactionCount = visible.reduce(
    (total, employee) => total + employee.completedTransactions,
    0,
  );
  const taskCount = visible.reduce((total, employee) => total + employee.tasksCompleted, 0);

  if (!authorized) {
    return (
      <AppShell>
        <PageHeader
          title="Employee intelligence"
          description="Staff performance is restricted to authorized administrators."
        />
        <p className="rounded-xl border bg-card p-5 text-sm text-muted-foreground">
          Your current role does not have permission to view staff profiles and performance.
        </p>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <PageHeader
        title="Employee intelligence"
        description={`Real staff records and attributable activity · ${PERIOD_LABEL[period]}`}
        actions={
          <div className="flex flex-wrap gap-2">
            <Select value={period} onValueChange={(value) => setPeriod(value as Period)}>
              <SelectTrigger className="w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.entries(PERIOD_LABEL) as [Period, string][]).map(([key, label]) => (
                  <SelectItem key={key} value={key}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={department} onValueChange={setDepartment}>
              <SelectTrigger className="w-48">
                <SelectValue placeholder="All departments" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All departments</SelectItem>
                {departments.map((item) => (
                  <SelectItem key={item} value={item}>
                    {item}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        }
      />

      <div className="mb-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard
          label="Staff profiles"
          value={visible.length}
          detail="Profiles visible under staff access controls"
          icon={Users}
        />
        <SummaryCard
          label="Active accounts"
          value={activeCount}
          detail="Active staff accounts in this filter"
          icon={Activity}
        />
        <SummaryCard
          label="Completed transactions"
          value={transactionCount}
          detail="Attributed cleared transactions"
          icon={CircleDollarSign}
        />
        <SummaryCard
          label="Tasks completed"
          value={taskCount}
          detail="Assigned tasks completed in the period"
          icon={ClipboardCheck}
        />
      </div>

      {query.isError ? (
        <ErrorState
          title="Employee performance could not be loaded"
          description="One or more permitted employee activity records could not be retrieved."
          onRetry={() => void query.refetch()}
        />
      ) : query.isLoading ? (
        <SectionSkeleton lines={5} />
      ) : (
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1.3fr)_minmax(320px,0.7fr)]">
          <Card className="shadow-[var(--shadow-panel)]">
            <CardContent className="p-5">
              <h2 className="font-display text-lg font-semibold">Performance ranking</h2>
              <p className="mb-4 text-sm text-muted-foreground">
                Ranked by cleared transactions, then completed tasks, then clients handled. Revenue
                is shown per currency; currencies are never combined.
              </p>
              {chartData.length ? (
                <div className="h-[340px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData} layout="vertical" margin={{ left: 12, right: 12 }}>
                      <CartesianGrid stroke="var(--border)" horizontal={false} />
                      <XAxis type="number" allowDecimals={false} />
                      <YAxis type="category" dataKey="name" width={130} tick={{ fontSize: 11 }} />
                      <Tooltip />
                      <Bar
                        dataKey="completedTransactions"
                        name="Cleared transactions"
                        fill="var(--primary)"
                        radius={[0, 4, 4, 0]}
                      />
                      <Bar
                        dataKey="tasksCompleted"
                        name="Completed tasks"
                        fill="var(--gold)"
                        radius={[0, 4, 4, 0]}
                      />
                      <Bar
                        dataKey="clientsHandled"
                        name="Clients registered"
                        fill="var(--success)"
                        radius={[0, 4, 4, 0]}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <p className="py-10 text-center text-sm text-muted-foreground">
                  No employee profiles are available for this filter.
                </p>
              )}
              {visible.length ? (
                <div className="mt-4 divide-y">
                  {visible.map((employee, index) => (
                    <button
                      type="button"
                      key={employee.id}
                      onClick={() => setSelectedEmployee(employee.id)}
                      className={`flex w-full items-center gap-3 py-3 text-left ${selected?.id === employee.id ? "text-primary" : ""}`}
                    >
                      <span className="w-8 text-sm font-semibold">#{index + 1}</span>
                      <StaffAvatar
                        photoUrl={employee.photo_url}
                        name={employee.full_name}
                        className="h-9 w-9"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">
                          {employee.full_name}
                        </span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {employee.job_title || "Position not set"} ·{" "}
                          {employee.department || "Department not set"}
                        </span>
                      </span>
                      <span className="text-right text-xs text-muted-foreground">
                        {employee.completedTransactions} cleared · {employee.tasksCompleted} tasks
                      </span>
                    </button>
                  ))}
                </div>
              ) : null}
            </CardContent>
          </Card>

          {selected ? (
            <Card className="h-fit shadow-[var(--shadow-panel)]">
              <CardContent className="space-y-5 p-5">
                <div className="flex items-center gap-4">
                  <StaffAvatar
                    photoUrl={selected.photo_url}
                    name={selected.full_name}
                    className="h-16 w-16"
                  />
                  <div className="min-w-0">
                    <h2 className="truncate font-display text-lg font-semibold">
                      {selected.full_name}
                    </h2>
                    <p className="truncate text-sm text-muted-foreground">
                      {selected.job_title || "Position not assigned"}
                    </p>
                    <span className="mt-1 inline-block rounded-full bg-muted px-2 py-0.5 text-xs capitalize">
                      {selected.status}
                    </span>
                  </div>
                </div>
                <dl className="grid grid-cols-2 gap-3 text-sm">
                  <Metric
                    label="Employee ID"
                    value={`KBL-${selected.id.slice(0, 8).toUpperCase()}`}
                  />
                  <Metric label="Department" value={selected.department || "Not set"} />
                  <Metric
                    label="Registered"
                    value={new Date(selected.created_at).toLocaleDateString()}
                  />
                  <Metric
                    label="Responsibilities"
                    value={selected.roles.join(", ") || "No roles assigned"}
                  />
                  <Metric
                    label="Clients handled"
                    value={canViewClients ? selected.clientsHandled : "Restricted"}
                  />
                  <Metric
                    label="Properties handled"
                    value={canViewProperties ? selected.propertiesHandled : "Restricted"}
                  />
                  <Metric
                    label="Transactions handled"
                    value={canViewFinance ? selected.transactionsHandled : "Restricted"}
                  />
                  <Metric
                    label="Completed transactions"
                    value={canViewFinance ? selected.completedTransactions : "Restricted"}
                  />
                  <Metric
                    label="Tasks completed"
                    value={canViewTasks ? selected.tasksCompleted : "Restricted"}
                  />
                </dl>
                {canViewFinance ? (
                  <div className="space-y-2 border-t pt-4">
                    <h3 className="text-sm font-semibold">Attributed cleared revenue</h3>
                    {Array.from(selected.revenue.entries()).length ? (
                      Array.from(selected.revenue.entries()).map(([currency, amount]) => (
                        <div key={currency} className="flex justify-between gap-3 text-sm">
                          <span>{currency}</span>
                          <span className="font-medium">{formatMoney(amount, currency)}</span>
                        </div>
                      ))
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        No cleared transaction revenue in this period.
                      </p>
                    )}
                    <h3 className="pt-2 text-sm font-semibold">Recorded commission attribution</h3>
                    {Array.from(selected.commission.entries()).length ? (
                      Array.from(selected.commission.entries()).map(([currency, amount]) => (
                        <div key={currency} className="flex justify-between gap-3 text-sm">
                          <span>{currency}</span>
                          <span className="font-medium">{formatMoney(amount, currency)}</span>
                        </div>
                      ))
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        No commission amounts recorded for this employee.
                      </p>
                    )}
                  </div>
                ) : null}
              </CardContent>
            </Card>
          ) : null}
        </div>
      )}
    </AppShell>
  );
}

function SummaryCard({
  label,
  value,
  detail,
  icon: Icon,
}: {
  label: string;
  value: number;
  detail: string;
  icon: typeof Users;
}) {
  return (
    <Card className="shadow-[var(--shadow-panel)]">
      <CardContent className="flex items-start justify-between gap-3 p-4">
        <div>
          <p className="label-caps">{label}</p>
          <p className="mt-2 text-2xl font-semibold">{value.toLocaleString()}</p>
          <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
        </div>
        <Icon className="h-5 w-5 text-primary" aria-hidden="true" />
      </CardContent>
    </Card>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="min-w-0 rounded-lg bg-muted/50 p-3">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-1 break-words text-sm font-medium">{value}</dd>
    </div>
  );
}
