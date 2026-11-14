import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Target, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import { AppShell, PageHeader } from "@/components/AppShell";
import { useSession, logAudit } from "@/hooks/useSession";
import { allows } from "@/lib/rbac";
import { EmptyState, NoAccess, StatusPill, Panel } from "@/components/records";
import { archiveRecord, formatDate, formatMoney, titleCase, CURRENCIES } from "@/lib/records";
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
import {
  calculateObjectiveProgress,
  OBJECTIVE_METRICS,
  readObjectiveKeyResults,
  type ObjectiveMetric,
  type ObjectiveKeyResultDraft,
} from "@/lib/objective-tracking";

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

function todayDateInput(): string {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

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
  key_results: Json;
}

function ObjectivesPage() {
  const { data: session } = useSession();
  const access = session?.access;
  const qc = useQueryClient();
  const [status, setStatus] = useState("all");
  const [open, setOpen] = useState(false);
  const [keyResults, setKeyResults] = useState<ObjectiveKeyResultDraft[]>([
    { metric: "clients_created", target: "1" },
  ]);
  const [trackingObjective, setTrackingObjective] = useState<ObjectiveRow | null>(null);
  const [trackingKeyResults, setTrackingKeyResults] = useState<ObjectiveKeyResultDraft[]>([]);
  const [form, setForm] = useState({
    title: "",
    description: "",
    department: "",
    priority: "medium",
    budget: "",
    currency: "UGX",
    start_date: todayDateInput(),
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
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  });

  const create = useMutation({
    mutationFn: async () => {
      if (!session) throw new Error("No session.");
      if (!hasValidTargets(keyResults)) {
        throw new Error("Enter a positive target for each automatic key result.");
      }
      if (form.start_date && form.target_date && form.target_date < form.start_date) {
        throw new Error("The target date must be on or after the start date.");
      }
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
        key_results: keyResults.map((result) => ({
          metric: result.metric,
          target: Number(result.target),
          current: 0,
        })) as never,
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
        start_date: todayDateInput(),
        target_date: "",
      });
      setKeyResults([{ metric: "clients_created", target: "1" }]);
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
        const { error } = await supabase.from("objective_progress").insert({
          objective_id: row.id,
          progress: patch['progress'] as number,
          note: "Progress updated",
          created_by: session.userId,
        } as never);
        if (error) throw error;
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

  const saveTracking = useMutation({
    mutationFn: async () => {
      if (!session) throw new Error("No session.");
      if (!trackingObjective) throw new Error("Choose an objective to configure.");
      if (!hasValidTargets(trackingKeyResults)) {
        throw new Error("Enter a positive target for each key result.");
      }
      const { error } = await supabase
        .from("objectives")
        .update({
          key_results: trackingKeyResults.map((result) => ({
            metric: result.metric,
            target: Number(result.target),
            current: 0,
          })) as never,
        })
        .eq("id", trackingObjective.id);
      if (error) throw error;
      await logAudit({
        actorId: session.userId,
        actorEmail: session.email,
        action: "objective.tracking_configured",
        entityType: "objectives",
        entityId: trackingObjective.id,
        newValue: trackingKeyResults,
      });
    },
    onSuccess: () => {
      toast.success("Automatic objective tracking updated.");
      setTrackingObjective(null);
      qc.invalidateQueries({ queryKey: ["objectives"] });
    },
    onError: (error: Error) => toast.error(error.message),
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
          {rows.map((o) => {
            const autoResults = readObjectiveKeyResults(o.key_results);
            const progress = calculateObjectiveProgress(autoResults) ?? o.progress ?? 0;
            return (
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
                    <span>{progress}%</span>
                  </div>
                  <Progress value={progress} />
                </div>
                {autoResults.length ? (
                  <div className="rounded-md bg-muted/50 p-3">
                    <p className="mb-2 flex items-center gap-1 text-xs font-medium">
                      <Target className="h-3.5 w-3.5" /> Live key results
                    </p>
                    <ul className="space-y-1 text-xs text-muted-foreground">
                      {autoResults.map((result, index) => (
                        <li key={`${result.metric}-${index}`} className="flex justify-between gap-3">
                          <span>{OBJECTIVE_METRICS[result.metric].label}</span>
                          <span className="shrink-0 font-medium text-foreground">
                            {result.metric === "cleared_brokerage_fees"
                              ? `${formatMoney(result.current, o.currency ?? "UGX")} / ${formatMoney(result.target, o.currency ?? "UGX")}`
                              : `${result.current.toLocaleString()} / ${result.target.toLocaleString()} ${OBJECTIVE_METRICS[result.metric].unit}`}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                <p className="text-xs text-muted-foreground">
                  {formatDate(o.start_date)} → {formatDate(o.target_date)}
                </p>
                {canEdit ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <Input
                      key={`${o.id}-${progress}`}
                      type="number"
                      min={0}
                      max={100}
                      defaultValue={progress}
                      disabled={autoResults.length > 0}
                      className="w-24"
                      onBlur={(e) => {
                        const value = Math.max(0, Math.min(100, Number(e.target.value)));
                        if (!autoResults.length && value !== (o.progress ?? 0))
                          update.mutate({ row: o, patch: { progress: value } });
                      }}
                    />
                    <Select
                      value={o.status}
                      onValueChange={(v) => {
                        if (v === "completed" && autoResults.length && progress < 100) {
                          toast.error("Complete the automatic key-result targets before closing this objective.");
                          return;
                        }
                        update.mutate({
                          row: o,
                          patch:
                            v === "completed"
                              ? { status: v, progress: 100, completed_at: new Date().toISOString() }
                              : { status: v },
                        });
                      }}
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
                    {o.status !== "completed" ? (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setTrackingObjective(o);
                          const existing = readObjectiveKeyResults(o.key_results);
                          setTrackingKeyResults(
                            existing.length
                              ? existing.map((result) => ({
                                  metric: result.metric,
                                  target: String(result.target),
                                }))
                              : [{ metric: "clients_created", target: "1" }],
                          );
                        }}
                      >
                        Configure tracking
                      </Button>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </Panel>
            );
          })}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[85dvh] overflow-y-auto">
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
            <ObjectiveKeyResultEditor
              results={keyResults}
              currency={form.currency}
              onChange={setKeyResults}
            />
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
              disabled={
                form.title.trim().length < 3 ||
                !hasValidTargets(keyResults) ||
                Boolean(form.start_date && form.target_date && form.target_date < form.start_date) ||
                create.isPending
              }
              onClick={() => create.mutate()}
            >
              {create.isPending ? "Creating…" : "Create objective"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={trackingObjective !== null}
        onOpenChange={(isOpen) => {
          if (!isOpen) setTrackingObjective(null);
        }}
      >
        <DialogContent className="max-h-[85dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Configure automatic tracking</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Progress is calculated from live records within the objective date range.
          </p>
          <ObjectiveKeyResultEditor
            results={trackingKeyResults}
            currency={trackingObjective?.currency ?? "UGX"}
            onChange={setTrackingKeyResults}
          />
          <Button
            disabled={!hasValidTargets(trackingKeyResults) || saveTracking.isPending}
            onClick={() => saveTracking.mutate()}
          >
            {saveTracking.isPending ? "Saving…" : "Save tracking"}
          </Button>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}

function hasValidTargets(results: ObjectiveKeyResultDraft[]): boolean {
  return (
    results.length > 0 &&
    results.every((result) => {
      const target = Number(result.target);
    return (
      Number.isFinite(target) &&
      target > 0 &&
      (result.metric === "cleared_brokerage_fees" || Number.isInteger(target))
    );
    })
  );
}

function ObjectiveKeyResultEditor({
  results,
  currency,
  onChange,
}: {
  results: ObjectiveKeyResultDraft[];
  currency: string;
  onChange: (results: ObjectiveKeyResultDraft[]) => void;
}) {
  return (
    <section className="space-y-3 rounded-lg border p-3">
      <div>
        <h3 className="text-sm font-medium">Automatic key results</h3>
        <p className="text-xs text-muted-foreground">
          Select business metrics and targets. Progress updates when related records change.
        </p>
      </div>
      {results.map((result, index) => (
        <div key={index} className="flex flex-wrap items-end gap-2">
          <div className="min-w-52 flex-1 space-y-1">
            <Label>Metric</Label>
            <Select
              value={result.metric}
              onValueChange={(value) =>
                onChange(
                  results.map((item, itemIndex) =>
                    itemIndex === index
                      ? { ...item, metric: value as ObjectiveMetric }
                      : item,
                  ),
                )
              }
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(OBJECTIVE_METRICS).map(([metric, option]) => (
                  <SelectItem key={metric} value={metric}>{option.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="w-36 space-y-1">
            <Label>Target ({result.metric === "cleared_brokerage_fees" ? currency : OBJECTIVE_METRICS[result.metric].unit})</Label>
            <Input
              type="number"
              min="0.01"
              step={result.metric === "cleared_brokerage_fees" ? "0.01" : "1"}
              value={result.target}
              onChange={(event) =>
                onChange(
                  results.map((item, itemIndex) =>
                    itemIndex === index ? { ...item, target: event.target.value } : item,
                  ),
                )
              }
            />
          </div>
          {results.length > 1 ? (
            <Button
              type="button"
              size="icon"
              variant="ghost"
              aria-label="Remove key result"
              onClick={() => onChange(results.filter((_, itemIndex) => itemIndex !== index))}
            >
              <Trash2 aria-hidden="true" className="h-4 w-4" />
            </Button>
          ) : null}
        </div>
      ))}
      {results.length < Object.keys(OBJECTIVE_METRICS).length ? (
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() =>
            onChange([...results, { metric: "clients_created", target: "1" }])
          }
        >
          <Plus aria-hidden="true" className="mr-1 h-4 w-4" />
          Add key result
        </Button>
      ) : null}
    </section>
  );
}
