import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  Search, LayoutDashboard, BrainCircuit, Users, Handshake,
  FileText, Wallet, ShieldCheck, FlaskConical, Settings,
  CalendarDays, Archive, Target, BriefcaseBusiness, Image,
  ClipboardList, UserRound, ChevronRight, BookOpen
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/page-directory")({
  component: PageDirectory,
});

const pages = [
  { title: "Company Dashboard", path: "/dashboard", group: "Company", description: "Company overview and operating metrics", icon: LayoutDashboard },
  { title: "Intelligence & Analytics", path: "/intelligence", group: "Company", description: "Intelligence reports, metrics and operational findings", icon: BrainCircuit },
  { title: "Calendar", path: "/calendar", group: "Company", description: "Calendar and scheduled activities", icon: CalendarDays },
  { title: "Holidays", path: "/holidays", group: "Company", description: "Holiday and non-working day records", icon: CalendarDays },
  { title: "Clients", path: "/clients", group: "Brokerage", description: "Client records and client management", icon: Users },
  { title: "Register Client", path: "/clients/new", group: "Brokerage", description: "Create a client record", icon: UserRound },
  { title: "Deals", path: "/deals", group: "Brokerage", description: "Deal pipeline and deal records", icon: Handshake },
  { title: "Create Deal", path: "/deals/new", group: "Brokerage", description: "Register a new deal", icon: BriefcaseBusiness },
  { title: "Requirements", path: "/requirements", group: "Brokerage", description: "Buyer and seller requirements", icon: ClipboardList },
  { title: "Add Requirement", path: "/requirements/new", group: "Brokerage", description: "Register a new requirement", icon: ClipboardList },
  { title: "Matches", path: "/matches", group: "Brokerage", description: "Matching opportunities and requirements", icon: Target },
  { title: "Opportunities", path: "/opportunities", group: "Brokerage", description: "Available business opportunities", icon: BriefcaseBusiness },
  { title: "Add Opportunity", path: "/opportunities/new", group: "Brokerage", description: "Register a new opportunity", icon: BriefcaseBusiness },
  { title: "Documents", path: "/documents", group: "Records", description: "Document records and access", icon: FileText },
  { title: "Forms", path: "/forms", group: "Records", description: "Forms and submitted records", icon: ClipboardList },
  { title: "Archive", path: "/archive", group: "Records", description: "Archived company records", icon: Archive },
  { title: "Finance", path: "/finance", group: "Finance", description: "Financial operations and records", icon: Wallet },
  { title: "Receipts", path: "/finance/receipts", group: "Finance", description: "Receipt register", icon: FileText },
  { title: "Agents", path: "/agents", group: "Agents", description: "Agent records and management", icon: Users },
  { title: "Agent Redemptions", path: "/agents/redemptions", group: "Agents", description: "Agent redemption records", icon: Wallet },
  { title: "Agent Portal", path: "/agent-portal", group: "Agents", description: "Agent portal", icon: UserRound },
  { title: "Verification", path: "/verification", group: "Risk & Compliance", description: "Verification cases", icon: ShieldCheck },
  { title: "Risk Intelligence", path: "/risk", group: "Risk & Compliance", description: "Risk cases and risk records", icon: ShieldCheck },
  { title: "Risk Search", path: "/risk/search", group: "Risk & Compliance", description: "Search risk intelligence records", icon: Search },
  { title: "Research", path: "/research", group: "Risk & Compliance", description: "Research cases and intelligence", icon: FlaskConical },
  { title: "Objectives", path: "/objectives", group: "Management", description: "Objectives and progress tracking", icon: Target },
  { title: "Media", path: "/media", group: "Management", description: "Company media records", icon: Image },
  { title: "Brand Settings", path: "/brand", group: "Administration", description: "Company brand settings", icon: Settings },
  { title: "Account", path: "/account", group: "Administration", description: "Account settings", icon: UserRound },
  { title: "Admin Centre", path: "/admin", group: "Administration", description: "Administration tools", icon: Settings },
  { title: "User Management", path: "/admin/users", group: "Administration", description: "Manage system users", icon: Users },
  { title: "Roles & Permissions", path: "/admin/roles", group: "Administration", description: "Role-based access controls", icon: ShieldCheck },
  { title: "Audit Logs", path: "/admin/audit", group: "Administration", description: "Audit and activity records", icon: BookOpen },
  { title: "Maintenance", path: "/admin/maintenance", group: "Administration", description: "System maintenance controls", icon: Settings },
];

