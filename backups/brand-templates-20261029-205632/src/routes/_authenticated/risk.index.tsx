import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { AppShell, PageHeader } from "@/components/AppShell";
import { useSession, logAudit } from "@/hooks/useSession";
import { allows } from "@/lib/rbac";
import { EmptyState, NoAccess, StatusPill } from "@/components/records";
import { titleCase } from "@/lib/records";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/risk/")({
  head: () => ({
    meta: [
      { title: "Risk & Investigations — Kalexi Brokerage" },
      { name: "description", content: "Risk flags and investigation case register." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: RiskPage,
});

const KINDS = ["risk", "investigation"];
const SEVERITIES = ["low", "medium", "high", "critical"];
const STATUSES = ["open", "in_progress", "closed", "escalated"];

function RiskPage() {
  const { data: session } = useSession();
  const access = session?.access;
  const qc = useQueryClient();
  const [term, setTerm] = useState("");
  const [kind, setKind] = useState("all");
  const [severity, setSeverity] = useState("all");
  const [status, setStatus] = useState("all");
  const [open, setOpen] = useState(false);

  const cases = useQuery({
    queryKey: ["risk-cases", term, kind, severity, status],
    enabled: allows(access, "risk.view"),
    queryFn: async () => {
      let query = supabase
        .from("risk_cases")
        .select("*")
        .is("archived_at", null)
        .order("created_at", { ascending: false })
        .limit(300);
      if (kind !== "all") query = query.eq("case_kind", kind);
      if (severity !== "all") query = query.eq("severity", severity);
      if (status !== "all") query = query.eq("status", status);
      const q = term.trim();
      if (q) query = query.or(`case_ref.ilike.%${q}%,subject_name.ilike.%${q}%,subject_company.ilike.%${q}%`);
      const { data, error } = await query;
      if (error) throw error;
      return data ?? [];
    },
  });

  if (!allows(access, "risk.view")) {
    return (
      <AppShell>
        <PageHeader title="Risk & Investigations" />
        <NoAccess module="Risk & Investigation" />
      </AppShell>
    );
  }

  const rows = cases.data ?? [];

  return (
    <AppShell>
      <PageHeader
        title="Risk & Investigations"
        description="Risk flags and internal investigations across clients and deals."
        actions={
          <div className="flex gap-2">
            <Button variant="outline" asChild>
              <Link to="/risk/search">Internal search</Link>
            </Button>
            {allows(access, "risk.create") ? (
              <Button onClick={() => setOpen(true)}>New case</Button>
            ) : null}
          </div>
        }
      />

      <div className="mb-4 flex flex-wrap gap-3">
        <Input
          className="max-w-xs"
          placeholder="Search reference, name or company"
          value={term}
          onChange={(e) => setTerm(e.target.value)}
        />
        <Select value={kind} onValueChange={setKind}>
          <SelectTrigger className="w-40"><SelectValue placeholder="Case kind" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All kinds</SelectItem>
            {KINDS.map((k) => (<SelectItem key={k} value={k}>{titleCase(k)}</SelectItem>))}
          </SelectContent>
        </Select>
        <Select value={severity} onValueChange={setSeverity}>
          <SelectTrigger className="w-40"><SelectValue placeholder="Severity" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All severities</SelectItem>
            {SEVERITIES.map((s) => (<SelectItem key={s} value={s}>{titleCase(s)}</SelectItem>))}
          </SelectContent>
        </Select>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-40"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {STATUSES.map((s) => (<SelectItem key={s} value={s}>{titleCase(s)}</SelectItem>))}
          </SelectContent>
        </Select>
      </div>

      <Card className="overflow-x-auto shadow-[var(--shadow-panel)]">
        {cases.isLoading ? (
          <p className="px-6 py-12 text-center text-sm text-muted-foreground">Loading…</p>
        ) : rows.length === 0 ? (
          <EmptyState title="No risk or investigation cases" hint="Open a new case to begin." />
        ) : (
          <table className="w-full min-w-[860px] text-sm">
            <thead className="bg-muted/60 text-left">
              <tr>
                <th className="px-4 py-2.5 font-medium">Ref</th>
                <th className="px-4 py-2.5 font-medium">Subject</th>
                <th className="px-4 py-2.5 font-medium">Kind</th>
                <th className="px-4 py-2.5 font-medium">Severity</th>
                <th className="px-4 py-2.5 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t hover:bg-muted/40">
                  <td className="px-4 py-2.5">
                    <Link
                      to="/risk/$caseId"
                      params={{ caseId: r.id }}
                      className="ref-mono text-xs font-medium underline-offset-2 hover:underline"
                    >
                      {r.case_ref ?? "—"}
                    </Link>
                  </td>
                  <td className="px-4 py-2.5">
                    {r.subject_name}
                    {r.subject_company ? <span className="text-muted-foreground"> · {r.subject_company}</span> : null}
                  </td>
                  <td className="px-4 py-2.5">{titleCase(r.case_kind)}</td>
                  <td className="px-4 py-2.5"><StatusPill value={r.severity} /></td>
                  <td className="px-4 py-2.5"><StatusPill value={r.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <NewCaseDialog
        open={open}
        onOpenChange={setOpen}
        onDone={() => {
          setOpen(false);
          qc.invalidateQueries({ queryKey: ["risk-cases"] });
        }}
      />
    </AppShell>
  );
}

function NewCaseDialog({
  open,
  onOpenChange,
  onDone,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onDone: () => void;
}) {
  const { data: session } = useSession();
  const [caseKind, setCaseKind] = useState("risk");
  const [subjectName, setSubjectName] = useState("");
  const [subjectCompany, setSubjectCompany] = useState("");
  const [severity, setSeverity] = useState("medium");
  const [description, setDescription] = useState("");

  const create = useMutation({
    mutationFn: async () => {
      if (!subjectName.trim()) throw new Error("Subject name is required.");
      if (!description.trim()) throw new Error("Description is required.");
      const { data, error } = await supabase
        .from("risk_cases")
        .insert({
          case_kind: caseKind,
          subject_name: subjectName.trim(),
          subject_company: subjectCompany.trim() || null,
          severity,
          description: description.trim(),
          status: "open",
          created_by: session?.userId ?? null,
        })
        .select("id, case_ref")
        .single();
      if (error) throw error;
      if (session) {
        await logAudit({
          actorId: session.userId,
          actorEmail: session.email,
          action: "risk_case.created",
          entityType: "risk_cases",
          entityId: data.id,
          newValue: { case_ref: data.case_ref },
        });
      }
      return data;
    },
    onSuccess: () => {
      toast.success("Case opened.");
      setSubjectName("");
      setSubjectCompany("");
      setDescription("");
      onDone();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>New risk / investigation case</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Case kind</Label>
            <Select value={caseKind} onValueChange={setCaseKind}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {KINDS.map((k) => (<SelectItem key={k} value={k}>{titleCase(k)}</SelectItem>))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Subject name</Label>
            <Input value={subjectName} onChange={(e) => setSubjectName(e.target.value)} maxLength={160} />
          </div>
          <div className="space-y-2">
            <Label>Subject company</Label>
            <Input value={subjectCompany} onChange={(e) => setSubjectCompany(e.target.value)} maxLength={160} />
          </div>
          <div className="space-y-2">
            <Label>Severity</Label>
            <Select value={severity} onValueChange={setSeverity}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {SEVERITIES.map((s) => (<SelectItem key={s} value={s}>{titleCase(s)}</SelectItem>))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Description</Label>
            <Textarea rows={4} value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <Button className="w-full" disabled={create.isPending} onClick={() => create.mutate()}>
            {create.isPending ? "Opening…" : "Open case"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
