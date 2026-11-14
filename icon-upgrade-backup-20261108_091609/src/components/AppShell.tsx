import HolidayLoginAnnouncement from './HolidayLoginAnnouncement';
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import {
  Activity,
  Archive,
  ArrowLeft,
  BadgeCheck,
  BrainCircuit,
  BriefcaseBusiness,
  Building2,
  CalendarDays,
  ClipboardList,
  FileText,
  FlaskConical,
  FolderOpen,
  Gift,
  Image,
  KeyRound,
  LayoutDashboard,
  LogOut,
  Menu,
  Palette,
  ReceiptText,
  Search,
  Settings,
  ShieldAlert,
  Sparkles,
  Target,
  UserPlus,
  Users,
  Wallet,
  Wrench,
  X,
  type LucideIcon,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/hooks/useSession";
import { ROLE_LABEL, WORKSPACE_LABEL, navFor, primaryRole } from "@/lib/rbac";
import { StaffAvatar } from "@/components/StaffAvatar";
import { DailyOperationsBriefing } from "@/components/DailyOperationsBriefing";
import { KalexiMark } from "@/components/KalexiMark";
import { Button } from "@/components/ui/button";
import { GlobalSearch } from "@/components/GlobalSearch";
import { APP_VERSION_DISPLAY } from "@/lib/app-version";

const NAV_ICONS: Record<string, LucideIcon> = {
  "/my-availability": CalendarDays,
  "/calendar": CalendarDays,
  "/reception/scheduling": CalendarDays,
  "/dashboard": LayoutDashboard,
  "/clients": Users,
  "/clients/new": UserPlus,
  "/requirements": ClipboardList,
  "/forms": FileText,
  "/properties": Building2,
  "/properties/new": Building2,
  "/opportunities": Sparkles,
  "/opportunities/new": Sparkles,
  "/matches": Activity,
  "/deals": BriefcaseBusiness,
  "/deals/new": BriefcaseBusiness,
  "/verification": BadgeCheck,
  "/risk": ShieldAlert,
  "/risk/search": Search,
  "/research": FlaskConical,
  "/intelligence": BrainCircuit,
  "/documents": FolderOpen,
  "/media": Image,
  "/finance": Wallet,
  "/finance/receipts": ReceiptText,
  "/agents": Users,
  "/agents/redemptions": Gift,
  "/objectives": Target,
  "/archive": Archive,
  "/admin": Settings,
  "/employee-intelligence": Activity,
  "/brand": Palette,
  "/admin/maintenance": Wrench,
  "/admin/users": Users,
  "/admin/roles": KeyRound,
  "/admin/audit": ClipboardList,
};

const GROUP_ICONS: Record<string, LucideIcon> = {
  "My Workspace": CalendarDays,
  Company: CalendarDays,
  Reception: CalendarDays,
  Overview: LayoutDashboard,
  Clients: Users,
  Properties: Building2,
  Opportunities: Sparkles,
  Deals: BriefcaseBusiness,
  Verification: BadgeCheck,
  "Risk & Intelligence": BrainCircuit,
  Documents: FolderOpen,
  Transactions: Wallet,
  "Digital Agents": Gift,
  Objectives: Target,
  Archive,
  Administration: Settings,
};

const PAGE_TITLE_ICONS: [string, LucideIcon][] = [
  ["employee", Activity],
  ["performance", LayoutDashboard],
  ["dashboard", LayoutDashboard],
  ["client", Users],
  ["requirement", ClipboardList],
  ["property", Building2],
  ["opportun", Sparkles],
  ["match", Activity],
  ["deal", BriefcaseBusiness],
  ["verification", BadgeCheck],
  ["risk", ShieldAlert],
  ["research", FlaskConical],
  ["intelligence", BrainCircuit],
  ["document", FolderOpen],
  ["media", Image],
  ["receipt", ReceiptText],
  ["transaction", Wallet],
  ["finance", Wallet],
  ["agent", Gift],
  ["objective", Target],
  ["archive", Archive],
  ["admin", Settings],
  ["control centre", Settings],
  ["brand", Palette],
  ["maintenance", Wrench],
  ["account", Users],
  ["calendar", CalendarDays],
  ["audit", ClipboardList],
  ["search", Search],
];

function iconForPage(title: string): LucideIcon {
  const normalized = title.toLowerCase();
  return PAGE_TITLE_ICONS.find(([keyword]) => normalized.includes(keyword))?.[1] ?? Sparkles;
}

export function AppShell({ children }: { children: ReactNode }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const { data: session } = useSession();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  const roles = session?.roles ?? [];
  const groups = navFor(session?.access);
  const role = primaryRole(roles);

  async function signOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/", replace: true });
  }

  return (
    <div className="flex h-svh min-h-0 overflow-hidden bg-background">
      <HolidayLoginAnnouncement />
      <DailyOperationsBriefing />
      <aside className="no-print hidden w-64 shrink-0 flex-col bg-sidebar text-sidebar-foreground md:flex md:h-svh">
        <div className="flex items-center gap-3 border-b border-sidebar-border px-5 py-5">
          <KalexiMark className="h-9 w-9" />
          <div>
            <p className="font-display text-sm font-semibold leading-tight">KALEXI</p>
            <p className="text-[11px] tracking-[0.18em] text-sidebar-foreground/60">
              BROKERAGE LTD
            </p>
          </div>
        </div>

        <div className="px-5 py-4">
          <p className="text-[11px] uppercase tracking-[0.14em] text-sidebar-primary">
            {role ? WORKSPACE_LABEL[role] : "Workspace"}
          </p>
        </div>

        <div className="px-3 pb-3">
          <GlobalSearch />
        </div>

        <nav className="flex-1 space-y-4 overflow-y-auto px-3 pb-4">
          {groups.map((group) => (
            <div key={group.label} className="space-y-1">
              <p className="flex items-center gap-2 px-3 pb-1 text-[10px] uppercase tracking-[0.16em] text-sidebar-foreground/50">
                {(() => {
                  const GroupIcon = GROUP_ICONS[group.label] ?? Sparkles;
                  return <GroupIcon aria-hidden="true" className="h-3 w-3" />;
                })()}
                {group.label}
              </p>
              {group.items.map((item) => {
                const active =
                  item.to === "/dashboard" || item.to === "/admin"
                    ? pathname === item.to
                    : pathname.startsWith(item.to);
                return (
                  <Link
                    key={item.to}
                    to={item.to}
                    className={`group/nav-item flex items-center gap-2.5 rounded-lg border border-transparent px-3 py-2 text-sm transition-all duration-200 ${
                      active
                        ? "border-sidebar-border bg-sidebar-accent font-medium text-sidebar-foreground shadow-sm"
                        : "text-sidebar-foreground/75 hover:translate-x-0.5 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground"
                    }`}
                    aria-current={active ? "page" : undefined}
                  >
                    {(() => {
                      const ItemIcon = NAV_ICONS[item.to] ?? Sparkles;
                      return (
                        <ItemIcon
                          aria-hidden="true"
                          className={`h-4 w-4 shrink-0 transition-colors ${
                            active
                              ? "text-sidebar-primary"
                              : "text-sidebar-foreground/55 group-hover/nav-item:text-sidebar-primary"
                          }`}
                        />
                      );
                    })()}
                    {item.label}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>

        <div className="border-t border-sidebar-border p-4">
          <div className="flex items-center gap-3">
            <StaffAvatar
              photoUrl={session?.profile?.photo_url}
              name={session?.profile?.full_name}
              className="h-9 w-9 text-xs"
            />
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{session?.profile?.full_name}</p>
              <p className="truncate text-xs text-sidebar-foreground/60">
                {role ? ROLE_LABEL[role] : "No role assigned"}
              </p>
            </div>
          </div>
          <div className="mt-3 flex gap-2">
            <Link
              to="/account"
              className="flex-1 rounded-md border border-sidebar-border px-2 py-1.5 text-center text-xs text-sidebar-foreground/80 hover:bg-sidebar-accent"
            >
              <Users aria-hidden="true" className="mr-1.5 inline h-3.5 w-3.5" />
              Account
            </Link>
            <Button
              variant="ghost"
              onClick={signOut}
              className="flex-1 rounded-md border border-sidebar-border px-2 py-1.5 text-xs text-sidebar-foreground/80 hover:bg-sidebar-accent"
            >
              <LogOut aria-hidden="true" className="mr-1.5 h-3.5 w-3.5" />
              Sign out
            </Button>
          </div>
        </div>
      </aside>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <header className="no-print flex shrink-0 items-center justify-between gap-3 border-b bg-card px-5 py-3 md:hidden">
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              aria-label={menuOpen ? "Close navigation" : "Open navigation"}
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen(!menuOpen)}
            >
              {menuOpen ? <X /> : <Menu />}
            </Button>
            <KalexiMark className="h-7 w-7" />
            <span className="font-display text-sm font-semibold">Kalexi</span>
          </div>
          <Button variant="outline" size="sm" onClick={signOut}>
            <LogOut aria-hidden="true" className="mr-1.5 h-4 w-4" />
            Sign out
          </Button>
        </header>

        {menuOpen ? (
          <nav
            aria-label="Mobile navigation"
            className="no-print max-h-[65svh] shrink-0 space-y-4 overflow-y-auto border-b bg-card p-4 md:hidden"
          >
            <GlobalSearch />
            {groups.map((g) => (
              <div key={g.label}>
                <p className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase text-muted-foreground">
                  {(() => {
                    const GroupIcon = GROUP_ICONS[g.label] ?? Sparkles;
                    return <GroupIcon aria-hidden="true" className="h-3.5 w-3.5 text-primary" />;
                  })()}
                  {g.label}
                </p>
                <div className="grid grid-cols-2 gap-1">
                  {g.items.map((item) => (
                    <Button
                      asChild
                      key={item.to}
                      variant={pathname === item.to ? "default" : "ghost"}
                      className="h-auto min-h-11 justify-start whitespace-normal border border-transparent text-left transition-all hover:border-border"
                    >
                      <Link to={item.to} onClick={() => setMenuOpen(false)}>
                        {(() => {
                          const ItemIcon = NAV_ICONS[item.to] ?? Sparkles;
                          return <ItemIcon aria-hidden="true" className="mr-2 h-4 w-4 shrink-0" />;
                        })()}
                        {item.label}
                      </Link>
                    </Button>
                  ))}
                </div>
              </div>
            ))}
            <Button asChild variant="outline">
              <Link to="/account">
                <Users aria-hidden="true" className="mr-2 h-4 w-4" />
                My account
              </Link>
            </Button>
          </nav>
        ) : null}

        <main className="workspace-main min-h-0 min-w-0 flex-1 overflow-y-scroll overscroll-y-contain px-4 py-5 md:px-8 md:py-8">
          <div className="no-print mb-4">
            <BackButton />
          </div>
          {children}
        </main>
        <footer className="no-print shrink-0 border-t bg-card px-4 py-2 text-center text-xs text-muted-foreground">
          {APP_VERSION_DISPLAY}
        </footer>
      </div>
    </div>
  );
}

export function BackButton({ fallback = "/dashboard" }: { fallback?: string }) {
  const navigate = useNavigate();

  function goBack() {
    if (window.history.length > 1) {
      window.history.back();
      return;
    }
    navigate({ to: fallback, replace: true });
  }

  return (
    <Button variant="ghost" size="sm" onClick={goBack} aria-label="Go back">
      <ArrowLeft aria-hidden="true" className="mr-1.5 h-4 w-4" />
      Back
    </Button>
  );
}

export function PageHeader({
  title,
  description,
  actions,
  icon,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
  icon?: LucideIcon;
}) {
  const PageIcon = icon ?? iconForPage(title);
  return (
    <div className="page-header mb-6 flex flex-wrap items-end justify-between gap-4 border-b pb-5">
      <div className="flex min-w-0 items-center gap-3">
        <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-primary/15 bg-gradient-to-br from-primary/15 via-primary/5 to-transparent text-primary shadow-sm transition-transform duration-200 hover:-translate-y-0.5">
          <PageIcon aria-hidden="true" className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground">{title}</h1>
          {description ? <p className="mt-1 text-sm text-muted-foreground">{description}</p> : null}
        </div>
      </div>
      <div className="max-w-full [&>div]:flex-wrap">{actions}</div>
    </div>
  );
}

