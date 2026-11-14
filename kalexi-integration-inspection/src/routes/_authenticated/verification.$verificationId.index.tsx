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

export const Route = createFileRoute("/_authenticated/verification/$verificationId/")({
  head: () => ({
    meta: [
      { title: "Verification Case — Kalexi Brokerage" },
      { name: "description", content: "Verification case file, checklist and findings." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: VerificationDetailPage,
});

const STATUSES = ["pending", "in_review", "verified", "rejected", "cleared"];
const ITEM_STATES = ["pass", "fail", "pending"];

function VerificationDetailPage() {
  const { verificationId } = useParams({ from: "/_authenticated/verification/$verificationId/" });
  const { data: session } = useSession();
  const access = session?.access;
  const qc = useQueryClient();
  const [findings, setFindings] = useState<string | null>(null);

  const record = useQuery({
    queryKey: ["verification", verificationId],
    enabled: allows(access, "verification.view"),
    queryFn: async () => {
      const { data, error } = await supabase.from("verifications").select("*").eq("id", verificationId).maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const items = useQuery({
    queryKey: ["verification-items", verificationId],
    enabled: allows(access, "verification.view"),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("verification_items")
        .select("*")
        .eq("verification_id", verificationId)
        .is("archived_at", null)
        .order("created_at");
      if (error) throw error;
      return data ?? [];
    },
  });

  const setStatus = useMutation({
    mutationFn: async (status: string) => {
      const patch: Record<string, unknown> = { status };
      if (["verified", "rejected", "cleared"].includes(status)) patch['decided_at'] = new Date().toISOString();
      const { error } = await supabase.from("verifications").update(patch as never).eq("id", verificationId);
      if (error) throw error;
      if (session) {
        await logAudit({
          actorId: session.userId,
          actorEmail: session.email,
          action: "verification.status_changed",
          entityType: "verifications",
          entityId: verificationId,
          newValue: { status },
        });
      }
    },
    onSuccess: () => {
      toast.success("Status updated.");
      qc.invalidateQueries({ queryKey: ["verification", verificationId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const saveFindings = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("verifications").update({ findings }).eq("id", verificationId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Findings saved.");
      qc.invalidateQueries({ queryKey: ["verification", verificationId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const setItemState = useMutation({
    mutationFn: async ({ id, state, comment }: { id: string; state: string; comment?: string | null }) => {
      const patch: Record<string, unknown> = { state };
      if (comment !== undefined) patch['comment'] = comment;
      const { error } = await supabase.from("verification_items").update(patch as never).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["verification-items", verificationId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!allows(access, "verification.view")) {
    return (
      <AppShell>
        <PageHeader title="Verification case" />
        <NoAccess module="Verification & Due Diligence" />
      </AppShell>
    );
  }

  if (record.isLoading) {
    return (
      <AppShell>
        <PageHeader title="Verification case" />
        <p className="text-sm text-muted-foreground">Loading case…</p>
      </AppShell>
    );
  }

  const r = record.data;
  if (!r) {
    return (
      <AppShell>
        <PageHeader title="Verification case" />
        <EmptyState title="Case not found" hint="It may have been archived." />
      </AppShell>
    );
  }

  const canEdit = allows(access, "verification.edit");
  const currentFindings = findings ?? r.findings ?? "";

  return (
    <AppShell>
      <PageHeader
        title={r.subject}
        description={`${r.case_ref} · ${titleCase(r.case_kind)}`}
        actions={
          allows(access, "verification.close") && !r.archived_at ? (
            <Button
              variant="outline"
              onClick={async () => {
                const reason = window.prompt("Reason for archiving this case?");
                if (!reason || !session) return;
                try {
                  await archiveRecord({
                    table: "verifications",
                    id: verificationId,
                    entityRef: r.case_ref,
                    title: r.subject,
                    previousStatus: r.status,
                    reason,
                    actorId: session.userId,
                    actorEmail: session.email,
                  });
                  toast.success("Case archived.");
                  qc.invalidateQueries({ queryKey: ["verification", verificationId] });
                } catch (e) {
                  toast.error((e as Error).message);
                }
              }}
            >
              Archive case
            </Button>
          ) : null
        }
      />

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <Panel
            title="Status"
            actions={
              canEdit ? (
                <Select value={r.status} onValueChange={(v) => setStatus.mutate(v)}>
                  <SelectTrigger className="h-8 w-40 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {STATUSES.map((s) => (<SelectItem key={s} value={s}>{titleCase(s)}</SelectItem>))}
                  </SelectContent>
                </Select>
              ) : (
                <StatusPill value={r.status} />
              )
            }
          >
            <p className="text-sm text-muted-foreground">{r.summary ?? "No summary recorded."}</p>
          </Panel>

          <Panel title="Findings">
            <Textarea
              rows={5}
              disabled={!canEdit}
              value={currentFindings}
              onChange={(e) => setFindings(e.target.value)}
              placeholder="Record verification findings…"
            />
            {canEdit ? (
              <Button
                className="mt-3"
                size="sm"
                disabled={saveFindings.isPending}
                onClick={() => saveFindings.mutate()}
              >
                Save findings
              </Button>
            ) : null}
          </Panel>

          <Panel title="Checklist">
            {canEdit ? <ChecklistForm verificationId={verificationId} /> : null}
            <div className="mt-4 space-y-2">
              {(items.data ?? []).length === 0 ? (
                <EmptyState title="No checklist items" />
              ) : (
                (items.data ?? []).map((item: any) => (
                  <div key={item.id} className="rounded-md border p-3">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium">{item.label}</p>
                        {item.requirement_note ? (
                          <p className="text-xs text-muted-foreground">{item.requirement_note}</p>
                        ) : null}
                      </div>
                      {canEdit ? (
                        <Select
                          value={item.state}
                          onValueChange={(v) => setItemState.mutate({ id: item.id, state: v })}
                        >
                          <SelectTrigger className="h-8 w-32 text-xs"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {ITEM_STATES.map((s) => (<SelectItem key={s} value={s}>{titleCase(s)}</SelectItem>))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <StatusPill value={item.state} />
                      )}
                    </div>
                    {canEdit ? (
                      <Input
                        className="mt-2 h-8 text-xs"
                        placeholder="Comment"
                        defaultValue={item.comment ?? ""}
                        onBlur={(e) => {
                          if (e.target.value !== (item.comment ?? "")) {
                            setItemState.mutate({ id: item.id, state: item.state, comment: e.target.value.trim() || null });
                          }
                        }}
                      />
                    ) : item.comment ? (
                      <p className="mt-2 text-xs text-muted-foreground">{item.comment}</p>
                    ) : null}
                  </div>
                ))
              )}
            </div>
          </Panel>

          <MediaGallery parentType="verifications" parentId={verificationId} />
        </div>

        <div className="space-y-5">
          <Panel title="Case summary">
            <div className="space-y-3">
              <Field label="Reference"><span className="ref-mono">{r.case_ref}</span></Field>
              <Field label="Type">{titleCase(r.case_kind)}</Field>
              <Field label="Sector">{r.sector ?? "—"}</Field>
              <Field label="Status"><StatusPill value={r.status} /></Field>
              <Field label="Decided">{formatDateTime(r.decided_at)}</Field>
              <Field label="Opened">{formatDateTime(r.created_at)}</Field>
            </div>
          </Panel>
        </div>
      </div>
    </AppShell>
  );
}

function ChecklistForm({ verificationId }: { verificationId: string }) {
  const { data: session } = useSession();
  const qc = useQueryClient();
  const [label, setLabel] = useState("");
  const [note, setNote] = useState("");

  const add = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("verification_items").insert({
        verification_id: verificationId,
        label: label.trim(),
        requirement_note: note.trim() || null,
        state: "pending",
        status: "active",
        created_by: session?.userId ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setLabel("");
      setNote("");
      qc.invalidateQueries({ queryKey: ["verification-items", verificationId] });
      toast.success("Checklist item added.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="grid gap-3 rounded-md border bg-muted/30 p-3 sm:grid-cols-3">
      <div className="space-y-1 sm:col-span-1">
        <Label className="text-xs">Item label</Label>
        <Input value={label} onChange={(e) => setLabel(e.target.value)} />
      </div>
      <div className="space-y-1 sm:col-span-1">
        <Label className="text-xs">Requirement note</Label>
        <Input value={note} onChange={(e) => setNote(e.target.value)} />
      </div>
      <Button
        className="self-end"
        size="sm"
        disabled={label.trim().length < 2 || add.isPending}
        onClick={() => add.mutate()}
      >
        Add item
      </Button>
    </div>
  );
}
