import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AppShell, PageHeader } from "@/components/AppShell";
import { useSession } from "@/hooks/useSession";
import { allows } from "@/lib/rbac";
import { Card } from "@/components/ui/card";

export const Route = createFileRoute("/_authenticated/admin/audit")({
  head: () => ({
    meta: [
      { title: "Audit Trail — Kalexi Brokerage" },
      { name: "description", content: "Immutable record of every critical action in the system." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AuditPage,
});

function AuditPage() {
  const { data: session } = useSession();
  const access = session?.access;

  const logs = useQuery({
    queryKey: ["audit-logs"],
    enabled: allows(access, "audit.view"),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("audit_logs")
        .select("id, created_at, actor_email, action, entity_type, entity_id")
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return data ?? [];
    },
  });

  if (!allows(access, "audit.view")) {
    return (
      <AppShell>
        <PageHeader
          title="Restricted"
          description="Only oversight roles may view the audit trail."
        />
      </AppShell>
    );
  }

  return (
    <AppShell>
      <PageHeader
        title="Audit trail"
        description="Append-only. Records cannot be edited or deleted by any user."
      />
      <Card className="overflow-x-auto shadow-[var(--shadow-panel)]">
        {logs.data && logs.data.length > 0 ? (
          <table className="w-full min-w-[680px] text-sm">
            <thead className="bg-muted/60 text-left">
              <tr>
                <th className="px-4 py-2.5 font-medium">Timestamp</th>
                <th className="px-4 py-2.5 font-medium">Actor</th>
                <th className="px-4 py-2.5 font-medium">Action</th>
                <th className="px-4 py-2.5 font-medium">Entity</th>
              </tr>
            </thead>
            <tbody>
              {logs.data.map((l) => (
                <tr key={l.id} className="border-t">
                  <td className="px-4 py-2.5 text-muted-foreground">
                    {new Date(l.created_at).toLocaleString()}
                  </td>
                  <td className="px-4 py-2.5">{l.actor_email ?? "system"}</td>
                  <td className="px-4 py-2.5 ref-mono text-xs">{l.action}</td>
                  <td className="px-4 py-2.5 text-muted-foreground">
                    {l.entity_type ? `${l.entity_type} · ${l.entity_id ?? "—"}` : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="px-6 py-14 text-center text-sm text-muted-foreground">
            No audit entries recorded yet.
          </p>
        )}
      </Card>
    </AppShell>
  );
}
