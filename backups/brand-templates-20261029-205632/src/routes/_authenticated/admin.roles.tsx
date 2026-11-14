import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { AppShell, PageHeader } from "@/components/AppShell";
import { useSession } from "@/hooks/useSession";
import { NoAccess } from "@/components/records";
import {
  ACTION_LABEL,
  ALL_ROLES,
  PERMISSION_GROUPS,
  ROLE_LABEL,
  WORKSPACE_LABEL,
  allows,
  type AppRole,
} from "@/lib/rbac";
import { adminListRolePermissions, adminSetRolePermissions } from "@/lib/admin.functions";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";

export const Route = createFileRoute("/_authenticated/admin/roles")({
  head: () => ({
    meta: [
      { title: "Roles & Permissions — Kalexi Brokerage" },
      {
        name: "description",
        content: "Configure which tools and actions each Kalexi workspace role may use.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: RolesPage,
});

const CONFIGURABLE = ALL_ROLES.filter((r) => r !== "super_admin");

function RolesPage() {
  const { data: session } = useSession();
  const access = session?.access;
  const qc = useQueryClient();
  const [selected, setSelected] = useState<AppRole>("receptionist");
  const [draft, setDraft] = useState<Set<string>>(new Set());

  const permissions = useQuery({
    queryKey: ["role-permissions"],
    enabled: allows(access, "admin.roles"),
    queryFn: async () => await adminListRolePermissions({ data: undefined }),
  });

  useEffect(() => {
    setDraft(new Set(permissions.data?.[selected] ?? []));
  }, [permissions.data, selected]);

  const save = useMutation({
    mutationFn: async () =>
      await adminSetRolePermissions({
        data: { roleKey: selected, permissions: Array.from(draft) },
      }),
    onSuccess: () => {
      toast.success(`${ROLE_LABEL[selected]} permissions updated.`);
      qc.invalidateQueries({ queryKey: ["role-permissions"] });
      qc.invalidateQueries({ queryKey: ["session"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!allows(access, "admin.roles")) {
    return (
      <AppShell>
        <PageHeader title="Roles & permissions" />
        <NoAccess module="Roles & Permissions" />
      </AppShell>
    );
  }

  const saved = new Set(permissions.data?.[selected] ?? []);
  const dirty =
    saved.size !== draft.size || Array.from(draft).some((p) => !saved.has(p));

  function toggle(permission: string, on: boolean) {
    setDraft((prev) => {
      const next = new Set(prev);
      if (on) next.add(permission);
      else next.delete(permission);
      return next;
    });
  }

  function toggleModule(actions: string[], moduleKey: string, on: boolean) {
    setDraft((prev) => {
      const next = new Set(prev);
      for (const a of actions) {
        const key = `${moduleKey}.${a}`;
        if (on) next.add(key);
        else next.delete(key);
      }
      return next;
    });
  }

  return (
    <AppShell>
      <PageHeader
        title="Roles & permissions"
        description="Equip every workspace with exactly the tools its duties require."
        actions={
          <Button disabled={!dirty || save.isPending} onClick={() => save.mutate()}>
            {save.isPending ? "Saving…" : "Save changes"}
          </Button>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[240px_1fr]">
        <Card className="h-fit p-2">
          {CONFIGURABLE.map((role) => (
            <button
              key={role}
              onClick={() => setSelected(role)}
              className={`w-full rounded-md px-3 py-2 text-left text-sm transition-colors ${
                selected === role
                  ? "bg-primary/10 font-medium text-primary"
                  : "text-muted-foreground hover:bg-muted"
              }`}
            >
              <span className="block">{ROLE_LABEL[role]}</span>
              <span className="block text-[11px] text-muted-foreground">
                {(permissions.data?.[role] ?? []).length} permissions
              </span>
            </button>
          ))}
          <div className="mt-2 rounded-md border border-dashed p-3 text-[11px] text-muted-foreground">
            Super Admin holds unrestricted authority over every module and cannot be limited.
          </div>
        </Card>

        <div className="space-y-4">
          <div className="rounded-lg border bg-card px-4 py-3">
            <p className="text-sm font-semibold">{WORKSPACE_LABEL[selected]}</p>
            <p className="text-xs text-muted-foreground">
              Changes apply immediately to every staff member holding this role.
            </p>
          </div>

          {PERMISSION_GROUPS.map((group) => {
            const all = group.actions.every((a) => draft.has(`${group.module}.${a}`));
            return (
              <section key={group.module} className="rounded-lg border bg-card">
                <header className="flex items-center justify-between border-b px-4 py-2.5">
                  <h2 className="text-sm font-semibold">{group.label}</h2>
                  <label className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Checkbox
                      checked={all}
                      onCheckedChange={(v) => toggleModule(group.actions, group.module, !!v)}
                    />
                    Full module access
                  </label>
                </header>
                <div className="flex flex-wrap gap-x-6 gap-y-3 p-4">
                  {group.actions.map((action) => {
                    const key = `${group.module}.${action}`;
                    return (
                      <label key={key} className="flex items-center gap-2 text-xs">
                        <Checkbox
                          checked={draft.has(key)}
                          onCheckedChange={(v) => toggle(key, !!v)}
                        />
                        {ACTION_LABEL[action] ?? action}
                      </label>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
      </div>
    </AppShell>
  );
}
