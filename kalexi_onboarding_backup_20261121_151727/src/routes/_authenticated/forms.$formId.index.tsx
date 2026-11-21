import { createFileRoute, useParams } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { AppShell, PageHeader } from "@/components/AppShell";
import { useSession } from "@/hooks/useSession";
import { allows } from "@/lib/rbac";
import { EmptyState, Field, NoAccess, Panel, StatusPill } from "@/components/records";
import { archiveRecord, formatDate, formatDateTime, titleCase } from "@/lib/records";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useState } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { FormField } from "./forms.index";

export const Route = createFileRoute("/_authenticated/forms/$formId/")({
  head: () => ({
    meta: [
      { title: "Form Detail — Kalexi Brokerage" },
      {
        name: "description",
        content: "Review a generated form, its fields and collected submissions.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: FormDetail,
});

interface SubmissionRow {
  id: string;
  answers: Record<string, unknown>;
  submitted_by_name: string | null;
  submitted_internally: boolean;
  review_note: string | null;
  status: string;
  created_at: string;
}

function FormDetail() {
  const { formId } = useParams({ from: "/_authenticated/forms/$formId/" });
  const { data: session } = useSession();
  const access = session?.access;
  const qc = useQueryClient();

  const formQuery = useQuery({
    queryKey: ["form", formId],
    enabled: allows(access, "forms.view"),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("forms")
        .select("*")
        .eq("id", formId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const submissions = useQuery({
    queryKey: ["form-submissions", formId],
    enabled: allows(access, "forms.view"),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("form_submissions")
        .select("*")
        .eq("form_id", formId)
        .is("archived_at", null)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as SubmissionRow[];
    },
  });

  if (!allows(access, "forms.view")) {
    return (
      <AppShell>
        <PageHeader title="Form detail" />
        <NoAccess module="Forms" />
      </AppShell>
    );
  }

  if (formQuery.isLoading) {
    return (
      <AppShell>
        <p className="text-sm text-muted-foreground">Loading form…</p>
      </AppShell>
    );
  }

  const form = formQuery.data;
  if (!form) {
    return (
      <AppShell>
        <PageHeader title="Form not found" />
        <EmptyState title="This form does not exist or was removed." />
      </AppShell>
    );
  }

  const schema = (form.schema as unknown as FormField[]) ?? [];
  const link = `${window.location.origin}/f/${form.access_token}`;

  async function onArchive() {
    const reason = window.prompt(`Reason for archiving form ${form!.form_ref}?`);
    if (!reason || !session) return;
    try {
      await archiveRecord({
        table: "forms",
        id: form!.id,
        entityRef: form!.form_ref,
        title: form!.title,
        previousStatus: form!.status,
        reason,
        actorId: session.userId,
        actorEmail: session.email,
      });
      toast.success("Form archived");
      qc.invalidateQueries({ queryKey: ["form", formId] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to archive");
    }
  }

  return (
    <AppShell>
      <PageHeader
        title={form.title}
        description={form.purpose ?? ""}
        actions={
          allows(access, "forms.archive") && !form.archived_at ? (
            <Button variant="outline" onClick={onArchive}>
              Archive
            </Button>
          ) : null
        }
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-1">
          <Panel title="Overview">
            <div className="space-y-3">
              <Field label="Reference">{form.form_ref}</Field>
              <Field label="Target">{titleCase(form.target)}</Field>
              <Field label="Status">
                <StatusPill value={form.status} />
              </Field>
              <Field label="Expires">{formatDate(form.expires_at)}</Field>
              <Field label="Allow multiple">{form.allow_multiple ? "Yes" : "No"}</Field>
              <Field label="Opened">{formatDateTime(form.opened_at)}</Field>
              <Field label="Last submitted">{formatDateTime(form.submitted_at)}</Field>
            </div>
          </Panel>

          <Panel title="Share link">
            <div className="space-y-2">
              <p className="break-all rounded-md bg-muted px-3 py-2 text-xs">{link}</p>
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  navigator.clipboard.writeText(link).then(
                    () => toast.success("Link copied"),
                    () => toast.error("Could not copy link"),
                  )
                }
              >
                Copy link
              </Button>
            </div>
          </Panel>

          <Panel title="Fields">
            <ul className="space-y-2">
              {schema.map((f) => (
                <li key={f.key} className="rounded-md border px-3 py-2 text-sm">
                  <p className="font-medium">
                    {f.label} {f.required ? <span className="text-destructive">*</span> : null}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {f.key} · {titleCase(f.type)}
                    {f.options?.length ? ` · ${f.options.join(", ")}` : ""}
                  </p>
                </li>
              ))}
            </ul>
          </Panel>
        </div>

        <div className="lg:col-span-2">
          <Panel title="Submissions">
            {submissions.isLoading ? (
              <p className="text-sm text-muted-foreground">Loading submissions…</p>
            ) : submissions.data && submissions.data.length > 0 ? (
              <div className="space-y-3">
                {submissions.data.map((s) => (
                  <SubmissionCard key={s.id} submission={s} schema={schema} formId={formId} />
                ))}
              </div>
            ) : (
              <EmptyState
                title="No submissions yet"
                hint="Share the link above to start collecting responses."
              />
            )}
          </Panel>
        </div>
      </div>
    </AppShell>
  );
}

function SubmissionCard({
  submission,
  schema,
  formId,
}: {
  submission: SubmissionRow;
  schema: FormField[];
  formId: string;
}) {
  const qc = useQueryClient();
  const [note, setNote] = useState(submission.review_note ?? "");

  const update = useMutation({
    mutationFn: async ({ status, reviewNote }: { status?: string; reviewNote?: string }) => {
      const patch: { status?: string; review_note?: string } = {};
      if (status) patch.status = status;
      if (reviewNote !== undefined) patch.review_note = reviewNote;
      const { error } = await supabase
        .from("form_submissions")
        .update(patch)
        .eq("id", submission.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Submission updated");
      qc.invalidateQueries({ queryKey: ["form-submissions", formId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="rounded-md border p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-medium">{submission.submitted_by_name ?? "Anonymous"}</p>
          <p className="text-xs text-muted-foreground">
            {formatDateTime(submission.created_at)} ·{" "}
            {submission.submitted_internally ? "Internal" : "Public"}
          </p>
        </div>
        <StatusPill value={submission.status} />
      </div>

      <dl className="mt-3 grid gap-2 sm:grid-cols-2">
        {schema.map((f) => (
          <div key={f.key}>
            <dt className="text-[11px] uppercase tracking-[0.1em] text-muted-foreground">
              {f.label}
            </dt>
            <dd className="text-sm">
              {f.type === "signature" &&
              typeof submission.answers?.[f.key] === "string" &&
              String(submission.answers[f.key]).startsWith("data:image/png;base64,") ? (
                <img
                  src={String(submission.answers[f.key])}
                  alt={`${f.label} on the submitted form`}
                  className="mt-1 h-20 max-w-64 rounded border bg-white object-contain"
                />
              ) : f.type === "checkbox" ? (
                submission.answers?.[f.key] === "true" ? (
                  "Accepted"
                ) : (
                  "Not accepted"
                )
              ) : (
                String(submission.answers?.[f.key] ?? "—")
              )}
            </dd>
          </div>
        ))}
      </dl>

      <SubmissionAttachments submissionId={submission.id} />

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Textarea
          className="min-h-[36px] flex-1"
          placeholder="Review note"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
        <Button size="sm" variant="outline" onClick={() => update.mutate({ reviewNote: note })}>
          Save note
        </Button>
        <Select value={submission.status} onValueChange={(v) => update.mutate({ status: v })}>
          <SelectTrigger className="h-9 w-36 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {["pending", "reviewed", "approved", "rejected"].map((s) => (
              <SelectItem key={s} value={s}>
                {titleCase(s)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}

/** Documents, photos and videos the client attached to their submission. */
function SubmissionAttachments({ submissionId }: { submissionId: string }) {
  const files = useQuery({
    queryKey: ["submission-files", submissionId],
    queryFn: async () => {
      const [{ data: docs }, { data: media }] = await Promise.all([
        supabase
          .from("documents")
          .select("id, title, storage_path, mime_type")
          .eq("parent_type", "form_submission")
          .eq("parent_id", submissionId)
          .is("archived_at", null),
        supabase
          .from("media")
          .select("id, caption, storage_path, media_type")
          .eq("parent_type", "form_submission")
          .eq("parent_id", submissionId)
          .is("archived_at", null),
      ]);
      return [
        ...((docs ?? []) as { id: string; title: string; storage_path: string }[]).map((d) => ({
          id: d.id,
          label: d.title,
          kind: "file" as const,
          path: d.storage_path,
        })),
        ...(
          (media ?? []) as {
            id: string;
            caption: string | null;
            storage_path: string;
            media_type: string;
          }[]
        ).map((m) => ({
          id: m.id,
          label: m.caption ?? "Attachment",
          kind: (m.media_type === "video" ? "video" : "image") as "video" | "image",
          path: m.storage_path,
        })),
      ];
    },
  });

  async function open(path: string) {
    const { data, error } = await supabase.storage.from("kalexi-vault").createSignedUrl(path, 600);
    if (error || !data) {
      toast.error("Could not open this attachment.");
      return;
    }
    window.open(data.signedUrl, "_blank", "noopener");
  }

  if (!files.data?.length) return null;

  return (
    <div className="mt-3 rounded-md border bg-muted/40 p-3">
      <p className="label-caps mb-2">Client attachments</p>
      <div className="flex flex-wrap gap-2">
        {files.data.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => open(f.path)}
            className="rounded-full border bg-card px-3 py-1 text-xs hover:border-primary/50"
          >
            {f.kind === "image" ? "🖼" : f.kind === "video" ? "🎬" : "📄"} {f.label}
          </button>
        ))}
      </div>
    </div>
  );
}
