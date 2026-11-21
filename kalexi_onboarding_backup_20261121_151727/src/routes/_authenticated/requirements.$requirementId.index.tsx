import { createFileRoute, Link, useParams, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { AppShell, PageHeader } from "@/components/AppShell";
import { logAudit, useSession } from "@/hooks/useSession";
import { allows } from "@/lib/rbac";
import { CURRENCIES, SECTORS, archiveRecord, formatDate, formatDateTime, formatMoney, titleCase } from "@/lib/records";
import { Field, NoAccess, Panel, StatusPill } from "@/components/records";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/requirements/$requirementId/")({
  head: () => ({
    meta: [
      { title: "Requirement Detail — Kalexi Brokerage" },
      { name: "description", content: "Full detail of a client requirement and its matched opportunities." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: RequirementDetail,
});

function tokenize(text: string) {
  return new Set(
    text
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((w) => w.length > 3),
  );
}

function scoreOpportunity(
  req: { sector: string; title: string; description: string; budget_min: number | null; budget_max: number | null; location: string },
  opp: { sector: string; title: string; description: string | null; price: number | null; location: string | null },
) {
  let score = 0;
  const reasons: string[] = [];
  if (opp.sector === req.sector) {
    score += 40;
    reasons.push(`Sector match: ${opp.sector}`);
  }
  if (opp.price !== null && (req.budget_min !== null || req.budget_max !== null)) {
    const min = req.budget_min ?? 0;
    const max = req.budget_max ?? Number.POSITIVE_INFINITY;
    if (opp.price >= min && opp.price <= max) {
      score += 30;
      reasons.push("Price within client budget");
    }
  }
  if (req.location && opp.location && opp.location.toLowerCase().includes(req.location.toLowerCase())) {
    score += 20;
    reasons.push(`Location match: ${opp.location}`);
  }
  const reqTokens = tokenize(`${req.title} ${req.description}`);
  const oppTokens = tokenize(`${opp.title} ${opp.description ?? ""}`);
  let overlap = 0;
  for (const t of reqTokens) if (oppTokens.has(t)) overlap += 1;
  if (overlap > 0) {
    score += 10;
    reasons.push(`Keyword overlap (${overlap} term${overlap > 1 ? "s" : ""})`);
  }
  return { score, reasons };
}

function RequirementDetail() {
  const { requirementId } = useParams({ from: "/_authenticated/requirements/$requirementId/" });
  const { data: session } = useSession();
  const access = session?.access;
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});
  const f = (k: string): string => form[k] ?? "";

  const requirement = useQuery({
    queryKey: ["requirement", requirementId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("client_requirements")
        .select("*, clients(id, full_name, client_ref, phone, company_name)")
        .eq("id", requirementId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const matches = useQuery({
    queryKey: ["requirement-matches", requirementId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("opportunity_matches")
        .select("*, opportunities(id, opportunity_ref, title, sector, price, currency, location, verification_status)")
        .eq("requirement_id", requirementId)
        .is("archived_at", null)
        .order("score", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const startEdit = () => {
    if (!requirement.data) return;
    const r = requirement.data;
    setForm({
      sector: r.sector,
      title: r.title,
      description: r.description ?? "",
      budget_min: r.budget_min?.toString() ?? "",
      budget_max: r.budget_max?.toString() ?? "",
      currency: r.currency ?? "UGX",
      location: r.location ?? "",
      quantity: r.quantity ?? "",
      specifications: r.specifications ?? "",
      deadline: r.deadline ?? "",
      priority: r.priority ?? "medium",
      status: r.status ?? "open",
    });
    setEditing(true);
  };

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("client_requirements")
        .update({
          sector: f("sector"),
          title: f("title"),
          description: f("description") || null,
          budget_min: f("budget_min") ? Number(f("budget_min")) : null,
          budget_max: f("budget_max") ? Number(f("budget_max")) : null,
          currency: f("currency"),
          location: f("location") || null,
          quantity: f("quantity") || null,
          specifications: f("specifications") || null,
          deadline: f("deadline") || null,
          priority: f("priority"),
          status: f("status"),
        })
        .eq("id", requirementId);
      if (error) throw error;
      await logAudit({
        actorId: session!.userId,
        actorEmail: session!.email,
        action: "requirement.updated",
        entityType: "client_requirements",
        entityId: requirementId,
        newValue: form,
      });
    },
    onSuccess: () => {
      toast.success("Requirement updated");
      setEditing(false);
      queryClient.invalidateQueries({ queryKey: ["requirement", requirementId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const rerun = useMutation({
    mutationFn: async () => {
      const r = requirement.data;
      if (!r) throw new Error("Requirement not loaded");
      const { error: delError } = await supabase
        .from("opportunity_matches")
        .delete()
        .eq("requirement_id", requirementId)
        .eq("status", "pending");
      if (delError) throw delError;

      const { data: opportunities } = await supabase
        .from("opportunities")
        .select("id, sector, title, description, price, location")
        .is("archived_at", null)
        .eq("sector", r.sector);

      const computed = (opportunities ?? [])
        .map((opp) => {
          const { score, reasons } = scoreOpportunity(
            { sector: r.sector, title: r.title, description: r.description ?? "", budget_min: r.budget_min, budget_max: r.budget_max, location: r.location ?? "" },
            opp,
          );
          return { opp, score, reasons };
        })
        .filter((m) => m.score >= 40);

      if (computed.length > 0) {
        const { error } = await supabase.from("opportunity_matches").insert(
          computed.map((m) => ({
            requirement_id: requirementId,
            opportunity_id: m.opp.id,
            score: m.score,
            reasons: m.reasons,
            created_by: session!.userId,
          })),
        );
        if (error) throw error;
      }
      await logAudit({
        actorId: session!.userId,
        actorEmail: session!.email,
        action: "requirement.matches_rerun",
        entityType: "client_requirements",
        entityId: requirementId,
        newValue: { matches: computed.length },
      });
    },
    onSuccess: () => {
      toast.success("Matching re-run");
      queryClient.invalidateQueries({ queryKey: ["requirement-matches", requirementId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const review = useMutation({
    mutationFn: async ({ matchId, status }: { matchId: string; status: "accepted" | "rejected" }) => {
      const { error } = await supabase
        .from("opportunity_matches")
        .update({ status, reviewed_by: session!.userId, reviewed_at: new Date().toISOString() })
        .eq("id", matchId);
      if (error) throw error;
      await logAudit({
        actorId: session!.userId,
        actorEmail: session!.email,
        action: `match.${status}`,
        entityType: "opportunity_matches",
        entityId: matchId,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["requirement-matches", requirementId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  async function onArchive() {
    if (!requirement.data) return;
    const reason = window.prompt(`Reason for archiving ${requirement.data.requirement_ref}?`);
    if (!reason) return;
    await archiveRecord({
      table: "client_requirements",
      id: requirementId,
      entityRef: requirement.data.requirement_ref,
      title: requirement.data.title,
      previousStatus: requirement.data.status,
      reason,
      actorId: session!.userId,
      actorEmail: session!.email,
    });
    toast.success("Requirement archived");
    navigate({ to: "/requirements" });
  }

  if (!allows(access, "requirements.view")) {
    return (
      <AppShell>
        <PageHeader title="Requirement" />
        <NoAccess module="Client Requirements" />
      </AppShell>
    );
  }

  if (requirement.isLoading) {
    return (
      <AppShell>
        <p className="text-sm text-muted-foreground">Loading requirement…</p>
      </AppShell>
    );
  }

  if (!requirement.data) {
    return (
      <AppShell>
        <PageHeader title="Record not found" description="This requirement is not available to you." />
        <Button asChild variant="outline">
          <Link to="/requirements">Back to requirements</Link>
        </Button>
      </AppShell>
    );
  }

  const r = requirement.data;

  return (
    <AppShell>
      <PageHeader
        title={r.title}
        description={`${r.requirement_ref} · ${r.sector}`}
        actions={
          <div className="flex gap-2">
            {allows(access, "requirements.edit") && !editing ? (
              <Button variant="outline" onClick={startEdit}>Edit</Button>
            ) : null}
            {allows(access, "requirements.archive") ? (
              <Button variant="outline" onClick={onArchive}>Archive</Button>
            ) : null}
          </div>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,420px)]">
        <Card className="shadow-[var(--shadow-panel)]">
          <CardContent className="p-6">
            {editing ? (
              <div className="space-y-5">
                <div className="grid gap-5 sm:grid-cols-2">
                  <Field label="Sector">
                    <Select value={f("sector")} onValueChange={(v) => setForm((f) => ({ ...f, sector: v }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {SECTORS.map((s) => (<SelectItem key={s} value={s}>{s}</SelectItem>))}
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field label="Priority">
                    <Select value={f("priority")} onValueChange={(v) => setForm((f) => ({ ...f, priority: v }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {["low", "medium", "high", "urgent"].map((p) => (<SelectItem key={p} value={p}>{p}</SelectItem>))}
                      </SelectContent>
                    </Select>
                  </Field>
                </div>
                <Field label="Title">
                  <Input value={f("title")} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} />
                </Field>
                <Field label="Description">
                  <Textarea rows={4} value={f("description")} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
                </Field>
                <div className="grid gap-5 sm:grid-cols-3">
                  <Field label="Budget min">
                    <Input type="number" value={f("budget_min")} onChange={(e) => setForm((f) => ({ ...f, budget_min: e.target.value }))} />
                  </Field>
                  <Field label="Budget max">
                    <Input type="number" value={f("budget_max")} onChange={(e) => setForm((f) => ({ ...f, budget_max: e.target.value }))} />
                  </Field>
                  <Field label="Currency">
                    <Select value={f("currency")} onValueChange={(v) => setForm((f) => ({ ...f, currency: v }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {CURRENCIES.map((c) => (<SelectItem key={c} value={c}>{c}</SelectItem>))}
                      </SelectContent>
                    </Select>
                  </Field>
                </div>
                <div className="grid gap-5 sm:grid-cols-2">
                  <Field label="Location">
                    <Input value={f("location")} onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))} />
                  </Field>
                  <Field label="Quantity">
                    <Input value={f("quantity")} onChange={(e) => setForm((f) => ({ ...f, quantity: e.target.value }))} />
                  </Field>
                </div>
                <Field label="Specifications">
                  <Textarea rows={3} value={f("specifications")} onChange={(e) => setForm((f) => ({ ...f, specifications: e.target.value }))} />
                </Field>
                <div className="grid gap-5 sm:grid-cols-2">
                  <Field label="Deadline">
                    <Input type="date" value={f("deadline")} onChange={(e) => setForm((f) => ({ ...f, deadline: e.target.value }))} />
                  </Field>
                  <Field label="Status">
                    <Select value={f("status")} onValueChange={(v) => setForm((f) => ({ ...f, status: v }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {["open", "matched", "closed"].map((s) => (<SelectItem key={s} value={s}>{s}</SelectItem>))}
                      </SelectContent>
                    </Select>
                  </Field>
                </div>
                <div className="flex gap-3 pt-2">
                  <Button onClick={() => save.mutate()} disabled={save.isPending}>
                    {save.isPending ? "Saving…" : "Save changes"}
                  </Button>
                  <Button variant="outline" onClick={() => setEditing(false)}>Cancel</Button>
                </div>
              </div>
            ) : (
              <dl className="divide-y text-sm">
                {[
                  ["Reference", r.requirement_ref],
                  ["Client", r.clients ? `${r.clients.full_name} (${r.clients.client_ref})` : "—"],
                  ["Sector", r.sector],
                  ["Priority", titleCase(r.priority)],
                  ["Status", r.status],
                  ["Budget", `${formatMoney(r.budget_min, r.currency ?? "UGX")} – ${formatMoney(r.budget_max, r.currency ?? "UGX")}`],
                  ["Location", r.location ?? "—"],
                  ["Quantity", r.quantity ?? "—"],
                  ["Deadline", formatDate(r.deadline)],
                  ["Description", r.description ?? "—"],
                  ["Specifications", r.specifications ?? "—"],
                  ["Created", formatDateTime(r.created_at)],
                ].map(([k, v]) => (
                  <div key={k} className="flex gap-4 py-3">
                    <dt className="w-40 shrink-0 text-muted-foreground">{k}</dt>
                    <dd className={k === "Status" ? "" : "whitespace-pre-wrap"}>
                      {k === "Status" ? <StatusPill value={v as string} /> : v}
                    </dd>
                  </div>
                ))}
              </dl>
            )}
          </CardContent>
        </Card>

        <Panel
          title="Matched opportunities"
          actions={
            <Button size="sm" variant="outline" onClick={() => rerun.mutate()} disabled={rerun.isPending}>
              {rerun.isPending ? "Re-running…" : "Re-run matching"}
            </Button>
          }
        >
          {matches.isLoading ? (
            <p className="text-sm text-muted-foreground">Loading matches…</p>
          ) : matches.data && matches.data.length > 0 ? (
            <div className="space-y-3">
              {matches.data.map((m) => (
                <div key={m.id} className="rounded-md border p-3">
                  <div className="flex items-center justify-between gap-2">
                    <Link
                      to="/opportunities/$opportunityId"
                      params={{ opportunityId: m.opportunity_id }}
                      className="text-sm font-medium hover:underline"
                    >
                      {m.opportunities?.title ?? "Opportunity"}
                    </Link>
                    <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
                      {m.score}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {m.opportunities?.opportunity_ref} · {formatMoney(m.opportunities?.price, m.opportunities?.currency ?? "UGX")}
                  </p>
                  <ul className="mt-1.5 list-disc pl-4 text-xs text-muted-foreground">
                    {((m.reasons as string[]) ?? []).map((reason, i) => (<li key={i}>{reason}</li>))}
                  </ul>
                  <div className="mt-2 flex items-center justify-between">
                    <StatusPill value={m.status} />
                    {m.status === "pending" ? (
                      <div className="flex gap-2">
                        <Button size="sm" variant="outline" onClick={() => review.mutate({ matchId: m.id, status: "accepted" })}>
                          Accept
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => review.mutate({ matchId: m.id, status: "rejected" })}>
                          Reject
                        </Button>
                      </div>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No matching opportunities yet.</p>
          )}
        </Panel>
      </div>
    </AppShell>
  );
}
