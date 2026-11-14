import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Area, AreaChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { getAgentDashboard, redeemAgentTokens } from "@/lib/agents.functions";
import { KalexiMark } from "@/components/KalexiMark";
import { StatusPill } from "@/components/records";
import { Button } from "@/components/ui/button";
import { AgentIdCard } from "@/components/AgentIdCard";
import { AgentMessages } from "@/components/AgentMessages";
import { validAgent } from "@/lib/agent-rules";

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

function AgentPortal() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["agent-dashboard"], queryFn: () => getAgentDashboard() });
  const [tab, setTab] = useState<"overview" | "clients" | "card" | "messages">("overview");
  async function signOut() { qc.clear(); await supabase.auth.signOut(); navigate({ to: "/", replace: true }); }
  const d = q.data;

  const header = (
    <header className="no-print flex items-center justify-between gap-3 bg-sidebar px-4 py-4 text-sidebar-foreground">
      <div className="flex items-center gap-3"><KalexiMark className="h-9 w-9" />
        <div className="min-w-0"><p className="font-display text-xs font-semibold sm:text-sm">KALEXI BROKERAGE LTD</p>
          <p className="text-[10px] uppercase tracking-[0.2em] text-sidebar-primary">Digital Agent Portal</p></div></div>
      <Button size="sm" variant="secondary" onClick={signOut}>Sign out</Button>
    </header>
  );
  const box = "min-w-0 border-t pt-5";

  if (q.isLoading) return <div className="min-h-screen bg-background">{header}<p className="p-8 text-sm text-muted-foreground">Loading…</p></div>;
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
    try { const r = await redeemAgentTokens(); toast.success(`Redemption of UGX ${r.amount.toLocaleString()} requested. Finance will contact you.`); qc.invalidateQueries({ queryKey: ["agent-dashboard"] }); }
    catch (e) { toast.error((e as Error).message); }
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
          {([["overview", "Overview"], ["clients", "My clients"], ["card", "ID card"], ["messages", `Messages (${d.notices.length})`]] as const).map(([k, l]) => (
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
                <p className="mt-1 text-xs text-muted-foreground">You earn a token for every client you refer. Collect enough to redeem a UGX 100,000 reward.</p>
                <p className="my-4 font-display text-5xl font-semibold text-primary">{tokens.available}</p>
                <div className="mb-5 border-l-4 border-success pl-4"><p className="text-xs text-muted-foreground">Approximate reward value</p><p className="text-2xl font-semibold text-success">UGX {tokens.approximateValue.toLocaleString()}</p><p className="mt-1 text-xs text-muted-foreground">Estimate only. Payment follows reward eligibility and company approval.</p></div>
                <Button className="w-full" disabled={!active || !tokens.canRedeem} onClick={redeem}>{tokens.canRedeem ? "Redeem UGX 100,000" : "Keep referring to unlock"}</Button>
                {d.redemptions.length ? (
                  <ul className="mt-4 divide-y text-sm">{d.redemptions.map((r) => (
                    <li key={r.id} className="flex justify-between py-2"><span>UGX {Number(r.amount).toLocaleString()}<br /><span className="text-xs text-muted-foreground">{new Date(r.created_at).toLocaleDateString()}</span></span><StatusPill value={r.status} /></li>
                  ))}</ul>
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
            <h2 className="mb-3 font-display font-semibold">My referred clients ({clients.length})</h2>
            {clients.length ? (
              <div className="record-scroll"><table className="w-full min-w-[600px] text-sm"><thead className="text-left text-xs text-muted-foreground"><tr><th className="py-2">Reference</th><th>Name</th><th>Sector</th><th>Registered</th><th>Progress</th></tr></thead>
                <tbody className="divide-y">{clients.map((c) => (
                  <tr key={c.id}><td className="py-2 font-mono text-xs">{c.client_ref}</td><td>{c.full_name}</td><td>{c.sector}</td><td>{new Date(c.created_at).toLocaleDateString()}</td><td><StatusPill value={c.status} /></td></tr>
                ))}</tbody></table></div>
            ) : <p className="text-sm text-muted-foreground">No referred clients yet — share your link to get started.</p>}
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
