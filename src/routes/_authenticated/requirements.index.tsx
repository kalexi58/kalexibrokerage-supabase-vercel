import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { AppShell, PageHeader } from "@/components/AppShell";
import { useSession, logAudit } from "@/hooks/useSession";
import { allows } from "@/lib/rbac";
import { NoAccess } from "@/components/records";
import { SECTORS, archiveRecord, formatDate, formatMoney, titleCase } from "@/lib/records";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { StatusPill } from "@/components/records";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DataEmptyState, DataTableSkeleton, ErrorState } from "@/components/LoadingStates";

export const Route = createFileRoute("/_authenticated/requirements/")({
  head: () => ({
    meta: [
      { title: "Client Requirements — Kalexi Brokerage" },
      {
        name: "description",
        content: "Search and manage client requirements for matching against opportunities.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: RequirementsPage,
});

function RequirementsPage() {
  const { data: session } = useSession();
  const access = session?.access;
  const queryClient = useQueryClient();
  const [term, setTerm] = useState("");
  const [sector, setSector] = useState<string>("all");
  const [status, setStatus] = useState<string>("all");

  const requirements = useQuery({
    queryKey: ["requirements", term, sector, status],
    enabled: allows(access, "requirements.view"),
    queryFn: async () => {
      let query = supabase
        .from("client_requirements")
        .select(
          "id, requirement_ref, title, sector, status, priority, budget_min, budget_max, currency, deadline, client_id, clients(full_name, client_ref)",
        )
        .is("archived_at", null)
        .order("created_at", { ascending: false })
        .limit(200);
      if (sector !== "all") query = query.eq("sector", sector);
      if (status !== "all") query = query.eq("status", status);
      const q = term.trim();
      if (q) query = query.or(`requirement_ref.ilike.%${q}%,title.ilike.%${q}%`);
      const { data, error } = await query;
      if (error) throw error;
      return data ?? [];
    },
  });

  if (!allows(access, "requirements.view")) {
    return (
      <AppShell>
        <PageHeader title="Client requirements" />
        <NoAccess module="Client Requirements" />
      </AppShell>
    );
  }

  async function onArchive(id: string, ref: string, title: string, prevStatus: string) {
    const reason = window.prompt(`Reason for archiving requirement ${ref}?`);
    if (!reason) return;
    try {
      await archiveRecord({
        table: "client_requirements",
        id,
        entityRef: ref,
        title,
        previousStatus: prevStatus,
        reason,
        actorId: session!.userId,
        actorEmail: session!.email,
      });
      toast.success("Requirement archived");
      queryClient.invalidateQueries({ queryKey: ["requirements"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to archive");
    }
  }

  return (
    <AppShell>
      <PageHeader
        title="Client requirements"
        description="What our clients are looking for, ready to match against the opportunity database."
        actions={
          allows(access, "requirements.create") ? (
            <Button asChild>
              <Link to="/requirements/new">New requirement</Link>
            </Button>
          ) : null
        }
      />

      <div className="mb-4 flex flex-wrap gap-3">
        <Input
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          placeholder="Search requirement ref or title"
          className="max-w-xs"
          maxLength={80}
        />
        <Select value={sector} onValueChange={setSector}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Sector" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All sectors</SelectItem>
            {SECTORS.map((s) => (
              <SelectItem key={s} value={s}>
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="open">Open</SelectItem>
            <SelectItem value="matched">Matched</SelectItem>
            <SelectItem value="closed">Closed</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Card className="overflow-x-auto shadow-[var(--shadow-panel)]">
        {requirements.isLoading ? (
          <DataTableSkeleton rows={6} columns={9} />
        ) : requirements.isError ? (
          <div className="p-4">
            <ErrorState
              title="Client requirements could not be retrieved"
              description="Check your connection and retry."
              onRetry={() => void requirements.refetch()}
            />
          </div>
        ) : requirements.data && requirements.data.length > 0 ? (
          <table className="w-full min-w-[860px] text-sm">
            <thead className="bg-muted/60 text-left">
              <tr>
                <th className="px-4 py-2.5 font-medium">Ref</th>
                <th className="px-4 py-2.5 font-medium">Title</th>
                <th className="px-4 py-2.5 font-medium">Client</th>
                <th className="px-4 py-2.5 font-medium">Sector</th>
                <th className="px-4 py-2.5 font-medium">Budget</th>
                <th className="px-4 py-2.5 font-medium">Priority</th>
                <th className="px-4 py-2.5 font-medium">Deadline</th>
                <th className="px-4 py-2.5 font-medium">Status</th>
                <th className="px-4 py-2.5 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {requirements.data.map((r) => (
                <tr key={r.id} className="border-t hover:bg-muted/40">
                  <td className="px-4 py-2.5">
                    <Link
                      to="/requirements/$requirementId"
                      params={{ requirementId: r.id }}
                      className="ref-mono text-xs font-medium underline-offset-2 hover:underline"
                    >
                      {r.requirement_ref}
                    </Link>
                  </td>
                  <td className="px-4 py-2.5">{r.title}</td>
                  <td className="px-4 py-2.5">
                    {r.clients ? (
                      <Link
                        to="/clients/$clientId"
                        params={{ clientId: r.client_id }}
                        className="hover:underline"
                      >
                        {r.clients.full_name}
                      </Link>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-4 py-2.5">{r.sector}</td>
                  <td className="px-4 py-2.5">
                    {formatMoney(r.budget_min, r.currency ?? "UGX")} –{" "}
                    {formatMoney(r.budget_max, r.currency ?? "UGX")}
                  </td>
                  <td className="px-4 py-2.5">{titleCase(r.priority)}</td>
                  <td className="px-4 py-2.5 text-muted-foreground">{formatDate(r.deadline)}</td>
                  <td className="px-4 py-2.5">
                    <StatusPill value={r.status} />
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    {allows(access, "requirements.archive") ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => onArchive(r.id, r.requirement_ref, r.title, r.status)}
                      >
                        Archive
                      </Button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <DataEmptyState
            title={term ? "No requirements match that search" : "No client requirements recorded"}
            description={
              term ? "Try another reference or title." : "New requirements will appear here."
            }
          />
        )}
      </Card>
    </AppShell>
  );
}
