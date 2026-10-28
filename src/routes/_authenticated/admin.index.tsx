import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AppShell, PageHeader } from "@/components/AppShell";
import { useSession } from "@/hooks/useSession";
import { NoAccess } from "@/components/records";
import { allows } from "@/lib/rbac";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AgentImpact } from "@/components/AgentImpact";
import { ErrorState, SectionSkeleton } from "@/components/LoadingStates";

export const Route = createFileRoute("/_authenticated/admin/")({
  head: () => ({
    meta: [
      { title: "Admin Control Centre — Kalexi Brokerage" },
      {
        name: "description",
        content:
          "Single command surface for Kalexi administration: every workspace, module and staff control in one place.",
      },
      { name: "robots", content: "noindex" },
      { property: "og:title", content: "Admin Control Centre — Kalexi Brokerage" },
      { property: "og:description", content: "Kalexi staff controls and operational workspaces." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AdminHome,
});

interface Tool {
  to: string;
  label: string;
  description: string;
  live?: boolean;
}
interface Section {
  label: string;
  tools: Tool[];
}

const SECTIONS: Section[] = [
  {
    label: "Administration",
    tools: [
      {
        to: "/admin/users",
        label: "Staff & identities",
        description:
          "Create staff, edit identities, assign workspaces, reset passwords, disable accounts.",
        live: true,
      },
      {
        to: "/admin/roles",
        label: "Roles & permissions",
        description: "Equip each workspace with the exact tools its duties require.",
        live: true,
      },
      {
        to: "/admin/audit",
        label: "Audit trail",
        description: "Append-only record of every critical action in the system.",
        live: true,
      },
      {
        to: "/admin/maintenance",
        label: "System maintenance",
        description: "Temporarily restrict access while maintenance is in progress.",
        live: true,
      },
      {
        to: "/account",
        label: "My account",
        description: "Your own identity, photo and password.",
        live: true,
      },
      {
        to: "/brand",
        label: "Brand Centre",
        description: "Company letters, notices and certificates with dates and signatures.",
        live: true,
      },
    ],
  },
  {
    label: "Digital Agent Programme",
    tools: [
      {
        to: "/agents",
        label: "Agent programme",
        description: "Applications, agent identities, field register and company messages.",
        live: true,
      },
      {
        to: "/agents/redemptions",
        label: "Token redemptions",
        description: "Review reward requests, approve rewards and record payment.",
        live: true,
      },
    ],
  },
  {
    label: "Overview",
    tools: [
      {
        to: "/dashboard",
        label: "Company performance",
        description:
          "Financial results, deal pipeline, agent referrals and audited staff activity.",
        live: true,
      },
    ],
  },
  {
    label: "Clients & requirements",
    tools: [
      {
        to: "/clients",
        label: "Client register",
        description: "Every registered client with references and KYC state.",
        live: true,
      },
      {
        to: "/clients/new",
        label: "Register client",
        description: "Reception intake with duplicate pre-check and acknowledgement.",
        live: true,
      },
      {
        to: "/requirements",
        label: "Requirements",
        description: "What each client is looking for, by sector and budget.",
        live: true,
      },
      {
        to: "/requirements/new",
        label: "New requirement",
        description: "Capture a client brief for matching.",
        live: true,
      },
      {
        to: "/forms",
        label: "Form links",
        description: "Generate client-facing intake forms.",
        live: true,
      },
    ],
  },
  {
    label: "Opportunities & matching",
    tools: [
      {
        to: "/opportunities",
        label: "Opportunity database",
        description: "Sourced assets and offers with sector-specific detail.",
        live: true,
      },
      {
        to: "/opportunities/new",
        label: "New opportunity",
        description: "Add a sourced opportunity to the database.",
        live: true,
      },
      {
        to: "/matches",
        label: "Matching board",
        description: "Automatic requirement ↔ opportunity scoring.",
        live: true,
      },
    ],
  },
  {
    label: "Deals",
    tools: [
      {
        to: "/deals",
        label: "Deal pipeline",
        description: "Board and list views across SOURCE → CLOSE.",
        live: true,
      },
      {
        to: "/deals/new",
        label: "New deal",
        description: "Open a deal file linked to client, requirement and opportunity.",
        live: true,
      },
    ],
  },
  {
    label: "Documents & intelligence",
    tools: [
      {
        to: "/documents",
        label: "Document vault",
        description: "Secure uploads, versioning, confidentiality and signed downloads.",
        live: true,
      },
      {
        to: "/media",
        label: "Media archive",
        description: "Photos and video recorded against clients, deals, opportunities and staff.",
        live: true,
      },
      {
        to: "/verification",
        label: "Verification & KYC",
        description: "Due diligence cases and checklists.",
        live: true,
      },
      {
        to: "/risk",
        label: "Risk & investigations",
        description: "Case files, severity and resolutions.",
        live: true,
      },
      {
        to: "/research",
        label: "Research",
        description: "Background research cases and sources.",
        live: true,
      },
    ],
  },
  {
    label: "Finance & governance",
    tools: [
      {
        to: "/finance",
        label: "Transactions",
        description: "Payments, commissions and settlement records.",
        live: true,
      },
      {
        to: "/finance/receipts",
        label: "Receipts",
        description: "QR-verified receipt issuance.",
        live: true,
      },
      {
        to: "/objectives",
        label: "Company objectives",
        description: "Targets, key results and progress.",
        live: true,
      },
      {
        to: "/archive",
        label: "Kalexi archive",
        description: "Company-wide archive with restore.",
        live: true,
      },
    ],
  },
];

function AdminHome() {
  const { data: session } = useSession();
  const access = session?.access;
  const isAdmin = allows(access, "admin.users") || allows(access, "admin.roles");

  const stats = useQuery({
    queryKey: ["admin-overview"],
    enabled: isAdmin,
    queryFn: async () => {
      const [staff, clients, deals, opportunities] = await Promise.all([
        supabase.from("profiles").select("id", { count: "exact", head: true }),
        supabase.from("clients").select("id", { count: "exact", head: true }),
        supabase.from("deals").select("id", { count: "exact", head: true }),
        supabase.from("opportunities").select("id", { count: "exact", head: true }),
      ]);
      const error = staff.error ?? clients.error ?? deals.error ?? opportunities.error;
      if (error) throw error;
      return {
        staff: staff.count ?? 0,
        clients: clients.count ?? 0,
        deals: deals.count ?? 0,
        opportunities: opportunities.count ?? 0,
      };
    },
  });

  if (!isAdmin) {
    return (
      <AppShell>
        <PageHeader title="Admin control centre" />
        <NoAccess module="Administration" />
      </AppShell>
    );
  }

  return (
    <AppShell>
      <PageHeader
        title="Admin control centre"
        description={`Every workspace, module and staff control on one page. Signed in as ${session?.profile?.full_name ?? ""}${
          access?.isSuperAdmin ? " — unrestricted Super Admin authority." : "."
        }`}
        actions={
          <Button asChild variant="outline">
            <Link to="/dashboard">Open company performance</Link>
          </Button>
        }
      />

      {allows(access, "agents.view") ? <AgentImpact /> : null}
      {stats.isError ? (
        <div className="mb-6">
          <ErrorState
            title="Administration summary could not be retrieved"
            onRetry={() => void stats.refetch()}
          />
        </div>
      ) : stats.isLoading ? (
        <div
          className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4"
          aria-label="Retrieving administration summary"
          aria-busy="true"
        >
          {Array.from({ length: 4 }, (_, index) => (
            <SectionSkeleton key={index} lines={2} />
          ))}
        </div>
      ) : (
        <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[
            { label: "Staff accounts", value: stats.data?.staff },
            { label: "Clients", value: stats.data?.clients },
            { label: "Opportunities", value: stats.data?.opportunities },
            { label: "Deals", value: stats.data?.deals },
          ].map((s) => (
            <Card key={s.label} className="p-4 shadow-[var(--shadow-panel)]">
              <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">{s.label}</p>
              <p className="mt-1 text-2xl font-semibold">{s.value ?? "—"}</p>
            </Card>
          ))}
        </div>
      )}

      <div className="space-y-6">
        {SECTIONS.map((section) => (
          <section key={section.label}>
            <h2 className="mb-2 text-xs uppercase tracking-[0.16em] text-muted-foreground">
              {section.label}
            </h2>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {section.tools.map((tool) =>
                tool.live ? (
                  <Link
                    key={tool.to}
                    to={tool.to}
                    className="rounded-lg border bg-card p-4 transition-colors hover:border-primary/50 hover:bg-muted/40"
                  >
                    <p className="text-sm font-semibold">{tool.label}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{tool.description}</p>
                  </Link>
                ) : (
                  <div
                    key={tool.to}
                    className="rounded-lg border border-dashed bg-muted/20 p-4 opacity-70"
                  >
                    <p className="flex items-center gap-2 text-sm font-semibold">
                      {tool.label}
                      <span className="rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                        In build
                      </span>
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">{tool.description}</p>
                  </div>
                ),
              )}
            </div>
          </section>
        ))}
      </div>
    </AppShell>
  );
}
