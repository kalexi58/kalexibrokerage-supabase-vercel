import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell, PageHeader } from "@/components/AppShell";
import { useSession } from "@/hooks/useSession";
import { allows } from "@/lib/rbac";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { DataEmptyState, DataTableSkeleton, ErrorState } from "@/components/LoadingStates";

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
  const access = session?.access;
  const [term, setTerm] = useState("");

  const clients = useQuery({
    queryKey: ["clients", term],
    queryFn: async () => {
      let query = supabase
        .from("clients")
        .select(
          "id, client_ref, full_name, phone, company_name, sector, client_type, status, created_at",
        )
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
          <table className="w-full min-w-[640px] text-sm">
            <thead className="bg-muted/60 text-left">
              <tr>
                <th className="px-4 py-2.5 font-medium">Client ID</th>
                <th className="px-4 py-2.5 font-medium">Name</th>
                <th className="px-4 py-2.5 font-medium">Phone</th>
                <th className="px-4 py-2.5 font-medium">Company</th>
                <th className="px-4 py-2.5 font-medium">Sector</th>
                <th className="px-4 py-2.5 font-medium">Registered</th>
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
