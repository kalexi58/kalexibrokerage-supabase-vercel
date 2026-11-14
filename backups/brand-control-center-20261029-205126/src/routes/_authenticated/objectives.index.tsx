import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { AppShell, PageHeader } from "@/components/AppShell";
import { useSession, logAudit } from "@/hooks/useSession";
import { allows } from "@/lib/rbac";
import { EmptyState, NoAccess, StatusPill, Panel } from "@/components/records";
import { archiveRecord, formatDate, titleCase, CURRENCIES } from "@/lib/records";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/objectives/")({
  head: () => ({
    meta: [
      { title: "Company Objectives — Kalexi Brokerage" },
      {
        name: "description",
        content: "Departmental targets, key results and progress tracking across Kalexi Brokerage.",
      },
      { name: "robots", content: "noindex" },
      { property: "og:title", content: "Company Objectives — Kalexi Brokerage" },
      { property: "og:description", content: "Targets, key results and progress tracking." },
    ],
  }),
  component: ObjectivesPage,
});

const STATUSES = ["planned", "in_progress", "completed", "on_hold", "cancelled"];
const PRIORITIES = ["low", "medium", "high", "critical"];

interface ObjectiveRow {
  id: string;
  objective_ref: string;
  title: string;
  description: string | null;
  department: string | null;
  priority: string | null;
  budget: number | null;
  currency: string | null;
  progress: number | null;
  start_date: string | null;
  target_date: string | null;
  status: string;
  outcome: string | null;
  completed_at: string | null;
}

