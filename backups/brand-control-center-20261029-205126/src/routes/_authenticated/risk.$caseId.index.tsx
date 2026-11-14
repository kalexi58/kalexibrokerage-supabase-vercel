import { createFileRoute, useParams } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { AppShell, PageHeader } from "@/components/AppShell";
import { useSession, logAudit } from "@/hooks/useSession";
import { allows } from "@/lib/rbac";
import { EmptyState, Field, NoAccess, Panel, StatusPill } from "@/components/records";
import { archiveRecord, formatDateTime, titleCase } from "@/lib/records";
import { MediaGallery } from "@/components/MediaGallery";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/risk/$caseId/")({
  head: () => ({
    meta: [
      { title: "Risk Case File — Kalexi Brokerage" },
      { name: "description", content: "Full risk or investigation case file." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: RiskDetailPage,
});

const SEVERITIES = ["low", "medium", "high", "critical"];
const STATUSES = ["open", "in_progress", "closed", "escalated"];

function RiskDetailPage() {
  const { caseId } = useParams({ from: "/_authenticated/risk/$caseId/" });
  const { data: session } = useSession();
  const access = session?.access;
  const qc = useQueryClient();
  const [finding, setFinding] = useState<string | null>(null);
  const [resolution, setResolution] = useState<string | null>(null);

  const record = useQuery({
    queryKey: ["risk-case", caseId],
    enabled: allows(access, "risk.view"),
    queryFn: async () => {
      const { data, error } = await supabase.from("risk_cases").select("*").eq("id", caseId).maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const update = useMutation({
    mutationFn: async (patch: Record<string, unknown>) => {
      const { error } = await supabase.from("risk_cases").update(patch as never).eq("id", caseId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Case updated.");
      qc.invalidateQueries({ queryKey: ["risk-case", caseId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const closeCase = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("risk_cases")
        .update({ status: "closed", closed_at: new Date().toISOString() })
        .eq("id", caseId);
      if (error) throw error;
      if (session) {
        await logAudit({
          actorId: session.userId,
          actorEmail: session.email,
          action: "risk_case.closed",
          entityType: "risk_cases",
          entityId: caseId,
        });
      }
    },
    onSuccess: () => {
      toast.success("Case closed.");
      qc.invalidateQueries({ queryKey: ["risk-case", caseId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!allows(access, "risk.view")) {
    return (
      <AppShell>
        <PageHeader title="Risk case file" />
        <NoAccess module="Risk & Investigation" />
      </AppShell>
    );
  }

  if (record.isLoading) {
    return (
      <AppShell>
        <PageHeader title="Risk case file" />
        <p className="text-sm text-muted-foreground">Loading case…</p>
      </AppShell>
    );
  }

  const r = record.data;
  if (!r) {
    return (
      <AppShell>
        <PageHeader title="Risk case file" />
        <EmptyState title="Case not found" hint="It may have been archived." />
      </AppShell>
    );
  }

  const canEdit = allows(access, "risk.edit");

  return (
    <AppShell>
      <PageHeader
        title={r.subject_name}
        description={`${r.case_ref ?? "—"} · ${titleCase(r.case_kind)}`}
        actions={
          <div className="flex gap-2">
            {allows(access, "risk.close") && r.status !== "closed" ? (
              <Button variant="outline" disabled={closeCase.isPending} onClick={() => closeCase.mutate()}>
                Close case
              </Button>
            ) : null}
            {allows(access, "risk.archive") && !r.archived_at ? (
              <Button
                variant="outline"
                onClick={async () => {
                  const reason = window.prompt("Reason for archiving this case?");
                  if (!reason || !session) return;
                  try {
                    await archiveRecord({
                      table: "risk_cases",
                      id: caseId,
                      entityRef: r.case_ref,
                      title: r.subject_name,
                      previousStatus: r.status,
                      reason,
                      actorId: session.userId,
                      actorEmail: session.email,
                    });
                    toast.success("Case archived.");
                    qc.invalidateQueries({ queryKey: ["risk-case", caseId] });
                  } catch (e) {
                    toast.error((e as Error).message);
                  }
                }}
              >
                Archive
              </Button>
            ) : null}
          </div>
        }
      />

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <Panel title="Description">
            <p className="whitespace-pre-wrap text-sm text-muted-foreground">{r.description}</p>
            {r.allegation ? (
              <>
                <p className="mt-3 text-[11px] uppercase tracking-[0.12em] text-muted-foreground">Allegation</p>
                <p className="text-sm text-muted-foreground">{r.allegation}</p>
              </>
            ) : null}
          </Panel>

          <Panel title="Verified finding">
            <Textarea
              rows={4}
              disabled={!canEdit}
              value={finding ?? r.verified_finding ?? ""}
              onChange={(e) => setFinding(e.target.value)}
              placeholder="Record the verified finding…"
            />
            {canEdit ? (
              <Button className="mt-3" size="sm" onClick={() => update.mutate({ verified_finding: finding })}>
                Save finding
              </Button>
            ) : null}
          </Panel>

          <Panel title="Resolution">
            <Textarea
              rows={4}
              disabled={!canEdit}
              value={resolution ?? r.resolution ?? ""}
              onChange={(e) => setResolution(e.target.value)}
              placeholder="Record the resolution…"
            />
            {canEdit ? (
              <Button className="mt-3" size="sm" onClick={() => update.mutate({ resolution })}>
                Save resolution
              </Button>
            ) : null}
          </Panel>

          <MediaGallery parentType="risk_cases" parentId={caseId} />
        </div>

        <div className="space-y-5">
          <Panel
            title="Case summary"
            actions={
              canEdit ? (
                <Select value={r.severity} onValueChange={(v) => update.mutate({ severity: v })}>
                  <SelectTrigger className="h-8 w-32 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {SEVERITIES.map((s) => (<SelectItem key={s} value={s}>{titleCase(s)}</SelectItem>))}
                  </SelectContent>
                </Select>
              ) : null
            }
          >
            <div className="space-y-3">
              <Field label="Reference"><span className="ref-mono">{r.case_ref ?? "—"}</span></Field>
              <Field label="Kind">{titleCase(r.case_kind)}</Field>
              <Field label="Severity"><StatusPill value={r.severity} /></Field>
              <Field label="Status">
                {canEdit ? (
                  <Select value={r.status} onValueChange={(v) => update.mutate({ status: v })}>
                    <SelectTrigger className="h-8 w-36 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {STATUSES.map((s) => (<SelectItem key={s} value={s}>{titleCase(s)}</SelectItem>))}
                    </SelectContent>
                  </Select>
                ) : (
                  <StatusPill value={r.status} />
                )}
              </Field>
              <Field label="Company">{r.subject_company ?? "—"}</Field>
              <Field label="Phone">{r.subject_phone ?? "—"}</Field>
              <Field label="Email">{r.subject_email ?? "—"}</Field>
              <Field label="Identifier">{r.subject_identifier ?? "—"}</Field>
              <Field label="Source">{r.source ?? "—"}</Field>
              <Field label="Closed">{formatDateTime(r.closed_at)}</Field>
              <Field label="Opened">{formatDateTime(r.created_at)}</Field>
            </div>
          </Panel>
        </div>
      </div>
    </AppShell>
  );
}
