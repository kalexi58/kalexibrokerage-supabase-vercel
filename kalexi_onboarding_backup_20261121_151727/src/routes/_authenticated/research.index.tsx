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

export const Route = createFileRoute("/_authenticated/research/")({
  head: () => ({
    meta: [
      { title: "Research — Kalexi Brokerage" },
      { name: "description", content: "Research case register for market and subject intelligence." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ResearchPage,
});

const STATUSES = ["open", "in_progress", "completed", "archived"];

function ResearchPage() {
  const { data: session } = useSession();
  const access = session?.access;
  const qc = useQueryClient();
  const [term, setTerm] = useState("");
  const [status, setStatus] = useState("all");
  const [open, setOpen] = useState(false);

  const cases = useQuery({
    queryKey: ["research-cases", term, status],
    enabled: allows(access, "research.view"),
    queryFn: async () => {
      let query = supabase
        .from("research_cases")
        .select("*")
        .is("archived_at", null)
        .order("created_at", { ascending: false })
        .limit(300);
      if (status !== "all") query = query.eq("status", status);
      const q = term.trim();
      if (q) query = query.or(`case_ref.ilike.%${q}%,subject.ilike.%${q}%`);
      const { data, error } = await query;
      if (error) throw error;
      return data ?? [];
    },
  });

  if (!allows(access, "research.view")) {
    return (
      <AppShell>
        <PageHeader title="Research" />
        <NoAccess module="Research" />
      </AppShell>
    );
  }

  const rows = cases.data ?? [];

  return (
    <AppShell>
      <PageHeader
        title="Research"
        description="Market, ownership and subject research case files."
        actions={
          allows(access, "research.create") ? (
            <Button onClick={() => setOpen(true)}>New research case</Button>
          ) : null
        }
      />

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
      </div>

      <Card className="overflow-x-auto shadow-[var(--shadow-panel)]">
        {cases.isLoading ? (
          <p className="px-6 py-12 text-center text-sm text-muted-foreground">Loading…</p>
        ) : rows.length === 0 ? (
          <EmptyState title="No research cases" hint="Open a new research case to begin." />
        ) : (
          <table className="w-full min-w-[760px] text-sm">
            <thead className="bg-muted/60 text-left">
              <tr>
                <th className="px-4 py-2.5 font-medium">Ref</th>
                <th className="px-4 py-2.5 font-medium">Subject</th>
                <th className="px-4 py-2.5 font-medium">Related party</th>
                <th className="px-4 py-2.5 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t hover:bg-muted/40">
                  <td className="px-4 py-2.5">
                    <Link
                      to="/research/$caseId"
                      params={{ caseId: r.id }}
                      className="ref-mono text-xs font-medium underline-offset-2 hover:underline"
                    >
                      {r.case_ref}
                    </Link>
                  </td>
                  <td className="px-4 py-2.5">{r.subject}</td>
                  <td className="px-4 py-2.5">{r.related_party ?? "—"}</td>
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
          qc.invalidateQueries({ queryKey: ["research-cases"] });
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
  const [subject, setSubject] = useState("");
  const [question, setQuestion] = useState("");
  const [relatedParty, setRelatedParty] = useState("");
  const [keywords, setKeywords] = useState("");

  const create = useMutation({
    mutationFn: async () => {
      if (!subject.trim()) throw new Error("Subject is required.");
      const kw = keywords
        .split(",")
        .map((k) => k.trim())
        .filter(Boolean);
      const { data, error } = await supabase
        .from("research_cases")
        .insert({
          subject: subject.trim(),
          research_question: question.trim() || null,
          related_party: relatedParty.trim() || null,
          keywords: kw,
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
          action: "research_case.created",
          entityType: "research_cases",
          entityId: data.id,
          newValue: { case_ref: data.case_ref },
        });
      }
      return data;
    },
    onSuccess: () => {
      toast.success("Research case opened.");
      setSubject("");
      setQuestion("");
      setRelatedParty("");
      setKeywords("");
      onDone();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>New research case</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Subject</Label>
            <Input value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={160} />
          </div>
          <div className="space-y-2">
            <Label>Research question</Label>
            <Textarea rows={3} value={question} onChange={(e) => setQuestion(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Related party</Label>
            <Input value={relatedParty} onChange={(e) => setRelatedParty(e.target.value)} maxLength={160} />
          </div>
          <div className="space-y-2">
            <Label>Keywords (comma-separated)</Label>
            <Input value={keywords} onChange={(e) => setKeywords(e.target.value)} placeholder="e.g. land, title, ownership" />
          </div>
          <Button className="w-full" disabled={create.isPending} onClick={() => create.mutate()}>
            {create.isPending ? "Opening…" : "Open case"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
