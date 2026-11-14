import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { MediaGallery } from "@/components/MediaGallery";
import { AvatarUploader } from "@/components/StaffAvatar";
import { AppShell, PageHeader } from "@/components/AppShell";
import { useRefreshSession, useSession } from "@/hooks/useSession";
import { completePasswordChange } from "@/lib/auth.functions";
import { ROLE_LABEL } from "@/lib/rbac";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { DEFAULT_INTERFACE_PREFERENCES } from "@/hooks/useInterfaceTheme";

type ThemeMode = "light" | "dark" | "system";
type Density = "comfortable" | "compact";
type Accent = "kalexi" | "ocean" | "forest" | "violet" | "gold";
type InterfacePreferences = {
  theme_mode: ThemeMode;
  density: Density;
  accent: Accent;
};

const preferenceKey = (userId?: string) => ["user-interface-preferences", userId];
const parseThemeMode = (value: string): ThemeMode =>
  value === "dark" || value === "system" ? value : "light";
const parseDensity = (value: string): Density =>
  value === "compact" ? "compact" : "comfortable";
const parseAccent = (value: string): Accent =>
  value === "ocean" || value === "forest" || value === "violet" || value === "gold"
    ? value
    : "kalexi";

export const Route = createFileRoute("/_authenticated/account")({
  head: () => ({
    meta: [
      { title: "My Account — Kalexi Brokerage" },
      { name: "description", content: "Manage your Kalexi staff account and password." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AccountPage,
});

function AccountPage() {
  const { data: session } = useSession();
  const refresh = useRefreshSession();
  const queryClient = useQueryClient();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [preferences, setPreferences] = useState<InterfacePreferences>(
    DEFAULT_INTERFACE_PREFERENCES,
  );
  const savedPreferences = useQuery({
    queryKey: preferenceKey(session?.userId),
    enabled: !!session?.userId,
    queryFn: async (): Promise<InterfacePreferences> => {
      if (!session) return DEFAULT_INTERFACE_PREFERENCES;
      const { data, error } = await supabase
        .from("user_preferences")
        .select("theme_mode, density, accent")
        .eq("user_id", session.userId)
        .maybeSingle();
      if (error) throw error;
      return {
        theme_mode: parseThemeMode(data?.theme_mode ?? "light"),
        density: parseDensity(data?.density ?? "comfortable"),
        accent: parseAccent(data?.accent ?? "kalexi"),
      };
    },
  });

  useEffect(() => {
    if (savedPreferences.data) setPreferences(savedPreferences.data);
  }, [savedPreferences.data]);

  const savePreferences = useMutation({
    mutationFn: async () => {
      if (!session) throw new Error("Sign in to save your preferences.");
      const { error } = await supabase.from("user_preferences").upsert({
        user_id: session.userId,
        ...preferences,
      });
      if (error) throw error;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: preferenceKey(session?.userId) });
      toast.success("Appearance preferences saved");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const change = useMutation({
    mutationFn: async () => {
      if (password.length < 10) throw new Error("Use at least 10 characters.");
      if (password !== confirm) throw new Error("Passwords do not match.");
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      await completePasswordChange();
    },
    onSuccess: () => {
      setPassword("");
      setConfirm("");
      refresh();
      toast.success("Password updated");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const p = session?.profile;

  return (
    <AppShell>
      <PageHeader title="My account" description="Your staff identity and sign-in security." />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="shadow-[var(--shadow-panel)]">
          <CardContent className="space-y-4 p-6">
            <div>
              <p className="label-caps">Appearance</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Personal workspace settings do not change official document branding.
              </p>
            </div>
            {savedPreferences.error ? (
              <p role="alert" className="text-sm text-destructive">
                Could not load saved preferences: {savedPreferences.error.message}
              </p>
            ) : null}
            <div className="space-y-2">
              <Label htmlFor="theme-mode">Theme</Label>
              <select
                id="theme-mode"
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={preferences.theme_mode}
                onChange={(event) =>
                  setPreferences((current) => ({
                    ...current,
                    theme_mode: parseThemeMode(event.target.value),
                  }))
                }
              >
                <option value="light">Light</option>
                <option value="dark">Dark</option>
                <option value="system">System</option>
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="interface-density">Layout density</Label>
              <select
                id="interface-density"
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={preferences.density}
                onChange={(event) =>
                  setPreferences((current) => ({
                    ...current,
                    density: parseDensity(event.target.value),
                  }))
                }
              >
                <option value="comfortable">Comfortable</option>
                <option value="compact">Compact</option>
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="interface-accent">Workspace accent</Label>
              <select
                id="interface-accent"
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={preferences.accent}
                onChange={(event) =>
                  setPreferences((current) => ({
                    ...current,
                    accent: parseAccent(event.target.value),
                  }))
                }
              >
                <option value="kalexi">Kalexi green</option>
                <option value="ocean">Ocean blue</option>
                <option value="forest">Forest</option>
                <option value="violet">Violet</option>
                <option value="gold">Gold</option>
              </select>
            </div>
            <Button
              onClick={() => savePreferences.mutate()}
              disabled={!session || savedPreferences.isLoading || savePreferences.isPending}
            >
              {savePreferences.isPending ? "Saving…" : "Save appearance"}
            </Button>
          </CardContent>
        </Card>
        <Card className="shadow-[var(--shadow-panel)]">
          <CardContent className="p-6">
            <p className="label-caps mb-3">Staff identity</p>
            {session ? (
              <div className="mb-5">
                <AvatarUploader
                  userId={session.userId}
                  name={p?.full_name}
                  photoUrl={p?.photo_url}
                  onUploaded={async (path) => {
                    const { error } = await supabase
                      .from("profiles")
                      .update({ photo_url: path })
                      .eq("id", session.userId);
                    if (error) throw new Error(error.message);
                    refresh();
                    toast.success("Profile photo updated");
                  }}
                />
              </div>
            ) : null}
            <dl className="space-y-3 text-sm">
              {[
                ["Name", p?.full_name ?? "—"],
                ["Email", p?.email ?? "—"],
                ["Job title", p?.job_title ?? "—"],
                ["Department", p?.department ?? "—"],
                ["Roles", (session?.roles ?? []).map((r) => ROLE_LABEL[r]).join(", ") || "—"],
              ].map(([k, v]) => (
                <div key={k} className="flex gap-4">
                  <dt className="w-28 shrink-0 text-muted-foreground">{k}</dt>
                  <dd className="font-medium">{v}</dd>
                </div>
              ))}
            </dl>
          </CardContent>
        </Card>

        <Card className="shadow-[var(--shadow-panel)]">
          <CardContent className="space-y-4 p-6">
            <p className="label-caps">Change password</p>
            <div className="space-y-2">
              <Label>New password</Label>
              <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Confirm new password</Label>
              <Input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
            </div>
            <Button onClick={() => change.mutate()} disabled={change.isPending}>
              {change.isPending ? "Updating…" : "Update password"}
            </Button>
          </CardContent>
        </Card>
      </div>
      {session ? (
        <div className="mt-6">
          <MediaGallery parentType="profiles" parentId={session.userId} title="My photos & videos" description="Personal record media — profile photos, field recordings and evidence you captured." />
        </div>
      ) : null}

    </AppShell>
  );
}
