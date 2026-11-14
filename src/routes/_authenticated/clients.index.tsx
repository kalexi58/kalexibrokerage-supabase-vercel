import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Archive } from "lucide-react";
import { toast } from "sonner";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell, PageHeader } from "@/components/AppShell";
import { useSession } from "@/hooks/useSession";
import { allows } from "@/lib/rbac";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { DataEmptyState, DataTableSkeleton, ErrorState } from "@/components/LoadingStates";

type ArchiveClientRpc = {
  rpc: (
    functionName: "archive_client",
    args: { _client_id: string; _reason: string },
  ) => PromiseLike<{ error: { message: string } | null }>;
};

export const Route = createFileRoute("/_authenticated/clients/")({
  head: () => ({
    meta: [
      { title: "Client Register — Kalexi Brokerage" },
      { name: "description", content: "Search and review officially registered Kalexi clients." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ClientsPage,
});

function ClientsPage() {
  const { data: session } = useSession();
  const archiveClientRpc = supabase as unknown as ArchiveClientRpc;
  const queryClient = useQueryClient();
  const access = session?.access;
  const [term, setTerm] = useState("");

  const archive = useMutation({
    mutationFn: async (input: { id: string; reason: string }) => {
      const { error } = await archiveClientRpc.rpc("archive_client", {
        _client_id: input.id,
        _reason: input.reason,
      });
      if (error) throw error;
    },
    onSuccess: async () => {
      toast.success("Client archived. The record remains available to internal research.");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["clients"] }),
        queryClient.invalidateQueries({ queryKey: ["archive-records"] }),
      ]);
    },
    onError: (error: Error) => toast.error(`Client could not be archived: ${error.message}`),
  });

  const clients = useQuery({
    queryKey: ["clients", term],
    queryFn: async () => {
      let query = supabase
        .from("clients")
        .select(
          "id, client_ref, full_name, phone, company_name, sector, client_type, status, created_at",
        )
        .is("archived_at", null)
        .order("created_at", { ascending: false })
        .limit(100);
      const q = term.trim();
      if (q) {
        query = query.or(
          `client_ref.ilike.%${q}%,full_name.ilike.%${q}%,phone.ilike.%${q}%,company_name.ilike.%${q}%`,
        );
      }
      const { data, error } = await query;
      if (error) throw error;
      return data ?? [];
    },
  });

  return (
    <AppShell>
      <PageHeader
        title="Client register"
        description="Every client officially registered in Kalexi's records."
        actions={
          allows(access, "clients.create") ? (
            <Button asChild>
              <Link to="/clients/new">Register new client</Link>
            </Button>
          ) : null
        }
      />

      <div className="mb-4 max-w-md">
        <Input
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          placeholder="Search Client ID, name, phone or company"
          maxLength={80}
        />
      </div>

      <Card className="overflow-x-auto shadow-[var(--shadow-panel)]">
        {clients.isLoading ? (
          <DataTableSkeleton rows={6} columns={6} />
        ) : clients.isError ? (
          <div className="p-4">
            <ErrorState
              title="Client records could not be retrieved"
              description="Check your connection and retry. Your records have not been changed."
              onRetry={() => void clients.refetch()}
            />
          </div>
        ) : clients.data && clients.data.length > 0 ? (
          <table className="w-full min-w-[720px] text-sm">
            <thead className="bg-muted/60 text-left">
              <tr>
                <th className="px-4 py-2.5 font-medium">Client ID</th>
                <th className="px-4 py-2.5 font-medium">Name</th>
                <th className="px-4 py-2.5 font-medium">Phone</th>
                <th className="px-4 py-2.5 font-medium">Company</th>
                <th className="px-4 py-2.5 font-medium">Sector</th>
                <th className="px-4 py-2.5 font-medium">Registered</th>
                {allows(access, "clients.archive") ? (
                  <th className="px-4 py-2.5 font-medium">Actions</th>
                ) : null}
              </tr>
            </thead>
            <tbody>
              {clients.data.map((c) => (
                <tr key={c.id} className="border-t hover:bg-muted/40">
                  <td className="px-4 py-2.5">
                    <Link
                      to="/clients/$clientId"
                      params={{ clientId: c.id }}
                      className="ref-mono text-xs font-medium underline-offset-2 hover:underline"
                    >
                      {c.client_ref}
                    </Link>
                  </td>
                  <td className="px-4 py-2.5">{c.full_name}</td>
                  <td className="px-4 py-2.5">{c.phone}</td>
                  <td className="px-4 py-2.5">{c.company_name ?? "—"}</td>
                  <td className="px-4 py-2.5">{c.sector}</td>
                  <td className="px-4 py-2.5 text-muted-foreground">
                    {new Date(c.created_at).toLocaleDateString()}
                  </td>
                  {allows(access, "clients.archive") ? (
                    <td className="px-4 py-2.5">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={archive.isPending}
                        onClick={() => {
                          const reason = window.prompt(
                            `Reason for archiving ${c.full_name} (${c.client_ref})?`,
                          );
                          if (reason === null) return;
                          if (reason.trim().length < 5) {
                            toast.error("Enter an archive reason of at least 5 characters.");
                            return;
                          }
                          archive.mutate({ id: c.id, reason: reason.trim() });
                        }}
                      >
                        <Archive color="#64748B" strokeWidth={2.2} className="mr-1.5 h-4 w-4 shrink-0" aria-hidden="true" />
                        Archive
                      </Button>
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <DataEmptyState
            title={term ? "No clients match that search" : "No clients registered yet"}
            description={
              term
                ? "Try another client name, ID, phone number, or company."
                : "Registered client records will appear here."
            }
          />
        )}
      </Card>
    </AppShell>
  );
}