function PageDirectory() {
  const [search, setSearch] = useState("");
  const [group, setGroup] = useState("All pages");

  const groups = useMemo(
    () => ["All pages", ...Array.from(new Set(pages.map((page) => page.group)))],
    []
  );

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return pages.filter((page) => {
      const matchesGroup = group === "All pages" || page.group === group;
      const matchesSearch =
        !query ||
        page.title.toLowerCase().includes(query) ||
        page.description.toLowerCase().includes(query) ||
        page.path.toLowerCase().includes(query) ||
        page.group.toLowerCase().includes(query);
      return matchesGroup && matchesSearch;
    });
  }, [search, group]);

  return (
    <main className="mx-auto w-full max-w-7xl space-y-6 p-4 md:p-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Kalexi Brokerage Operating System
          </p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight">Company Page Directory</h1>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            A central index of the main registered application pages. Access remains
            subject to your existing login and permissions.
          </p>
        </div>
        <Link
          to="/dashboard"
          className="inline-flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium hover:bg-muted"
        >
          <LayoutDashboard size={16} /> Company Dashboard
        </Link>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border p-4">
          <p className="text-sm text-muted-foreground">Pages listed</p>
          <p className="mt-1 text-2xl font-bold">{pages.length}</p>
        </div>
        <div className="rounded-xl border p-4">
          <p className="text-sm text-muted-foreground">Categories</p>
          <p className="mt-1 text-2xl font-bold">{groups.length - 1}</p>
        </div>
        <div className="rounded-xl border p-4">
          <p className="text-sm text-muted-foreground">Search results</p>
          <p className="mt-1 text-2xl font-bold">{filtered.length}</p>
        </div>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative min-w-0 flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={18} />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search pages, departments or functions..."
            className="w-full rounded-lg border bg-background py-3 pl-10 pr-3 text-sm outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        <select
          value={group}
          onChange={(event) => setGroup(event.target.value)}
          className="rounded-lg border bg-background px-3 py-3 text-sm"
        >
          {groups.map((item) => <option key={item} value={item}>{item}</option>)}
        </select>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed p-10 text-center">
          <Search className="mx-auto mb-3 text-muted-foreground" size={28} />
          <p className="font-semibold">No matching pages</p>
          <p className="mt-1 text-sm text-muted-foreground">Try another search or category.</p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((page) => {
            const Icon = page.icon;
            return (
              <Link
                key={page.path}
                to={page.path as any}
                className="group flex min-w-0 items-start gap-3 rounded-xl border p-4 transition hover:border-primary/50 hover:bg-muted/40"
              >
                <span className="rounded-lg border p-2">
                  <Icon size={20} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2 font-semibold">
                    {page.title}
                    <ChevronRight className="shrink-0 opacity-50 transition group-hover:translate-x-1" size={16} />
                  </span>
                  <span className="mt-1 block text-sm text-muted-foreground">{page.description}</span>
                  <span className="mt-3 block truncate text-xs text-muted-foreground">{page.path}</span>
                  <span className="mt-2 inline-block rounded-full bg-muted px-2 py-1 text-xs">{page.group}</span>
                </span>
              </Link>
            );
          })}
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        This directory lists known main pages, not every record-specific URL.
        Detail pages normally open from the relevant client, deal, receipt or case.
        A listed link does not override role permissions or guarantee access to restricted data.
      </p>
    </main>
  );
}
