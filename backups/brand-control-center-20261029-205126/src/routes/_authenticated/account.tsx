import { createFileRoute } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
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
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");

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