function ObjectivesPage() {
  const { data: session } = useSession();
  const access = session?.access;
  const qc = useQueryClient();
  const [status, setStatus] = useState("all");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    title: "",
    description: "",
    department: "",
    priority: "medium",
    budget: "",
    currency: "UGX",
    start_date: "",
    target_date: "",
  });

  const canView = allows(access, "objectives.view");
  const canCreate = allows(access, "objectives.create");
  const canEdit = allows(access, "objectives.edit");

  const objectives = useQuery({
    queryKey: ["objectives", status],
    enabled: canView,
    queryFn: async () => {
      let query = supabase
        .from("objectives")
        .select("*")
        .is("archived_at", null)
        .order("created_at", { ascending: false })
        .limit(200);
      if (status !== "all") query = query.eq("status", status);
      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as unknown as ObjectiveRow[];
    },
  });

  const create = useMutation({
    mutationFn: async () => {
      if (!session) throw new Error("No session.");
      const { error } = await supabase.from("objectives").insert({
        title: form.title.trim(),
        description: form.description.trim() || null,
        department: form.department.trim() || null,
        priority: form.priority,
        budget: form.budget ? Number(form.budget) : null,
        currency: form.currency,
        start_date: form.start_date || null,
        target_date: form.target_date || null,
        responsible_id: session.userId,
        status: "planned",
        progress: 0,
        created_by: session.userId,
      } as never);
      if (error) throw error;
      await logAudit({
        actorId: session.userId,
        actorEmail: session.email,
        action: "objective.created",
        entityType: "objectives",
        newValue: { title: form.title },
      });
    },
    onSuccess: () => {
      toast.success("Objective created.");
      setOpen(false);
      setForm({
        title: "",
        description: "",
        department: "",
        priority: "medium",
        budget: "",
        currency: "UGX",
        start_date: "",
        target_date: "",
      });
      qc.invalidateQueries({ queryKey: ["objectives"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const update = useMutation({
    mutationFn: async ({ row, patch }: { row: ObjectiveRow; patch: Record<string, unknown> }) => {
      if (!session) throw new Error("No session.");
      const { error } = await supabase
        .from("objectives")
        .update(patch as never)
        .eq("id", row.id);
      if (error) throw error;
      if (typeof patch['progress'] === "number") {
        await supabase.from("objective_progress").insert({
          objective_id: row.id,
          progress: patch['progress'] as number,
          note: "Progress updated",
          created_by: session.userId,
        } as never);
      }
      await logAudit({
        actorId: session.userId,
        actorEmail: session.email,
        action: "objective.updated",
        entityType: "objectives",
        entityId: row.id,
        newValue: patch,
      });
    },
    onSuccess: () => {
      toast.success("Objective updated.");
      qc.invalidateQueries({ queryKey: ["objectives"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  async function archive(row: ObjectiveRow) {
    const reason = window.prompt("Reason for archiving this objective?");
    if (!reason || !session) return;
    try {
      await archiveRecord({
        table: "objectives",
        id: row.id,
        entityRef: row.objective_ref,
        title: row.title,
        previousStatus: row.status,
        reason,
        actorId: session.userId,
        actorEmail: session.email,
      });
      toast.success("Objective archived.");
      qc.invalidateQueries({ queryKey: ["objectives"] });
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  if (!canView) {
    return (
      <AppShell>
        <PageHeader title="Company objectives" />
        <NoAccess module="Objectives" />
      </AppShell>
    );
  }

  const rows = objectives.data ?? [];

  return (
    <AppShell>
      <PageHeader
        title="Company objectives"
        description="Targets, key results and delivery progress across every department."
        actions={
          canCreate ? <Button onClick={() => setOpen(true)}>New objective</Button> : undefined
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {STATUSES.map((s) => (
              <SelectItem key={s} value={s}>
                {titleCase(s)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {objectives.isLoading ? (
        <p className="text-sm text-muted-foreground">Loading objectives…</p>
      ) : rows.length === 0 ? (
        <EmptyState
          title="No objectives recorded"
          hint={canCreate ? "Create the first company objective." : ""}
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {rows.map((o) => (
            <Panel key={o.id} title={o.title}>
              <div className="space-y-3">
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <span className="ref-mono">{o.objective_ref}</span>
                  <StatusPill value={o.status} />
                  {o.priority ? <StatusPill value={o.priority} /> : null}
                  <span>{o.department ?? "—"}</span>
                </div>
                {o.description ? (
                  <p className="text-sm text-muted-foreground">{o.description}</p>
                ) : null}
                <div>
                  <div className="mb-1 flex justify-between text-xs text-muted-foreground">
                    <span>Progress</span>
                    <span>{o.progress ?? 0}%</span>
                  </div>
                  <Progress value={o.progress ?? 0} />
                </div>
                <p className="text-xs text-muted-foreground">
                  {formatDate(o.start_date)} → {formatDate(o.target_date)}
                </p>
                {canEdit ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <Input
                      type="number"
                      min={0}
                      max={100}
                      defaultValue={o.progress ?? 0}
                      className="w-24"
                      onBlur={(e) => {
                        const value = Math.max(0, Math.min(100, Number(e.target.value)));
                        if (value !== (o.progress ?? 0))
                          update.mutate({ row: o, patch: { progress: value } });
                      }}
                    />
                    <Select
                      value={o.status}
                      onValueChange={(v) =>
                        update.mutate({
                          row: o,
                          patch:
                            v === "completed"
                              ? { status: v, progress: 100, completed_at: new Date().toISOString() }
                              : { status: v },
                        })
                      }
                    >
                      <SelectTrigger className="w-40">
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
                    {allows(access, "objectives.archive") ? (
                      <Button size="sm" variant="ghost" onClick={() => archive(o)}>
                        Archive
                      </Button>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </Panel>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New objective</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="space-y-1">
              <Label>Title</Label>
              <Input
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label>Description</Label>
              <Textarea
                rows={3}
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label>Department</Label>
                <Input
                  value={form.department}
                  onChange={(e) => setForm({ ...form, department: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <Label>Priority</Label>
                <Select
                  value={form.priority}
                  onValueChange={(v) => setForm({ ...form, priority: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PRIORITIES.map((p) => (
                      <SelectItem key={p} value={p}>
                        {titleCase(p)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Budget</Label>
                <Input
                  type="number"
                  value={form.budget}
                  onChange={(e) => setForm({ ...form, budget: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <Label>Currency</Label>
                <Select
                  value={form.currency}
                  onValueChange={(v) => setForm({ ...form, currency: v })}
                >
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
                <Label>Start date</Label>
                <Input
                  type="date"
                  value={form.start_date}
                  onChange={(e) => setForm({ ...form, start_date: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <Label>Target date</Label>
                <Input
                  type="date"
                  value={form.target_date}
                  onChange={(e) => setForm({ ...form, target_date: e.target.value })}
                />
              </div>
            </div>
            <Button
              disabled={form.title.trim().length < 3 || create.isPending}
              onClick={() => create.mutate()}
            >
              {create.isPending ? "Creating…" : "Create objective"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
