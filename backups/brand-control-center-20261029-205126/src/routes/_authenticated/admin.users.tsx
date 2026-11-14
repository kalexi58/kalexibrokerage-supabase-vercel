import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { AppShell, PageHeader } from "@/components/AppShell";
import { useSession } from "@/hooks/useSession";
import { ALL_ROLES, ROLE_LABEL, allows, type AppRole } from "@/lib/rbac";
import {
  adminCreateUser,
  adminResetPassword,
  adminSetRoles,
  adminSetStatus,
  adminTerminateSessions,
} from "@/lib/auth.functions";
import { adminUpdateStaffIdentity } from "@/lib/admin.functions";
import { AvatarUploader, StaffAvatar } from "@/components/StaffAvatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export const Route = createFileRoute("/_authenticated/admin/users")({
  head: () => ({
    meta: [
      { title: "Staff & Access Control — Kalexi Brokerage" },
      { name: "description", content: "Create staff accounts and control system access and roles." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: UsersPage,
});

interface StaffRow {
  id: string;
  full_name: string;
  email: string;
  phone: string | null;
  job_title: string | null;
  department: string | null;
  photo_url: string | null;
  status: string;
  last_login_at: string | null;
}

const ADMIN_TOOLS: { to: "/admin/roles" | "/admin/audit" | "/documents"; label: string; hint: string }[] = [
  { to: "/admin/roles", label: "Roles & permissions", hint: "Equip each workspace with its tools" },
  { to: "/admin/audit", label: "Audit logs", hint: "Immutable record of every action" },
  { to: "/documents", label: "Document vault", hint: "Versioned, access-controlled papers" },
];

function UsersPage() {
  const { data: session } = useSession();
  const access = session?.access;
  const qc = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<(StaffRow & { roles: AppRole[] }) | null>(null);
  const [tempPassword, setTempPassword] = useState<{ email: string; password: string } | null>(null);

  const staff = useQuery({
    queryKey: ["staff"],
    queryFn: async () => {
      const [{ data: profiles }, { data: roles }] = await Promise.all([
        supabase
          .from("profiles")
          .select("id, full_name, email, phone, job_title, department, photo_url, status, last_login_at")
          .order("created_at", { ascending: true }),
        supabase.from("user_roles").select("user_id, role"),
      ]);
      const byUser = new Map<string, AppRole[]>();
      for (const r of roles ?? []) {
        const list = byUser.get(r.user_id) ?? [];
        list.push(r.role as AppRole);
        byUser.set(r.user_id, list);
      }
      return ((profiles ?? []) as StaffRow[]).map((p) => ({ ...p, roles: byUser.get(p.id) ?? [] }));
    },
  });

  const refresh = () => qc.invalidateQueries({ queryKey: ["staff"] });

  const setStatus = useMutation({
    mutationFn: (v: { userId: string; status: "active" | "disabled" }) =>
      adminSetStatus({ data: v }),
    onSuccess: () => {
      toast.success("Account status updated");
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const setRoles = useMutation({
    mutationFn: (v: { userId: string; roles: AppRole[] }) => adminSetRoles({ data: v }),
    onSuccess: () => {
      toast.success("Roles updated");
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const resetPassword = useMutation({
    mutationFn: async (v: { userId: string; email: string }) => {
      const res = await adminResetPassword({ data: { userId: v.userId } });
      return { email: v.email, tempPassword: res.temporaryPassword };
    },
    onSuccess: (res) => {
      setTempPassword({ email: res.email, password: res.tempPassword });
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const terminate = useMutation({
    mutationFn: (v: { userId: string }) => adminTerminateSessions({ data: v }),
    onSuccess: () => toast.success("All sessions terminated"),
    onError: (e: Error) => toast.error(e.message),
  });

  if (!allows(access, "admin.users")) {
    return (
      <AppShell>
        <PageHeader
          title="Restricted"
          description="Only the Super Admin may manage staff accounts and access control."
        />
      </AppShell>
    );
  }

  return (
    <AppShell>
      <PageHeader
        title="Staff &amp; access control"
        description="Create accounts, assign roles and revoke access. Every action is audit-logged."
        actions={<Button onClick={() => setCreating(true)}>Create staff account</Button>}
      />

      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        {ADMIN_TOOLS.map((tool) => (
          <Link
            key={tool.to}
            to={tool.to}
            className="rounded-lg border bg-card p-4 transition-colors hover:border-primary/50"
          >
            <p className="text-sm font-medium">{tool.label}</p>
            <p className="mt-1 text-xs text-muted-foreground">{tool.hint}</p>
          </Link>
        ))}
      </div>

      <div className="space-y-4">
        {(staff.data ?? []).map((u) => (
          <Card key={u.id} className="shadow-[var(--shadow-panel)]">
            <CardContent className="p-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="flex items-start gap-3">
                  <StaffAvatar photoUrl={u.photo_url} name={u.full_name} />
                  <div>
                  <p className="font-medium">{u.full_name}</p>
                  <p className="text-sm text-muted-foreground">{u.email}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {u.job_title ?? "No title"} · {u.department ?? "No department"} ·{" "}
                    {u.last_login_at
                      ? `Last login ${new Date(u.last_login_at).toLocaleString()}`
                      : "Never signed in"}
                  </p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                      u.status === "active"
                        ? "bg-success/15 text-success"
                        : "bg-destructive/15 text-destructive"
                    }`}
                  >
                    {u.status}
                  </span>
                  {u.id !== session?.userId ? (
                    <>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          setStatus.mutate({
                            userId: u.id,
                            status: u.status === "active" ? "disabled" : "active",
                          })
                        }
                      >
                        {u.status === "active" ? "Disable" : "Enable"}
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => setEditing(u)}>
                        Edit identity
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => resetPassword.mutate({ userId: u.id, email: u.email })}
                      >
                        Reset password
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => terminate.mutate({ userId: u.id })}
                      >
                        Terminate sessions
                      </Button>
                    </>
                  ) : (
                    <span className="text-xs text-muted-foreground">Your account</span>
                  )}
                </div>
              </div>

              <div className="mt-4 flex flex-wrap gap-3 border-t pt-4">
                {ALL_ROLES.map((role) => {
                  const checked = u.roles.includes(role);
                  const locked = u.id === session?.userId && role === "super_admin";
                  return (
                    <label
                      key={role}
                      className="flex items-center gap-2 text-xs"
                      title={locked ? "You cannot remove your own Super Admin role" : undefined}
                    >
                      <Checkbox
                        checked={checked}
                        disabled={locked}
                        onCheckedChange={(v) => {
                          const next = v
                            ? [...u.roles, role]
                            : u.roles.filter((r) => r !== role);
                          setRoles.mutate({ userId: u.id, roles: next });
                        }}
                      />
                      {ROLE_LABEL[role]}
                    </label>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <CreateUserDialog
        open={creating}
        onOpenChange={setCreating}
        onCreated={(res) => {
          setCreating(false);
          setTempPassword({ email: res.email, password: res.tempPassword });
          refresh();
        }}
      />

      <Dialog open={!!tempPassword} onOpenChange={() => setTempPassword(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Temporary password</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Give this to {tempPassword?.email} privately. It is shown once and must be changed on
            first sign-in.
          </p>
          <p className="ref-mono rounded-md border bg-muted px-4 py-3 text-center text-base">
            {tempPassword?.password}
          </p>
        </DialogContent>
      </Dialog>

      <EditIdentityDialog
        staff={editing}
        onOpenChange={() => setEditing(null)}
        onSaved={() => {
          setEditing(null);
          refresh();
        }}
      />
    </AppShell>
  );
}

function CreateUserDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreated: (res: { email: string; tempPassword: string }) => void;
}) {
  const [form, setForm] = useState({
    full_name: "",
    email: "",
    phone: "",
    job_title: "",
    department: "",
  });
  const [roles, setRoles] = useState<AppRole[]>([]);

  const create = useMutation({
    mutationFn: async () => {
      const res = await adminCreateUser({
        data: {
          fullName: form.full_name.trim(),
          email: form.email.trim().toLowerCase(),
          phone: form.phone.trim() || null,
          jobTitle: form.job_title.trim() || null,
          department: form.department.trim() || null,
          roles,
        },
      });
      return { email: form.email.trim().toLowerCase(), tempPassword: res.temporaryPassword };
    },
    onSuccess: (res) => {
      setForm({ full_name: "", email: "", phone: "", job_title: "", department: "" });
      setRoles([]);
      onCreated(res);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create staff account</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {(
            [
              ["full_name", "Full name"],
              ["email", "Work email"],
              ["phone", "Phone (optional)"],
              ["job_title", "Job title"],
              ["department", "Department"],
            ] as const
          ).map(([key, label]) => (
            <div key={key} className="space-y-2">
              <Label>{label}</Label>
              <Input
                value={form[key]}
                maxLength={160}
                onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
              />
            </div>
          ))}
          <div className="space-y-2">
            <Label>Roles</Label>
            <div className="flex flex-wrap gap-3">
              {ALL_ROLES.map((role) => (
                <label key={role} className="flex items-center gap-2 text-xs">
                  <Checkbox
                    checked={roles.includes(role)}
                    onCheckedChange={(v) =>
                      setRoles((prev) => (v ? [...prev, role] : prev.filter((r) => r !== role)))
                    }
                  />
                  {ROLE_LABEL[role]}
                </label>
              ))}
            </div>
          </div>
          <Button
            className="w-full"
            disabled={create.isPending || !form.full_name || !form.email || roles.length === 0}
            onClick={() => create.mutate()}
          >
            {create.isPending ? "Creating…" : "Create account"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function EditIdentityDialog({
  staff,
  onOpenChange,
  onSaved,
}: {
  staff: (StaffRow & { roles: AppRole[] }) | null;
  onOpenChange: (v: boolean) => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState({
    full_name: "",
    email: "",
    phone: "",
    job_title: "",
    department: "",
  });
  const [photo, setPhoto] = useState<string | null>(null);

  useEffect(() => {
    if (staff) {
      setForm({
        full_name: staff.full_name,
        email: staff.email,
        phone: staff.phone ?? "",
        job_title: staff.job_title ?? "",
        department: staff.department ?? "",
      });
      setPhoto(staff.photo_url);
    }
  }, [staff]);

  const save = useMutation({
    mutationFn: async () => {
      if (!staff) return;
      await adminUpdateStaffIdentity({
        data: {
          userId: staff.id,
          fullName: form.full_name.trim(),
          email: form.email.trim().toLowerCase(),
          phone: form.phone.trim() || null,
          jobTitle: form.job_title.trim() || null,
          department: form.department.trim() || null,
          photoUrl: photo,
        },
      });
    },
    onSuccess: () => {
      toast.success("Staff identity updated.");
      onSaved();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={!!staff} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit staff identity</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {staff ? (
            <AvatarUploader
              userId={staff.id}
              name={form.full_name || staff.full_name}
              photoUrl={photo}
              onUploaded={(path) => {
                setPhoto(path);
                toast.success("Photo uploaded — save to apply.");
              }}
            />
          ) : null}
          {(
            [
              ["full_name", "Full name"],
              ["email", "Work email"],
              ["phone", "Phone"],
              ["job_title", "Job title"],
              ["department", "Department"],
            ] as const
          ).map(([key, label]) => (
            <div key={key} className="space-y-2">
              <Label>{label}</Label>
              <Input
                value={form[key]}
                maxLength={160}
                onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
              />
            </div>
          ))}
          <Button
            className="w-full"
            disabled={save.isPending || form.full_name.trim().length < 2 || !form.email.trim()}
            onClick={() => save.mutate()}
          >
            {save.isPending ? "Saving…" : "Save identity"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
