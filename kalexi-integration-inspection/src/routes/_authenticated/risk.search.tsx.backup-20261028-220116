import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell, PageHeader } from "@/components/AppShell";
import { useSession } from "@/hooks/useSession";
import { allows } from "@/lib/rbac";
import { EmptyState, NoAccess, StatusPill } from "@/components/records";
import { titleCase } from "@/lib/records";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Panel } from "@/components/records";

export const Route = createFileRoute("/_authenticated/risk/search")({
  head: () => ({
    meta: [
      { title: "Internal Intelligence Search — Kalexi Brokerage" },
      { name: "description", content: "Cross-reference risk cases, clients and opportunities." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: RiskSearchPage,
});

function RiskSearchPage() {
  const { data: session } = useSession();
  const access = session?.access;
  const [term, setTerm] = useState("");
  const [query, setQuery] = useState("");

  const results = useQuery({
    queryKey: ["risk-search", query],
    enabled: allows(access, "risk.view") && query.trim().length > 1,
    queryFn: async () => {
      const q = `%${query.trim()}%`;
      const [risk, clients, opportunities] = await Promise.all([
        supabase
          .from("risk_cases")
          .select("id, case_ref, case_kind, subject_name, subject_company, subject_phone, subject_email, subject_identifier, severity, status")
          .is("archived_at", null)
          .or(
            `subject_name.ilike.${q},subject_company.ilike.${q},subject_phone.ilike.${q},subject_email.ilike.${q},subject_identifier.ilike.${q}`,
          )
          .limit(50),
        supabase
          .from("clients")
          .select("id, client_ref, full_name, phone, email")
          .is("archived_at", null)
          .or(`full_name.ilike.${q},phone.ilike.${q},email.ilike.${q},client_ref.ilike.${q}`)
          .limit(50),
        supabase
          .from("opportunities")
          .select("id, opportunity_ref, title, owner_name, owner_contact")
          .is("archived_at", null)
          .or(`owner_name.ilike.${q},owner_contact.ilike.${q},title.ilike.${q}`)
          .limit(50),
      ]);
      return {
        risk: risk.data ?? [],
        clients: clients.data ?? [],
        opportunities: opportunities.data ?? [],
      };
    },
  });

  if (!allows(access, "risk.view")) {
    return (
      <AppShell>
        <PageHeader title="Internal intelligence search" />
        <NoAccess module="Risk & Investigation" />
      </AppShell>
    );
  }

  const data = results.data;
  const totalHits = data ? data.risk.length + data.clients.length + data.opportunities.length : 0;

  return (
    <AppShell>
      <PageHeader
        title="Internal intelligence search"
        description="Search names, phones, emails and identifiers across risk cases, clients and opportunities."
      />

      <div className="mb-5 flex gap-2">
        <Input
          className="max-w-md"
          placeholder="Name, phone, email or identifier"
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && setQuery(term)}
        />
        <Button onClick={() => setQuery(term)}>Search</Button>
      </div>

      {!query.trim() ? (
        <EmptyState title="Enter a search term" hint="Search across risk cases, clients and opportunities." />
      ) : results.isLoading ? (
        <p className="text-sm text-muted-foreground">Searching…</p>
      ) : totalHits === 0 ? (
        <EmptyState title="No adverse record found" hint="No matches across risk cases, clients or opportunities." />
      ) : (
        <div className="space-y-5">
          <Panel title={`Risk & investigation cases (${data?.risk.length ?? 0})`}>
            {(data?.risk ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">No matches.</p>
            ) : (
              <div className="space-y-2">
                {(data?.risk ?? []).map((r) => (
                  <div key={r.id} className="flex items-center justify-between rounded-md border p-3">
                    <div>
                      <Link to="/risk/$caseId" params={{ caseId: r.id }} className="text-sm font-medium underline-offset-2 hover:underline">
                        {r.subject_name}
                      </Link>
                      <p className="text-xs text-muted-foreground">
                        {r.case_ref} · {titleCase(r.case_kind)} · {r.subject_company ?? "—"}
                      </p>
                    </div>
                    <StatusPill value={r.severity} />
                  </div>
                ))}
              </div>
            )}
          </Panel>

          <Panel title={`Clients (${data?.clients.length ?? 0})`}>
            {(data?.clients ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">No matches.</p>
            ) : (
              <div className="space-y-2">
                {(data?.clients ?? []).map((c) => (
                  <div key={c.id} className="flex items-center justify-between rounded-md border p-3">
                    <div>
                      <Link to="/clients/$clientId" params={{ clientId: c.id }} className="text-sm font-medium underline-offset-2 hover:underline">
                        {c.full_name}
                      </Link>
                      <p className="text-xs text-muted-foreground">{c.client_ref} · {c.phone ?? "—"}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Panel>

          <Panel title={`Opportunities (${data?.opportunities.length ?? 0})`}>
            {(data?.opportunities ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">No matches.</p>
            ) : (
              <div className="space-y-2">
                {(data?.opportunities ?? []).map((o) => (
                  <div key={o.id} className="flex items-center justify-between rounded-md border p-3">
                    <div>
                      <Link to="/opportunities/$opportunityId" params={{ opportunityId: o.id }} className="text-sm font-medium underline-offset-2 hover:underline">
                        {o.title}
                      </Link>
                      <p className="text-xs text-muted-foreground">{o.opportunity_ref} · {o.owner_name ?? "—"}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Panel>
        </div>
      )}
    </AppShell>
  );
}
