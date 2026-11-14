import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import {
  Activity,
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  BriefcaseBusiness,
  Building2,
  CalendarDays,
  CheckCircle2,
  CircleDollarSign,
  ClipboardList,
  Download,
  FileText,
  RefreshCw,
  ShieldCheck,
  Users,
  Wallet,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/intelligence")({
  component: IntelligenceDashboard,
});

type Report = {
  id: string;
  report_date: string;
  generated_at: string;
  report_type: string;
  status: string;
  summary: Record<string, any> | null;
  findings: any;
};

const supabaseUrl = import.meta.env["VITE_SUPABASE_URL"];
const supabaseKey =
  import.meta.env["VITE_SUPABASE_PUBLISHABLE_KEY"] ||
  import.meta.env["VITE_SUPABASE_ANON_KEY"];

const db =
  supabaseUrl && supabaseKey
    ? createClient(supabaseUrl, supabaseKey)
    : null;

function numberValue(value: unknown): number {
  const result = Number(value ?? 0);
  return Number.isFinite(result) ? result : 0;
}

function money(value: unknown, currency = "UGX"): string {
  return new Intl.NumberFormat("en-UG", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
    notation: "compact",
  }).format(numberValue(value));
}

function count(value: unknown): string {
  return new Intl.NumberFormat("en-UG", {
    maximumFractionDigits: 0,
  }).format(numberValue(value));
}

