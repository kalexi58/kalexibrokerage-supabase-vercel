import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Activity, CheckCircle2, CircleAlert, Clock3, ServerCog } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { CompanyBrand } from "@/components/CompanyBrand";
import { MaintenanceNotice } from "@/components/MaintenanceNotice";
import { AppShell, PageHeader } from "@/components/AppShell";
import { NoAccess } from "@/components/records";
import { BrandedLoadingScreen, ErrorState } from "@/components/LoadingStates";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useSession } from "@/hooks/useSession";
import {
  getMaintenanceAccess,
  getMaintenanceHealth,
  getMaintenanceSettings,
  getMaintenanceStatus,
  saveMaintenanceSettings,
} from "@/lib/maintenance.functions";
import { lookupLoginIdentity, signInWithPhone, type LoginIdentity } from "@/lib/auth.functions";

export const Route = createFileRoute("/maintenance")({
  head: () => ({
    meta: [
      { title: "System Maintenance — Kalexi Brokerage" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: () => <MaintenanceRoute />,
});

function toLocalDateTime(value: string | null | undefined): string {
  if (!value) return "";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 16);
}

export function MaintenanceAdminPage() {
  const session = useSession();

  if (session.isPending) {
    return <BrandedLoadingScreen message="Verifying administrator permissions…" />;
  }

  if (session.isError) {
    return (
      <AppShell>
        <ErrorState
          title="Administrator permissions could not be verified"
          description="Check your connection and retry."
          onRetry={() => void session.refetch()}
        />
      </AppShell>
    );
  }

  if (!session.data?.access.isSuperAdmin) {
    return (
      <AppShell>
        <PageHeader title="System maintenance" />
        <NoAccess module="System maintenance" />
      </AppShell>
    );
  }

  return (
    <AppShell>
      <MaintenanceRoute embedded />
    </AppShell>
  );
}

function MaintenanceRoute({ embedded = false }: { embedded?: boolean }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const session = useSession();
  const [loginMethod, setLoginMethod] = useState<"email" | "phone">("email");
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [identity, setIdentity] = useState<LoginIdentity | null>(null);
  const [loginStep, setLoginStep] = useState<"identity" | "password">("identity");
  const [signingIn, setSigningIn] = useState(false);
  const [preview, setPreview] = useState(false);
  const [message, setMessage] = useState("");
  const [estimatedCompletionTime, setEstimatedCompletionTime] = useState("");
  const [saving, setSaving] = useState(false);

  const admin = session.data?.access.isSuperAdmin ?? false;
  const statusQuery = useQuery({
    queryKey: ["maintenance-status"],
    queryFn: () => getMaintenanceStatus({ data: undefined }),
    retry: 1,
    refetchInterval: 30_000,
  });
  const settingsQuery = useQuery({
    queryKey: ["maintenance-settings"],
    enabled: admin,
    queryFn: () => getMaintenanceSettings({ data: undefined }),
    refetchInterval: admin ? 60_000 : false,
  });
  const healthQuery = useQuery({
    queryKey: ["maintenance-health"],
    enabled: admin,
    queryFn: () => getMaintenanceHealth({ data: undefined }),
    refetchInterval: admin ? 60_000 : false,
  });
  const activityMessage = signingIn
    ? "Verifying sign-in details…"
    : saving
      ? "Saving maintenance settings…"
      : statusQuery.isLoading
        ? "Checking system status…"
        : admin && settingsQuery.isLoading
          ? "Loading maintenance settings…"
          : admin && settingsQuery.isFetching
            ? "Refreshing maintenance status…"
            : null;

  useEffect(() => {
    const settings = settingsQuery.data;
    if (!settings) return;
    setMessage(settings.maintenance_message ?? "");
    setEstimatedCompletionTime(toLocalDateTime(settings.estimated_completion_time));
  }, [settingsQuery.data]);

  useEffect(() => {
    if (statusQuery.data && !statusQuery.data.maintenanceEnabled && !admin) {
      window.location.replace("/");
    }
  }, [admin, statusQuery.data]);

  async function signIn() {
    setSigningIn(true);
    try {
      if (loginMethod === "email" && loginStep === "identity") {
        const account = await lookupLoginIdentity({ data: { identifier: identifier.trim() } });
        if (!account) throw new Error("Account not found or not authorized.");
        setIdentity(account);
        setLoginStep("password");
        return;
      }

      if (loginMethod === "email") {
        const { error } = await supabase.auth.signInWithPassword({
          email: identifier.trim(),
          password,
        });
        if (error) throw error;
      } else {
        const { session: phoneSession } = await signInWithPhone({
          data: { phone: identifier.trim(), password },
        });
        const { error } = await supabase.auth.setSession(phoneSession);
        if (error) throw error;
      }

      await queryClient.invalidateQueries({ queryKey: ["session"] });
      await queryClient.invalidateQueries({ queryKey: ["maintenance-access"] });
      await queryClient.invalidateQueries({ queryKey: ["maintenance-settings"] });
      const access = await getMaintenanceAccess({ data: undefined });
      if (!access.isSuperAdmin) {
        await supabase.auth.signOut();
        throw new Error("Super Admin access is required during maintenance.");
      }
      await navigate({ to: "/admin", replace: true });
      setPassword("");
    } catch (error) {
      console.error("[maintenance] Administrator sign-in failed.", error);
      toast.error("Could not verify administrator access. Check your sign-in details.");
    } finally {
      setSigningIn(false);
    }
  }

  function changeLoginMethod(method: "email" | "phone") {
    setLoginMethod(method);
    setIdentifier("");
    setPassword("");
    setIdentity(null);
    setLoginStep("identity");
  }

  function changeAccount() {
    setPassword("");
    setIdentity(null);
    setLoginStep("identity");
  }

  async function signOut() {
    await supabase.auth.signOut();
    await queryClient.clear();
    window.location.reload();
  }

  async function save(enabled: boolean) {
    const currentEnabled = settingsQuery.data?.maintenance_enabled ?? false;
    if (
      enabled !== currentEnabled &&
      !window.confirm(
        enabled
          ? "Enable maintenance mode? All non-administrator users will be blocked from the system."
          : "Disable maintenance mode and restore normal access?",
      )
    ) {
      return;
    }

    setSaving(true);
    try {
      const saved = await saveMaintenanceSettings({
        data: {
          maintenanceEnabled: enabled,
          maintenanceMessage: message.trim() || null,
          estimatedCompletionTime: estimatedCompletionTime
            ? new Date(estimatedCompletionTime).toISOString()
            : null,
        },
      });
      queryClient.setQueryData(["maintenance-settings"], (current: typeof settingsQuery.data) =>
        current ? { ...current, ...saved } : current,
      );
      await queryClient.invalidateQueries({ queryKey: ["maintenance-status"] });
      await queryClient.invalidateQueries({ queryKey: ["maintenance-settings"] });
      toast.success(
        enabled === currentEnabled
          ? "Maintenance announcement and estimate saved."
          : enabled
            ? "Maintenance mode enabled."
            : "Maintenance mode disabled.",
      );
      if (!enabled) setPreview(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save maintenance settings.");
    } finally {
      setSaving(false);
    }
  }

  if (preview || (statusQuery.data?.maintenanceEnabled && !admin)) {
    return (
      <MaintenanceNotice
        available={preview || (statusQuery.data?.maintenanceEnabled ?? false)}
        message={message || statusQuery.data?.maintenanceMessage || null}
        estimatedCompletionTime={
          estimatedCompletionTime
            ? new Date(estimatedCompletionTime).toISOString()
            : (statusQuery.data?.estimatedCompletionTime ?? null)
        }
        onRetry={() => (preview ? setPreview(false) : void statusQuery.refetch())}
        retryLabel={preview ? "Return to settings" : "Check availability"}
      />
    );
  }

  if (!admin) {
    if (statusQuery.data && !statusQuery.data.maintenanceEnabled) return null;
    return (
      <main className="flex min-h-svh items-center justify-center bg-[#f6f8f7] px-4 py-8">
        <div className="w-full max-w-xl">
          <MaintenanceNotice
            available={statusQuery.data?.maintenanceEnabled ?? false}
            message={statusQuery.data?.maintenanceMessage ?? null}
            estimatedCompletionTime={statusQuery.data?.estimatedCompletionTime ?? null}
            onRetry={() => void statusQuery.refetch()}
          />
          <section className="mx-auto -mt-2 max-w-xl rounded-b-2xl border border-t-0 bg-white px-6 pb-7 text-center sm:px-12">
            <p className="mb-3 text-xs text-muted-foreground">Administrator access</p>
            {activityMessage ? <ActivityStatus message={activityMessage} /> : null}
            {session.data ? (
              <div>
                <p className="text-sm text-destructive">
                  Only an authorized Super Admin can access maintenance controls.
                </p>
                <Button variant="outline" className="mt-3" onClick={signOut}>
                  Sign out
                </Button>
              </div>
            ) : (
              <form
                className="mx-auto grid max-w-sm gap-3 text-left"
                onSubmit={(event) => {
                  event.preventDefault();
                  void signIn();
                }}
              >
                <div className="grid grid-cols-2 rounded-lg border p-1" aria-label="Sign-in method">
                  <button
                    type="button"
                    className={`rounded-md px-3 py-2 text-sm font-medium ${
                      loginMethod === "email" ? "bg-primary text-primary-foreground" : ""
                    }`}
                    aria-pressed={loginMethod === "email"}
                    onClick={() => changeLoginMethod("email")}
                  >
                    Email
                  </button>
                  <button
                    type="button"
                    className={`rounded-md px-3 py-2 text-sm font-medium ${
                      loginMethod === "phone" ? "bg-primary text-primary-foreground" : ""
                    }`}
                    aria-pressed={loginMethod === "phone"}
                    onClick={() => changeLoginMethod("phone")}
                  >
                    Phone number
                  </button>
                </div>
                {identity && loginStep === "password" ? (
                  <div className="flex items-center justify-between gap-3 rounded-md border p-3">
                    <div>
                      <p className="text-sm font-medium">{identity.fullName}</p>
                      <p className="text-xs text-muted-foreground">{identifier}</p>
                    </div>
                    <Button type="button" variant="ghost" size="sm" onClick={changeAccount}>
                      Change
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    <Label htmlFor="maintenance-admin-identifier">
                      {loginMethod === "email" ? "Administrator email" : "Administrator phone"}
                    </Label>
                    <Input
                      id="maintenance-admin-identifier"
                      type={loginMethod === "email" ? "email" : "tel"}
                      autoComplete="username"
                      required
                      value={identifier}
                      onChange={(event) => setIdentifier(event.target.value)}
                    />
                  </div>
                )}
                {(loginMethod === "phone" || loginStep === "password") && (
                  <div className="space-y-1.5">
                    <Label htmlFor="maintenance-admin-password">Password</Label>
                    <Input
                      id="maintenance-admin-password"
                      type="password"
                      autoComplete="current-password"
                      required
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                    />
                  </div>
                )}
                <Button type="submit" disabled={signingIn}>
                  {signingIn
                    ? "Verifying…"
                    : loginMethod === "email" && loginStep === "identity"
                      ? "Continue"
                      : "Sign in as administrator"}
                </Button>
              </form>
            )}
          </section>
        </div>
      </main>
    );
  }

  const settings = settingsQuery.data;
  const settingsContent = (
    <>
      {embedded ? (
        <PageHeader
          title="System maintenance"
          description="Review the current system status and configure controlled maintenance access."
        />
      ) : (
        <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div>
            <CompanyBrand markClassName="h-10 w-10" />
            <p className="mt-1 text-xs text-muted-foreground">Maintenance administration</p>
          </div>
          <Button variant="outline" onClick={signOut}>
            Sign out
          </Button>
        </header>
      )}

      <section className="rounded-2xl border bg-white p-5 shadow-sm sm:p-8">
        {activityMessage ? <ActivityStatus message={activityMessage} /> : null}
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="font-display text-2xl font-semibold">System maintenance</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Only Super Admins can change the global maintenance state.
            </p>
          </div>
          <span
            className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
              settings?.maintenance_enabled
                ? "bg-amber-100 text-amber-900"
                : "bg-emerald-100 text-emerald-900"
            }`}
            role="status"
          >
            {settingsQuery.isLoading
              ? "Checking status…"
              : settings?.maintenance_enabled
                ? "Maintenance enabled"
                : "Maintenance disabled"}
          </span>
        </div>

        {settingsQuery.isError ? (
          <p className="mt-5 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
            Maintenance settings could not be loaded. The system fails closed for non-admins.
            Refresh to retry; no setting was changed.
          </p>
        ) : null}

        <section
          aria-label="System health"
          className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
        >
          <HealthCard
            icon={ServerCog}
            label="Application"
            value={
              healthQuery.data?.application === "healthy"
                ? "Responding"
                : healthQuery.isError
                  ? "Unavailable"
                  : "Checking"
            }
            healthy={healthQuery.data?.application === "healthy"}
          />
          <HealthCard
            icon={Activity}
            label="Database"
            value={
              healthQuery.isFetching && !healthQuery.data
                ? "Checking"
                : healthQuery.data?.database === "healthy"
                  ? "Connected"
                  : healthQuery.isError || healthQuery.data?.database === "unavailable"
                    ? "Unavailable"
                    : "Checking"
            }
            healthy={healthQuery.data?.database === "healthy"}
          />
          <div className="rounded-lg border bg-background p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Application version
            </p>
            <p className="mt-2 truncate text-sm font-semibold">
              {healthQuery.data?.version ?? "Checking"}
            </p>
          </div>
          <div className="rounded-lg border bg-background p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Last health check
            </p>
            <p className="mt-2 text-sm font-semibold">
              {healthQuery.data
                ? new Date(healthQuery.data.checkedAt).toLocaleTimeString()
                : "Not checked"}
            </p>
            {healthQuery.data ? (
              <p className="mt-1 text-xs text-muted-foreground">
                Database response: {healthQuery.data.durationMs} ms
              </p>
            ) : null}
          </div>
          {healthQuery.isError ? (
            <p className="text-sm text-destructive sm:col-span-2 lg:col-span-4" role="alert">
              The application health check could not be completed. Retry to check again.
            </p>
          ) : null}
        </section>

        <div className="mt-6 grid gap-5">
          <div className="space-y-1.5">
            <Label htmlFor="maintenance-message">Optional message for users</Label>
            <textarea
              id="maintenance-message"
              maxLength={1000}
              rows={3}
              className="w-full rounded-md border bg-background p-3 text-sm"
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              placeholder="Optional additional information about this maintenance."
            />
            <p className="text-xs text-muted-foreground">
              This announcement is shown publicly while maintenance is enabled. Save changes below
              to publish an update.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="maintenance-estimate">Estimated completion (optional)</Label>
            <Input
              id="maintenance-estimate"
              type="datetime-local"
              value={estimatedCompletionTime}
              onChange={(event) => setEstimatedCompletionTime(event.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Leave blank if there is no reliable estimate.
            </p>
          </div>
        </div>

        <div className="mt-6 flex flex-wrap gap-2">
          {settings?.maintenance_enabled ? (
            <Button
              variant="destructive"
              disabled={saving || settingsQuery.isLoading || settingsQuery.isError}
              onClick={() => void save(false)}
            >
              {saving ? "Saving…" : "Disable maintenance"}
            </Button>
          ) : (
            <Button
              disabled={saving || settingsQuery.isLoading || settingsQuery.isError}
              onClick={() => void save(true)}
            >
              {saving ? "Saving…" : "Enable maintenance"}
            </Button>
          )}
          <Button
            variant="outline"
            disabled={saving || settingsQuery.isLoading || settingsQuery.isError || !settings}
            onClick={() => void save(settings?.maintenance_enabled ?? false)}
          >
            {saving ? "Saving…" : "Save announcement & estimate"}
          </Button>
          <Button variant="outline" onClick={() => setPreview(true)}>
            Preview maintenance page
          </Button>
          <Button
            variant="ghost"
            disabled={settingsQuery.isFetching || healthQuery.isFetching}
            onClick={() => {
              void settingsQuery.refetch();
              void healthQuery.refetch();
            }}
          >
            {settingsQuery.isFetching || healthQuery.isFetching ? "Refreshing…" : "Refresh status"}
          </Button>
        </div>

        <div className="mt-7 border-t pt-5 text-sm">
          <h2 className="font-semibold">Last change</h2>
          {settings?.maintenance_updated_at ? (
            <p className="mt-1 text-muted-foreground">
              {settings.updatedBy?.fullName ?? "Unknown administrator"}
              {settings.updatedBy?.email ? ` (${settings.updatedBy.email})` : ""}
              {" · "}
              {new Date(settings.maintenance_updated_at).toLocaleString()}
            </p>
          ) : (
            <p className="mt-1 text-muted-foreground">No maintenance changes recorded.</p>
          )}
        </div>

        <div className="mt-7 border-t pt-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-semibold">Recent maintenance history</h2>
              <p className="mt-1 text-xs text-muted-foreground">
                Enable and disable actions recorded in the audit log.
              </p>
            </div>
            <Button asChild variant="ghost" size="sm">
              <Link to="/admin/audit">Open audit trail</Link>
            </Button>
          </div>
          {settingsQuery.isError ? (
            <p className="mt-4 text-sm text-destructive" role="alert">
              Maintenance history could not be loaded.
            </p>
          ) : settingsQuery.isLoading ? (
            <p className="mt-4 text-sm text-muted-foreground">Loading maintenance history…</p>
          ) : settings?.history.length ? (
            <ol className="mt-4 divide-y rounded-lg border">
              {settings.history.map((entry) => (
                <li
                  key={entry.id}
                  className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm"
                >
                  <span className="font-medium">
                    {entry.action === "system.maintenance_enabled"
                      ? "Maintenance enabled"
                      : entry.action === "system.maintenance_disabled"
                        ? "Maintenance disabled"
                        : "Maintenance announcement or estimate updated"}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {entry.actor_email ?? "Administrator"} ·{" "}
                    {new Date(entry.created_at).toLocaleString()}
                  </span>
                </li>
              ))}
            </ol>
          ) : (
            <p className="mt-4 text-sm text-muted-foreground">
              No maintenance mode changes have been recorded.
            </p>
          )}
        </div>
      </section>
    </>
  );
  return embedded ? (
    <div className="mx-auto max-w-3xl">{settingsContent}</div>
  ) : (
    <main className="min-h-svh bg-[#f6f8f7] px-4 py-8 text-[#172625] sm:px-8">
      <div className="mx-auto max-w-3xl">{settingsContent}</div>
    </main>
  );
}

function HealthCard({
  icon: Icon,
  label,
  value,
  healthy,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  healthy: boolean | undefined;
}) {
  const StateIcon = healthy === false ? CircleAlert : healthy ? CheckCircle2 : Clock3;
  return (
    <div className="rounded-lg border bg-background p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
        <Icon aria-hidden="true" className="h-4 w-4 text-muted-foreground" />
      </div>
      <p className="mt-2 flex items-center gap-2 text-sm font-semibold">
        <StateIcon
          aria-hidden="true"
          className={`h-4 w-4 ${
            healthy === false
              ? "text-destructive"
              : healthy
                ? "text-emerald-600"
                : "text-muted-foreground"
          }`}
        />
        {value}
      </p>
    </div>
  );
}

function ActivityStatus({ message }: { message: string }) {
  return (
    <div
      className="mb-5 rounded-lg border border-[#dce7e3] bg-[#f8fbf9] px-4 py-3"
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <CompanyBrand markClassName="h-8 w-8" />
        <span className="text-xs font-medium text-[#52615d]">{message}</span>
      </div>
      <div
        className="mt-3 h-1.5 overflow-hidden rounded-full bg-[#e3ece8]"
        role="progressbar"
        aria-label={message}
        aria-valuetext="In progress"
      >
        <span className="maintenance-progress-indicator block h-full w-1/3 rounded-full bg-[#145453]" />
      </div>
    </div>
  );
}
