import { createFileRoute, Link, useParams, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { MediaGallery } from "@/components/MediaGallery";
import { AppShell, PageHeader } from "@/components/AppShell";
import { logAudit, useSession } from "@/hooks/useSession";
import { allows } from "@/lib/rbac";
import { CURRENCIES, SECTORS, archiveRecord, formatDateTime, formatMoney, titleCase } from "@/lib/records";
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

export const Route = createFileRoute("/_authenticated/opportunities/$opportunityId/")({
  head: () => ({
    meta: [
      { title: "Opportunity Detail — Kalexi Brokerage" },
      { name: "description", content: "Full detail, verification status and matching requirements for an opportunity." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: OpportunityDetail,
});

const TYPES = ["supply", "demand", "sale", "lease", "investment", "service"];
const VERIFICATIONS = ["unverified", "in_review", "verified", "rejected"];

function OpportunityDetail() {
  const { opportunityId } = useParams({ from: "/_authenticated/opportunities/$opportunityId/" });
  const { data: session } = useSession();
  const access = session?.access;
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});
  const f = (k: string): string => form[k] ?? "";

  const opportunity = useQuery({
    queryKey: ["opportunity", opportunityId],
    queryFn: async () => {
      const { data, error } = await supabase.from("opportunities").select("*").eq("id", opportunityId).maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const matches = useQuery({
    queryKey: ["opportunity-matches", opportunityId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("opportunity_matches")
        .select("*, client_requirements(id, requirement_ref, title, client_id, clients(full_name))")
        .eq("opportunity_id", opportunityId)
        .is("archived_at", null)
        .order("score", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const startEdit = () => {
    if (!opportunity.data) return;
    const o = opportunity.data;
    setForm({
      sector: o.sector,
      opportunity_type: o.opportunity_type,
      title: o.title,
      description: o.description ?? "",
      owner_name: o.owner_name ?? "",
      owner_contact: o.owner_contact ?? "",
      source: o.source ?? "",
      location: o.location ?? "",
      price: o.price?.toString() ?? "",
      currency: o.currency ?? "UGX",
      quantity: o.quantity ?? "",
      availability: o.availability ?? "",
      requirements: o.requirements ?? "",
      notes: o.notes ?? "",
    });
    setEditing(true);
  };

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("opportunities")
        .update({
          sector: f("sector"),
          opportunity_type: f("opportunity_type"),
          title: f("title"),
          description: f("description") || null,
          owner_name: f("owner_name") || null,
          owner_contact: f("owner_contact") || null,
          source: f("source") || null,
          location: f("location") || null,
          price: f("price") ? Number(f("price")) : null,
          currency: f("currency"),
          quantity: f("quantity") || null,
          availability: f("availability") || null,
          requirements: f("requirements") || null,
          notes: f("notes") || null,
        })
        .eq("id", opportunityId);
      if (error) throw error;
      await logAudit({
        actorId: session!.userId,
        actorEmail: session!.email,
        action: "opportunity.updated",
        entityType: "opportunities",
        entityId: opportunityId,
        newValue: form,
      });
    },
    onSuccess: () => {
      toast.success("Opportunity updated");
      setEditing(false);
      queryClient.invalidateQueries({ queryKey: ["opportunity", opportunityId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const setVerification = useMutation({
    mutationFn: async (status: string) => {
      const { error } = await supabase.from("opportunities").update({ verification_status: status }).eq("id", opportunityId);
      if (error) throw error;
      await logAudit({
        actorId: session!.userId,
        actorEmail: session!.email,
        action: "opportunity.verification_updated",
        entityType: "opportunities",
        entityId: opportunityId,
        newValue: { verification_status: status },
      });
    },
    onSuccess: () => {
      toast.success("Verification status updated");
      queryClient.invalidateQueries({ queryKey: ["opportunity", opportunityId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  async function onArchive() {
    if (!opportunity.data) return;
    const reason = window.prompt(`Reason for archiving ${opportunity.data.opportunity_ref}?`);
    if (!reason) return;
    await archiveRecord({
      table: "opportunities",
      id: opportunityId,
      entityRef: opportunity.data.opportunity_ref,
      title: opportunity.data.title,
      previousStatus: opportunity.data.status,
      reason,
      actorId: session!.userId,
      actorEmail: session!.email,
    });
    toast.success("Opportunity archived");
    navigate({ to: "/opportunities" });
  }

  if (!allows(access, "opportunities.view")) {
    return (
      <AppShell>
        <PageHeader title="Opportunity" />
        <NoAccess module="Opportunities" />
      </AppShell>
    );
  }

  if (opportunity.isLoading) {
    return (
      <AppShell>
        <p className="text-sm text-muted-foreground">Loading opportunity…</p>
      </AppShell>
    );
  }

  if (!opportunity.data) {
    return (
      <AppShell>
        <PageHeader title="Record not found" description="This opportunity is not available to you." />
        <Button asChild variant="outline">
          <Link to="/opportunities">Back to opportunities</Link>
        </Button>
      </AppShell>
    );
  }

  const o = opportunity.data;
  const details = (o.sector_details ?? {}) as Record<string, unknown>;

  return (
    <AppShell>
      <PageHeader
        title={o.title}
        description={`${o.opportunity_ref} · ${o.sector} · ${titleCase(o.opportunity_type)}`}
        actions={
          <div className="flex gap-2">
            {allows(access, "opportunities.edit") && !editing ? (
              <Button variant="outline" onClick={startEdit}>Edit</Button>
            ) : null}
            {allows(access, "opportunities.archive") ? (
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
                  <Field label="Type">
                    <Select value={f("opportunity_type")} onValueChange={(v) => setForm((f) => ({ ...f, opportunity_type: v }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {TYPES.map((t) => (<SelectItem key={t} value={t}>{t}</SelectItem>))}
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
                <div className="grid gap-5 sm:grid-cols-2">
                  <Field label="Owner name">
                    <Input value={f("owner_name")} onChange={(e) => setForm((f) => ({ ...f, owner_name: e.target.value }))} />
                  </Field>
                  <Field label="Owner contact">
                    <Input value={f("owner_contact")} onChange={(e) => setForm((f) => ({ ...f, owner_contact: e.target.value }))} />
                  </Field>
                </div>
                <div className="grid gap-5 sm:grid-cols-2">
                  <Field label="Source">
                    <Input value={f("source")} onChange={(e) => setForm((f) => ({ ...f, source: e.target.value }))} />
                  </Field>
                  <Field label="Location">
                    <Input value={f("location")} onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))} />
                  </Field>
                </div>
                <div className="grid gap-5 sm:grid-cols-3">
                  <Field label="Price">
                    <Input type="number" value={f("price")} onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))} />
                  </Field>
                  <Field label="Currency">
                    <Select value={f("currency")} onValueChange={(v) => setForm((f) => ({ ...f, currency: v }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {CURRENCIES.map((c) => (<SelectItem key={c} value={c}>{c}</SelectItem>))}
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field label="Quantity">
                    <Input value={f("quantity")} onChange={(e) => setForm((f) => ({ ...f, quantity: e.target.value }))} />
                  </Field>
                </div>
                <Field label="Availability">
                  <Input value={f("availability")} onChange={(e) => setForm((f) => ({ ...f, availability: e.target.value }))} />
                </Field>
                <Field label="Requirements">
                  <Textarea rows={3} value={f("requirements")} onChange={(e) => setForm((f) => ({ ...f, requirements: e.target.value }))} />
                </Field>
                <Field label="Notes">
                  <Textarea rows={3} value={f("notes")} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />
                </Field>
                <div className="flex gap-3 pt-2">
                  <Button onClick={() => save.mutate()} disabled={save.isPending}>
                    {save.isPending ? "Saving…" : "Save changes"}
                  </Button>
                  <Button variant="outline" onClick={() => setEditing(false)}>Cancel</Button>
                </div>
              </div>
            ) : (
              <>
                <dl className="divide-y text-sm">
                  {[
                    ["Reference", o.opportunity_ref],
                    ["Sector", o.sector],
                    ["Type", titleCase(o.opportunity_type)],
                    ["Owner", o.owner_name ?? "—"],
                    ["Owner contact", o.owner_contact ?? "—"],
                    ["Source", o.source ?? "—"],
                    ["Location", o.location ?? "—"],
                    ["Price", formatMoney(o.price, o.currency ?? "UGX")],
                    ["Quantity", o.quantity ?? "—"],
                    ["Availability", o.availability ?? "—"],
                    ["Description", o.description ?? "—"],
                    ["Requirements", o.requirements ?? "—"],
                    ["Notes", o.notes ?? "—"],
                    ["Created", formatDateTime(o.created_at)],
                  ].map(([k, v]) => (
                    <div key={k} className="flex gap-4 py-3">
                      <dt className="w-40 shrink-0 text-muted-foreground">{k}</dt>
                      <dd className="whitespace-pre-wrap">{v}</dd>
                    </div>
                  ))}
                </dl>
                {Object.keys(details).length > 0 ? (
                  <div className="mt-4 rounded-md border p-4">
                    <p className="label-caps mb-2">Sector-specific details</p>
                    <dl className="grid gap-2 sm:grid-cols-2">
                      {Object.entries(details).map(([k, v]) => (
                        <div key={k} className="text-sm">
                          <dt className="text-xs uppercase tracking-wide text-muted-foreground">{titleCase(k)}</dt>
                          <dd>{String(v)}</dd>
                        </div>
                      ))}
                    </dl>
                  </div>
                ) : null}
              </>
            )}
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Panel title="Verification">
            <p className="mb-3"><StatusPill value={o.verification_status} /></p>
            {allows(access, "verification.edit") ? (
              <Select value={o.verification_status ?? "unverified"} onValueChange={(v) => setVerification.mutate(v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {VERIFICATIONS.map((v) => (<SelectItem key={v} value={v}>{titleCase(v)}</SelectItem>))}
                </SelectContent>
              </Select>
            ) : (
              <p className="text-xs text-muted-foreground">Only Verification Officers can change this status.</p>
            )}
          </Panel>

          <Panel title="Matching requirements">
            {matches.isLoading ? (
              <p className="text-sm text-muted-foreground">Loading matches…</p>
            ) : matches.data && matches.data.length > 0 ? (
              <div className="space-y-3">
                {matches.data.map((m) => (
                  <div key={m.id} className="rounded-md border p-3">
                    <div className="flex items-center justify-between gap-2">
                      <Link
                        to="/requirements/$requirementId"
                        params={{ requirementId: m.requirement_id }}
                        className="text-sm font-medium hover:underline"
                      >
                        {m.client_requirements?.title ?? "Requirement"}
                      </Link>
                      <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
                        {m.score}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {m.client_requirements?.requirement_ref} · {m.client_requirements?.clients?.full_name ?? "—"}
                    </p>
                    <div className="mt-2"><StatusPill value={m.status} /></div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No matching requirements yet.</p>
            )}
          </Panel>
        </div>
      </div>
      <div className="mt-6">
        <MediaGallery parentType="opportunities" parentId={opportunityId} title="Site photos & videos" />
      </div>

    </AppShell>
  );
}
