import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Check, Banknote, X } from "lucide-react";
import { toast } from "sonner";
import { AppShell, PageHeader } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { EmptyState, NoAccess, StatusPill } from "@/components/records";
import { useSession } from "@/hooks/useSession";
import { allows } from "@/lib/rbac";
import { supabase } from "@/integrations/supabase/client";
import { setRedemptionStatus } from "@/lib/agents.functions";
import {
  getAgentCommissionPayouts,
  processAgentCommissionPayout,
  type AgentCommissionPayoutRecord,
} from "@/lib/agent-commission.functions";

export const Route = createFileRoute("/_authenticated/agents/redemptions")({
  head: () => ({ meta: [{ title: "Agent Reward Payouts — Kalexi" }, { name: "description", content: "Review, approve and record agent token and commission payouts." }, { property: "og:title", content: "Agent Reward Payouts — Kalexi" }, { property: "og:description", content: "Kalexi agent token reward and commission payout requests." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }, { name: "robots", content: "noindex" }] }),
  component: RedemptionPage,
});
function RedemptionPage() {
  const { data: session } = useSession();
  const read = allows(session?.access, "agents.view"); const manage = allows(session?.access, "agents.manage");
  const [filter, setFilter] = useState("requested"); const [busy, setBusy] = useState<string | null>(null);
  const qc = useQueryClient(); const process = useServerFn(setRedemptionStatus);
  const processCommission = useServerFn(processAgentCommissionPayout);
  const q = useQuery({ queryKey: ["agent-redemptions"], enabled: read, queryFn: async () => {
    const { data, error } = await supabase.from("agent_redemptions").select("*, agents(full_name, agent_code, phone, application_id)").order("created_at", { ascending: false });
    if (error) throw error;
    const redemptionRows = data ?? [];
    const ids = redemptionRows.flatMap(r => r.agents?.application_id ? [r.agents.application_id] : []);
    const payments = ids.length ? await supabase.from("agent_applications").select("id,payment_method,payment_provider,payment_account_name,payment_account_number").in("id", ids) : null;
    if (payments?.error) throw payments.error;
    return redemptionRows.map(r => ({ ...r, payment: payments?.data?.find(p => p.id === r.agents?.application_id) }));
  } });
  const commissionPayouts = useQuery({
    queryKey: ["agent-commission-payouts"],
    enabled: read,
    queryFn: () => getAgentCommissionPayouts(),
  });
  async function action(id: string, status: "approved" | "paid" | "rejected") {
    if (!window.confirm(status === "paid" ? "Confirm this reward has been paid outside this system?" : `${status === "approved" ? "Approve" : "Reject"} this reward request?`)) return;
    setBusy(id);
    try { await process({ data: { id, status } }); toast.success(status === "paid" ? "Payment recorded" : "Request updated"); await qc.invalidateQueries({ queryKey: ["agent-redemptions"] }); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Could not update request"); }
    finally { setBusy(null); }
  }
  async function commissionAction(id: string, status: "approved" | "paid" | "rejected") {
    if (!window.confirm(status === "paid" ? "Confirm this commission payout has been paid outside this system?" : `${status === "approved" ? "Approve" : "Reject"} this commission payout request?`)) return;
    setBusy(`commission:${id}`);
    try {
      await processCommission({ data: { id, status } });
      toast.success(status === "paid" ? "Commission payment recorded" : "Commission payout updated");
      await qc.invalidateQueries({ queryKey: ["agent-commission-payouts"] });
      await qc.invalidateQueries({ queryKey: ["agent-commission-summary"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Commission payout could not be updated.");
    } finally {
      setBusy(null);
    }
  }
  const rows = (q.data ?? []).filter(r => filter === "all" || r.status === filter);
  const commissionRows = (commissionPayouts.data ?? []).filter((r: AgentCommissionPayoutRecord) => filter === "all" || r.status === filter);
  const payoutCount = (status: string) =>
    (q.data ?? []).filter((row) => row.status === status).length +
    (commissionPayouts.data ?? []).filter((row) => row.status === status).length;
  return <AppShell><PageHeader title="Agent reward payouts" description="Review token rewards and cleared-receipt commission payouts. Approval and recorded payment remain separate steps." />{!read ? <NoAccess module="Agent rewards" /> : <>
    <div className="no-print mb-5 flex flex-wrap gap-2">{["requested", "approved", "paid", "rejected", "all"].map(s => <Button key={s} size="sm" variant={s === filter ? "default" : "outline"} onClick={() => setFilter(s)} className="capitalize">{s} {s === "all" ? (q.data?.length ?? 0) + (commissionPayouts.data?.length ?? 0) : payoutCount(s)}</Button>)}</div>
    <h2 className="mb-3 font-display text-lg font-semibold">Token rewards</h2>
    {q.isPending ? <p>Loading requests…</p> : q.isError ? <div role="alert"><p className="text-destructive">Could not load requests.</p><Button onClick={() => q.refetch()}>Try again</Button></div> : !rows.length ? <EmptyState title="No token reward requests in this view" /> : <div className="space-y-3">{rows.map(r => <article key={r.id} className="rounded-lg border bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="font-semibold">{r.agents?.full_name ?? "Agent"}</h2><p className="text-xs text-muted-foreground">{r.agents?.agent_code} · {r.agents?.phone}</p></div><div className="text-right"><p className="font-display text-xl font-semibold">{r.currency} {Number(r.amount).toLocaleString()}</p><StatusPill value={r.status} /></div></div>
      <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4"><div><dt className="text-xs text-muted-foreground">Requested</dt><dd>{new Date(r.created_at).toLocaleString()}</dd></div><div><dt className="text-xs text-muted-foreground">Tokens redeemed</dt><dd>{r.tokens_used.toLocaleString()}</dd></div><div><dt className="text-xs text-muted-foreground">Payment destination</dt><dd>{r.payment ? `${r.payment.payment_provider ?? r.payment.payment_method} · ${r.payment.payment_account_number}` : "Confirm with agent"}</dd><dd className="text-xs text-muted-foreground">{r.payment?.payment_account_name}</dd></div><div><dt className="text-xs text-muted-foreground">Processed</dt><dd>{r.processed_at ? new Date(r.processed_at).toLocaleString() : "Awaiting review"}</dd></div></dl>
      {manage && (r.status === "requested" || r.status === "approved") ? <div className="mt-4 flex flex-wrap gap-2 border-t pt-3"><Button disabled={busy === r.id} size="sm" onClick={() => action(r.id, r.status === "requested" ? "approved" : "paid")}>{r.status === "requested" ? <Check /> : <Banknote />}{r.status === "requested" ? "Approve reward" : "Record payment"}</Button><Button disabled={busy === r.id} variant="outline" size="sm" onClick={() => action(r.id, "rejected")}><X />Reject</Button></div> : null}
    </article>)}</div>}
    <section className="mt-8 border-t pt-6">
      <h2 className="mb-3 font-display text-lg font-semibold">Commission payout requests</h2>
      {commissionPayouts.isPending ? <p>Loading commission payouts…</p> : commissionPayouts.isError ? (
        <div role="alert" className="space-y-2">
          <p className="text-destructive">Could not load commission payout requests.</p>
          <Button onClick={() => void commissionPayouts.refetch()}>Try again</Button>
        </div>
      ) : !commissionRows.length ? <EmptyState title="No commission payout requests in this view" /> : (
        <div className="space-y-3">{commissionRows.map((r) => (
          <article key={r.id} className="rounded-lg border bg-card p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="font-semibold">{r.agents?.full_name ?? "Agent"}</h3>
                <p className="text-xs text-muted-foreground">{r.agents?.agent_code} · {r.agents?.phone}</p>
              </div>
              <div className="text-right">
                <p className="font-display text-xl font-semibold">{r.currency} {Number(r.amount).toLocaleString()}</p>
                <StatusPill value={r.status} />
              </div>
            </div>
            <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
              <div><dt className="text-xs text-muted-foreground">Requested</dt><dd>{new Date(r.created_at).toLocaleString()}</dd></div>
              <div><dt className="text-xs text-muted-foreground">Payment destination</dt><dd>{r.payment ? `${r.payment.payment_provider ?? r.payment.payment_method} · ${r.payment.payment_account_number}` : "Confirm with agent"}</dd><dd className="text-xs text-muted-foreground">{r.payment?.payment_account_name}</dd></div>
              <div><dt className="text-xs text-muted-foreground">Processed</dt><dd>{r.processed_at ? new Date(r.processed_at).toLocaleString() : "Awaiting review"}</dd></div>
            </dl>
            {manage && (r.status === "requested" || r.status === "approved") ? (
              <div className="mt-4 flex flex-wrap gap-2 border-t pt-3">
                <Button disabled={busy === `commission:${r.id}`} size="sm" onClick={() => void commissionAction(r.id, r.status === "requested" ? "approved" : "paid")}>
                  {r.status === "requested" ? <Check /> : <Banknote />}
                  {r.status === "requested" ? "Approve payout" : "Record payment"}
                </Button>
                <Button disabled={busy === `commission:${r.id}`} variant="outline" size="sm" onClick={() => void commissionAction(r.id, "rejected")}><X />Reject</Button>
              </div>
            ) : null}
          </article>
        ))}</div>
      )}
    </section>
  </>}</AppShell>;
}