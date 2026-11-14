import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { AppShell, PageHeader } from "@/components/AppShell";
import { MediaGallery } from "@/components/MediaGallery";
import { useSession, logAudit } from "@/hooks/useSession";
import { allows } from "@/lib/rbac";
import { NoAccess, Panel, Field, StatusPill } from "@/components/records";
import { formatDateTime, titleCase } from "@/lib/records";
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

export const Route = createFileRoute("/_authenticated/research/$caseId/")({
  head: () => ({
    meta: [
      { title: "Research Case — Kalexi Brokerage" },
      { name: "description", content: "Background research case file with sources and findings." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ResearchDetail,
});

interface Source {
  title: string;
  url: string;
  note: string;
}

const STATUSES = ["open", "in_progress", "completed", "closed"];

function ResearchDetail() {
  const { caseId } = useParams({ from: "/_authenticated/research/$caseId/" });
  const { data: session } = useSession();
  const access = session?.access;
  const qc = useQueryClient();
  const [findings, setFindings] = useState("");
  const [notes, setNotes] = useState("");
  const [src, setSrc] = useState<Source>({ title: "", url: "", note: "" });

  const record = useQuery({
    queryKey: ["research-case", caseId],
    enabled: allows(access, "research.view"),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("research_cases")
        .select("*")
        .eq("id", caseId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  useEffect(() => {
    if (record.data) {
      setFindings(record.data.findings ?? "");
      setNotes(record.data.notes ?? "");
    }
  }, [record.data]);

  const canEdit = allows(access, "research.edit");
  const sources = (record.data?.sources ?? []) as unknown as Source[];

  const save = useMutation({
    mutationFn: async (patch: Record<string, unknown>) => {
      const { error } = await supabase
        .from("research_cases")
        .update(patch as never)
        .eq("id", caseId);
      if (error) throw error;
      if (session) {
        await logAudit({
          actorId: session.userId,
          actorEmail: session.email,
          action: "research_case.updated",
          entityType: "research_cases",
          entityId: caseId,
          newValue: patch,
        });
      }
    },
    onSuccess: () => {
      toast.success("Research case updated.");
      qc.invalidateQueries({ queryKey: ["research-case", caseId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!allows(access, "research.view")) {
    return (
      <AppShell>
        <PageHeader title="Research case" />
        <NoAccess module="Research" />
      </AppShell>
    );
  }

  if (record.isLoading) {
    return (
      <AppShell>
        <p className="text-sm text-muted-foreground">Loading research case…</p>
      </AppShell>
    );
  }

  const r = record.data;
  if (!r) {
    return (
      <AppShell>
        <PageHeader title="Case not found" description="This research case is not available." />
        <Button asChild variant="outline">
          <Link to="/research">Back to research</Link>
        </Button>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <PageHeader
        title={r.subject}
        description={`${r.case_ref} · ${titleCase(r.status)}`}
        actions={
          <Button asChild variant="outline">
            <Link to="/research">Back to research</Link>
          </Button>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,340px)]">
        <div className="space-y-6">
          <Panel title="Case detail">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Reference">
                <span className="ref-mono">{r.case_ref}</span>
              </Field>
              <Field label="Status">
                <StatusPill value={r.status} />
              </Field>
              <Field label="Related party">{r.related_party ?? "—"}</Field>
              <Field label="Opened">{formatDateTime(r.created_at)}</Field>
              <Field label="Keywords">{(r.keywords ?? []).join(", ") || "—"}</Field>
              <Field label="Research question">{r.research_question ?? "—"}</Field>
            </div>
          </Panel>

          <Panel title="Findings">
            <Textarea
              rows={6}
              value={findings}
              disabled={!canEdit}
              onChange={(e) => setFindings(e.target.value)}
            />
            <Textarea
              rows={4}
              className="mt-3"
              placeholder="Internal notes"
              value={notes}
              disabled={!canEdit}
              onChange={(e) => setNotes(e.target.value)}
            />
            {canEdit ? (
              <Button className="mt-3" size="sm" onClick={() => save.mutate({ findings, notes })}>
                Save findings
              </Button>
            ) : null}
          </Panel>

          <Panel title="Sources">
            <ul className="space-y-2 text-sm">
              {sources.length === 0 ? (
                <li className="text-muted-foreground">No sources recorded.</li>
              ) : (
                sources.map((s, i) => (
                  <li key={`${s.url}-${i}`} className="rounded-md border p-3">
                    <p className="font-medium">{s.title || s.url}</p>
                    {s.url ? (
                      <a
                        href={s.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-primary underline"
                      >
                        {s.url}
                      </a>
                    ) : null}
                    {s.note ? (
                      <p className="mt-1 text-xs text-muted-foreground">{s.note}</p>
                    ) : null}
                    {canEdit ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="mt-1 h-6 px-1 text-[11px] text-destructive"
                        onClick={() =>
                          save.mutate({ sources: sources.filter((_, idx) => idx !== i) })
                        }
                      >
                        Remove
                      </Button>
                    ) : null}
                  </li>
                ))
              )}
            </ul>
            {canEdit ? (
              <div className="mt-3 grid gap-2 rounded-md border bg-muted/30 p-3 sm:grid-cols-3">
                <div className="space-y-1">
                  <Label className="text-xs">Title</Label>
                  <Input
                    value={src.title}
                    onChange={(e) => setSrc({ ...src, title: e.target.value })}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">URL</Label>
                  <Input value={src.url} onChange={(e) => setSrc({ ...src, url: e.target.value })} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Note</Label>
                  <Input
                    value={src.note}
                    onChange={(e) => setSrc({ ...src, note: e.target.value })}
                  />
                </div>
                <Button
                  size="sm"
                  className="sm:col-span-3"
                  disabled={!src.title.trim() && !src.url.trim()}
                  onClick={() => {
                    save.mutate({ sources: [...sources, src] });
                    setSrc({ title: "", url: "", note: "" });
                  }}
                >
                  Add source
                </Button>
              </div>
            ) : null}
          </Panel>

          <MediaGallery parentType="research_cases" parentId={caseId} title="Case media" />
        </div>

        <div className="space-y-4">
          <Panel title="Case status">
            <Select
              value={r.status}
              disabled={!canEdit}
              onValueChange={(v) => save.mutate({ status: v })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {titleCase(s)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Panel>
        </div>
      </div>
    </AppShell>
  );
}
