import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { AppShell, PageHeader } from "@/components/AppShell";
import { useSession } from "@/hooks/useSession";
import { allows } from "@/lib/rbac";
import { EmptyState, NoAccess, StatusPill } from "@/components/records";
import { formatDate, formatDateTime, titleCase } from "@/lib/records";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/forms/")({
  head: () => ({
    meta: [
      { title: "Forms — Kalexi Brokerage" },
      {
        name: "description",
        content: "Generate and manage shareable intake forms for clients and prospects.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: FormsPage,
});

export interface FormField {
  key: string;
  label: string;
  type: "text" | "email" | "textarea" | "number" | "date" | "select" | "checkbox" | "signature";
  options?: string[];
  required?: boolean;
}

const BROKER_AGREEMENT_FIELDS: FormField[] = [
  { key: "full_name", label: "Broker's full legal name", type: "text", required: true },
  { key: "email", label: "Email address", type: "email", required: true },
  {
    key: "accept_agreement",
    label: "I have read and agree to this Broker Agreement",
    type: "checkbox",
    required: true,
  },
  { key: "signature", label: "Broker signature", type: "signature", required: true },
];

interface FormRow {
  id: string;
  form_ref: string;
  title: string;
  purpose: string | null;
  target: string;
  schema: FormField[];
  access_token: string;
  allow_multiple: boolean;
  expires_at: string | null;
  status: string;
  opened_at: string | null;
  submitted_at: string | null;
  created_at: string;
}

function FormsPage() {
  const { data: session } = useSession();
  const access = session?.access;
  const qc = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [createTarget, setCreateTarget] = useState("client");

  const forms = useQuery({
    queryKey: ["forms"],
    enabled: allows(access, "forms.view"),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("forms")
        .select("*")
        .is("archived_at", null)
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as unknown as FormRow[];
    },
  });

  if (!allows(access, "forms.view")) {
    return (
      <AppShell>
        <PageHeader title="Forms" />
        <NoAccess module="Forms" />
      </AppShell>
    );
  }

  const rows = forms.data ?? [];

  function copyLink(token: string) {
    const url = `${window.location.origin}/f/${token}`;
    navigator.clipboard.writeText(url).then(
      () => toast.success("Link copied to clipboard"),
      () => toast.error("Could not copy link"),
    );
  }

  return (
    <AppShell>
      <PageHeader
        title="Forms"
        description="Generate shareable client forms or broker agreement signing links, then review submissions here."
        actions={
          allows(access, "forms.create") ? (
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  setCreateTarget("broker");
                  setCreateOpen(true);
                }}
              >
                New broker signing link
              </Button>
              <Button
                onClick={() => {
                  setCreateTarget("client");
                  setCreateOpen(true);
                }}
              >
                New form
              </Button>
            </div>
          ) : null
        }
      />

      {forms.isLoading ? (
        <p className="text-sm text-muted-foreground">Loading forms…</p>
      ) : rows.length === 0 ? (
        <EmptyState
          title="No forms yet"
          hint="Create a form to start collecting information from clients."
        />
      ) : (
        <Card className="overflow-x-auto shadow-[var(--shadow-panel)]">
          <table className="w-full min-w-[860px] text-sm">
            <thead className="bg-muted/60 text-left">
              <tr>
                <th className="px-4 py-2.5 font-medium">Ref</th>
                <th className="px-4 py-2.5 font-medium">Title</th>
                <th className="px-4 py-2.5 font-medium">Target</th>
                <th className="px-4 py-2.5 font-medium">Expires</th>
                <th className="px-4 py-2.5 font-medium">Status</th>
                <th className="px-4 py-2.5 font-medium">Link</th>
                <th className="px-4 py-2.5 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((f) => (
                <tr key={f.id} className="border-t hover:bg-muted/40">
                  <td className="px-4 py-2.5">
                    <Link
                      to="/forms/$formId"
                      params={{ formId: f.id }}
                      className="ref-mono text-xs font-medium underline-offset-2 hover:underline"
                    >
                      {f.form_ref}
                    </Link>
                  </td>
                  <td className="px-4 py-2.5">{f.title}</td>
                  <td className="px-4 py-2.5">{titleCase(f.target)}</td>
                  <td className="px-4 py-2.5 text-muted-foreground">{formatDate(f.expires_at)}</td>
                  <td className="px-4 py-2.5">
                    <StatusPill value={f.status} />
                  </td>
                  <td className="px-4 py-2.5">
                    <Button size="sm" variant="outline" onClick={() => copyLink(f.access_token)}>
                      Copy link
                    </Button>
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <Button asChild size="sm" variant="ghost">
                      <Link to="/forms/$formId" params={{ formId: f.id }}>
                        Open
                      </Link>
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      <CreateFormDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        defaultTarget={createTarget}
        onDone={() => {
          setCreateOpen(false);
          qc.invalidateQueries({ queryKey: ["forms"] });
        }}
      />
    </AppShell>
  );
}

function CreateFormDialog({
  open,
  onOpenChange,
  defaultTarget,
  onDone,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  defaultTarget: string;
  onDone: () => void;
}) {
  const { data: session } = useSession();
  const [title, setTitle] = useState("");
  const [purpose, setPurpose] = useState("");
  const [target, setTarget] = useState("client");
  const [allowMultiple, setAllowMultiple] = useState(false);
  const [expiresAt, setExpiresAt] = useState("");
  const [fields, setFields] = useState<FormField[]>([
    { key: "full_name", label: "Full name", type: "text", required: true },
  ]);

  useEffect(() => {
    if (!open) return;
    setTarget(defaultTarget);
    if (defaultTarget === "broker") {
      setTitle((current) => current || "Broker Agreement");
      setFields((current) =>
        current.length === 1 && current[0]?.key === "full_name" ? BROKER_AGREEMENT_FIELDS : current,
      );
      setAllowMultiple(false);
    }
  }, [defaultTarget, open]);

  function addField() {
    setFields((prev) => [...prev, { key: "", label: "", type: "text", required: false }]);
  }

  function updateField(i: number, patch: Partial<FormField>) {
    setFields((prev) => prev.map((f, idx) => (idx === i ? { ...f, ...patch } : f)));
  }

  function removeField(i: number) {
    setFields((prev) => prev.filter((_, idx) => idx !== i));
  }

  const create = useMutation({
    mutationFn: async () => {
      if (!session) throw new Error("No session");
      const cleanFields = fields
        .filter((f) => f.key.trim() && f.label.trim())
        .map((f) => ({
          key: f.key.trim(),
          label: f.label.trim(),
          type: f.type,
          required: !!f.required,
          ...(f.type === "select" ? { options: f.options ?? [] } : {}),
        }));
      if (cleanFields.length === 0) throw new Error("Add at least one valid field");
      if (target === "broker") {
        if (!purpose.trim())
          throw new Error("Add the broker agreement text before creating its signing link.");
        if (
          !cleanFields.some((field) => field.key === "full_name" && field.required) ||
          !cleanFields.some(
            (field) => field.key === "email" && field.type === "email" && field.required,
          ) ||
          !cleanFields.some((field) => field.type === "signature" && field.required) ||
          !cleanFields.some((field) => field.type === "checkbox" && field.required)
        ) {
          throw new Error(
            "A broker agreement needs a required acceptance checkbox and signature field.",
          );
        }
        if (allowMultiple) throw new Error("Broker agreement links can only be signed once.");
      }
      const token = crypto.randomUUID().replace(/-/g, "");
      const { error } = await supabase.from("forms").insert({
        title: title.trim(),
        purpose: purpose.trim() || null,
        target,
        schema: cleanFields as never,
        access_token: token,
        allow_multiple: allowMultiple,
        expires_at: expiresAt || null,
        created_by: session.userId,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(target === "broker" ? "Broker signing link created" : "Form created");
      setTitle("");
      setPurpose("");
      setFields([{ key: "full_name", label: "Full name", type: "text", required: true }]);
      setTarget("client");
      setAllowMultiple(false);
      onDone();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>New form</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>Title</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={140} />
          </div>
          <div>
            <Label>{target === "broker" ? "Broker agreement text" : "Purpose"}</Label>
            <Textarea
              value={purpose}
              onChange={(e) => setPurpose(e.target.value)}
              maxLength={target === "broker" ? 10_000 : 400}
              placeholder={
                target === "broker"
                  ? "Paste the complete agreement that the broker will review and sign."
                  : undefined
              }
            />
            {target === "broker" ? (
              <p className="mt-1 text-xs text-muted-foreground">
                This text appears above the required acceptance and signature fields.
              </p>
            ) : null}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Target</Label>
              <Select
                value={target}
                onValueChange={(value) => {
                  setTarget(value);
                  if (value === "broker") {
                    setTitle((current) => current || "Broker Agreement");
                    setPurpose((current) => current || "");
                    setFields((current) =>
                      current.length === 1 && current[0]?.key === "full_name"
                        ? BROKER_AGREEMENT_FIELDS
                        : current,
                    );
                    setAllowMultiple(false);
                  }
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="client">Client</SelectItem>
                  <SelectItem value="prospect">Prospect</SelectItem>
                  <SelectItem value="partner">Partner</SelectItem>
                  <SelectItem value="broker">Broker (agreement signing)</SelectItem>
                  <SelectItem value="internal">Internal</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Expires at</Label>
              <Input type="date" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Checkbox
              checked={allowMultiple}
              disabled={target === "broker"}
              onCheckedChange={(v) => setAllowMultiple(!!v)}
            />
            <Label className="font-normal">
              {target === "broker"
                ? "Broker agreements can only be signed once"
                : "Allow multiple submissions"}
            </Label>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Fields</Label>
              <Button type="button" size="sm" variant="outline" onClick={addField}>
                Add field
              </Button>
            </div>
            <div className="space-y-3">
              {fields.map((f, i) => (
                <div key={i} className="rounded-md border p-3">
                  <div className="grid grid-cols-12 gap-2">
                    <Input
                      className="col-span-4"
                      placeholder="key"
                      value={f.key}
                      onChange={(e) => updateField(i, { key: e.target.value.replace(/\s+/g, "_") })}
                    />
                    <Input
                      className="col-span-4"
                      placeholder="Label"
                      value={f.label}
                      onChange={(e) => updateField(i, { label: e.target.value })}
                    />
                    <Select
                      value={f.type}
                      onValueChange={(v) => updateField(i, { type: v as FormField["type"] })}
                    >
                      <SelectTrigger className="col-span-3">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="text">Text</SelectItem>
                        <SelectItem value="email">Email</SelectItem>
                        <SelectItem value="textarea">Textarea</SelectItem>
                        <SelectItem value="number">Number</SelectItem>
                        <SelectItem value="date">Date</SelectItem>
                        <SelectItem value="select">Select</SelectItem>
                        <SelectItem value="checkbox">Agreement checkbox</SelectItem>
                        <SelectItem value="signature">Signature</SelectItem>
                      </SelectContent>
                    </Select>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="col-span-1"
                      onClick={() => removeField(i)}
                    >
                      ✕
                    </Button>
                  </div>
                  {f.type === "select" ? (
                    <Input
                      className="mt-2"
                      placeholder="Options, comma separated"
                      value={(f.options ?? []).join(", ")}
                      onChange={(e) =>
                        updateField(i, {
                          options: e.target.value
                            .split(",")
                            .map((o) => o.trim())
                            .filter(Boolean),
                        })
                      }
                    />
                  ) : null}
                  <div className="mt-2 flex items-center gap-2">
                    <Checkbox
                      checked={!!f.required}
                      onCheckedChange={(v) => updateField(i, { required: !!v })}
                    />
                    <Label className="font-normal text-xs">Required</Label>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={!title.trim() || create.isPending} onClick={() => create.mutate()}>
            {create.isPending ? "Creating…" : "Create form"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
