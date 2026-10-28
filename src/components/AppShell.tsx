import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { Menu, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/hooks/useSession";
import { ROLE_LABEL, WORKSPACE_LABEL, navFor, primaryRole } from "@/lib/rbac";
import { StaffAvatar } from "@/components/StaffAvatar";
import { KalexiMark } from "@/components/KalexiMark";
import { Button } from "@/components/ui/button";
import { GlobalSearch } from "@/components/GlobalSearch";
import { APP_VERSION_DISPLAY } from "@/lib/app-version";

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
              <p className="px-3 pb-1 text-[10px] uppercase tracking-[0.16em] text-sidebar-foreground/40">
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
                    className={`block rounded-md px-3 py-2 text-sm transition-colors ${
                      active
                        ? "bg-sidebar-accent font-medium text-sidebar-foreground"
                        : "text-sidebar-foreground/70 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground"
                    }`}
                  >
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
              Account
            </Link>
            <Button
              variant="ghost"
              onClick={signOut}
              className="flex-1 rounded-md border border-sidebar-border px-2 py-1.5 text-xs text-sidebar-foreground/80 hover:bg-sidebar-accent"
            >
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
                <p className="mb-1 text-xs font-semibold uppercase text-muted-foreground">
                  {g.label}
                </p>
                <div className="grid grid-cols-2 gap-1">
                  {g.items.map((item) => (
                    <Button
                      asChild
                      key={item.to}
                      variant={pathname === item.to ? "default" : "ghost"}
                      className="h-auto min-h-11 justify-start whitespace-normal text-left"
                    >
                      <Link to={item.to} onClick={() => setMenuOpen(false)}>
                        {item.label}
                      </Link>
                    </Button>
                  ))}
                </div>
              </div>
            ))}
            <Button asChild variant="outline">
              <Link to="/account">My account</Link>
            </Button>
          </nav>
        ) : null}

        <main className="min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain px-4 py-5 md:px-8 md:py-8">
          {children}
        </main>
        <footer className="no-print shrink-0 border-t bg-card px-4 py-2 text-center text-xs text-muted-foreground">
          {APP_VERSION_DISPLAY}
        </footer>
      </div>
    </div>
  );
}

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4 border-b pb-5">
      <div className="min-w-0">
        <h1 className="font-display text-2xl font-semibold text-foreground">{title}</h1>
        {description ? <p className="mt-1 text-sm text-muted-foreground">{description}</p> : null}
      </div>
      <div className="max-w-full [&>div]:flex-wrap">{actions}</div>
    </div>
  );
}
