import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { CalendarDays, Clock, MapPin, ClipboardList } from "lucide-react";
import { Area, AreaChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { getAgentDashboard, getUpcomingAgentEvents, redeemAgentTokens } from "@/lib/agents.functions";
import {
  getMyAgentCommissionSummary,
  requestAgentCommissionPayout,
} from "@/lib/agent-commission.functions";
import { KalexiMark } from "@/components/KalexiMark";
import { StatusPill } from "@/components/records";
import { Button } from "@/components/ui/button";
import { BackButton } from "@/components/AppShell";
import { AgentIdCard } from "@/components/AgentIdCard";
import { AgentMessages } from "@/components/AgentMessages";
import { validAgent } from "@/lib/agent-rules";
import { DEAL_STAGES, DEAL_STAGE_LABEL } from "@/lib/records";

export const Route = createFileRoute("/_authenticated/agent-portal")({
  head: () => ({ meta: [{ title: "My Agent Dashboard — Kalexi" }, { name: "description", content: "Your referrals, approximate rewards and private Kalexi conversations." }, { property: "og:title", content: "My Agent Dashboard — Kalexi" }, { property: "og:description", content: "Your Kalexi agent performance and rewards." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: AgentPortal,
});

const TIPS = [
  "Share your link on WhatsApp status and in community groups.",
  "Ask satisfied clients to refer friends — each referral counts for you.",
  "Collect the client's exact need (location, budget, quantity) so Kalexi can match faster.",
  "Never collect money from clients — all payments go to official Kalexi accounts.",
];
const TRACKED_DEAL_STAGES = DEAL_STAGES.filter((stage) => stage !== "archived");

function AgentPortal() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["agent-dashboard"],
    queryFn: () => getAgentDashboard(),
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  });
  const eventsQuery = useQuery({
    queryKey: ["agent-upcoming-events"],
    queryFn: () => getUpcomingAgentEvents(),
    enabled: !!q.data && q.data.kind !== "pending",
    refetchOnWindowFocus: true,
  });
  const commissionQuery = useQuery({
    queryKey: ["agent-commission-summary"],
    queryFn: () => getMyAgentCommissionSummary(),
    enabled: !!q.data && q.data.kind === "agent",
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  });
  const redeemTokens = useServerFn(redeemAgentTokens);
  const requestCommissionPayout = useServerFn(requestAgentCommissionPayout);
  const [tab, setTab] = useState<"overview" | "clients" | "events" | "card" | "messages">("overview");
  const [tokensToRedeem, setTokensToRedeem] = useState(1);
  const [commissionAmounts, setCommissionAmounts] = useState<Record<string, string>>({});
  async function signOut() { qc.clear(); await supabase.auth.signOut(); navigate({ to: "/", replace: true }); }
  const d = q.data;

  const header = (
    <header className="no-print flex items-center justify-between gap-3 bg-sidebar px-4 py-4 text-sidebar-foreground">
      <div className="flex items-center gap-3"><KalexiMark className="h-9 w-9" />
        <div className="min-w-0"><p className="font-display text-xs font-semibold sm:text-sm">KALEXI BROKERAGE LTD</p>
          <p className="text-[10px] uppercase tracking-[0.2em] text-sidebar-primary">Digital Agent Portal</p></div></div>
      <div className="flex items-center gap-2">
        <BackButton fallback="/dashboard" />
        <Button size="sm" variant="secondary" onClick={signOut}>Sign out</Button>
      </div>
    </header>
  );
  const box = "min-w-0 border-t pt-5";

  if (q.isLoading) return <div className="min-h-screen bg-background">{header}<p className="p-8 text-sm text-muted-foreground">Loading…</p></div>;
  if (q.isError) return <div className="min-h-screen bg-background">{header}
    <main className="mx-auto max-w-3xl space-y-4 p-8">
      <p className="text-sm text-destructive">
        {q.error instanceof Error ? q.error.message : "The agent dashboard could not be loaded."}
      </p>
      <Button variant="outline" onClick={() => void q.refetch()}>Retry</Button>
    </main>
  </div>;
  if (!d) return <div className="min-h-screen bg-background">{header}<p className="p-8 text-sm">No agent profile is linked to this sign-in. Contact Kalexi Brokerage.</p></div>;

  if (d.kind === "pending") {
    const a = d.application;
    return (
      <div className="min-h-screen bg-background">{header}
        <main className="mx-auto max-w-3xl space-y-6 px-5 py-8">
          <div className="rounded-xl border bg-gradient-to-br from-primary/15 via-card to-card p-6">
            <p className="text-xs uppercase tracking-[0.16em] text-primary">Welcome</p>
            <h1 className="font-display text-2xl font-semibold">{a.full_name}</h1>
            <p className="mt-1 text-sm text-muted-foreground">Application {a.application_ref} · <StatusPill value={a.status} /></p>
          </div>
          <div className={box}>
            <h2 className="font-display font-semibold">Your verification is in progress</h2>
            <p className="mt-2 text-sm text-muted-foreground">Kalexi is reviewing your identity and details. Once approved you'll unlock your official ID card, your referral link, tokens and performance tracking.</p>
            {a.review_note ? <p className="mt-3 rounded-md bg-muted p-3 text-sm">Message from Kalexi: {a.review_note}</p> : null}
            <ul className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
              {["Digital ID card download", "Referral link", "Tokens & rewards", "Performance charts"].map((x) => (
                <li key={x} className="flex items-center gap-2 rounded-md border px-3 py-2 text-muted-foreground">🔒 {x}</li>
              ))}
            </ul>
          </div>
          <div className={box}><h2 className="mb-2 font-display font-semibold">Get ready</h2>
            <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">{TIPS.map((t) => <li key={t}>{t}</li>)}</ul></div>
        </main>
      </div>
    );
  }

  const { me, performance: p, tokens, clients } = d;
  const active = validAgent(me.status, me.expires_at);
  const refLink = `${typeof window !== "undefined" ? window.location.origin : ""}/r/${me.referral_code}`;
  const shareText = encodeURIComponent(`Looking for property, land, minerals or a supplier? Register with Kalexi Brokerage through my link: ${refLink}`);

  async function redeem() {
    try {
      const requestTokens = Math.min(tokensToRedeem, tokens.available);
      const r = await redeemTokens({ data: { tokens: requestTokens } });
      toast.success(`Redemption of UGX ${r.amount.toLocaleString()} requested. Finance will contact you.`);
      await qc.invalidateQueries({ queryKey: ["agent-dashboard"] });
    }
    catch (e) { toast.error((e as Error).message); }
  }

  async function redeemCommission(currency: string, amount: number) {
    if (!Number.isFinite(amount) || amount <= 0) {
      toast.error("Enter a commission payout amount greater than zero.");
      return;
    }
    if (!window.confirm(`Request payment of your available ${currency} ${amount.toLocaleString()} commission balance?`)) return;
    try {
      await requestCommissionPayout({ data: { currency, amount } });
      toast.success(`${currency} ${amount.toLocaleString()} commission payout requested.`);
      await qc.invalidateQueries({ queryKey: ["agent-commission-summary"] });
      await qc.invalidateQueries({ queryKey: ["agent-dashboard"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Commission payout could not be requested.");
    }
  }

  return (
    <div className="min-h-screen bg-background">{header}
      <main className="mx-auto max-w-6xl space-y-6 px-4 py-6">
        <div className="no-print border-b pb-5">
          <p className="text-xs uppercase tracking-[0.16em] text-primary">Welcome back</p>
          <h1 className="font-display text-2xl font-semibold">{me.full_name}</h1>
          <p className="text-sm text-muted-foreground">{me.agent_code} · {me.district ?? "—"} <StatusPill value={me.status} /></p>
        </div>

        <div className="no-print grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
          {([["overview", "Overview"], ["clients", "My clients"], ["events", `Upcoming events (${eventsQuery.data?.length ?? 0})`], ["card", "ID card"], ["messages", `Messages (${d.notices.length})`]] as const).map(([k, l]) => (
            <Button key={k} size="sm" variant={tab === k ? "default" : "outline"} onClick={() => setTab(k)}>{l}</Button>
          ))}
        </div>

        {tab === "overview" && (
          <>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              {[["Referred clients", p.mine], ["My rank", `#${p.rank} of ${p.totalAgents}`], ["Standing", `Top ${p.topPercent}%`], ["Tokens", tokens.available]].map(([l, v]) => (
                <div key={l as string} className="rounded-lg border bg-card p-4"><p className="text-xs text-muted-foreground">{l}</p><p className="mt-1 font-display text-xl font-semibold">{v}</p></div>
              ))}
            </div>
            <div className="grid gap-6 lg:grid-cols-[1.6fr_1fr]">
              <section className={box}>
                <h2 className="mb-1 font-display font-semibold">My performance</h2>
                <p className="mb-3 text-xs text-muted-foreground">Clients you referred each month compared with the programme average.</p>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={p.months}>
                      <defs><linearGradient id="mine" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="var(--primary)" stopOpacity={0.5} /><stop offset="100%" stopColor="var(--primary)" stopOpacity={0} /></linearGradient></defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                      <XAxis dataKey="month" stroke="var(--muted-foreground)" fontSize={12} />
                      <YAxis allowDecimals={false} stroke="var(--muted-foreground)" fontSize={12} />
                      <Tooltip /><Legend />
                      <Area type="monotone" name="Me" dataKey="mine" stroke="var(--primary)" fill="url(#mine)" strokeWidth={2} />
                      <Area type="monotone" name="Average agent" dataKey="average" stroke="var(--muted-foreground)" fill="transparent" strokeDasharray="4 4" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
                <p className="mt-2 text-sm">{p.mine >= p.average ? "You're performing above the average agent — keep it up!" : `The average agent has ${p.average} clients. Share your link to climb the ranking.`}</p>
              </section>
              <section className={box}>
                <h2 className="font-display font-semibold">My tokens</h2>
                <p className="mt-1 text-xs text-muted-foreground">You earn a token for every client you refer. Redeem any number of tokens in your available balance.</p>
                <p className="my-4 font-display text-5xl font-semibold text-primary">{tokens.available}</p>
                <div className="mb-5 border-l-4 border-success pl-4"><p className="text-xs text-muted-foreground">Approximate reward value</p><p className="text-2xl font-semibold text-success">UGX {tokens.approximateValue.toLocaleString()}</p><p className="mt-1 text-xs text-muted-foreground">Estimate only. Payment follows reward eligibility and company approval.</p></div>
                <label className="mb-2 block text-sm font-medium" htmlFor="tokens-to-redeem">Tokens to redeem</label>
                <input
                  id="tokens-to-redeem"
                  type="number"
                  min={1}
                  max={tokens.available}
                  step={1}
                  value={tokens.available ? Math.min(tokensToRedeem, tokens.available) : 0}
                  onChange={(event) => setTokensToRedeem(Math.max(0, Math.floor(Number(event.target.value))))}
                  className="mb-3 min-h-10 w-full rounded-md border bg-background px-3 text-sm"
                  disabled={!active || tokens.available === 0}
                />
                <p className="mb-3 text-xs text-muted-foreground">Estimated request: UGX {(Math.min(tokensToRedeem, tokens.available) * 1000).toLocaleString()}</p>
                <Button className="w-full" disabled={!active || !tokens.available || tokensToRedeem < 1} onClick={redeem}>Request token reward</Button>
                {d.redemptions.length ? (
                  <ul className="mt-4 divide-y text-sm">{d.redemptions.map((r) => (
                    <li key={r.id} className="flex justify-between py-2"><span>UGX {Number(r.amount).toLocaleString()}<br /><span className="text-xs text-muted-foreground">{new Date(r.created_at).toLocaleDateString()}</span></span><StatusPill value={r.status} /></li>
                  ))}</ul>
                ) : null}
              </section>
              <section className={box}>
                <h2 className="font-display font-semibold">Collected commissions</h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  Cleared Kalexi brokerage-fee receipts linked to your referred clients are included after finance verification.
                </p>
                {commissionQuery.isError ? (
                  <div role="alert" className="mt-3 flex flex-wrap items-center justify-between gap-3">
                    <p className="text-sm text-destructive">
                      {commissionQuery.error instanceof Error
                        ? commissionQuery.error.message
                        : "Commission balances could not be loaded."}
                    </p>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={commissionQuery.isFetching}
                      onClick={() => void commissionQuery.refetch()}
                    >
                      {commissionQuery.isFetching ? "Retrying…" : "Retry"}
                    </Button>
                  </div>
                ) : commissionQuery.isPending ? (
                  <p className="mt-3 text-sm text-muted-foreground">Loading commission balances…</p>
                ) : commissionQuery.data?.balances.length ? (
                  <div className="mt-4 space-y-3">
                    {commissionQuery.data.balances.map((balance) => (
                      <div key={balance.currency} className="space-y-3 rounded-md border p-3">
                        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                          {[
                            { label: "Net commissions", amount: balance.netPayable },
                            { label: "Pending", amount: balance.pending },
                            { label: "Approved", amount: balance.approved },
                            { label: "Paid", amount: balance.paid },
                            { label: "Outstanding", amount: balance.outstanding },
                            { label: "Available to request", amount: balance.available },
                          ].map(({ label, amount }) => (
                            <div key={label} className="min-w-0">
                              <p className="text-xs text-muted-foreground">{label} · {balance.currency}</p>
                              <p className="mt-0.5 truncate font-display font-semibold">
                                {balance.currency} {Number(amount).toLocaleString()}
                              </p>
                            </div>
                          ))}
                        </div>
                        <div className="flex flex-wrap items-end gap-2">
                          <label className="text-xs">
                            <span className="mb-1 block text-muted-foreground">Amount to request</span>
                            <input
                              aria-label={`${balance.currency} commission payout amount`}
                              type="number"
                              min="0.01"
                              max={balance.available}
                              step="0.01"
                              value={commissionAmounts[balance.currency] ?? balance.available.toFixed(2)}
                              onChange={(event) => setCommissionAmounts((current) => ({
                                ...current,
                                [balance.currency]: event.target.value,
                              }))}
                              className="min-h-9 w-36 rounded-md border bg-background px-2 text-sm"
                            />
                          </label>
                          <Button
                            size="sm"
                            disabled={
                              !active ||
                              balance.available <= 0 ||
                              !Number.isFinite(Number(commissionAmounts[balance.currency] ?? balance.available)) ||
                              Number(commissionAmounts[balance.currency] ?? balance.available) <= 0 ||
                              Number(commissionAmounts[balance.currency] ?? balance.available) > balance.available
                            }
                            onClick={() => void redeemCommission(
                              balance.currency,
                              Number(commissionAmounts[balance.currency] ?? balance.available),
                            )}
                          >
                            Request payout
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="mt-3 text-sm text-muted-foreground">No cleared commission is currently available.</p>
                )}
                {commissionQuery.data?.payouts.length ? (
                  <ul className="mt-4 divide-y text-sm">
                    {commissionQuery.data.payouts.slice(0, 5).map((payout) => (
                      <li key={payout.id} className="flex items-center justify-between gap-2 py-2">
                        <span>{payout.currency} {Number(payout.amount).toLocaleString()}<br />
                          <span className="text-xs text-muted-foreground">{new Date(payout.created_at).toLocaleDateString()}</span>
                        </span>
                        <StatusPill value={payout.status} />
                      </li>
                    ))}
                  </ul>
                ) : null}
                {commissionQuery.data?.commissions.length ? (
                  <div className="mt-4 border-t pt-3">
                    <h3 className="text-sm font-medium">Commission records</h3>
                    <ul className="mt-2 divide-y text-sm">
                      {commissionQuery.data.commissions.slice(0, 5).map((commission) => {
                        const client = clients.find((item) => item.id === commission.client_id);
                        return (
                          <li key={commission.id} className="flex items-center justify-between gap-2 py-2">
                            <span>
                              {client?.full_name ?? "Referred client"} · {commission.currency} {Number(commission.net_payable).toLocaleString()}
                              <br />
                              <span className="text-xs text-muted-foreground">
                                Recorded {new Date(commission.created_at).toLocaleDateString()}
                              </span>
                            </span>
                            <StatusPill value={commission.status} />
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ) : null}
              </section>
            </div>
            <div className="grid gap-6 lg:grid-cols-2">
              <section className={box}>
                <h2 className="mb-2 font-display font-semibold">Share my referral link</h2>
                <p className="text-sm">Code: <b className="font-mono">{me.referral_code}</b></p>
                <div className="mt-2 flex gap-2"><code className="flex-1 truncate rounded bg-muted px-2 py-1.5 text-xs">{refLink}</code>
                  <Button size="sm" variant="outline" onClick={() => { navigator.clipboard.writeText(refLink); toast.success("Copied"); }}>Copy</Button></div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <a className="rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground" href={`https://wa.me/?text=${shareText}`} target="_blank" rel="noreferrer">Share on WhatsApp</a>
                  <a className="rounded-md border px-3 py-1.5 text-sm" href={`sms:?body=${shareText}`}>Send by SMS</a>
                  <a className="rounded-md border px-3 py-1.5 text-sm" href={`mailto:?subject=Kalexi%20Brokerage&body=${shareText}`}>Email</a>
                </div>
              </section>
              <section className={box}><h2 className="mb-2 font-display font-semibold">Agent tips</h2>
                <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">{TIPS.map((t) => <li key={t}>{t}</li>)}</ul></section>
            </div>
          </>
        )}

        {tab === "clients" && (
          <section className={box}>
            <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="font-display font-semibold">My referred clients ({clients.length})</h2>
                <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
                  Progress and activity below come from records entered in Kalexi. Follow-up signals are indicators, not a guarantee of a successful deal.
                </p>
              </div>
              <Button variant="outline" size="sm" disabled={q.isFetching} onClick={() => void q.refetch()}>
                {q.isFetching ? "Refreshing…" : "Refresh client progress"}
              </Button>
            </div>
            {clients.length ? (
              <div className="space-y-4">
                {clients.map((client) => {
                  const tracking = client.tracking;
                  const deal = tracking?.latestDeal;
                  const stageIndex = deal
                    ? TRACKED_DEAL_STAGES.indexOf(
                        deal.stage as (typeof TRACKED_DEAL_STAGES)[number],
                      )
                    : -1;
                  const stageCount = TRACKED_DEAL_STAGES.length;
                  const stageProgress = stageIndex >= 0 ? Math.round(((stageIndex + 1) / stageCount) * 100) : 0;
                  const commissionRows = commissionQuery.data?.commissions.filter(
                    (commission) => commission.client_id === client.id,
                  ) ?? [];
                  const clearedCommissions = commissionRows.filter(
                    (commission) => commission.status === "available",
                  );
                  const outlook = deal?.stage === "closed"
                    ? deal.close_outcome?.toLowerCase() === "lost" ? "Closed — not won" : "Deal closed"
                    : tracking?.stalledReason
                      ? "Follow-up needed"
                      : deal
                        ? "Moving through pipeline"
                        : tracking?.requirements.length
                          ? "Requirement recorded"
                          : "Qualification not started";

                  return (
                    <article key={client.id} className="rounded-xl border bg-card p-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <h3 className="font-semibold">{client.full_name}</h3>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {client.client_ref} · {client.sector} · Referred {new Date(client.created_at).toLocaleDateString()}
                          </p>
                        </div>
                        <StatusPill value={outlook} />
                      </div>
                      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                        <div className="rounded-md bg-muted/50 p-3">
                          <p className="text-xs text-muted-foreground">Current process</p>
                          <p className="mt-1 text-sm font-medium">
                            {deal
                              ? DEAL_STAGE_LABEL[deal.stage as keyof typeof DEAL_STAGE_LABEL] ?? deal.stage.replaceAll("_", " ")
                              : tracking?.requirements[0]?.title ?? "No deal opened"}
                          </p>
                          {deal ? (
                            <>
                              <div
                                className="mt-2 h-2 overflow-hidden rounded-full bg-muted"
                                role="progressbar"
                                aria-label={`${client.full_name} recorded deal pipeline stage`}
                                aria-valuemin={0}
                                aria-valuemax={100}
                                aria-valuenow={stageProgress}
                              >
                                <div className="h-full rounded-full bg-primary" style={{ width: `${stageProgress}%` }} />
                              </div>
                              <p className="mt-1 text-xs text-muted-foreground">{deal.deal_ref}</p>
                              {deal.value != null ? (
                                <p className="mt-1 text-xs text-muted-foreground">
                                  Value: {deal.currency} {Number(deal.value).toLocaleString()}
                                </p>
                              ) : null}
                              {deal.expected_close ? (
                                <p className="mt-1 text-xs text-muted-foreground">
                                  Expected close: {new Date(`${deal.expected_close}T12:00:00`).toLocaleDateString()}
                                </p>
                              ) : null}
                            </>
                          ) : null}
                          {!deal && tracking?.requirements[0] ? (
                            <p className="mt-1 text-xs text-muted-foreground">
                              Requirement status: {tracking.requirements[0].status}
                            </p>
                          ) : null}
                        </div>
                        <div className="rounded-md bg-muted/50 p-3">
                          <p className="text-xs text-muted-foreground">Transactions with Kalexi</p>
                          <p className="mt-1 text-sm font-medium">
                            {tracking?.clearedTransactionCount
                              ? `${tracking.clearedTransactionCount} cleared`
                              : tracking?.pendingTransactionCount
                                ? "Recorded, awaiting clearance"
                                : "No cleared transaction"}
                          </p>
                          {!tracking?.clearedTransactionCount ? (
                            <p className="mt-1 text-xs text-muted-foreground">
                              {tracking?.pendingTransactionCount
                                ? "A transaction is recorded but not cleared yet."
                                : "This client has not yet completed a recorded transaction with Kalexi."}
                            </p>
                          ) : null}
                        </div>
                        <div className="rounded-md bg-muted/50 p-3">
                          <p className="text-xs text-muted-foreground">Recorded activity</p>
                          <p className="mt-1 text-sm font-medium">
                            {tracking?.recentCommunicationCount ?? 0} communication record{tracking?.recentCommunicationCount === 1 ? "" : "s"} in the last 30 days
                          </p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            Last update {tracking?.lastActivityAt ? new Date(tracking.lastActivityAt).toLocaleDateString() : "not recorded"}
                          </p>
                        </div>
                        <div className="rounded-md bg-muted/50 p-3">
                          <p className="text-xs text-muted-foreground">Progress signal</p>
                          <p className="mt-1 text-sm font-medium">
                            {tracking?.stalledReason ?? (deal?.stage === "closed"
                              ? "Deal process closed"
                              : deal
                                ? "No recorded stall; continue monitoring"
                                : tracking?.requirements.length
                                  ? "A requirement is recorded; a deal has not opened"
                                  : "Client needs qualification and a next step")}
                          </p>
                          {tracking?.openTaskCount ? (
                            <p className="mt-1 text-xs text-muted-foreground">
                              {tracking.openTaskCount} open follow-up task{tracking.openTaskCount === 1 ? "" : "s"}
                            </p>
                          ) : null}
                        </div>
                      </div>
                      <div className="mt-3 rounded-md border border-dashed p-3 text-sm">
                        {commissionQuery.isPending ? (
                          <span className="text-muted-foreground">Checking commission records…</span>
                        ) : clearedCommissions.length ? (
                          <span>
                            Commission recorded: {clearedCommissions.map((commission) =>
                              `${commission.currency} ${Number(commission.net_payable).toLocaleString()}`,
                            ).join(", ")}. Use the Overview tab to request a payout.
                          </span>
                        ) : deal?.stage === "closed" ? (
                          <span>
                            The deal is closed, but no commission is recorded yet. A cleared brokerage-fee receipt and Finance processing are required before it can be requested.
                          </span>
                        ) : (
                          <span className="text-muted-foreground">
                            No commission is available yet. A commission can be recorded after this client has a closed deal and an eligible cleared fee receipt.
                          </span>
                        )}
                      </div>
                    </article>
                  );
                })}
              </div>
            ) : <p className="text-sm text-muted-foreground">No referred clients yet — share your link to get started.</p>}
          </section>
        )}

        {tab === "events" && (
          <section className={box}>
            <div className="mb-4 flex items-center gap-2">
              <CalendarDays aria-hidden="true" className="h-5 w-5 text-primary" />
              <h2 className="font-display font-semibold">Upcoming company events</h2>
            </div>
            <p className="mb-4 text-sm text-muted-foreground">
              Events and attendee instructions published by Kalexi staff. This view only shows upcoming events, not the company calendar.
            </p>
            {eventsQuery.isLoading ? (
              <p className="text-sm text-muted-foreground">Loading upcoming events…</p>
            ) : eventsQuery.isError ? (
              <div role="alert" className="space-y-3">
                <p className="text-sm text-destructive">
                  {eventsQuery.error instanceof Error
                    ? eventsQuery.error.message
                    : "Upcoming events could not be loaded."}
                </p>
                <Button variant="outline" size="sm" onClick={() => void eventsQuery.refetch()}>
                  Retry
                </Button>
              </div>
            ) : eventsQuery.data?.length ? (
              <div className="space-y-3">
                {eventsQuery.data.map((event) => (
                  <details key={event.id} className="group rounded-xl border bg-card p-4">
                    <summary className="cursor-pointer list-none">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <h3 className="font-semibold group-open:text-primary">{event.title}</h3>
                          <p className="mt-1 flex items-center gap-2 text-sm text-muted-foreground">
                            <Clock aria-hidden="true" className="h-4 w-4 shrink-0" />
                            {new Date(event.starts_at).toLocaleString("en-GB", {
                              dateStyle: "medium",
                              timeStyle: "short",
                              timeZone: "Africa/Kampala",
                            })}
                            {event.ends_at
                              ? ` – ${new Date(event.ends_at).toLocaleTimeString("en-GB", {
                                  hour: "2-digit",
                                  minute: "2-digit",
                                  timeZone: "Africa/Kampala",
                                })}`
                              : ""}
                          </p>
                        </div>
                        <span className="rounded-full border px-2.5 py-1 text-xs capitalize">
                          {event.event_type}
                        </span>
                      </div>
                    </summary>
                    <div className="mt-4 space-y-3 border-t pt-4 text-sm">
                      {event.description ? (
                        <p className="whitespace-pre-wrap leading-6">{event.description}</p>
                      ) : null}
                      {event.location ? (
                        <p className="flex items-start gap-2">
                          <MapPin aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                          <span><strong>Location:</strong> {event.location}</span>
                        </p>
                      ) : null}
                      {event.requirements ? (
                        <p className="flex items-start gap-2 whitespace-pre-wrap">
                          <ClipboardList aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                          <span><strong>Requirements:</strong> {event.requirements}</span>
                        </p>
                      ) : null}
                      {!event.description && !event.location && !event.requirements ? (
                        <p className="text-muted-foreground">No additional event details were provided.</p>
                      ) : null}
                    </div>
                  </details>
                ))}
              </div>
            ) : (
              <div className="rounded-xl border border-dashed p-8 text-center">
                <CalendarDays aria-hidden="true" className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
                <p className="font-medium">No upcoming events</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Staff-published events will appear here when scheduled.
                </p>
              </div>
            )}
          </section>
        )}

        {tab === "card" && (
          <section className={box}>
            <div className="no-print mb-4 flex flex-wrap items-center justify-between gap-3"><h2 className="font-display font-semibold">My official ID card</h2>
              <Button size="sm" disabled={!active} onClick={() => window.print()}>Download / print</Button></div>
            {active ? <AgentIdCard agent={me} photoUrl={me.photoUrl} signatureUrl={me.signatureUrl} /> : <p className="text-sm text-muted-foreground">Your card is unavailable while your account is {me.status} or expired.</p>}
          </section>
        )}

        {tab === "messages" && (
          <section className={box}>
            <AgentMessages />
            <h2 className="mb-3 font-display font-semibold">Messages from Kalexi</h2>
            {d.notices.length ? d.notices.map((n) => (
              <article key={n.id} className="border-b py-3 last:border-0"><p className="font-medium">{n.title}</p>
                <p className="whitespace-pre-wrap text-sm text-muted-foreground">{n.body}</p>
                <p className="mt-1 text-xs text-muted-foreground">{new Date(n.created_at).toLocaleDateString()}</p></article>
            )) : <p className="text-sm text-muted-foreground">No messages yet.</p>}
          </section>
        )}
      </main>
    </div>
  );
}