function titleCase(value: string): string {
  return value
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function asArray(value: any): any[] {
  return Array.isArray(value) ? value : [];
}

function IntelligenceDashboard() {
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const loadReports = useCallback(async (manual = false) => {
    if (!db) {
      setError(
        "Supabase environment variables are missing. Configure VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY in your local environment and Vercel."
      );
      setLoading(false);
      return;
    }

    if (manual) setRefreshing(true);
    else setLoading(true);

    setError("");

    try {
      const { data: sessionData, error: sessionError } =
        await db.auth.getSession();

      if (sessionError) throw sessionError;

      if (!sessionData.session) {
        setError(
          "Your session is not available. Sign in to Kalexi Brokerage and reopen Intelligence."
        );
        setReports([]);
        return;
      }

      const { data, error: rpcError } = await db.rpc(
        "get_intelligence_reports",
        { p_limit: 50 }
      );

      if (rpcError) throw rpcError;

      setReports((data ?? []) as Report[]);
      setLastUpdated(new Date());
    } catch (e: any) {
      setError(
        e?.message ||
          "Could not load intelligence reports. Check the database connection and report permissions."
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void loadReports();
  }, [loadReports]);

  const latestReport = reports[0] ?? null;
  const summary = latestReport?.summary ?? {};

  const pipeline = asArray(summary["deal_pipeline"]);
  const demand = asArray(summary["demand"]);
  const findings = asArray(latestReport?.findings);

  const totalPipelineValue = pipeline.reduce(
    (sum, item) => sum + numberValue(item.total_deal_value),
    0
  );

  const totalOpenRequirements = demand.reduce(
    (sum, item) =>
      sum + numberValue(item.open_requirements ?? item.requirement_count),
    0
  );

  const totalDemandBudget = demand.reduce(
    (sum, item) =>
      sum + numberValue(
        item.maximum_budget_total ?? item.total_maximum_budget
      ),
    0
  );

  const criticalFindings = findings.filter(
    (item) =>
      String(item.severity ?? "").toLowerCase() === "high" ||
      String(item.severity ?? "").toLowerCase() === "critical"
  ).length;

  const metrics = [
    {
      label: "Total clients",
      value: count(summary["clients_total"]),
      icon: Users,
      note: "Recorded client accounts",
    },
    {
      label: "Active deals",
      value: count(summary["active_deals"]),
      icon: BriefcaseBusiness,
      note: "Deals currently in progress",
    },
    {
      label: "Open requirements",
      value: count(summary["open_requirements"] ?? totalOpenRequirements),
      icon: ClipboardList,
      note: "Unfulfilled client demand",
    },
    {
      label: "Pipeline value",
      value: money(totalPipelineValue),
      icon: CircleDollarSign,
      note: "Value recorded in deal pipeline",
    },
    {
      label: "KYC pending",
      value: count(summary["clients_pending_kyc"]),
      icon: ShieldCheck,
      note: "Clients needing compliance review",
    },
    {
      label: "High-risk findings",
      value: count(criticalFindings),
      icon: AlertTriangle,
      note: "High or critical report findings",
    },
  ];

  const maxPipeline = Math.max(
    1,
    ...pipeline.map((item) => numberValue(item.total_deal_value))
  );

  const reportRows = useMemo(() => reports, [reports]);

  function exportReport() {
    const payload = {
      exported_at: new Date().toISOString(),
      latest_report: latestReport,
      report_history: reports,
    };

    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json",
    });

    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `kalexi-intelligence-${new Date()
      .toISOString()
      .slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <main className="min-h-screen space-y-6 bg-slate-50 p-4 text-slate-900 sm:p-6 lg:p-8">
      <header className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
          <div data-kalexi-intelligence-back className="flex justify-start">
            <Link to="/dashboard" className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100">
              Back to Dashboard
            </Link>
          </div>
        <div>
          <div className="mb-2 flex items-center gap-2 text-sm font-medium text-blue-700">
            <Activity color="#0891B2" strokeWidth={2.2} size={17} />
            KALEXI BROKERAGE OPERATING SYSTEM
          </div>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
            Intelligence & Analytics
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-600">
            Business performance, deal pipeline, market demand, compliance
            risks and intelligence reporting in one place.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void loadReports(true)}
            disabled={loading || refreshing}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold shadow-sm hover:bg-slate-100 disabled:opacity-50"
          >
            <RefreshCw
              size={16}
              className={refreshing ? "animate-spin" : ""}
            />
            Refresh
          </button>
          <button
            type="button"
            onClick={exportReport}
            disabled={!reports.length}
            className="inline-flex items-center gap-2 rounded-xl bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-800 disabled:opacity-50"
          >
            <Download size={16} />
            Export JSON
          </button>
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold hover:bg-slate-100"
          >
            <FileText color="#475569" strokeWidth={2.2} size={16} />
            Print report
          </button>
        </div>
      </header>

      {error && (
        <section
          role="alert"
          className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800"
        >
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 shrink-0" size={19} />
            <div>
              <p className="font-semibold">Intelligence data unavailable</p>
              <p className="mt-1 break-words">{error}</p>
              <p className="mt-2">
                Check the Supabase connection, sign-in session, and the
                get_intelligence_reports database function.
              </p>
            </div>
          </div>
        </section>
      )}

      <section className="flex flex-col justify-between gap-2 rounded-2xl border border-slate-200 bg-white p-4 sm:flex-row sm:items-center">
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-blue-50 p-3 text-blue-700">
            <BarChart3 size={22} />
          </div>
          <div>
            <p className="font-semibold">Business intelligence overview</p>
            <p className="text-sm text-slate-500">
              {latestReport
                ? `Latest report: ${latestReport.report_type.replace(/_/g, " ")}`
                : "Waiting for the first intelligence report"}
            </p>
          </div>
        </div>
        <div className="text-sm text-slate-500">
          <span className="inline-flex items-center gap-2">
            <span
              className={`h-2 w-2 rounded-full ${
                latestReport ? "bg-emerald-500" : "bg-amber-500"
              }`}
            />
            {latestReport ? "Report loaded" : "No report loaded"}
          </span>
          <p className="mt-1">
            Updated{" "}
            {lastUpdated
              ? lastUpdated.toLocaleString()
              : "not yet"}
          </p>
        </div>
      </section>

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-bold">Key business metrics</h2>
          <span className="text-xs text-slate-500">
            Source: latest saved report
          </span>
        </div>

        {loading ? (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 6 }).map((_, index) => (
              <div
                key={index}
                className="h-32 animate-pulse rounded-2xl bg-slate-200"
              />
            ))}
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {metrics.map((metric) => {
              const Icon = metric.icon;
              return (
                <article
                  key={metric.label}
                  className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium text-slate-500">
                        {metric.label}
                      </p>
                      <p className="mt-3 break-words text-2xl font-bold tracking-tight">
                        {metric.value}
                      </p>
                    </div>
                    <div className="rounded-xl bg-blue-50 p-3 text-blue-700">
                      <Icon size={21} />
                    </div>
                  </div>
                  <p className="mt-3 text-xs text-slate-500">
                    {metric.note}
                  </p>
                </article>
              );
            })}
          </div>
        )}
      </section>

      <section className="grid gap-6 xl:grid-cols-2">
        <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-5 flex items-center gap-3">
            <div className="rounded-xl bg-indigo-50 p-3 text-indigo-700">
              <Building2 color="#DB2777" strokeWidth={2.2} size={21} />
            </div>
            <div>
              <h2 className="font-bold">Deal pipeline</h2>
              <p className="text-sm text-slate-500">
                Recorded deal value by category
              </p>
            </div>
          </div>

          {pipeline.length ? (
            <div className="space-y-5">
              {pipeline.map((item, index) => {
                const value = numberValue(item.total_deal_value);
                const percent = Math.max(
                  3,
                  Math.min(100, (value / maxPipeline) * 100)
                );
                return (
                  <div key={`${item.category ?? "deal"}-${index}`}>
                    <div className="mb-2 flex items-start justify-between gap-3 text-sm">
                      <div>
                        <p className="font-semibold">
                          {item.category ?? "Uncategorised"}
                        </p>
                        <p className="text-xs text-slate-500">
                          {count(item.deal_count)} deals
                          {item.status ? ` · ${item.status}` : ""}
                        </p>
                      </div>
                      <p className="shrink-0 font-semibold">
                        {money(value, item.currency || "UGX")}
                      </p>
                    </div>
                    <div className="h-2.5 overflow-hidden rounded-full bg-slate-100">
                      <div
                        className="h-full rounded-full bg-blue-600 transition-all"
                        style={{ width: `${percent}%` }}
                      />
                    </div>
                  </div>
                );
              })}
              <div className="border-t border-slate-100 pt-4">
                <p className="text-sm text-slate-500">
                  Total recorded pipeline
                </p>
                <p className="mt-1 text-xl font-bold">
                  {money(totalPipelineValue)}
                </p>
              </div>
            </div>
          ) : (
            <EmptyState text="No deal pipeline breakdown was found in the latest report." />
          )}
        </article>

        <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-5 flex items-center gap-3">
            <div className="rounded-xl bg-emerald-50 p-3 text-emerald-700">
              <ClipboardList size={21} />
            </div>
            <div>
              <h2 className="font-bold">Client demand</h2>
              <p className="text-sm text-slate-500">
                Open requirements and recorded budget ceilings
              </p>
            </div>
          </div>

          {demand.length ? (
            <div className="space-y-4">
              {demand.map((item, index) => (
                <div
                  key={`${item.category ?? "demand"}-${item.location ?? ""}-${index}`}
                  className="rounded-xl border border-slate-100 bg-slate-50 p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold">
                        {item.category ?? "Uncategorised demand"}
                      </p>
                      <p className="mt-1 text-sm text-slate-500">
                        {item.location || "Location not specified"}
                      </p>
                    </div>
                    <span className="rounded-lg bg-white px-2.5 py-1 text-xs font-semibold text-slate-700">
                      {count(item.open_requirements ?? item.requirement_count)}{" "}
                      open
                    </span>
                  </div>
                  <p className="mt-3 text-sm text-slate-600">
                    Maximum recorded budget
                  </p>
                  <p className="font-bold">
                    {money(
                      item.maximum_budget_total ??
                        item.total_maximum_budget
                    )}
                  </p>
                </div>
              ))}
              <p className="text-sm text-slate-500">
                Combined recorded budget ceilings:{" "}
                <span className="font-semibold text-slate-900">
                  {money(totalDemandBudget)}
                </span>
              </p>
            </div>
          ) : (
            <EmptyState text="No demand breakdown was found in the latest report." />
          )}
        </article>
      </section>

      <section className="grid gap-6 xl:grid-cols-3">
        <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm xl:col-span-2">
          <div className="mb-5 flex items-center gap-3">
            <div className="rounded-xl bg-amber-50 p-3 text-amber-700">
              <AlertTriangle size={21} />
            </div>
            <div>
              <h2 className="font-bold">Risk and data quality</h2>
              <p className="text-sm text-slate-500">
                Findings recorded in the latest intelligence report
              </p>
            </div>
          </div>

          {findings.length ? (
            <div className="space-y-3">
              {findings.map((finding, index) => {
                const severity = String(
                  finding.severity ?? "info"
                ).toLowerCase();
                const high =
                  severity === "high" || severity === "critical";
                const medium = severity === "medium";
                return (
                  <div
                    key={`${finding.issue ?? finding.title ?? "finding"}-${index}`}
                    className="flex items-start gap-3 rounded-xl border border-slate-100 p-4"
                  >
                    <div
                      className={`mt-0.5 rounded-lg p-2 ${
                        high
                          ? "bg-red-50 text-red-700"
                          : medium
                            ? "bg-amber-50 text-amber-700"
                            : "bg-blue-50 text-blue-700"
                      }`}
                    >
                      {high ? (
                        <AlertTriangle size={18} />
                      ) : (
                        <ShieldCheck color="#9333EA" strokeWidth={2.2} size={18} />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-semibold">
                          {titleCase(
                            String(
                              finding.issue ??
                                finding.title ??
                                finding.type ??
                                "Report finding"
                            )
                          )}
                        </p>
                        <span
                          className={`rounded-full px-2 py-1 text-xs font-semibold ${
                            high
                              ? "bg-red-50 text-red-700"
                              : medium
                                ? "bg-amber-50 text-amber-700"
                                : "bg-slate-100 text-slate-600"
                          }`}
                        >
                          {titleCase(severity)}
                        </span>
                      </div>
                      {finding.description && (
                        <p className="mt-1 text-sm text-slate-600">
                          {finding.description}
                        </p>
                      )}
                      <p className="mt-1 text-xs text-slate-500">
                        Affected records:{" "}
                        {count(finding.affected_records)}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <EmptyState text="No findings are recorded in the latest report, or the report has no findings field." />
          )}
        </article>

        <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center gap-3">
            <div className="rounded-xl bg-violet-50 p-3 text-violet-700">
              <Activity color="#0891B2" strokeWidth={2.2} size={21} />
            </div>
            <div>
              <h2 className="font-bold">Forecasting status</h2>
              <p className="text-sm text-slate-500">Model readiness</p>
            </div>
          </div>

          {summary["forecasting_enabled"] === true ? (
            <div className="rounded-xl bg-emerald-50 p-4 text-emerald-800">
              <CheckCircle2 color="#16A34A" strokeWidth={2.2} size={22} />
              <p className="mt-2 font-semibold">Forecasting enabled</p>
              <p className="mt-1 text-sm">
                Forecast results should be validated against actual outcomes.
              </p>
            </div>
          ) : (
            <div className="rounded-xl bg-amber-50 p-4 text-amber-900">
              <CalendarDays color="#7C3AED" strokeWidth={2.2} size={22} />
              <p className="mt-2 font-semibold">
                Historical data still required
              </p>
              <p className="mt-1 text-sm">
                The baseline collector records metrics, but forecasts are not
                enabled. Build a reliable history before treating predictions
                as business facts.
              </p>
            </div>
          )}

          <div className="mt-5 space-y-3 text-sm">
            <div className="flex items-center justify-between gap-2">
              <span className="text-slate-500">Saved reports</span>
              <span className="font-semibold">{count(reports.length)}</span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-slate-500">Latest report date</span>
              <span className="font-semibold">
                {latestReport?.report_date ?? "Not available"}
              </span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-slate-500">Report status</span>
              <span className="font-semibold">
                {latestReport?.status ?? "No report"}
              </span>
            </div>
          </div>
        </article>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col justify-between gap-2 border-b border-slate-100 p-5 sm:flex-row sm:items-center">
          <div>
            <h2 className="font-bold">Intelligence report history</h2>
            <p className="mt-1 text-sm text-slate-500">
              Latest saved reports returned by the secure database function
            </p>
          </div>
          <span className="text-sm text-slate-500">
            {count(reports.length)} reports
          </span>
        </div>

        {reportRows.length ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[650px] text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-5 py-3 font-semibold">Report</th>
                  <th className="px-5 py-3 font-semibold">Report date</th>
                  <th className="px-5 py-3 font-semibold">Generated</th>
                  <th className="px-5 py-3 font-semibold">Status</th>
                </tr>
              </thead>
              <tbody>
                {reportRows.map((report) => (
                  <tr key={report.id} className="border-t border-slate-100">
                    <td className="px-5 py-4 font-medium">
                      {titleCase(report.report_type || "Report")}
                    </td>
                    <td className="px-5 py-4 text-slate-600">
                      {report.report_date || "Not recorded"}
                    </td>
                    <td className="px-5 py-4 text-slate-600">
                      {report.generated_at
                        ? new Date(report.generated_at).toLocaleString()
                        : "Not recorded"}
                    </td>
                    <td className="px-5 py-4">
                      <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">
                        {report.status || "Unknown"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-6">
            <EmptyState text="No saved intelligence reports are available for this account yet." />
          </div>
        )}
      </section>

      <footer className="flex flex-col gap-2 border-t border-slate-200 pt-4 text-xs text-slate-500 sm:flex-row sm:items-center sm:justify-between">
        <span>Kalexi Brokerage · Internal business intelligence</span>
        <span>
          Metrics reflect saved reports and may not be real-time transaction
          totals.
        </span>
      </footer>
    </main>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="rounded-xl border border-dashed border-slate-200 p-6 text-center">
      <BarChart3 className="mx-auto text-slate-400" size={25} />
      <p className="mt-2 text-sm text-slate-500">{text}</p>
    </div>
  );
}

