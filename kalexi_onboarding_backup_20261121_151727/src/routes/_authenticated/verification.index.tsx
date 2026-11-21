import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { AppShell, PageHeader } from "@/components/AppShell";
import { useSession, logAudit } from "@/hooks/useSession";
import { allows } from "@/lib/rbac";
import { EmptyState, NoAccess, StatusPill } from "@/components/records";
import { SECTORS, titleCase } from "@/lib/records";
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

export const Route = createFileRoute("/_authenticated/verification/")({
  head: () => ({
    meta: [
      { title: "Verification & KYC — Kalexi Brokerage" },
      { name: "description", content: "Verification and due diligence case register." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: VerificationPage,
});

const CASE_KINDS = ["kyc", "due_diligence", "identity", "ownership", "compliance", "other"];
const STATUSES = ["pending", "in_review", "verified", "rejected", "cleared"];

function VerificationPage() {
  const { data: session } = useSession();
  const access = session?.access;
  const qc = useQueryClient();
  const [term, setTerm] = useState("");
  const [status, setStatus] = useState("all");
  const [kind, setKind] = useState("all");
  const [open, setOpen] = useState(false);

  const cases = useQuery({
    queryKey: ["verifications", term, status, kind],
    enabled: allows(access, "verification.view"),
    queryFn: async () => {
      let query = supabase
        .from("verifications")
        .select("*")
        .is("archived_at", null)
        .order("created_at", { ascending: false })
        .limit(300);
      if (status !== "all") query = query.eq("status", status);
      if (kind !== "all") query = query.eq("case_kind", kind);
      const q = term.trim();
      if (q) query = query.or(`case_ref.ilike.%${q}%,subject.ilike.%${q}%`);
      const { data, error } = await query;
      if (error) throw error;
      return data ?? [];
    },
  });

  if (!allows(access, "verification.view")) {
    return (
      <AppShell>
        <PageHeader title="Verification & KYC" />
        <NoAccess module="Verification & Due Diligence" />
      </AppShell>
    );
  }

  const rows = cases.data ?? [];
  const stats = {
    total: rows.length,
    pending: rows.filter((r) => r.status === "pending").length,
    inReview: rows.filter((r) => r.status === "in_review").length,
    cleared: rows.filter((r) => r.status === "verified" || r.status === "cleared").length,
  };

  return (
    <AppShell>
      <PageHeader
        title="Verification & KYC"
        description="Case register for identity, ownership and due diligence verification."
        actions={
          allows(access, "verification.create") ? (
            <Button onClick={() => setOpen(true)}>New verification case</Button>
          ) : null
        }
      />

      <div className="mb-5 grid gap-3 sm:grid-cols-4">
        <StatCard label="Total cases" value={stats.total} />
        <StatCard label="Pending" value={stats.pending} />
        <StatCard label="In review" value={stats.inReview} />
        <StatCard label="Verified / cleared" value={stats.cleared} />
      </div>

      <div className="mb-4 flex flex-wrap gap-3">
        <Input
          className="max-w-xs"
          placeholder="Search reference or subject"
          value={term}
          onChange={(e) => setTerm(e.target.value)}
        />
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-44"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {STATUSES.map((s) => (<SelectItem key={s} value={s}>{titleCase(s)}</SelectItem>))}
          </SelectContent>
        </Select>
        <Select value={kind} onValueChange={setKind}>
          <SelectTrigger className="w-48"><SelectValue placeholder="Case type" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All types</SelectItem>
            {CASE_KINDS.map((k) => (<SelectItem key={k} value={k}>{titleCase(k)}</SelectItem>))}
          </SelectContent>
        </Select>
      </div>

      <Card className="overflow-x-auto shadow-[var(--shadow-panel)]">
        {cases.isLoading ? (
          <p className="px-6 py-12 text-center text-sm text-muted-foreground">Loading…</p>
        ) : rows.length === 0 ? (
          <EmptyState title="No verification cases" hint="Open a new case to begin." />
        ) : (
          <table className="w-full min-w-[760px] text-sm">
            <thead className="bg-muted/60 text-left">
              <tr>
                <th className="px-4 py-2.5 font-medium">Ref</th>
                <th className="px-4 py-2.5 font-medium">Subject</th>
                <th className="px-4 py-2.5 font-medium">Type</th>
                <th className="px-4 py-2.5 font-medium">Sector</th>
                <th className="px-4 py-2.5 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t hover:bg-muted/40">
                  <td className="px-4 py-2.5">
                    <Link
                      to="/verification/$verificationId"
                      params={{ verificationId: r.id }}
                      className="ref-mono text-xs font-medium underline-offset-2 hover:underline"
                    >
                      {r.case_ref}
                    </Link>
                  </td>
                  <td className="px-4 py-2.5">{r.subject}</td>
                  <td className="px-4 py-2.5">{titleCase(r.case_kind)}</td>
                  <td className="px-4 py-2.5">{r.sector ?? "—"}</td>
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
          qc.invalidateQueries({ queryKey: ["verifications"] });
        }}
      />
    </AppShell>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <p className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold">{value}</p>
    </div>
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
  const [subject, setSubject] = useState("");
  const [caseKind, setCaseKind] = useState("kyc");
  const [sector, setSector] = useState<string>("none");
  const [summary, setSummary] = useState("");

  const clients = useQuery({
    queryKey: ["verification-clients"],
    enabled: open,
    queryFn: async () => {
      const { data } = await supabase.from("clients").select("id, client_ref, full_name").is("archived_at", null).limit(300);
      return data ?? [];
    },
  });

  const [clientId, setClientId] = useState<string>("none");

  const create = useMutation({
    mutationFn: async () => {
      if (!subject.trim()) throw new Error("Subject is required.");
      const { data, error } = await supabase
        .from("verifications")
        .insert({
          subject: subject.trim(),
          case_kind: caseKind,
          sector: sector === "none" ? null : sector,
          client_id: clientId === "none" ? null : clientId,
          summary: summary.trim() || null,
          status: "pending",
          created_by: session?.userId ?? null,
        })
        .select("id, case_ref")
        .single();
      if (error) throw error;
      if (session) {
        await logAudit({
          actorId: session.userId,
          actorEmail: session.email,
          action: "verification.created",
          entityType: "verifications",
          entityId: data.id,
          newValue: { case_ref: data.case_ref },
        });
      }
      return data;
    },
    onSuccess: () => {
      toast.success("Verification case opened.");
      setSubject("");
      setSummary("");
      onDone();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>New verification case</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Subject</Label>
            <Input value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={160} />
          </div>
          <div className="space-y-2">
            <Label>Case type</Label>
            <Select value={caseKind} onValueChange={setCaseKind}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {CASE_KINDS.map((k) => (<SelectItem key={k} value={k}>{titleCase(k)}</SelectItem>))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Sector</Label>
            <Select value={sector} onValueChange={setSector}>
              <SelectTrigger><SelectValue placeholder="Optional" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None</SelectItem>
                {SECTORS.map((s) => (<SelectItem key={s} value={s}>{s}</SelectItem>))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Client</Label>
            <Select value={clientId} onValueChange={setClientId}>
              <SelectTrigger><SelectValue placeholder="Optional" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None</SelectItem>
                {(clients.data ?? []).map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.full_name} · {c.client_ref}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Summary</Label>
            <Textarea rows={3} value={summary} onChange={(e) => setSummary(e.target.value)} />
          </div>
          <Button className="w-full" disabled={create.isPending} onClick={() => create.mutate()}>
            {create.isPending ? "Opening…" : "Open case"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
