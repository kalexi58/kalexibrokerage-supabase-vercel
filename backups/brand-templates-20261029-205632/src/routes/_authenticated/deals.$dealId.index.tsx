import { createFileRoute, useParams } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { MediaGallery } from "@/components/MediaGallery";
import { AppShell, PageHeader } from "@/components/AppShell";
import { useSession, logAudit } from "@/hooks/useSession";
import { allows } from "@/lib/rbac";
import { EmptyState, Field, NoAccess, Panel, StatusPill } from "@/components/records";
import {
  CURRENCIES,
  DEAL_STAGES,
  DEAL_STAGE_LABEL,
  archiveRecord,
  formatDate,
  formatDateTime,
  formatMoney,
  titleCase,
  type DealStage,
} from "@/lib/records";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/deals/$dealId/")({
  head: () => ({
    meta: [
      { title: "Deal File — Kalexi Brokerage" },
      { name: "description", content: "Deal file: stage, parties, offers, negotiation log." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: DealDetailPage,
});

const ENTRY_TYPES = ["call", "meeting", "counter_offer", "concession", "agreement", "note"];

function DealDetailPage() {
  const { dealId } = useParams({ from: "/_authenticated/deals/$dealId/" });
  const { data: session } = useSession();
  const access = session?.access;
  const qc = useQueryClient();

  const deal = useQuery({
    queryKey: ["deal", dealId],
    enabled: allows(access, "deals.view"),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("deals")
        .select("*, clients(full_name, client_ref, phone)")
        .eq("id", dealId)
        .maybeSingle();
      if (error) throw error;
      return data as never as (Record<string, any> & { clients: any }) | null;
    },
  });

  const parties = useQuery({
    queryKey: ["deal-parties", dealId],
    enabled: allows(access, "deals.view"),
    queryFn: async () => {
      const { data } = await supabase
        .from("deal_parties")
        .select("*")
        .eq("deal_id", dealId)
        .is("archived_at", null)
        .order("created_at");
      return data ?? [];
    },
  });

  const offers = useQuery({
    queryKey: ["deal-offers", dealId],
    enabled: allows(access, "deals.view"),
    queryFn: async () => {
      const { data } = await supabase
        .from("offers")
        .select("*")
        .eq("deal_id", dealId)
        .is("archived_at", null)
        .order("offered_at", { ascending: false });
      return data ?? [];
    },
  });

  const negotiations = useQuery({
    queryKey: ["deal-negotiations", dealId],
    enabled: allows(access, "deals.view"),
    queryFn: async () => {
      const { data } = await supabase
        .from("negotiations")
        .select("*")
        .eq("deal_id", dealId)
        .is("archived_at", null)
        .order("occurred_at", { ascending: false });
      return data ?? [];
    },
  });

  const setStage = useMutation({
    mutationFn: async (stage: DealStage) => {
      const patch: Record<string, unknown> = { stage };
      if (stage === "closed") patch['closed_at'] = new Date().toISOString();
      const { error } = await supabase.from("deals").update(patch as never).eq("id", dealId);
      if (error) throw error;
      if (session) {
        await logAudit({
          actorId: session.userId,
          actorEmail: session.email,
          action: "deal.stage_changed",
          entityType: "deals",
          entityId: dealId,
          newValue: { stage },
        });
      }
    },
    onSuccess: () => {
      toast.success("Deal stage updated.");
      qc.invalidateQueries({ queryKey: ["deal", dealId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!allows(access, "deals.view")) {
    return (
      <AppShell>
        <PageHeader title="Deal file" />
        <NoAccess module="Deals" />
      </AppShell>
    );
  }

  if (deal.isLoading) {
    return (
      <AppShell>
        <PageHeader title="Deal file" />
        <p className="text-sm text-muted-foreground">Loading deal…</p>
      </AppShell>
    );
  }

  const d = deal.data;
  if (!d) {
    return (
      <AppShell>
        <PageHeader title="Deal file" />
        <EmptyState title="Deal not found" hint="It may have been archived." />
      </AppShell>
    );
  }

  const canEdit = allows(access, "deals.edit");

  return (
    <AppShell>
      <PageHeader
        title={d['title']}
        description={`${d['deal_ref']} · ${d['sector']}`}
        actions={
          allows(access, "deals.archive") && !d['archived_at'] ? (
            <Button
              variant="outline"
              onClick={async () => {
                const reason = window.prompt("Reason for archiving this deal?");
                if (!reason || !session) return;
                try {
                  await archiveRecord({
                    table: "deals",
                    id: dealId,
                    entityRef: d['deal_ref'],
                    title: d['title'],
                    previousStatus: d['status'],
                    reason,
                    actorId: session.userId,
                    actorEmail: session.email,
                  });
                  toast.success("Deal archived.");
                  qc.invalidateQueries({ queryKey: ["deal", dealId] });
                } catch (e) {
                  toast.error((e as Error).message);
                }
              }}
            >
              Archive deal
            </Button>
          ) : null
        }
      />

      <div className="mb-5 overflow-x-auto rounded-lg border bg-card p-4">
        <div className="flex min-w-max items-center gap-1">
          {DEAL_STAGES.filter((s) => s !== "archived").map((stage) => {
            const active = d['stage'] === stage;
            return (
              <button
                key={stage}
                disabled={!canEdit || setStage.isPending}
                onClick={() => setStage.mutate(stage)}
                className={`rounded-md px-3 py-1.5 text-xs transition-colors ${
                  active
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground hover:bg-muted/70"
                } ${canEdit ? "" : "cursor-default"}`}
              >
                {DEAL_STAGE_LABEL[stage as DealStage]}
              </button>
            );
          })}
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <Panel title="Offers">
            {canEdit ? <OfferForm dealId={dealId} currency={d['currency']} /> : null}
            <div className="mt-4 space-y-2">
              {(offers.data ?? []).length === 0 ? (
                <EmptyState title="No offers recorded" />
              ) : (
                (offers.data ?? []).map((o: any) => (
                  <div key={o.id} className="flex items-center justify-between rounded-md border p-3">
                    <div>
                      <p className="text-sm font-medium">
                        {formatMoney(o.amount, o.currency)} · {titleCase(o.offered_by)}
                      </p>
                      <p className="text-xs text-muted-foreground">{o.terms ?? "No terms noted"}</p>
                    </div>
                    <div className="text-right">
                      <StatusPill value={o.status} />
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        {formatDateTime(o.offered_at)}
                      </p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </Panel>

          <Panel title="Negotiation log">
            {canEdit ? <NegotiationForm dealId={dealId} /> : null}
            <div className="mt-4 space-y-2">
              {(negotiations.data ?? []).length === 0 ? (
                <EmptyState title="No negotiation entries" />
              ) : (
                (negotiations.data ?? []).map((n: any) => (
                  <div key={n.id} className="rounded-md border p-3">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium">{n.summary}</p>
                      <span className="text-[11px] text-muted-foreground">
                        {formatDateTime(n.occurred_at)}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {titleCase(n.entry_type)}
                      {n.detail ? ` — ${n.detail}` : ""}
                    </p>
                  </div>
                ))
              )}
            </div>
          </Panel>

          <Panel title="Parties">
            {canEdit ? <PartyForm dealId={dealId} /> : null}
            <div className="mt-4 space-y-2">
              {(parties.data ?? []).length === 0 ? (
                <EmptyState title="No parties recorded" />
              ) : (
                (parties.data ?? []).map((p: any) => (
                  <div key={p.id} className="flex items-center justify-between rounded-md border p-3">
                    <div>
                      <p className="text-sm font-medium">{p.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {titleCase(p.party_role)}
                        {p.contact ? ` · ${p.contact}` : ""}
                      </p>
                    </div>
                    <StatusPill value={p.status} />
                  </div>
                ))
              )}
            </div>
          </Panel>
        </div>

        <div className="space-y-5">
          <Panel title="Deal summary">
            <div className="space-y-3">
              <Field label="Reference">
                <span className="ref-mono">{d['deal_ref']}</span>
              </Field>
              <Field label="Stage">
                <StatusPill value={d['stage']} />
              </Field>
              <Field label="Status">
                <StatusPill value={d['status']} />
              </Field>
              <Field label="Client">
                {d.clients ? `${d.clients.full_name} · ${d.clients.client_ref}` : "—"}
              </Field>
              <Field label="Value">{formatMoney(d['value'], d['currency'])}</Field>
              <Field label="Commission rate">
                {d['commission_rate'] ? `${d['commission_rate']}%` : "—"}
              </Field>
              <Field label="Expected close">{formatDate(d['expected_close'])}</Field>
              <Field label="Closed">{formatDateTime(d['closed_at'])}</Field>
              <Field label="Opened">{formatDateTime(d['created_at'])}</Field>
            </div>
          </Panel>

          <Panel title="Notes">
            <p className="whitespace-pre-wrap text-sm text-muted-foreground">
              {d['notes'] ?? "No internal notes recorded."}
            </p>
          </Panel>
        </div>
      </div>
      <div className="mt-6">
        <MediaGallery parentType="deals" parentId={dealId} title="Deal photos & videos" />
      </div>

    </AppShell>
  );
}

function OfferForm({ dealId, currency }: { dealId: string; currency: string }) {
  const { data: session } = useSession();
  const qc = useQueryClient();
  const [amount, setAmount] = useState("");
  const [cur, setCur] = useState(currency);
  const [offeredBy, setOfferedBy] = useState("buyer");
  const [terms, setTerms] = useState("");

  const add = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("offers").insert({
        deal_id: dealId,
        offered_by: offeredBy,
        amount: Number(amount),
        currency: cur,
        terms: terms.trim() || null,
        status: "pending",
        created_by: session?.userId ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setAmount("");
      setTerms("");
      qc.invalidateQueries({ queryKey: ["deal-offers", dealId] });
      toast.success("Offer recorded.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="grid gap-3 rounded-md border bg-muted/30 p-3 sm:grid-cols-4">
      <div className="space-y-1">
        <Label className="text-xs">Amount</Label>
        <Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} />
      </div>
      <div className="space-y-1">
        <Label className="text-xs">Currency</Label>
        <Select value={cur} onValueChange={setCur}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {CURRENCIES.map((c) => (
              <SelectItem key={c} value={c}>
                {c}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1">
        <Label className="text-xs">Offered by</Label>
        <Select value={offeredBy} onValueChange={setOfferedBy}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {["buyer", "seller", "broker"].map((v) => (
              <SelectItem key={v} value={v}>
                {titleCase(v)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1">
        <Label className="text-xs">Terms</Label>
        <Input value={terms} onChange={(e) => setTerms(e.target.value)} />
      </div>
      <Button
        className="sm:col-span-4"
        size="sm"
        disabled={!amount || add.isPending}
        onClick={() => add.mutate()}
      >
        Record offer
      </Button>
    </div>
  );
}

function NegotiationForm({ dealId }: { dealId: string }) {
  const { data: session } = useSession();
  const qc = useQueryClient();
  const [entryType, setEntryType] = useState("note");
  const [summary, setSummary] = useState("");
  const [detail, setDetail] = useState("");

  const add = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("negotiations").insert({
        deal_id: dealId,
        entry_type: entryType,
        summary: summary.trim(),
        detail: detail.trim() || null,
        status: "active",
        created_by: session?.userId ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setSummary("");
      setDetail("");
      qc.invalidateQueries({ queryKey: ["deal-negotiations", dealId] });
      toast.success("Entry logged.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-3 rounded-md border bg-muted/30 p-3">
      <div className="grid gap-3 sm:grid-cols-[180px_1fr]">
        <div className="space-y-1">
          <Label className="text-xs">Entry type</Label>
          <Select value={entryType} onValueChange={setEntryType}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ENTRY_TYPES.map((t) => (
                <SelectItem key={t} value={t}>
                  {titleCase(t)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Summary</Label>
          <Input value={summary} onChange={(e) => setSummary(e.target.value)} />
        </div>
      </div>
      <Textarea
        rows={2}
        placeholder="Detail (optional)"
        value={detail}
        onChange={(e) => setDetail(e.target.value)}
      />
      <Button size="sm" disabled={summary.trim().length < 3 || add.isPending} onClick={() => add.mutate()}>
        Log entry
      </Button>
    </div>
  );
}

function PartyForm({ dealId }: { dealId: string }) {
  const { data: session } = useSession();
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [role, setRole] = useState("buyer");
  const [contact, setContact] = useState("");

  const add = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("deal_parties").insert({
        deal_id: dealId,
        party_role: role,
        name: name.trim(),
        contact: contact.trim() || null,
        status: "active",
        created_by: session?.userId ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setName("");
      setContact("");
      qc.invalidateQueries({ queryKey: ["deal-parties", dealId] });
      toast.success("Party added.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="grid gap-3 rounded-md border bg-muted/30 p-3 sm:grid-cols-4">
      <div className="space-y-1 sm:col-span-2">
        <Label className="text-xs">Name</Label>
        <Input value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div className="space-y-1">
        <Label className="text-xs">Role</Label>
        <Select value={role} onValueChange={setRole}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {["buyer", "seller", "agent", "lawyer", "witness", "financier", "other"].map((v) => (
              <SelectItem key={v} value={v}>
                {titleCase(v)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1">
        <Label className="text-xs">Contact</Label>
        <Input value={contact} onChange={(e) => setContact(e.target.value)} />
      </div>
      <Button
        className="sm:col-span-4"
        size="sm"
        disabled={name.trim().length < 2 || add.isPending}
        onClick={() => add.mutate()}
      >
        Add party
      </Button>
    </div>
  );
}
