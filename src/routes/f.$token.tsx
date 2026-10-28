import { createFileRoute, useParams } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { KalexiMark } from "@/components/KalexiMark";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { SignatureInput } from "@/components/SignatureInput";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  createPublicFormUpload,
  getPublicForm,
  submitPublicForm,
} from "@/lib/publicform.functions";

export const Route = createFileRoute("/f/$token")({
  head: () => ({
    meta: [
      { title: "Kalexi Brokerage — Secure Client Form" },
      {
        name: "description",
        content:
          "Complete this secure form issued by Kalexi Brokerage Ltd and attach any supporting documents, photos or videos.",
      },
      { property: "og:title", content: "Kalexi Brokerage — Secure Client Form" },
      {
        property: "og:description",
        content:
          "Complete this secure form issued by Kalexi Brokerage Ltd and attach any supporting documents, photos or videos.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: PublicFormPage,
});

interface Attachment {
  path: string;
  name: string;
  mimeType: string | null;
  sizeBytes: number | null;
  kind: "image" | "video" | "file";
}

function kindOf(file: File): Attachment["kind"] {
  if (file.type.startsWith("image/")) return "image";
  if (file.type.startsWith("video/")) return "video";
  return "file";
}

function PublicFormPage() {
  const { token } = useParams({ from: "/f/$token" });
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [name, setName] = useState("");
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const [submitted, setSubmitted] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const formQuery = useQuery({
    queryKey: ["public-form", token],
    queryFn: () => getPublicForm({ data: { token } }),
    retry: false,
  });

  const form = formQuery.data ?? null;
  const schema = form?.schema ?? [];
  const unavailable =
    formQuery.isError || (!formQuery.isLoading && (!form || form.expired || form.closed));

  async function handleFiles(files: FileList | null) {
    if (!files?.length) return;
    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        if (file.size > 100 * 1024 * 1024) {
          toast.error(`${file.name} is larger than 100MB.`);
          continue;
        }
        const slot = await createPublicFormUpload({
          data: { token, fileName: file.name },
        });
        const { error } = await supabase.storage
          .from(slot.bucket)
          .uploadToSignedUrl(slot.path, slot.uploadToken, file);
        if (error) throw new Error(error.message);
        setAttachments((prev) => [
          ...prev,
          {
            path: slot.path,
            name: file.name,
            mimeType: file.type || null,
            sizeBytes: file.size,
            kind: kindOf(file),
          },
        ]);
      }
      toast.success("Attachment uploaded.");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  const submit = useMutation({
    mutationFn: async () => {
      for (const f of schema) {
        if (f.required && !answers[f.key]?.trim()) throw new Error(`${f.label} is required`);
      }
      return submitPublicForm({
        data: {
          token,
          submittedByName: answers["full_name"]?.trim() || name.trim() || null,
          answers,
          attachments,
        },
      });
    },
    onSuccess: (res) => setSubmitted(res.formRef),
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background px-4 py-16">
      <div
        aria-hidden
        className="pointer-events-none absolute -top-40 left-1/2 h-96 w-[60rem] -translate-x-1/2 rounded-full bg-primary/15 blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-24 left-1/2 h-72 w-[46rem] -translate-x-1/2 rounded-full bg-primary/10 blur-3xl"
      />

      <div className="relative w-full max-w-xl rounded-xl border bg-card/95 p-8 shadow-[var(--shadow-panel)] backdrop-blur">
        <div className="flex items-center gap-3 border-b pb-5">
          <KalexiMark className="h-10 w-10" />
          <div>
            <p className="font-display text-base font-semibold tracking-tight">
              KALEXI BROKERAGE LTD
            </p>
            <p className="text-xs text-muted-foreground">
              {form?.target === "broker" ? "Broker agreement signing" : "Secure client form"}
            </p>
          </div>
        </div>

        <div className="pt-6">
          {formQuery.isLoading ? (
            <p className="text-sm text-muted-foreground">Loading form…</p>
          ) : submitted ? (
            <div>
              <p className="inline-flex rounded-full bg-success/15 px-3 py-1 text-xs font-medium text-success">
                Submitted
              </p>
              <p className="mt-4 text-sm">
                Thank you. Your response has been recorded under reference{" "}
                <span className="ref-mono font-medium">{submitted}</span>.
              </p>
            </div>
          ) : unavailable ? (
            <p className="text-sm text-muted-foreground">This form link is not available.</p>
          ) : (
            <div className="space-y-5">
              <div>
                <h1 className="font-display text-xl font-semibold">{form!.title}</h1>
                {form!.purpose ? (
                  <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">
                    {form!.purpose}
                  </p>
                ) : null}
              </div>

              {form!.target !== "broker" ? (
                <div className="space-y-2">
                  <Label>Your name</Label>
                  <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={140} />
                </div>
              ) : null}

              {schema.map((f) => (
                <div key={f.key} className="space-y-2">
                  {f.type === "checkbox" ? (
                    <label className="flex items-start gap-3 rounded-md border p-3">
                      <Checkbox
                        checked={answers[f.key] === "true"}
                        onCheckedChange={(checked) =>
                          setAnswers((prev) => ({
                            ...prev,
                            [f.key]: checked ? "true" : "",
                          }))
                        }
                      />
                      <span className="text-sm">
                        {f.label} {f.required ? <span className="text-destructive">*</span> : null}
                      </span>
                    </label>
                  ) : (
                    <Label>
                      {f.label} {f.required ? <span className="text-destructive">*</span> : null}
                    </Label>
                  )}
                  {f.type === "signature" ? (
                    <SignatureInput
                      label={f.label}
                      value={answers[f.key] ?? ""}
                      onChange={(value) => setAnswers((prev) => ({ ...prev, [f.key]: value }))}
                    />
                  ) : f.type === "checkbox" ? null : f.type === "textarea" ? (
                    <Textarea
                      value={answers[f.key] ?? ""}
                      onChange={(e) => setAnswers((prev) => ({ ...prev, [f.key]: e.target.value }))}
                    />
                  ) : f.type === "select" ? (
                    <Select
                      value={answers[f.key] ?? ""}
                      onValueChange={(v) => setAnswers((prev) => ({ ...prev, [f.key]: v }))}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select…" />
                      </SelectTrigger>
                      <SelectContent>
                        {(f.options ?? []).map((o) => (
                          <SelectItem key={o} value={o}>
                            {o}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Input
                      type={
                        f.type === "number"
                          ? "number"
                          : f.type === "date"
                            ? "date"
                            : f.type === "email"
                              ? "email"
                              : "text"
                      }
                      value={answers[f.key] ?? ""}
                      onChange={(e) => setAnswers((prev) => ({ ...prev, [f.key]: e.target.value }))}
                    />
                  )}
                </div>
              ))}

              <div className="space-y-3 rounded-lg border border-dashed p-4">
                <div>
                  <p className="text-sm font-medium">Supporting documents, photos &amp; videos</p>
                  <p className="text-xs text-muted-foreground">
                    Attach identification, title papers, site photos or short videos (up to 100MB
                    each).
                  </p>
                </div>
                <input
                  ref={fileRef}
                  type="file"
                  multiple
                  className="hidden"
                  accept="image/*,video/*,.pdf,.doc,.docx,.xls,.xlsx,.txt"
                  onChange={(e) => handleFiles(e.target.files)}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={uploading}
                  onClick={() => fileRef.current?.click()}
                >
                  {uploading ? "Uploading…" : "Choose files"}
                </Button>
                {attachments.length ? (
                  <ul className="space-y-1 text-xs">
                    {attachments.map((a) => (
                      <li
                        key={a.path}
                        className="flex items-center justify-between gap-3 rounded bg-muted px-2.5 py-1.5"
                      >
                        <span className="truncate">
                          {a.kind === "image" ? "🖼" : a.kind === "video" ? "🎬" : "📄"} {a.name}
                        </span>
                        <button
                          type="button"
                          className="text-muted-foreground underline"
                          onClick={() =>
                            setAttachments((prev) => prev.filter((x) => x.path !== a.path))
                          }
                        >
                          Remove
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>

              <Button
                className="w-full"
                disabled={submit.isPending || uploading}
                onClick={() => submit.mutate()}
              >
                {submit.isPending ? "Submitting…" : "Submit"}
              </Button>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
