import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { AppShell, PageHeader } from "@/components/AppShell";
import { useSession, logAudit } from "@/hooks/useSession";
import { allows } from "@/lib/rbac";
import { EmptyState, NoAccess, StatusPill } from "@/components/records";
import { formatDateTime, titleCase, type ArchivableTable } from "@/lib/records";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/archive/")({
  head: () => ({
    meta: [
      { title: "Kalexi Archive — Kalexi Brokerage" },
      {
        name: "description",
        content: "Company-wide archive register of retired records, with restore controls.",
      },
      { name: "robots", content: "noindex" },
      { property: "og:title", content: "Kalexi Archive — Kalexi Brokerage" },
      { property: "og:description", content: "Company-wide archive register with restore." },
    ],
  }),
  component: ArchivePage,
});

interface ArchiveRow {
  id: string;
  entity_type: string;
  entity_id: string;
  entity_ref: string | null;
  title: string | null;
  previous_status: string | null;
  reason: string | null;
  archived_at: string | null;
  archived_by: string | null;
  restored_at: string | null;
  restore_reason: string | null;
  state: string;
  snapshot: unknown;
}

function ArchivePage() {
  const { data: session } = useSession();
  const access = session?.access;
  const qc = useQueryClient();
  const [term, setTerm] = useState("");
  const [type, setType] = useState("all");
  const [state, setState] = useState("archived");
  const [detail, setDetail] = useState<ArchiveRow | null>(null);

  const canView = allows(access, "archive.view");
  const canRestore = allows(access, "archive.restore");

  const types = useQuery({
    queryKey: ["archive-types"],
    enabled: canView,
    queryFn: async () => {
      const { data, error } = await supabase.from("archive_records").select("entity_type");
      if (error) throw error;
      return Array.from(new Set((data ?? []).map((r) => r.entity_type))).sort();
    },
  });

  const records = useQuery({
    queryKey: ["archive-records", term, type, state],
    enabled: canView,
    queryFn: async () => {
      let query = supabase
        .from("archive_records")
        .select("*")
        .order("archived_at", { ascending: false })
        .limit(300);
      if (type !== "all") query = query.eq("entity_type", type);
      if (state !== "all") query = query.eq("state", state);
      const q = term.trim();
      if (q) query = query.or(`entity_ref.ilike.%${q}%,title.ilike.%${q}%`);
      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as unknown as ArchiveRow[];
    },
  });

  const restore = useMutation({
    mutationFn: async (row: ArchiveRow) => {
      if (!session) throw new Error("No session.");
      const reason = window.prompt("Reason for restoring this record?");
      if (!reason) throw new Error("Restore cancelled.");
      const restoreValues = {
        archived_at: null,
        archived_by: null,
        archive_reason: null,
        ...(row.entity_type === "clients" ? { status: row.previous_status ?? "registered" } : {}),
      };
      const { error: srcError } = await supabase
        .from(row.entity_type as ArchivableTable)
        .update(restoreValues as never)
        .eq("id", row.entity_id);
      if (srcError) throw srcError;
      const { error } = await supabase
        .from("archive_records")
        .update({
          state: "restored",
          restored_by: session.userId,
          restored_at: new Date().toISOString(),
          restore_reason: reason,
        })
        .eq("id", row.id);
      if (error) throw error;
      await logAudit({
        actorId: session.userId,
        actorEmail: session.email,
        action: "archive.restored",
        entityType: row.entity_type,
        entityId: row.entity_id,
        newValue: { entity_ref: row.entity_ref, reason },
      });
    },
    onSuccess: () => {
      toast.success("Record restored.");
      qc.invalidateQueries({ queryKey: ["archive-records"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!canView) {
    return (
      <AppShell>
        <PageHeader title="Kalexi archive" />
        <NoAccess module="the Company Archive" />
      </AppShell>
    );
  }

  const rows = records.data ?? [];

  return (
    <AppShell>
      <PageHeader
        title="Kalexi archive"
        description="Every retired record across the company, with reasons, snapshots and restore controls."
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Input
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          placeholder="Search reference or title…"
          className="max-w-xs"
        />
        <Select value={type} onValueChange={setType}>
          <SelectTrigger className="w-52">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All record types</SelectItem>
            {(types.data ?? []).map((t) => (
              <SelectItem key={t} value={t}>
                {titleCase(t)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={state} onValueChange={setState}>
          <SelectTrigger className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All states</SelectItem>
            <SelectItem value="archived">Archived</SelectItem>
            <SelectItem value="restored">Restored</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {records.isLoading ? (
        <p className="text-sm text-muted-foreground">Loading archive…</p>
      ) : rows.length === 0 ? (
        <EmptyState title="Archive is empty" hint="Archived records appear here with full history." />
      ) : (
        <div className="overflow-x-auto rounded-lg border bg-card">
          <table className="w-full text-left text-sm">
            <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-2.5 font-medium">Reference</th>
                <th className="px-4 py-2.5 font-medium">Title</th>
                <th className="px-4 py-2.5 font-medium">Type</th>
                <th className="px-4 py-2.5 font-medium">Reason</th>
                <th className="px-4 py-2.5 font-medium">Archived</th>
                <th className="px-4 py-2.5 font-medium">State</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t hover:bg-muted/40">
                  <td className="ref-mono px-4 py-2.5 text-xs">{r.entity_ref ?? "—"}</td>
                  <td className="px-4 py-2.5">{r.title ?? "—"}</td>
                  <td className="px-4 py-2.5">{titleCase(r.entity_type)}</td>
                  <td className="max-w-xs truncate px-4 py-2.5 text-muted-foreground">
                    {r.reason ?? "—"}
                  </td>
                  <td className="px-4 py-2.5 text-xs text-muted-foreground">
                    {formatDateTime(r.archived_at)}
                  </td>
                  <td className="px-4 py-2.5">
                    <StatusPill value={r.state} />
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <Button size="sm" variant="ghost" onClick={() => setDetail(r)}>
                      View
                    </Button>
                    {canRestore && r.state === "archived" ? (
                      <Button size="sm" variant="outline" onClick={() => restore.mutate(r)}>
                        Restore
                      </Button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{detail?.entity_ref ?? detail?.title ?? "Archived record"}</DialogTitle>
          </DialogHeader>
          <pre className="max-h-[60vh] overflow-auto rounded-md bg-muted p-3 text-xs">
            {JSON.stringify(detail?.snapshot ?? {}, null, 2)}
          </pre>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
